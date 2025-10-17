-- scripts/setup-complete-schema.sql
-- Comprehensive schema for APL AI Scraper 2.0
-- Run this in Supabase SQL Editor (restore/SQL console) as a privileged user (service_role key required for some operations)

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Scraper Templates
CREATE TABLE IF NOT EXISTS scraper_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  code TEXT NOT NULL,
  config JSONB DEFAULT '{}'::jsonb,
  version VARCHAR(50) DEFAULT '1.0.0',
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Scraping Jobs
CREATE TABLE IF NOT EXISTS scraping_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  template_id UUID REFERENCES scraper_templates(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'pending',
  url TEXT NOT NULL,
  config JSONB DEFAULT '{}'::jsonb,
  result JSONB,
  error_message TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  priority INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Scraped Data
CREATE TABLE IF NOT EXISTS scraped_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES scraping_jobs(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User profiles (app-level metadata in addition to auth.users)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name VARCHAR(255),
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Login attempts (audit)
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  successful BOOLEAN DEFAULT false,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- API keys for programmatic access (service-managed)
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  name VARCHAR(255),
  scopes TEXT[],
  revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_status ON scraping_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_project ON scraping_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_scraped_data_job ON scraped_data(job_id);

-- Example function to hash API keys (server-side usage)
CREATE OR REPLACE FUNCTION fn_hash_api_key(raw_key TEXT) RETURNS TEXT AS $$
BEGIN
  RETURN encode(digest(raw_key, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Row-level security policies
-- Note: policies require auth.uid() to be available and may depend on Supabase auth setup.
-- Projects RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS projects_rls_user ON projects
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Templates RLS
ALTER TABLE scraper_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS templates_rls_user ON scraper_templates
  USING (
    EXISTS (
      SELECT 1 FROM projects p WHERE p.id = scraper_templates.project_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p WHERE p.id = scraper_templates.project_id AND p.user_id = auth.uid()
    )
  );

-- Jobs RLS
ALTER TABLE scraping_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS jobs_rls_user ON scraping_jobs
  USING (
    EXISTS (
      SELECT 1 FROM projects p WHERE p.id = scraping_jobs.project_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p WHERE p.id = scraping_jobs.project_id AND p.user_id = auth.uid()
    )
  );

-- Scraped data RLS
ALTER TABLE scraped_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS scrapeddata_rls_user ON scraped_data
  USING (
    EXISTS (
      SELECT 1 FROM scraping_jobs j JOIN projects p ON p.id = j.project_id WHERE j.id = scraped_data.job_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scraping_jobs j JOIN projects p ON p.id = j.project_id WHERE j.id = scraped_data.job_id AND p.user_id = auth.uid()
    )
  );

-- User profiles RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS profiles_rls_user ON user_profiles
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- API keys RLS (only user who created or admins)
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS apikeys_rls_owner ON api_keys
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Safe defaults for public (deny all by default)
-- (Optional) If you intend anyone to be able to read project metadata, add appropriate policies.

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_timestamp() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_timestamp_projects
  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TRIGGER trg_update_timestamp_templates
  BEFORE UPDATE ON scraper_templates FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TRIGGER trg_update_timestamp_profiles
  BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

-- End of migration

COMMENT ON TABLE projects IS 'Projects managed by users';
COMMENT ON TABLE scraper_templates IS 'User-created scraper templates and code';
COMMENT ON TABLE scraping_jobs IS 'Queued and historical scraping jobs';
COMMENT ON TABLE scraped_data IS 'Stored scraped results';
COMMENT ON TABLE api_keys IS 'API keys created for programmatic access (hashed)';
