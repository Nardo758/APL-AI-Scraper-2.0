-- scripts/setup-schema.sql
-- Run this in Supabase SQL Editor to create missing tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scraper templates
CREATE TABLE IF NOT EXISTS scraper_templates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    code TEXT NOT NULL,
    config JSONB DEFAULT '{}',
    version VARCHAR(50) DEFAULT '1.0.0',
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scraping jobs
CREATE TABLE IF NOT EXISTS scraping_jobs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    template_id UUID REFERENCES scraper_templates(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'pending',
    url TEXT NOT NULL,
    config JSONB DEFAULT '{}',
    result JSONB,
    error_message TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scraped data
CREATE TABLE IF NOT EXISTS scraped_data (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_id UUID REFERENCES scraping_jobs(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security and policies (RLS)
DO $$ 
BEGIN
    -- Projects RLS
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'projects' AND rowsecurity = true) THEN
        ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Users can manage own projects" ON projects
            FOR ALL USING (auth.uid() = user_id);
    END IF;

    -- Scraper templates RLS
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'scraper_templates' AND rowsecurity = true) THEN
        ALTER TABLE scraper_templates ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Users can access project templates" ON scraper_templates
            FOR ALL USING (
                EXISTS (
                    SELECT 1 FROM projects 
                    WHERE projects.id = scraper_templates.project_id 
                    AND projects.user_id = auth.uid()
                )
            );
    END IF;

    -- Scraping jobs RLS
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'scraping_jobs' AND rowsecurity = true) THEN
        ALTER TABLE scraping_jobs ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Users can access project jobs" ON scraping_jobs
            FOR ALL USING (
                EXISTS (
                    SELECT 1 FROM projects 
                    WHERE projects.id = scraping_jobs.project_id 
                    AND projects.user_id = auth.uid()
                )
            );
    END IF;

    -- Scraped data RLS
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'scraped_data' AND rowsecurity = true) THEN
        ALTER TABLE scraped_data ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Users can access project data" ON scraped_data
            FOR ALL USING (
                EXISTS (
                    SELECT 1 FROM scraping_jobs
                    JOIN projects ON projects.id = scraping_jobs.project_id
                    WHERE scraping_jobs.id = scraped_data.job_id
                    AND projects.user_id = auth.uid()
                )
            );
    END IF;
END $$;
