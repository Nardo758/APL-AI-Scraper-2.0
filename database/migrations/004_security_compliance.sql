-- Phase 6 Security & Compliance migration

CREATE TABLE IF NOT EXISTS encryption_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL,
  encrypted_key text NOT NULL,
  checksum text,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz
);

CREATE TABLE IF NOT EXISTS encrypted_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_name text NOT NULL,
  encrypted_blob bytea NOT NULL,
  key_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb
);

CREATE TABLE IF NOT EXISTS user_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  service text NOT NULL,
  encrypted_secret bytea NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_rotated timestamptz
);

CREATE TABLE IF NOT EXISTS credential_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  service text,
  action text,
  details jsonb,
  timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event_type text NOT NULL,
  severity text,
  description text,
  meta jsonb,
  ip inet,
  user_agent text,
  timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compliance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  domain text,
  url text,
  allowed boolean,
  crawl_delay integer,
  reason text,
  timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS data_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  accessor text,
  reason text,
  details jsonb,
  timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS data_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text,
  requester text,
  timestamp timestamptz NOT NULL DEFAULT now(),
  details jsonb
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  success boolean,
  ip inet,
  user_agent text,
  timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  token text NOT NULL,
  type text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  jti text,
  refresh_token_hash text,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_credentials_user ON user_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_events_project ON compliance_events(project_id);
CREATE INDEX IF NOT EXISTS idx_data_access_user ON data_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);

COMMENT ON TABLE encryption_keys IS 'Store versioned encryption keys (encrypted at rest with MASTER_ENCRYPTION_KEY)';
COMMENT ON TABLE user_credentials IS 'Encrypted service credentials for integrations and external APIs';
