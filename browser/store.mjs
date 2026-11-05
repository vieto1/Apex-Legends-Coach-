// Videos and metadata stay in this browser's origin-scoped IndexedDB.
export class LocalStore {
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      // Persistent schema identifier: retain existing private recordings after a rebrand.
      const r = indexedDB.open(["apex", "review", "private"].join("-"), 1);
      r.onupgradeneeded = () => {
        for (const name of ["matches", "sources", "profiles"])
          r.result.createObjectStore(name, { keyPath: "id" });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () =>
        reject(
          Error(
            "Lokaler Browserspeicher nicht verfügbar. Privaten Modus verlassen oder Browserberechtigungen prüfen.",
          ),
        );
    });
    this.db.onversionchange = () => this.db.close();
    return this.db;
  }
  async get(name, id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const r = db.transaction(name).objectStore(name).get(id);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async all(name) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const r = db.transaction(name).objectStore(name).getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async put(name, value) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(name, "readwrite");
      t.objectStore(name).put(value);
      t.oncomplete = () => resolve(value);
      t.onabort = t.onerror = () =>
        reject(
          Error(
            t.error?.name === "QuotaExceededError"
              ? "Browserspeicher voll. Alte Aufnahmen exportieren und löschen."
              : t.error?.message || "Speichern fehlgeschlagen",
          ),
        );
    });
  }
  async change(id, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const t = db.transaction("matches", "readwrite"),
        s = t.objectStore("matches"),
        r = s.get(id);
      let value;
      r.onsuccess = () => {
        try {
          if (!r.result) throw Error("Aufnahme nicht gefunden");
          value = fn(r.result);
          s.put(value);
        } catch (e) {
          reject(e);
          t.abort();
        }
      };
      t.oncomplete = () => resolve(value);
      t.onabort = t.onerror = () =>
        reject(t.error || Error("Änderung nicht gespeichert"));
    });
  }
  async remove(name, id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(name, "readwrite");
      t.objectStore(name).delete(id);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  }
  async deleteMatch(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(["matches", "sources"], "readwrite");
      for (const name of ["matches", "sources"]) t.objectStore(name).delete(id);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  }
}
