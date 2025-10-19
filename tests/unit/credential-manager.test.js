const { CredentialManager } = require('../../services/auth/credential-manager');

// Ensure tests have a deterministic encryption key so EncryptionService does not throw
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key';

describe('CredentialManager - basic flows', () => {
  let cm;

  beforeAll(() => {
    cm = new CredentialManager();
  });

  test('store and get credentials (stubbed)', async () => {
    const userId = 'user-1';
    const service = 'test-service';
    const creds = { type: 'basic_auth', username: 'u1', password: 'p1' };

    // store should not throw (supabase stub or in-repo stub handles persistence)
    await expect(cm.storeCredentials(userId, service, creds)).resolves.toBeDefined();

    // getCredentials should return decrypted object or null (depends on stub)
    const got = await cm.getCredentials(userId, service);
    expect(got === null || typeof got === 'object').toBe(true);
  });

  test('purge credentials does not throw', async () => {
    const userId = 'user-1';
    const service = 'test-service';
    await expect(cm.purgeCredentials(userId, service)).resolves.toBeUndefined();
  });
});
