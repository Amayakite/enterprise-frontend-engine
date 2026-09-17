import { userDataStore } from "@/utils/user-data/index";
const checkedAt = new Map<string, number>();
let sessionRevision = 0;
const TTL = 5 * 60_000;

export function getPreferenceRemoteAdapter() {
  return userDataStore.getRemoteAdapter();
}

export function shouldCheckPreference(key: string) {
  return Date.now() - (checkedAt.get(key) ?? 0) >= TTL;
}

export function markPreferenceChecked(key: string) {
  checkedAt.delete(key);
  checkedAt.set(key, Date.now());
  while (checkedAt.size > 100) checkedAt.delete(checkedAt.keys().next().value!);
}

/** 登出清理同步会话；不常驻任何列数据或页面引用。 */
export function clearPreferenceSession() {
  sessionRevision++;
  checkedAt.clear();
}

export function getPreferenceSessionRevision() {
  return sessionRevision;
}
