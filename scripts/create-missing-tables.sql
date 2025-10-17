-- scripts/create-missing-tables.sql
-- Minimal migration to create only the missing tables discovered by the schema diff
-- REVIEW before running in production. This file is read-only in the repo; run it manually via psql, Supabase SQL editor, or a controlled migration tool.

BEGIN;

-- projects
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  user_id uuid,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);

-- scraper_templates
CREATE TABLE IF NOT EXISTS public.scraper_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  config jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scraper_templates_project_id ON public.scraper_templates(project_id);

-- scraping_jobs
CREATE TABLE IF NOT EXISTS public.scraping_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.scraper_templates(id) ON DELETE SET NULL,
  status text DEFAULT 'pending',
  url text,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scraping_jobs_project_id ON public.scraping_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_template_id ON public.scraping_jobs(template_id);

-- scraped_data
CREATE TABLE IF NOT EXISTS public.scraped_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.scraping_jobs(id) ON DELETE CASCADE,
  data jsonb DEFAULT '{}'::jsonb,
  url text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scraped_data_job_id ON public.scraped_data(job_id);

-- login_attempts
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  attempted_at timestamptz DEFAULT now(),
  success boolean DEFAULT false,
  ip inet
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON public.login_attempts(user_id);

-- api_keys
CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  key text NOT NULL,
  name text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys(user_id);

COMMIT;

-- Notes:
-- 1) gen_random_uuid() requires the pgcrypto or pgcrypto-equivalent extension; in Supabase you can use gen_random_uuid() if the extension is available, otherwise use uuid_generate_v4().
-- 2) Review foreign key references and RLS policies after applying.
-- 3) This script intentionally keeps types minimal and avoids destructive operations.
