-- Phase 3: Scraper Management & Execution Database Schema
-- Created: October 2025
-- Description: Database schema for scraper templates, distributed execution, proxy management, and data processing

-- Scraper templates table
CREATE TABLE scraper_templates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    code TEXT NOT NULL,
    config JSONB DEFAULT '{}',
    version VARCHAR(50) DEFAULT '1.0.0',
    status VARCHAR(50) DEFAULT 'active',
    last_change_detected TIMESTAMP WITH TIME ZONE,
    change_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_template_name_per_project UNIQUE(project_id, name)
);

-- Template versions for history tracking
CREATE TABLE scraper_template_versions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    template_id UUID REFERENCES scraper_templates(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    config JSONB DEFAULT '{}',
    version VARCHAR(50) NOT NULL,
    change_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_version_per_template UNIQUE(template_id, version)
);

-- Template performance metrics
CREATE TABLE template_metrics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    template_id UUID REFERENCES scraper_templates(id) ON DELETE CASCADE,
    total_runs INTEGER DEFAULT 0,
    successful_runs INTEGER DEFAULT 0,
    failed_runs INTEGER DEFAULT 0,
    success_rate DECIMAL(5,4) DEFAULT 0,
    average_duration DECIMAL(10,2) DEFAULT 0,
    last_run TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_metrics_per_template UNIQUE(template_id)
);

-- Proxy management
CREATE TABLE proxy_list (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL,
    username VARCHAR(255),
    password VARCHAR(255),
    type VARCHAR(50) DEFAULT 'http',
    country VARCHAR(100),
    provider VARCHAR(100),
    reliability DECIMAL(5,4) DEFAULT 1.0,
    total_requests INTEGER DEFAULT 0,
    successful_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    success_rate DECIMAL(5,4) DEFAULT 1.0,
    response_time_ms DECIMAL(10,2) DEFAULT 0,
    last_used TIMESTAMP WITH TIME ZONE,
    last_status VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_proxy_endpoint UNIQUE(host, port)
);

-- Data processing schemas
CREATE TABLE data_schemas (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    schema_def JSONB NOT NULL,
    validation_rules JSONB DEFAULT '{}',
    transformation_rules JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_schema_name_per_project UNIQUE(project_id, name)
);

-- Scraping execution jobs (extended from existing jobs table)
CREATE TABLE scraping_executions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_id UUID REFERENCES scraping_jobs(id) ON DELETE CASCADE,
    template_id UUID REFERENCES scraper_templates(id) ON DELETE SET NULL,
    proxy_id UUID REFERENCES proxy_list(id) ON DELETE SET NULL,
    data_schema_id UUID REFERENCES data_schemas(id) ON DELETE SET NULL,
    url TEXT NOT NULL,
    raw_result JSONB,
    processed_result JSONB,
    validation_errors JSONB DEFAULT '[]',
    execution_metadata JSONB DEFAULT '{}',
    captcha_encountered BOOLEAN DEFAULT FALSE,
    captcha_solved BOOLEAN DEFAULT FALSE,
    proxy_used BOOLEAN DEFAULT FALSE,
    execution_duration_ms INTEGER,
    status VARCHAR(50) DEFAULT 'pending',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_executions_template_id (template_id),
    INDEX idx_executions_status (status),
    INDEX idx_executions_created_at (created_at),
    INDEX idx_executions_url_hash (MD5(url))
);

-- CAPTCHA solving logs
CREATE TABLE captcha_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    execution_id UUID REFERENCES scraping_executions(id) ON DELETE CASCADE,
    captcha_type VARCHAR(100),
    detection_method VARCHAR(100), -- 'dom_selector', 'ai_vision', 'manual'
    solving_method VARCHAR(100), -- 'automated_bypass', '2captcha', 'anticaptcha', 'manual'
    solving_duration_ms INTEGER,
    success BOOLEAN,
    cost_usd DECIMAL(10,4) DEFAULT 0,
    error_message TEXT,
    confidence_score DECIMAL(3,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_captcha_logs_execution_id (execution_id),
    INDEX idx_captcha_logs_type (captcha_type),
    INDEX idx_captcha_logs_created_at (created_at)
);

