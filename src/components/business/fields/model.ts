import { readonly, shallowRef } from "vue";
import type { DeepReadonly } from "vue";

/** 将只读公共视图复制为独立可编辑值；断言仅恢复克隆后的可变性。 */
export function cloneReadonlyModel<T>(value: DeepReadonly<T>): T {
  return cloneModel(value) as T;
}

/** 表单快照限于普通对象、数组、Date 与原始值；不接收组件、函数或循环引用。 */
export function cloneModel<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((item) => cloneModel(item)) as T;
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = cloneModel(item);
    return result as T;
  }
  return value;
}

/** 比较模型值是否等价，用于基线/草稿变更检测；不修改参与比较的对象。 */
export function sameModelValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object")
    return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) =>
        Object.hasOwn(right, key) && sameModelValue(Reflect.get(left, key), Reflect.get(right, key))
    )
  );
}

/** 复制普通模型并提供深只读快照；用于异步钩子，修改不会影响控制器。
 * @param value 普通对象、数组、Date 或原始值，不接受循环引用。
 * @returns 与输入隔离的只读值。
 * @example
 * `const input = readonlyModel(model);`
 */
export function readonlyModel<T>(value: T): DeepReadonly<T> {
  return readonly(shallowRef(cloneModel(value))).value;
}
