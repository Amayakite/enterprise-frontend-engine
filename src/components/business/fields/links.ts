import { cloneModel, sameModelValue } from "./model";
import type { ChangeReason, FieldEnvironment, FieldKey, FieldLink } from "./types";

/** 编译并校验字段联动依赖，返回可复用执行器；检测非法依赖以避免反复循环更新。 */
export function compileLinks<M, C>(links: readonly FieldLink<M, C>[]) {
  const edges = new Map<FieldKey<M>, Set<FieldKey<M>>>();
  for (const link of links) {
    if (!link.watch.length) throw new Error("字段联动 watch 不得为空");
    for (const target of link.clear ?? [])
      if (!link.writes.includes(target)) throw new Error(`clear 未声明写字段：${target}`);
    for (const key of link.watch) {
      const targets = edges.get(key) ?? new Set<FieldKey<M>>();
      link.writes.forEach((target) => targets.add(target));
      edges.set(key, targets);
    }
  }
  const order: FieldKey<M>[] = [];
  const seen = new Set<FieldKey<M>>();
  function visit(key: FieldKey<M>, path: FieldKey<M>[]) {
    if (path.includes(key)) throw new Error(`字段联动环路：${[...path, key].join(" → ")}`);
    if (seen.has(key)) return;
    for (const next of edges.get(key) ?? []) visit(next, [...path, key]);
    seen.add(key);
    order.unshift(key);
  }
  for (const key of edges.keys()) visit(key, []);
  // 所有上游写规则完成后再读取该规则；每条规则每个事务最多运行一次。
  const ranked = [...links].sort(
    (a, b) =>
      Math.max(...a.watch.map((key) => order.indexOf(key))) -
      Math.max(...b.watch.map((key) => order.indexOf(key)))
  );
  return (
    env: FieldEnvironment<M, C>,
    initial: M,
    patch: Partial<M>,
    reason: ChangeReason
  ): {
    /**
     * 当前页面模型；表单字段与联动使用它，不等同于后端保存 DTO。
     */
    model: M;
    /**
     * 本次产生的部分模型修改；只包含发生变化的字段，不提交整个上下文。
     */
    changes: Partial<M>;
  } => {
    const model = cloneModel(env.model) as M;
    const changes: Partial<M> = {};
    const changed = new Set<FieldKey<M>>();
    const writers = new Map<FieldKey<M>, unknown>();
    function write(key: FieldKey<M>, value: M[FieldKey<M>], linked: boolean) {
      if (linked && writers.has(key) && !sameModelValue(writers.get(key), value))
        throw new Error(`字段联动多写冲突：${key}`);
      if (linked) writers.set(key, value);
      if (!sameModelValue(model[key], value)) {
        model[key] = cloneModel(value);
        if (sameModelValue(env.model[key], value)) {
          delete changes[key];
          changed.delete(key);
        } else {
          changes[key] = cloneModel(value);
          changed.add(key);
        }
      }
    }
    for (const key of Object.keys(patch) as FieldKey<M>[])
      write(key, patch[key] as M[FieldKey<M>], false);
    if (reason !== "hydrate" && reason !== "reset") {
      for (const link of ranked) {
        if (!link.watch.some((key) => changed.has(key))) continue;
        const mapped: Partial<M> = link.apply?.({ ...env, model: cloneModel(model), reason }) ?? {};
        if (mapped instanceof Promise) throw new Error("字段联动 apply 必须同步返回 patch");
        for (const key of Object.keys(mapped) as FieldKey<M>[]) {
          if (!link.writes.includes(key)) throw new Error(`联动未声明写字段：${key}`);
          write(key, mapped[key] as M[FieldKey<M>], true);
        }
        for (const key of link.clear ?? []) write(key, initial[key], true);
      }
    }
    return { model, changes };
  };
}
