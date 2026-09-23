import { computed, onScopeDispose, ref, shallowRef } from "vue";
import { createUserDataKey, userDataStore } from "@/utils/user-data/index";
import { parseQueryPreset } from "@/components/business/search/query-presets";
import type {
  QueryPresetController,
  QueryPresetOptions,
  QueryPresetSnapshot,
} from "@/components/business/search/query-presets";
import type { QuerySchema } from "@/components/business/search/types";
import type { CrudColumnIdentity } from "./useCrudColumns";

interface StoredPreset {
  /** 本机方案的稳定随机 ID，重命名时保持不变。 */
  id: string;
  /** 用户设置的名称，1–40 个字，同一集合内不能重名。 */
  name: string;
  /** 保存时的方案语义版本，与当前配置不一致时禁止应用。 */
  version: number;
  /** 保存的条件和排序；读取时保持 unknown，应用前按当前 schema 验证。 */
  snapshot: unknown;
}
interface PresetCollection {
  /** 同一用户、模块和范围内保存的方案，最多 20 个。 */
  items: StoredPreset[];
  /** 进入列表自动应用的方案 ID，null 表示不设置默认方案。 */
  defaultId: string | null;
}
/** 判断存储值是否为普通对象形状，排除空值和数组后才能继续读成员。 */
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** 检查本机方案集合的数量、名称、ID 和默认项，损坏时明确报错。 */
function collection(value: unknown): PresetCollection {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 20)
    throw new Error("查询方案数据损坏，请联系管理员检查本机数据");
  /** 校验后的存储方案，保留原快照供使用时再按查询规则解析。 */
  const items: StoredPreset[] = value.items.map((item: unknown) => {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      !item.id ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 40 ||
      typeof item.version !== "number"
    )
      throw new Error("查询方案数据结构不正确");
    return { id: item.id, name: item.name, version: item.version, snapshot: item.snapshot };
  });
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    new Set(items.map((item) => item.name)).size !== items.length
  )
    throw new Error("查询方案标识或名称重复");
  if (
    value.defaultId !== null &&
    (typeof value.defaultId !== "string" || !items.some((item) => item.id === value.defaultId))
  )
    throw new Error("默认查询方案不存在");
  return { items, defaultId: value.defaultId };
}

/**
 * 使用公共用户数据存储管理本机查询方案；身份变化时由列表显式 initialize。
 * @param options 当前版本、schema、身份及查询快照读写端口；apply 应原子替换筛选与排序。
 * @returns UI 端口及列表生命周期端口；不提供服务器同步，不持久化固定范围。
 * @example
 * `const presets = useQueryPresets({ ...options, identity: () => page.preference.value });`
 */
