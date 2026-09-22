import { ref } from "vue";
import { cloneReadonlyModel } from "@/components/business/fields/model";
import type { DeepReadonly } from "vue";
import type { FieldKey } from "@/components/business/fields/types";
import type { CrudFormController, CrudTableBinding } from "@/components/business/crud/types";

/**
 * 将主表中的对象数组字段绑定为 MyCrudChildTable 可消费的子表端口。
 *
 * @typeParam K 只能是 Model 的对象数组字段，避免把普通数组误接为子表。
 * @remarks 主表仍拥有最终提交值；子表只能通过 binding.replace 回写。草稿版本和字段白名单
 * 必须在子表 config 中声明。
 * @example `const contacts = useCrudTableChild(controller, "contacts", { draft: { version: 1, fields: ["name"] } });`
 */
export function useCrudTableChild<
  Model extends object,
  Entity,
  Id extends string | number,
  K extends FieldKey<Model>,
>(
  controller: CrudFormController<Model, Entity, Id>,
  key: K & (Model[K] extends readonly object[] ? unknown : never),
  options?: {
    /** 子表草稿白名单；省略时不持久化行编辑状态。 */
    draft?: {
      /** 子表草稿结构版本，结构不兼容时递增。 */
      version: number;
      /** 允许保存的子行字段；未列入的数据不写本机草稿。 */
      fields: readonly FieldKey<
        Model[K] extends readonly (infer Item extends object)[] ? Item : never
      >[];
    };
  }
) {
  type Row = Model[K] extends readonly (infer Item extends object)[] ? Item : never;
  const locked = ref(false);
  // K 已被调用签名限制为对象数组；条件类型在泛型实现体内无法反向缩窄。
  const binding: CrudTableBinding<Row> = {
    get rows() {
      return controller.state.model[key as keyof typeof controller.state.model] as DeepReadonly<
        Row[]
      >;
    },
    get busy() {
      return locked.value || controller.busy;
    },
    get readonly() {
      return (
        locked.value ||
        !!controller.readonlyReason ||
        !controller.savePermission ||
        ["checking", "available", "conflict", "unsafe"].includes(
          controller.draft?.state.phase ?? ""
        ) ||
        ["loading", "saving", "resolving", "committed-needs-sync"].includes(
          controller.state.phase
        ) ||
        controller.state.mutationOutcome === "unknown"
      );
    },
    replace(rows) {
      if (!binding.readonly) controller.patch({ [key]: rows } as Partial<Model>);
    },
    register(port) {
      return controller.registerChild({
        key,
        draftVersion: options?.draft?.version,
        snapshotDraft:
          options?.draft && port.snapshotDraft
            ? () => ({
                version: options.draft!.version,
                data: port.snapshotDraft!(options.draft!.fields),
              })
            : undefined,
        restoreDraft:
          options?.draft && port.restoreDraft
            ? async (snapshot) => {
                if (
                  !snapshot ||
                  typeof snapshot !== "object" ||
                  !("version" in snapshot) ||
                  snapshot.version !== options.draft!.version ||
                  !("data" in snapshot)
                )
                  return false;
                return port.restoreDraft!(snapshot.data, options.draft!.fields);
              }
            : undefined,
        subscribeDraft: options?.draft ? port.subscribeDraft : undefined,
        isDirty: port.isDirty,
        async commitDraft() {
          return (await port.commit())
            ? { proceed: true }
            : { proceed: false, reason: "请完成明细草稿" };
        },
        cancelDraft: port.cancel,
        async validate(rows) {
          const checked = await port.validate(cloneReadonlyModel<Model[K]>(rows) as Row[]);
          return checked.valid
            ? { valid: true }
            : {
                valid: false,
                issues: checked.errors.map((issue) => ({
                  section: key,
                  rowKey: issue.rowKey,
                  rowField: issue.field,
                  message: issue.message,
                })),
              };
        },
        async focus(issue) {
          if (issue.rowKey !== undefined && issue.rowField)
            await port.focus(issue.rowKey, issue.rowField);
          else {
            const first = binding.rows[0];
            if (first) await port.focus("", "");
          }
        },
        setReadonly(value) {
          locked.value = value;
        },
      });
    },
  };
  return binding;
}
