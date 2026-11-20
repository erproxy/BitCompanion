import { t as tr } from './i18n.js';
/** Keep version-1 JSON unchanged while refusing writes from a stale tab. */
export function createStateStore(getStorage, key, getLocks = () => null) {
  let snapshot, generation = 0, pending = Promise.resolve();
  const currentStorage = () => getStorage();
  function read() {
    generation++;
    snapshot = currentStorage().getItem(key);
    return snapshot;
  }
  function writable() {
    const storage = currentStorage();
    if (snapshot === undefined) snapshot = storage.getItem(key);
    if (storage.getItem(key) !== snapshot) {
      const error = new Error(tr("Данные изменились в другой вкладке. Сначала открой актуальную копию."));
      error.code = 'STATE_CHANGED';
      throw error;
    }
    return storage;
  }
  function write(value) {
    const storage = writable();
    storage.setItem(key, value);
    snapshot = value;
  }
  function importValue(value, previous) {
    const storage = writable();
    // If either write fails, the current state is never replaced in memory.
    storage.setItem(key + '-before-import', snapshot ?? previous);
    storage.setItem(key, value);
    snapshot = value;
  }
  function locked(action) {
    const expectedGeneration = generation;
    const check = () => {
      if (expectedGeneration !== generation) {
        const error = new Error(tr("Копия данных уже обновлена. Повтори действие."));
        error.code = 'STATE_CHANGED';
        throw error;
      }
      return action();
    };
    // The comparison and write run under the same origin-wide lock, including
    // import's backup. Queue this tab's writes too, preserving event order.
    const task = pending.catch(() => {}).then(() => {
      const locks = getLocks();
      return locks ? locks.request('bitcraft-state:' + key, check) : check();
    });
    pending = task;
    return task;
  }
  return {read,write,importValue,writeLocked:value=>locked(()=>write(value)),
    importValueLocked:(value,previous)=>locked(()=>importValue(value,previous))};
}
