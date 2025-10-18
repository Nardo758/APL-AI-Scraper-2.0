const fs = require('fs');
const path = require('path');

const { InMemoryCredentials, FileBackedCredentials } = require('../../services/credentials');

describe('InMemoryCredentials', () => {
  test('set/get/delete', async () => {
    const c = new InMemoryCredentials();
    await c.set('foo', 'bar');
    expect(await c.get('foo')).toBe('bar');
    await c.delete('foo');
    expect(await c.get('foo')).toBeNull();
  });
});

describe('FileBackedCredentials', () => {
  const tmp = path.join(process.cwd(), 'tmp-test-creds.json');
  afterEach(() => {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  });

  test('set/get/delete persists to file', async () => {
    const c = new FileBackedCredentials(tmp);
    await c.set('a', 1);
    expect(await c.get('a')).toBe(1);
    await c.delete('a');
    expect(await c.get('a')).toBeNull();
  });
});
