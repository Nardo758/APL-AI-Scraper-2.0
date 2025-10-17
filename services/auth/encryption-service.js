/**
 * Data Encryption Service - APL AI Scraper 2.0 Phase 6
 * Comprehensive encryption service with key rotation, integrity validation, and secure storage
 */

const crypto = require('crypto');
const { promisify } = require('util');
const { scrypt } = require('crypto');
const logger = require('../core/logger');
const { supabase } = require('../core/supabase');

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 12; // 12 bytes is recommended for GCM
    this.scryptAsync = promisify(scrypt);

    // Key rotation settings
    this.keyRotationInterval = 90 * 24 * 60 * 60 * 1000; // 90 days
    this.keyVersions = new Map(); // Cache for key versions

    this.setupKeyRotation();
    logger.info('EncryptionService initialized');
  }

  async generateKey() {
    return crypto.randomBytes(this.keyLength);
  }

  calculateChecksum(data) {
    const hash = crypto.createHash('sha256');
    hash.update(typeof data === 'string' ? data : JSON.stringify(data));
    return hash.digest('hex');
  }

  async encryptData(data, key = null, keyVersion = 'current') {
    try {
      if (!key) key = await this.getEncryptionKey(keyVersion);

      const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, key, iv, { authTagLength: 16 });

      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();

      return {
        encryptedData: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        metadata: {
          algorithm: this.algorithm,
          keyVersion,
          timestamp: Date.now()
        },
        checksum: this.calculateChecksum(plaintext)
      };
    } catch (err) {
      logger.error('encryptData failed', { error: err.message });
      throw err;
    }
  }

  async decryptData(encryptionResult, key = null) {
    try {
      const { encryptedData, iv, authTag, metadata, checksum } = encryptionResult;
      if (!key) key = await this.getEncryptionKey(metadata.keyVersion || 'current');

      const decipher = crypto.createDecipheriv(this.algorithm, key, Buffer.from(iv, 'hex'), { authTagLength: 16 });
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));

      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      const currentChecksum = this.calculateChecksum(decrypted);
      if (checksum && currentChecksum !== checksum) {
        throw new Error('Data integrity check failed');
      }

      try {
        return JSON.parse(decrypted);
      } catch (e) {
        return decrypted;
      }
    } catch (err) {
      logger.error('decryptData failed', { error: err.message });
      throw err;
    }
  }

  async encryptSensitiveFields(data, fieldsToEncrypt, keyVersion = 'current') {
    try {
      const result = { ...data };
      const key = await this.getEncryptionKey(keyVersion);

      for (const field of fieldsToEncrypt) {
        if (data[field] !== undefined && data[field] !== null) {
          const enc = await this.encryptData(data[field], key, keyVersion);
          result[field] = { encrypted: true, ...enc };
        }
      }

      return result;
    } catch (err) {
      logger.error('encryptSensitiveFields failed', { error: err.message });
      throw err;
    }
  }

  async decryptSensitiveFields(data, fieldsToDecrypt) {
    try {
      const result = { ...data };
      for (const field of fieldsToDecrypt) {
        if (data[field] && data[field].encrypted) {
          result[field] = await this.decryptData(data[field]);
        }
      }
      return result;
    } catch (err) {
      logger.error('decryptSensitiveFields failed', { error: err.message });
      throw err;
    }
  }

  async getEncryptionKey(version = 'current') {
    try {
      if (this.keyVersions.has(version)) return this.keyVersions.get(version);

      let keySource;
      if (version === 'current') {
        keySource = process.env.ENCRYPTION_KEY;
        if (!keySource) throw new Error('ENCRYPTION_KEY not configured');
      } else {
        // Retrieve versioned key from DB
        const { data, error } = await supabase.from('encryption_keys').select('encrypted_key').eq('version', version).single();
        if (error || !data) throw new Error('Key version not found');
        const masterKey = await this.getMasterKey();
        const decrypted = await this.decryptData(data.encrypted_key, masterKey);
        keySource = decrypted;
      }

      const salt = process.env.ENCRYPTION_SALT || 'apl-ai-scraper-salt';
      const derived = await this.scryptAsync(keySource, salt, this.keyLength);
      this.keyVersions.set(version, derived);
      setTimeout(() => this.keyVersions.delete(version), 60 * 60 * 1000);
      return derived;
    } catch (err) {
      logger.error('getEncryptionKey failed', { error: err.message, version });
      throw err;
    }
  }

  async getMasterKey() {
    const master = process.env.MASTER_ENCRYPTION_KEY;
    if (!master) throw new Error('MASTER_ENCRYPTION_KEY not configured');
    return this.scryptAsync(master, 'master-salt', this.keyLength);
  }

  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  async createEncryptedBackup(data, backupId) {
    try {
      const enc = await this.encryptData(data);
      const backup = {
        id: backupId,
        encrypted_data: enc,
        created_at: new Date().toISOString(),
        checksum: this.calculateChecksum(JSON.stringify(data))
      };
      const { error } = await supabase.from('encrypted_backups').insert(backup);
      if (error) throw error;
      logger.info('Encrypted backup created', { backupId });
      return backupId;
    } catch (err) {
      logger.error('createEncryptedBackup failed', { error: err.message });
      throw err;
    }
  }

  async restoreFromEncryptedBackup(backupId) {
    try {
      const { data: backup, error } = await supabase.from('encrypted_backups').select('*').eq('id', backupId).single();
      if (error || !backup) throw new Error('Backup not found');
      const decrypted = await this.decryptData(backup.encrypted_data);
      const isValid = this.calculateChecksum(decrypted) === backup.checksum;
      if (!isValid) throw new Error('Backup integrity failed');
      return decrypted;
    } catch (err) {
      logger.error('restoreFromEncryptedBackup failed', { error: err.message, backupId });
      throw err;
    }
  }

  setupKeyRotation() {
    this.checkKeyRotation();
    setInterval(() => this.checkKeyRotation(), 24 * 60 * 60 * 1000);
  }

  async checkKeyRotation() {
    try {
      const { data: currentKey } = await supabase.from('encryption_keys').select('created_at, version').eq('is_active', true).order('created_at', { ascending: false }).limit(1).single();
      if (!currentKey) return await this.createInitialKey();
      const age = Date.now() - new Date(currentKey.created_at).getTime();
      if (age > this.keyRotationInterval) await this.initiateKeyRotation();
    } catch (err) {
      logger.error('checkKeyRotation failed', { error: err.message });
    }
  }

  async createInitialKey() {
    try {
      const newKey = (await this.generateKey()).toString('hex');
      const master = await this.getMasterKey();
      const encryptedKey = await this.encryptData(newKey, master);
      await supabase.from('encryption_keys').insert({ version: 'v1', encrypted_key: encryptedKey, is_active: true, created_at: new Date().toISOString() });
      logger.info('Initial key created');
    } catch (err) {
      logger.error('createInitialKey failed', { error: err.message });
      throw err;
    }
  }

  async initiateKeyRotation() {
    try {
      const newKey = (await this.generateKey()).toString('hex');
      const newVersion = `v${Date.now()}`;
      const master = await this.getMasterKey();
      const encryptedKey = await this.encryptData(newKey, master);
      await supabase.from('encryption_keys').insert({ version: newVersion, encrypted_key: encryptedKey, is_active: true, created_at: new Date().toISOString() });
      await supabase.from('encryption_keys').update({ is_active: false }).neq('version', newVersion);
      process.env.ENCRYPTION_KEY = newKey;
      this.keyVersions.clear();
      logger.info('Key rotation completed', { newVersion });
      // In production, schedule re-encryption jobs here
    } catch (err) {
      logger.error('initiateKeyRotation failed', { error: err.message });
      throw err;
    }
  }
}

module.exports = { EncryptionService };