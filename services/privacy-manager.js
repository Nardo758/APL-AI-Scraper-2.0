const { supabase } = require('./core/supabase');
const { EncryptionService } = require('./auth/encryption-service');
const logger = require('./core/logger');

class PrivacyManager {
  constructor() {
    this.encryption = new EncryptionService();
  }

  // Export all user-related data for portability (GDPR data subject access request)
  async exportUserData(userId) {
    try {
      const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', userId).single();
      const { data: credentials } = await supabase.from('user_credentials').select('*').eq('user_id', userId);
      const decryptedCreds = await Promise.all((credentials || []).map(async c => {
        try { return { ...c, secret: await this.encryption.decryptData(c.encrypted_secret) };
        } catch (e) { return { ...c, secret: null, _error: e.message }; }
      }));

      const { data: events } = await supabase.from('data_access_log').select('*').eq('user_id', userId);

      const exportPackage = { profile, credentials: decryptedCreds, access_log: events };
      return exportPackage;
    } catch (err) {
      logger.error('exportUserData failed', { userId, error: err.message });
      throw err;
    }
  }

  // Permanently delete or anonymize user data according to retention policy
  async deleteUserData(userId, options = { anonymize: false, requester: 'system' }) {
    try {
      const timestamp = new Date().toISOString();
      if (options.anonymize) {
        await supabase.from('user_profiles').update({ email: null, name: null, anonymized_at: timestamp }).eq('id', userId);
        await supabase.from('user_credentials').update({ active: false }).eq('user_id', userId);
        await supabase.from('data_deletion_log').insert([{ user_id: userId, action: 'anonymize', requester: options.requester, timestamp }]);
        logger.info('User data anonymized', { userId });
        return { status: 'anonymized' };
      }

      // Full deletion: remove PII and related records
      await supabase.from('user_credentials').delete().eq('user_id', userId);
      await supabase.from('user_sessions').delete().eq('user_id', userId);
      await supabase.from('data_access_log').delete().eq('user_id', userId);
      await supabase.from('user_profiles').delete().eq('id', userId);
      await supabase.from('data_deletion_log').insert([{ user_id: userId, action: 'delete', requester: options.requester, timestamp }]);
      logger.info('User data deleted', { userId });
      return { status: 'deleted' };
    } catch (err) {
      logger.error('deleteUserData failed', { userId, error: err.message });
      throw err;
    }
  }

  // Enforce retention policies across users and projects
  async enforceRetentionPolicy(retentionDays = 365) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    try {
      const { data: oldSessions } = await supabase.from('user_sessions').select('id,user_id,updated_at').lte('updated_at', cutoff);
      for (const s of oldSessions || []) {
        await supabase.from('user_sessions').delete().eq('id', s.id);
        await supabase.from('data_deletion_log').insert([{ user_id: s.user_id, action: 'session_prune', timestamp: new Date().toISOString() }]);
      }
      logger.info('Retention enforcement complete', { pruned_sessions: oldSessions ? oldSessions.length : 0 });
      return { pruned_sessions: oldSessions ? oldSessions.length : 0 };
    } catch (err) {
      logger.error('enforceRetentionPolicy failed', { error: err.message });
      throw err;
    }
  }

  // Record data access for auditing
  async logDataAccess(userId, accessor, reason, details = {}) {
    try {
      await supabase.from('data_access_log').insert([{ user_id: userId, accessor, reason, details: JSON.stringify(details), timestamp: new Date().toISOString() }]);
    } catch (err) {
      logger.error('logDataAccess failed', { userId, error: err.message });
    }
  }
}

module.exports = { PrivacyManager };