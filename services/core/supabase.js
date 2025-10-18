// services/core/supabase.js
// Lightweight in-memory Supabase-like stub for tests and local development.
// This is NOT for production use. For production, set SUPABASE_URL and SUPABASE_ANON_KEY and
// require('@supabase/supabase-js').createClient instead.

const db = new Map();

const users = new Map();

const auth = {
  async signUp({ email, password, options }) {
    const id = `user_${Math.random().toString(36).slice(2, 10)}`;
    const user = { id, email, password, user_metadata: options && options.data ? options.data : {} };
    users.set(id, user);
    return { data: { user }, error: null };
  },
  async signInWithPassword({ email, password }) {
    for (const u of users.values()) {
      if (u.email === email && u.password === password) return { data: { user: u }, error: null };
    }
    return { data: null, error: { message: 'Invalid credentials' } };
  },
  admin: {
    async deleteUser(id) { users.delete(id); return { data: null, error: null }; }
  }
};

function ensureTable(table) {
  if (!db.has(table)) db.set(table, []);
  return db.get(table);
}

function fakeQuery(table) {
  const rows = ensureTable(table);
  const builder = {
    _table: table,
    _action: null,
    _payload: null,
    _single: false,
    select(fields) { this._action = 'select'; this._fields = fields; return this; },
    insert(items) { this._action = 'insert'; const toInsert = Array.isArray(items) ? items : [items]; rows.push(...toInsert); this._payload = toInsert; return this; },
    update(u) { this._action = 'update'; if (rows[0]) Object.assign(rows[0], u); this._payload = u; return this; },
    delete() { this._action = 'delete'; return this; },
    eq() { return this; },
    order() { return this; },
    single() { this._single = true; return this; },
    async then(resolve) {
      // resolve like supabase responses: { data, error }
      if (this._action === 'insert') return resolve({ data: this._payload, error: null });
      if (this._single) return resolve({ data: rows[0] || null, error: null });
      return resolve({ data: rows, error: null });
    },
    catch() { /* noop to satisfy promise-like usage */ }
  };

  return builder;
}

/**
 * Mark the exported supabase stub as `any` for TypeScript checking so
 * server-side code that uses the stub doesn't produce spurious type
 * errors while iterating. This is a test/dev-only lightweight stub.
 * @type {any}
 */
const supabase = /** @type {any} */ ({
  auth,
  from: (table) => fakeQuery(table)
});

module.exports = { supabase };
