// services/credentials/secure-manager.js
// Secure Credential Manager with database storage and encryption

const crypto = require('crypto');
const { DatabaseAdapter } = require('../core/database-adapter');

class SecureCredentialManager {
  constructor(supabase) {
    this.supabase = supabase;
    this.dbAdapter = new DatabaseAdapter(supabase);
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'your-encryption-key-here-32-chars-min';
    this.algorithm = 'aes-256-gcm';
  }

  // Encrypt data using AES-256-GCM
  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipherGCM(this.algorithm, this.encryptionKey, iv);
    cipher.setAAD(Buffer.from('credential-aad'));

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  // Decrypt data
  decrypt(encryptedData) {
    const { encrypted, iv, authTag } = encryptedData;
    const decipher = crypto.createDecipherGCM(this.algorithm, this.encryptionKey, Buffer.from(iv, 'hex'));
    decipher.setAAD(Buffer.from('credential-aad'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // Store API key securely in database
  async storeApiKey(provider, apiKey, metadata = {}) {
    const encrypted = this.encrypt(apiKey);

    const credentialData = {
      provider,
      encrypted_key: JSON.stringify(encrypted),
      metadata: {
        ...metadata,
        created_at: new Date().toISOString(),
        expires_at: metadata.expires_at || null
      }
    };

    // For now, we'll store in a simple key-value structure
    // In production, you'd want a dedicated credentials table
    const { error } = await this.supabase
      .from('user_preferences') // Using existing table as temporary storage
      .upsert({
        user_id: 'system', // System-wide credentials
        preferences: {
          credentials: {
            [provider]: credentialData
          }
        }
      });

    if (error) throw error;
  }

  // Retrieve and decrypt API key
  async getApiKey(provider) {
    const { data, error } = await this.supabase
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', 'system')
      .single();

    if (error || !data?.preferences?.credentials?.[provider]) {
      return null;
    }

    const credentialData = data.preferences.credentials[provider];

    // Check if expired
    if (credentialData.metadata?.expires_at) {
      const expiresAt = new Date(credentialData.metadata.expires_at);
      if (expiresAt < new Date()) {
        await this.deleteApiKey(provider);
        return null;
      }
    }

    try {
      return this.decrypt(JSON.parse(credentialData.encrypted_key));
    } catch (err) {
      console.error(`Failed to decrypt ${provider} key:`, err);
      return null;
    }
  }

  // Delete API key
  async deleteApiKey(provider) {
    const { data } = await this.supabase
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', 'system')
      .single();

    if (data?.preferences?.credentials) {
      delete data.preferences.credentials[provider];

      await this.supabase
        .from('user_preferences')
        .update({ preferences: data.preferences })
        .eq('user_id', 'system');
    }
  }

  // Rotate API key (delete old, store new)
  async rotateApiKey(provider, newApiKey, metadata = {}) {
    await this.deleteApiKey(provider);
    await this.storeApiKey(provider, newApiKey, metadata);
  }

  // Get all stored providers
  async getStoredProviders() {
    const { data } = await this.supabase
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', 'system')
      .single();

    return data?.preferences?.credentials ?
      Object.keys(data.preferences.credentials) : [];
  }

  // Check for expired keys and return list of providers that need rotation
  async getExpiredKeys() {
    const { data } = await this.supabase
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', 'system')
      .single();

    if (!data?.preferences?.credentials) return [];

    const expired = [];
    const now = new Date();

    for (const [provider, credentialData] of Object.entries(data.preferences.credentials)) {
      if (credentialData.metadata?.expires_at) {
        const expiresAt = new Date(credentialData.metadata.expires_at);
        if (expiresAt < now) {
          expired.push(provider);
        }
      }
    }

    return expired;
  }

  // Automatic key rotation with callback for new key generation
  async rotateExpiredKeys(keyGeneratorCallback) {
    const expiredProviders = await this.getExpiredKeys();

    for (const provider of expiredProviders) {
      try {
        console.log(`🔄 Rotating expired key for ${provider}`);

        // Generate new key using callback
        const newKey = await keyGeneratorCallback(provider);

        if (newKey) {
          await this.rotateApiKey(provider, newKey, {
            rotated_at: new Date().toISOString(),
            previous_expiry: null // Could be enhanced to track rotation history
          });

          console.log(`✅ Successfully rotated key for ${provider}`);
        } else {
          console.warn(`⚠️ Failed to generate new key for ${provider}`);
        }
      } catch (error) {
        console.error(`❌ Failed to rotate key for ${provider}:`, error);
      }
    }

    return expiredProviders.length;
  }

  // Schedule automatic key rotation (call this periodically)
  startAutoRotation(intervalMs = 24 * 60 * 60 * 1000) { // Default: daily
    console.log(`🔄 Starting automatic key rotation (every ${intervalMs / (1000 * 60 * 60)} hours)`);

    this.rotationInterval = setInterval(async () => {
      try {
        const rotatedCount = await this.rotateExpiredKeys(async (provider) => {
          // This would typically call an external API to generate new keys
          // For now, we'll log that manual intervention is needed
          console.log(`📝 Manual key generation needed for ${provider}`);
          return null; // Return null to indicate manual generation needed
        });

        if (rotatedCount > 0) {
          console.log(`🔄 Rotated ${rotatedCount} expired keys`);
        }
      } catch (error) {
        console.error('❌ Auto-rotation failed:', error);
      }
    }, intervalMs);
  }

  // Stop automatic rotation
  stopAutoRotation() {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
      console.log('⏹️ Stopped automatic key rotation');
    }
  }

  // Validate API key format (basic validation)
  validateApiKey(provider, apiKey) {
    const patterns = {
      openai: /^sk-[a-zA-Z0-9]{48}$/,
      anthropic: /^sk-ant-[a-zA-Z0-9-_]{95,}$/
    };

    const pattern = patterns[provider.toLowerCase()];
    return pattern ? pattern.test(apiKey) : true; // Allow unknown providers
  }
}

module.exports = { SecureCredentialManager };