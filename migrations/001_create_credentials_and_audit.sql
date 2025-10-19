-- Migration 001: create user_credentials and credential_audit_log tables
-- This is a safe initial schema used by the credential manager and audit logging.

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY,
  email text
);

CREATE TABLE IF NOT EXISTS user_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id),
  service text NOT NULL,
  credentials jsonb NOT NULL,
  is_active boolean DEFAULT true,
  last_used timestamptz,
  last_rotated timestamptz DEFAULT now(),
  version text
);

CREATE TABLE IF NOT EXISTS credential_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  service text,
  action text,
  timestamp timestamptz DEFAULT now(),
  ip_address text
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_credentials_user_service ON user_credentials(user_id, service);
CREATE INDEX IF NOT EXISTS idx_credential_audit_user ON credential_audit_log(user_id);
