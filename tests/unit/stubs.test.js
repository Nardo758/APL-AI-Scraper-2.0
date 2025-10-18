const SupabaseStub = require('../../services/stubs/supabase');
const RedisStub = require('../../services/stubs/redis');

describe('SupabaseStub', () => {
  test('insert and select', async () => {
    const db = new SupabaseStub();
    await db.from('t').insert({ id: 1, a: 'b' });
    const res = await db.from('t').select();
    expect(res.data).toHaveLength(1);
    expect(res.data[0].a).toBe('b');
  });
});

describe('RedisStub', () => {
  test('set/get/del', async () => {
    const r = new RedisStub();
    await r.set('k', 'v');
    expect(await r.get('k')).toBe('v');
    await r.del('k');
    expect(await r.get('k')).toBeNull();
  });
});