export function useQueryPresets<Row, S extends QuerySchema>(options: {
  /** 查询方案语义版本；不兼容升级时递增。 */
  config: QueryPresetOptions;
  /** 当前查询字段白名单，读取旧数据时重新校验。 */
  schema: S;
  /** 当前允许排序的字段，不能包含操作列。 */
  sortKeys: readonly Extract<keyof Row, string>[];
  /** 当前账号、模块及组织/权限范围；列表在身份变化后调用 initialize。 */
  identity: () => CrudColumnIdentity;
  /** 返回已应用条件与排序的独立快照，不读取尚未应用的草稿。 */
  snapshot: () => QueryPresetSnapshot<Row, S>;
  /** 原子应用快照并查询；返回是否成功，不能拆成筛选/排序两次请求。 */
  apply: (snapshot: QueryPresetSnapshot<Row, S>) => Promise<boolean>;
}) {
  /** 当前身份已读取的方案集合及默认方案 ID。 */
  const data = shallowRef<PresetCollection>({ items: [], defaultId: null });
  /** busy 防止并发读写；error 显示失败原因，notice 说明保存范围及降级情况。 */
  const busy = ref(false),
    /** 查询方案读取、保存或应用失败的原因，开始下一次操作时清空。 */
    error = ref(""),
    /** 说明方案仅保存在本机，或当前已降级为内存保存。 */
    notice = ref("");
  /** 最近成功应用的方案 ID；手动改条件或删除该方案后清空。 */
  const activeId = ref<string | null>(null);
  /** alive 标记实例存活；epoch 区分读取轮次，loadedKey 记录已读身份，revision 防止多窗口覆盖。 */
  let alive = true,
    /** 每次重读递增，使上一轮读取或写入不能更新当前集合。 */
    epoch = 0,
    /** 最近已成功读取的身份键，写入前必须与当前身份一致。 */
    loadedKey = "",
    /** 最近读取或写入的存储版本，用于检测其他窗口的并发修改。 */
    revision: string | null = null;
  /** 按账号、模块和范围生成本机方案存储键，不把固定范围写进可应用条件。 */
  const key = computed(() => {
    const identity = options.identity();
    return createUserDataKey({
      userId: identity.user,
      moduleKey: identity.module,
      kind: "preferences",
      slot: `query-presets:${identity.scope ?? "default"}`,
    });
  });
  /** 按当前方案版本及查询规则解析快照；过期字段、排序或版本会报错。 */
  const parse = (item: StoredPreset) => {
    if (item.version !== options.config.version) throw new Error("查询配置已升级，请重新保存方案");
    return parseQueryPreset<Row, S>(item.snapshot, options.schema, options.sortKeys);
  };
  /** 给菜单显示的方案名称与失效原因，保留失效项方便用户辨认和删除。 */
  const items = computed(() =>
    data.value.items.map((item) => {
      let issue = "";
      try {
        parse(item);
      } catch (cause) {
        issue = message(cause);
      }
      return { id: item.id, name: item.name, issue };
    })
  );
  /** 提取异常原因；未知异常使用统一的方案操作失败提示。 */
  function message(cause: unknown) {
    return cause instanceof Error ? cause.message : "查询方案操作失败";
  }
  /** 根据实际存储级别告知用户是否仅内存有效。 */
  function storageNotice(level: string) {
    notice.value =
      level === "memory"
        ? "仅保存在当前内存中，刷新或关闭后可能丢失"
        : "查询方案保存在本机，不会同步到其他设备";
  }
  /** 清空旧身份数据并读取本机方案；只接受本轮且同一身份的结果。 */
  async function reload() {
    const run = ++epoch,
      ownKey = key.value;
    busy.value = true;
    error.value = "";
    loadedKey = "";
    data.value = { items: [], defaultId: null };
    revision = null;
    try {
      const result = await userDataStore.read<unknown>(ownKey);
      if (!alive || run !== epoch || key.value !== ownKey) return;
      if (result.record && result.record.schemaVersion !== 1)
        throw new Error("不支持的查询方案存储版本");
      data.value = result.record ? collection(result.record.value) : { items: [], defaultId: null };
      revision = result.record?.revision ?? null;
      loadedKey = ownKey;
      storageNotice(result.level);
    } catch (cause) {
      if (alive && run === epoch && key.value === ownKey) error.value = message(cause);
    } finally {
      if (alive && run === epoch) busy.value = false;
    }
  }
  /** 去除方案名称首尾空格，并检查长度和重名；重命名时可排除自己。 */
  function nameOf(name: string, except?: string) {
    const value = name.trim();
    if (!value || value.length > 40) throw new Error("方案名称请填写 1–40 个字");
    if (data.value.items.some((item) => item.id !== except && item.name === value))
      throw new Error("已存在同名查询方案");
    return value;
  }
  /** 按已读取版本保存一份新集合；成功后更新界面，冲突或失败时保留原集合。 */
  async function write(update: () => PresetCollection) {
    if (busy.value || !alive) return false;
    const ownKey = key.value,
      run = epoch;
    busy.value = true;
    error.value = "";
    try {
      // 必须先读取当前身份的集合和版本，不能用上一账号的数据直接写入新身份。
      if (loadedKey !== ownKey) throw new Error("查询方案尚未读取，请重试读取后操作");
      const next = update();
      const result = await userDataStore.write(ownKey, next, {
        schemaVersion: 1,
        expectedRevision: revision,
        ttlMs: 365 * 86400000,
      });
      if (!alive || run !== epoch || key.value !== ownKey) return false;
      // 存储确认成功后才替换菜单数据；发生版本冲突时保留原集合供重新读取。
      data.value = next;
      revision = result.record?.revision ?? null;
      storageNotice(result.level);
      if (activeId.value && !next.items.some((item) => item.id === activeId.value))
        activeId.value = null;
      return true;
    } catch (cause) {
      if (alive && run === epoch && key.value === ownKey)
        error.value = `${message(cause)}；可重试读取后再操作`;
      return false;
    } finally {
      if (alive && run === epoch) busy.value = false;
    }
  }
  /** 按 ID 找到已读取方案；不存在时提示重新读取。 */
  function find(id: string) {
    const item = data.value.items.find((item) => item.id === id);
    if (!item) throw new Error("查询方案已不存在，请重试读取");
    return item;
  }
  /** 校验指定方案并一次性应用查询和排序；只有成功后才标记为当前方案。 */
  async function apply(id: string) {
    if (busy.value || !alive) return false;
    const ownKey = key.value,
      run = epoch;
    busy.value = true;
    error.value = "";
    try {
      if (loadedKey !== ownKey) throw new Error("查询方案尚未读取");
      const success = await options.apply(parse(find(id)));
      if (!alive || run !== epoch || key.value !== ownKey) return false;
      if (success) activeId.value = id;
      return success;
    } catch (cause) {
      if (alive && run === epoch && key.value === ownKey) error.value = message(cause);
      return false;
    } finally {
      if (alive && run === epoch) busy.value = false;
    }
  }
  /** 供方案菜单使用的读写入口，新增、重命名、删除都经同一版本检查。 */
  const controller: QueryPresetController = {
    get items() {
      return items.value;
    },
    get defaultId() {
      return data.value.defaultId;
    },
    get activeId() {
      return activeId.value;
    },
    get busy() {
      return busy.value;
    },
    get error() {
      return error.value;
    },
    get notice() {
      return notice.value;
    },
    save: (name) =>
      write(() => {
        if (data.value.items.length >= 20)
          throw new Error("最多保存 20 个查询方案，请先删除不用的方案");
        return {
          ...data.value,
          items: [
            ...data.value.items,
            {
              id: crypto.randomUUID(),
              name: nameOf(name),
              version: options.config.version,
              snapshot: parseQueryPreset<Row, S>(
                options.snapshot(),
                options.schema,
                options.sortKeys
              ),
            },
          ],
        };
      }),
    rename: (id, name) =>
      write(() => {
        find(id);
        const nextName = nameOf(name, id);
        return {
          ...data.value,
          items: data.value.items.map((item) =>
            item.id === id ? { ...item, name: nextName } : item
          ),
        };
      }),
    remove: (id) =>
      write(() => {
        find(id);
        return {
          items: data.value.items.filter((item) => item.id !== id),
          defaultId: data.value.defaultId === id ? null : data.value.defaultId,
        };
      }),
    setDefault: (id) =>
      write(() => {
        if (id !== null) parse(find(id));
        return { ...data.value, defaultId: id };
      }),
    apply,
    reload: async () => {
      if (!busy.value) await reload();
    },
  };
  /** 销毁后使未完成的存储读写回调失效。 */
  onScopeDispose(() => {
    alive = false;
    epoch++;
  });
  return {
    controller,
    clearActive: () => {
      activeId.value = null;
    },
    /** 返回 true 表示已处理默认方案（包括失效时阻止自动无条件查询）。 */
    async initialize() {
      activeId.value = null;
      const loading = reload(),
        run = epoch;
      await loading;
      // 读取失败或已切换身份时也视为已处理初始化，避免意外发出不带默认筛选的查询。
      if (!alive || run !== epoch || loadedKey !== key.value) return true;
      if (data.value.defaultId) {
        await apply(data.value.defaultId);
        return true;
      }
      return false;
    },
  };
}
