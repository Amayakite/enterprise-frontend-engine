export type ViewLeaveGuard = () => boolean | Promise<boolean>;
type RegisteredGuard = { guard: ViewLeaveGuard; rollback: () => void };

export function createViewLeaveGuardRegistry() {
  const guards = new Map<string, RegisteredGuard>();

  function register(
    fullPath: string,
    guard: ViewLeaveGuard,
    rollback: () => void = () => undefined
  ) {
    const registered = { guard, rollback };
    guards.set(fullPath, registered);
    return () => {
      if (guards.get(fullPath) === registered) guards.delete(fullPath);
    };
  }

  async function canRemove(fullPaths: readonly string[]): Promise<boolean> {
    const approved: RegisteredGuard[] = [];
    try {
      for (const fullPath of new Set(fullPaths)) {
        const registered = guards.get(fullPath);
        if (!registered) continue;
        if (!(await registered.guard())) {
          approved.reverse().forEach(({ rollback }) => rollback());
          return false;
        }
        approved.push(registered);
      }
      return true;
    } catch (error) {
      approved.reverse().forEach(({ rollback }) => rollback());
      throw error;
    }
  }

  function rollback(fullPaths: readonly string[]) {
    for (const fullPath of new Set(fullPaths)) guards.get(fullPath)?.rollback();
  }

  return { register, canRemove, rollback, clear: () => guards.clear() };
}

export function createViewOperationLock() {
  let flight: Promise<unknown> | null = null;

  async function run<T>(operation: () => T | Promise<T>): Promise<T | undefined> {
    if (flight) {
      await flight;
      return undefined;
    }

    const current = Promise.resolve().then(operation);
    flight = current;
    try {
      return await current;
    } finally {
      if (flight === current) flight = null;
    }
  }

  return { run };
}
