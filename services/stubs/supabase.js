class SupabaseStub {
  constructor() {
    this._tables = new Map();
  }

  from(table) {
    const self = this;
    // Minimal chainable query builder to satisfy simple test usage
    const builder = {
      _rows: () => self._tables.get(table) || [],
      select() {
        const rows = this._rows();
        const res = { data: rows, error: null };
        // make thenable
        return Promise.resolve(res);
      },
      insert(row) {
        const arr = self._tables.get(table) || [];
        arr.push(row);
        self._tables.set(table, arr);
        return Promise.resolve({ data: [row], error: null });
      },
      upsert(row) {
        // naive upsert: append if not found, otherwise replace first match by index 0
        const arr = self._tables.get(table) || [];
        if (!arr.length) {
          arr.push(row && Array.isArray(row) ? row[0] : row);
        } else {
          arr[0] = row && Array.isArray(row) ? row[0] : row;
        }
        self._tables.set(table, arr);
        return Promise.resolve({ data: [arr[0]], error: null });
      },
      update() {
        return Promise.resolve({ data: [], error: null });
      },
      delete() {
        self._tables.delete(table);
        return Promise.resolve({ data: [], error: null });
      },
      // chainable variants
      eq() { return this; },
      neq() { return this; },
      order() { return this; },
      limit() { return this; },
      single() {
        const rows = this._rows();
        const first = rows && rows.length ? rows[0] : null;
        return Promise.resolve({ data: first, error: null });
      }
    };

    return builder;
  }
}

module.exports = SupabaseStub;