-- Template change detection history
CREATE TABLE template_change_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    template_id UUID REFERENCES scraper_templates(id) ON DELETE CASCADE,
    change_type VARCHAR(100), -- 'structural', 'content', 'selector_failure'
    change_description TEXT,
    confidence_score DECIMAL(3,2),
    sample_data JSONB,
    suggested_fix TEXT,
    auto_applied BOOLEAN DEFAULT FALSE,
    reviewed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_change_history_template_id (template_id),
    INDEX idx_change_history_type (change_type),
    INDEX idx_change_history_created_at (created_at)
);

-- Data quality metrics
CREATE TABLE data_quality_metrics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    template_id UUID REFERENCES scraper_templates(id) ON DELETE CASCADE,
    execution_date DATE NOT NULL,
    total_records INTEGER DEFAULT 0,
    valid_records INTEGER DEFAULT 0,
    invalid_records INTEGER DEFAULT 0,
    duplicate_records INTEGER DEFAULT 0,
    validation_score DECIMAL(5,4) DEFAULT 0,
    completeness_score DECIMAL(5,4) DEFAULT 0,
    accuracy_score DECIMAL(5,4) DEFAULT 0,
    consistency_score DECIMAL(5,4) DEFAULT 0,
    overall_quality_score DECIMAL(5,4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_daily_metrics UNIQUE(template_id, execution_date),
    INDEX idx_quality_metrics_template_id (template_id),
    INDEX idx_quality_metrics_date (execution_date)
);

-- Create indexes for better performance
CREATE INDEX idx_scraper_templates_project_id ON scraper_templates(project_id);
CREATE INDEX idx_scraper_templates_status ON scraper_templates(status);
CREATE INDEX idx_template_versions_template_id ON scraper_template_versions(template_id);
CREATE INDEX idx_proxy_list_status ON proxy_list(status);
CREATE INDEX idx_proxy_list_success_rate ON proxy_list(success_rate DESC);
CREATE INDEX idx_data_schemas_project_id ON data_schemas(project_id);

-- Create functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at columns
CREATE TRIGGER update_scraper_templates_updated_at 
    BEFORE UPDATE ON scraper_templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_template_metrics_updated_at 
    BEFORE UPDATE ON template_metrics 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_proxy_list_updated_at 
    BEFORE UPDATE ON proxy_list 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_data_schemas_updated_at 
    BEFORE UPDATE ON data_schemas 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample proxy data for testing
INSERT INTO proxy_list (host, port, type, country, provider, status) VALUES 
('proxy1.example.com', 8080, 'http', 'US', 'ProxyProvider1', 'active'),
('proxy2.example.com', 3128, 'http', 'UK', 'ProxyProvider1', 'active'),
('proxy3.example.com', 1080, 'socks5', 'DE', 'ProxyProvider2', 'active');

-- Insert sample data schema for testing
INSERT INTO data_schemas (project_id, name, schema_def, validation_rules) 
SELECT 
    id as project_id,
    'Default Product Schema' as name,
    '{"fields": {"title": {"type": "string", "required": true}, "price": {"type": "price", "required": true}, "description": {"type": "string", "required": false}, "image_url": {"type": "url", "required": false}}}' as schema_def,
    '{"deduplicate": {"key": "title"}, "quality_threshold": 0.8}' as validation_rules
FROM projects LIMIT 1;

COMMENT ON TABLE scraper_templates IS 'Stores scraper code templates with versioning and change detection';
COMMENT ON TABLE template_metrics IS 'Tracks performance and reliability metrics for each template';
COMMENT ON TABLE proxy_list IS 'Manages proxy servers for distributed scraping with health monitoring';
COMMENT ON TABLE data_schemas IS 'Defines data validation and processing rules for scraped content';
COMMENT ON TABLE scraping_executions IS 'Detailed execution logs for individual scraping tasks';
COMMENT ON TABLE captcha_logs IS 'Tracks CAPTCHA encounters and solving attempts';
COMMENT ON TABLE template_change_history IS 'Records website changes that affect scraper templates';
COMMENT ON TABLE data_quality_metrics IS 'Daily aggregated data quality metrics per template';