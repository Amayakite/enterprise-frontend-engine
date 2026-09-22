import { computed, shallowRef, watch, type DeepReadonly } from "vue";
import {
  cloneModel,
  cloneReadonlyModel,
  sameModelValue,
  readonlyModel,
} from "@/components/business/fields/model";
import { compileLinks } from "@/components/business/fields/links";
import type {
  ChangeReason,
  FieldEnvironment,
  FieldKey,
  FieldLink,
  FormPatch,
  FormChange,
} from "@/components/business/fields/types";

/** 受控表单模型与字段联动装配；从宿主取模型、通过更新事件回写，不保存后端数据。 */
export function useFormModel<M extends object, C>(
  props: {
    /**
     * 受控字段/表单值；更新通过对应回调提交，保持声明类型。
     */
    modelValue: M | DeepReadonly<M>;

    /**
     * 当前业务环境；传组织/权限范围等数据，不在公共组件写死客户业务值。
     */
    context: C;

    /**
     * 场景判别值：add 表示新建无 ID，edit 表示已有实体；按所在分支填写字面量。
     */
    mode?: "add" | "edit";

    /**
     * 表单实例/实体标识；切换实体时更新，不用会随渲染变化的随机值。
     */
    formKey?: string | number;

    /**
     * 创建全新初始模型；每次返回独立对象与数组，不复用可变单例。
     */
    createInitialModel: () => M;

    /**
     * 字段联动规则数组；复用公共联动引擎，不在页面重复写 watch。
     */
    links?: readonly FieldLink<M, C>[];
  },
  publish: (model: M, patch: FormPatch<M>) => void,
  changes?: {
    /** 只有宿主订阅 change 时启用事务快照，默认不分配。 */ enabled: () => boolean;
    /** 用户确认后通知；模型已同步回写且 links 已完成，不负责后端保存。 */ emit: (
      event: FormChange<M>
    ) => void;
  }
) {
  const model = shallowRef<M>(cloneReadonlyModel<M>(props.modelValue));
  const snapshot = shallowRef<M>(cloneReadonlyModel<M>(props.modelValue));
  // 发布模型与内部模型各自拥有可变字段；普通输入仅复制 changes，保留其余分支。
  let published = cloneReadonlyModel<M>(props.modelValue);
  const version = shallowRef(0);
  const entityVersion = shallowRef(0);
  const env = computed<FieldEnvironment<M, C>>(() => ({
    model: model.value,
    context: props.context,
    mode: props.mode ?? "add",
  }));
  const applyLinks = computed(() => compileLinks(props.links ?? []));
  // 初始化也检查图；错误配置不得等用户第一次输入才暴露。
  watch(applyLinks, () => {}, { immediate: true });
  function emitModel(next: M, patch: FormPatch<M>) {
    model.value = next;
    published =
      patch.reason === "hydrate" || patch.reason === "reset"
        ? cloneModel(next)
        : { ...published, ...cloneModel(patch.changes) };
    version.value++;
    publish(published, patch);
  }
  const pendingChanges = new Map<
    FieldKey<M>,
    {
      /** 交互开始前模型；仅启用 change 时创建。 */ previous: M;
      /** 本事务涉及的主字段、回填及联动字段。 */ keys: Set<FieldKey<M>>;
      /** 用户或参照依赖触发来源。 */ reason: "user" | "dependency";
    }
  >();
  function commit(field: FieldKey<M>) {
    const pending = pendingChanges.get(field);
    pendingChanges.delete(field);
    if (!pending || !changes?.enabled()) return;
    const patch: Partial<M> = {};
    for (const key of pending.keys)
      if (!sameModelValue(pending.previous[key], model.value[key]))
        patch[key] = cloneModel(model.value[key]);
    if (!Object.keys(patch).length) return;
    changes.emit({
      field,
      reason: pending.reason,
      previous: readonlyModel(pending.previous),
      model: readonlyModel(model.value),
      changes: readonlyModel(patch),
    });
  }
  function applyPatch(patch: Partial<M>, reason: ChangeReason = "external", field?: FieldKey<M>) {
    const result = applyLinks.value(env.value, props.createInitialModel, cloneModel(patch), reason);
    if (Object.keys(result.changes).length) {
      if (field && (reason === "user" || reason === "dependency") && changes?.enabled()) {
        const pending = pendingChanges.get(field) ?? {
          previous: cloneModel(model.value),
          keys: new Set<FieldKey<M>>(),
          reason,
        };
        for (const key of Object.keys(result.changes) as FieldKey<M>[]) pending.keys.add(key);
        pendingChanges.set(field, pending);
      } else {
        // 外部替换、草稿恢复与程序 patch 不伪装为用户确认，也不保留旧交互事务。
        pendingChanges.clear();
      }
      emitModel(result.model, { changes: result.changes, reason, field });
    }
  }
  function hydrate(next: M | DeepReadonly<M>) {
    pendingChanges.clear();
    entityVersion.value++;
    snapshot.value = cloneReadonlyModel<M>(next);
    emitModel(cloneReadonlyModel<M>(next), {
      changes: cloneReadonlyModel<M>(next),
      reason: "hydrate",
    });
  }
  function reset() {
    pendingChanges.clear();
    entityVersion.value++;
    emitModel(cloneModel(snapshot.value), { changes: cloneModel(snapshot.value), reason: "reset" });
  }
  let entityKey = props.formKey;
  watch(
    [() => props.modelValue, () => props.formKey],
    ([next, key]) => {
      // 同一渲染批次的新 key 与实体一起 hydrate，避免先当运行期变更清下游。
      if (key !== entityKey) {
        entityKey = key;
        hydrate(next);
        return;
      }
      // 同步回写（包括父级浅拷贝）不重跑联动；深监听同时捕获父级原位修改。
      if (sameModelValue(next, model.value)) return;
      const patch: Partial<M> = {};
      for (const key of Object.keys(next) as FieldKey<M>[]) {
        // DeepReadonly 的条件映射在泛型处不能反推键；仅恢复同一模型字段的对应关系。
        const value = next[key as keyof typeof next] as M[typeof key] | DeepReadonly<M[typeof key]>;
        if (!sameModelValue(value, model.value[key]))
          patch[key] = cloneReadonlyModel<M[typeof key]>(value);
      }
      applyPatch(patch, "external");
    },
    { deep: true }
  );
  watch(
    () => props.context,
    () => {
      version.value++;
    },
    { deep: true }
  );
  return { model, env, version, entityVersion, applyPatch, commit, hydrate, reset };
}
