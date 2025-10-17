const { EncryptionService } = require('./encryption-service');
const logger = require('../core/logger');
const { supabase } = require('../core/supabase');

class CredentialManager {
  constructor() {
    this.encryptionService = new EncryptionService();
    this.credentialCache = new Map();
    this.setupCredentialRotation();
  }

  getCacheKey(userId, service) {
    return `${userId}:${service}`;
  }

  getSensitiveFieldsForService(service) {
    const sensitiveFields = {
      openai: ['api_key'],
      anthropic: ['api_key'],
      serpapi: ['api_key'],
      proxy: ['username', 'password'],
      database: ['password'],
      smtp: ['password']
    };
    return sensitiveFields[service] || ['password', 'api_key', 'secret', 'token'];
  }

  async storeCredentials(userId, service, credentials) {
    try {
      this.validateCredentials(credentials);
      const encrypted = await this.encryptionService.encryptSensitiveFields(credentials, this.getSensitiveFieldsForService(service));
      const { data, error } = await supabase.from('user_credentials').upsert([{ user_id: userId, service, credentials: encrypted, is_active: true, last_used: null, version: '1.0' }]).select().single();
      if (error) throw error;
      this.credentialCache.delete(this.getCacheKey(userId, service));
      return data;
    } catch (err) {
      logger.error('storeCredentials failed', { error: err.message });
      throw err;
    }
  }

  async getCredentials(userId, service) {
    const cacheKey = this.getCacheKey(userId, service);
    if (this.credentialCache.has(cacheKey)) return this.credentialCache.get(cacheKey);
    try {
      const { data, error } = await supabase.from('user_credentials').select('*').eq('user_id', userId).eq('service', service).eq('is_active', true).single();
      if (error || !data) return null;
      const decrypted = await this.encryptionService.decryptSensitiveFields(data.credentials, this.getSensitiveFieldsForService(service));
      await this.updateLastUsed(data.id);
      this.credentialCache.set(cacheKey, decrypted);
      setTimeout(() => this.credentialCache.delete(cacheKey), 5 * 60 * 1000);
      return decrypted;
    } catch (err) {
      logger.error('getCredentials failed', { error: err.message });
      throw err;
    }
  }

  async rotateCredentials(userId, service, newCredentials) {
    try {
      const newRec = await this.storeCredentials(userId, service, newCredentials);
      await supabase.from('user_credentials').update({ is_active: false }).eq('user_id', userId).eq('service', service).neq('id', newRec.id);
      await this.logCredentialRotation(userId, service);
      return newRec;
    } catch (err) {
      logger.error('rotateCredentials failed', { error: err.message });
      throw err;
    }
  }

  validateCredentials(credentials) {
    const requiredFields = {
      api_key: ['key'],
      oauth2: ['client_id', 'client_secret', 'refresh_token'],
      basic_auth: ['username', 'password'],
      proxy: ['host', 'port', 'username', 'password']
    };
    const serviceType = credentials.type;
    const required = requiredFields[serviceType];
    if (!required) throw new Error(`Unknown credential type: ${serviceType}`);
    for (const f of required) if (!credentials[f]) throw new Error(`Missing required field: ${f}`);
    return true;
  }

  async updateLastUsed(credentialId) {
    await supabase.from('user_credentials').update({ last_used: new Date().toISOString() }).eq('id', credentialId);
  }

  async logCredentialRotation(userId, service) {
    await supabase.from('credential_audit_log').insert([{ user_id: userId, service, action: 'rotate', timestamp: new Date().toISOString(), ip_address: 'system' }]);
  }

  setupCredentialRotation() {
    setInterval(async () => { await this.checkCredentialExpiry(); }, 24 * 60 * 60 * 1000);
  }

  async checkCredentialExpiry() {
    try {
      const { data } = await supabase.from('user_credentials').select('user_id, service, id').lt('last_rotated', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()).eq('is_active', true);
      for (const cred of data || []) await this.notifyCredentialRotation(cred.user_id, cred.service);
    } catch (err) {
      logger.error('checkCredentialExpiry failed', { error: err.message });
    }
  }

  async notifyCredentialRotation(userId, service) {
    try {
      const { data } = await supabase.from('user_profiles').select('email').eq('id', userId).single();
      if (data?.email) console.log(`Notify ${data.email} to rotate ${service}`);
    } catch (err) {
      logger.error('notifyCredentialRotation failed', { error: err.message });
    }
  }

  async purgeCredentials(userId, service) {
    try {
      await supabase.from('user_credentials').update({ is_active: false }).eq('user_id', userId).eq('service', service);
      this.credentialCache.delete(this.getCacheKey(userId, service));
      await supabase.from('credential_audit_log').insert([{ user_id: userId, service, action: 'purge', timestamp: new Date().toISOString() }]);
    } catch (err) {
      logger.error('purgeCredentials failed', { error: err.message });
      throw err;
    }
  }
}

module.exports = { CredentialManager };