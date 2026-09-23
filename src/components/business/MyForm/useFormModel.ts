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

/** 受控表单模型与字段联动组合；从调用方取模型、通过更新事件回写，不保存后端数据。 */
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
    /** 调用方是否始终替换根对象、保留未变分支；默认 false 深监听。挂载后不变更此策略。 */
    immutableModel?: boolean;

    /**
     * 字段联动规则数组；复用公共联动引擎，不在页面重复写 watch。
     */
    links?: readonly FieldLink<M, C>[];
  },
  publish: (model: M, patch: FormPatch<M>) => void,
  changes?: {
    /** 只有调用方订阅 change 时启用事务快照，默认不分配。 */ enabled: () => boolean;
    /** 用户确认后通知；模型已同步回写且 links 已完成，不负责后端保存。 */ emit: (
      event: FormChange<M>
    ) => void;
  }
) {
  /** 表单当前编辑数据的独立副本，字段输入先修改它，再通过事件交给父页面。 */
  const model = shallowRef<M>(cloneReadonlyModel<M>(props.modelValue));
  /** 最近一次初始化或回填的数据，点击重置时恢复到这里，而不是清成空表单。 */
  const snapshot = shallowRef<M>(cloneReadonlyModel<M>(props.modelValue));
  // 发布模型与内部模型各自拥有可变字段；普通输入仅复制 changes，保留其余分支。
  let published = cloneReadonlyModel<M>(props.modelValue);
  /** 每次数据或上下文变化递增，使还在运行的旧校验结果失效。 */
  const version = shallowRef(0);
  /** 整条记录重新回填或重置时递增，用于重建输入控件并清除旧记录的内部状态。 */
  const entityVersion = shallowRef(0);
  /** 集中提供当前模型、组织等额外信息和新增/编辑模式，供字段规则与联动读取。 */
  const env = computed<FieldEnvironment<M, C>>(() => ({
    model: model.value,
    context: props.context,
    mode: props.mode ?? "add",
  }));
  /** 把 links 配置转换为可执行的字段联动函数，配置变化后重新生成。 */
  const applyLinks = computed(() => compileLinks(props.links ?? []));
  // 初始化也检查图；错误配置不得等用户第一次输入才暴露。
  watch(applyLinks, () => {}, { immediate: true });
  /** 更新内部数据并发布模型和字段补丁；普通输入只复制变化部分，整批回填则创建完整副本。 */
  function emitModel(next: M, patch: FormPatch<M>) {
    model.value = next;
    published =
      patch.reason === "hydrate" || patch.reason === "reset"
        ? cloneModel(next)
        : { ...published, ...cloneModel(patch.changes) };
    version.value++;
    publish(published, patch);
  }
  /** 记录一个字段从开始输入到确认期间的旧值及受影响字段，只在订阅 change 时收集。 */
  const pendingChanges = new Map<
    FieldKey<M>,
    {
      /** 交互开始前模型；仅启用 change 时创建。 */ previous: M;
      /** 本事务涉及的主字段、回填及联动字段。 */ keys: Set<FieldKey<M>>;
      /** 用户或参照依赖触发来源。 */ reason: "user" | "dependency";
    }
  >();
  /** 在失焦或选择完成时合并本次输入及联动变化，发出一次 change 通知；没有实际变化不通知。 */
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
  /** 将一组字段修改经过同步联动后回写，并按来源区分用户编辑、外部更新和回填。 */
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
  /** 用新读取或恢复的数据整体回填，更新重置基准并取消旧的未确认输入事件。 */
  function hydrate(next: M | DeepReadonly<M>) {
    pendingChanges.clear();
    entityVersion.value++;
    snapshot.value = cloneReadonlyModel<M>(next);
    emitModel(cloneReadonlyModel<M>(next), {
      changes: cloneReadonlyModel<M>(next),
      reason: "hydrate",
    });
  }
  /** 恢复最近一次回填的数据，结束旧输入过程，但不调用保存接口。 */
  function reset() {
    pendingChanges.clear();
    entityVersion.value++;
    emitModel(cloneModel(snapshot.value), { changes: cloneModel(snapshot.value), reason: "reset" });
  }
  /** 记住当前记录的标识，用于区分切换记录与同一记录的普通字段更新。 */
  let entityKey = props.formKey;
  /** 父页面更新模型时同步到内部；记录标识改变走整体回填，同一记录只应用有变化的字段，避免重复触发联动。 */
  watch(
    [() => props.modelValue, () => props.formKey],
    ([next, key], [previous]) => {
      // 同一渲染批次的新 key 与实体一起 hydrate，避免先当运行期变更清下游。
      if (key !== entityKey) {
        entityKey = key;
        hydrate(next);
        return;
      }
      // 同步回写（包括父级浅拷贝）不重跑联动；深监听同时捕获父级原位修改。
      if (!props.immutableModel && sameModelValue(next, model.value)) return;
      const patch: Partial<M> = {};
      for (const key of Object.keys(next) as FieldKey<M>[]) {
        // DeepReadonly 的条件映射在泛型处不能反推键；仅恢复同一模型字段的对应关系。
        const value = next[key as keyof typeof next] as M[typeof key] | DeepReadonly<M[typeof key]>;
        // CRUD 每次只替换被修改分支；无需再次遍历数百条未修改子行。
        if (props.immutableModel && Object.is(value, previous[key as keyof typeof previous]))
          continue;
        if (!sameModelValue(value, model.value[key]))
          patch[key] = cloneReadonlyModel<M[typeof key]>(value);
      }
      applyPatch(patch, "external");
    },
    { deep: !props.immutableModel }
  );
  /** 组织、权限等上下文变化后让旧校验过期，即使字段值没有变化也需按新条件重新判断。 */
  watch(
    () => props.context,
    () => {
      version.value++;
    },
    { deep: true }
  );
  return { model, env, version, entityVersion, applyPatch, commit, hydrate, reset };
}
