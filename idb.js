// Kleiner IndexedDB-Speicher, gemeinsam für Scanner und Planer (gleiche Webadresse).
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('container-planer', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function run(mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const tx = db.transaction('kv', mode); const st = tx.objectStore('kv');
    const req = fn(st);
    tx.oncomplete = () => res(req && req.result);
    tx.onerror = () => rej(tx.error);
  }));
}
export const idbGet = (k) => run('readonly', st => st.get(k));
export const idbSet = (k, v) => run('readwrite', st => st.put(v, k));
export const idbDel = (k) => run('readwrite', st => st.delete(k));
