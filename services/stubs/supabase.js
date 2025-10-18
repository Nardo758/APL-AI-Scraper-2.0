class SupabaseStub {
  constructor() {
    this._tables = new Map();
  }

  from(table) {
    const self = this;
    return {
      select() {
        const rows = self._tables.get(table) || [];
        return Promise.resolve({ data: rows, error: null });
      },
      insert(row) {
        const arr = self._tables.get(table) || [];
        arr.push(row);
        self._tables.set(table, arr);
        return Promise.resolve({ data: [row], error: null });
      },
      update() {
        // naive update: replace all (not implemented for tests)
        return Promise.resolve({ data: [], error: null });
      },
      delete() {
        self._tables.delete(table);
        return Promise.resolve({ data: [], error: null });
      },
    };
  }
}

module.exports = SupabaseStub;
