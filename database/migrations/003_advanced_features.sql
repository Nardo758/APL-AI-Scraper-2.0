-- Phase 5: Advanced Features Database Schema Extensions
-- PostgreSQL/Supabase compatible schema for APL AI Scraper 2.0

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================
-- 5.1 AI-POWERED ENHANCEMENTS
-- ================================

-- Site change detection tracking
CREATE TABLE IF NOT EXISTS site_change_detections (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    template_id UUID REFERENCES scraper_templates(id) ON DELETE CASCADE,
    change_type VARCHAR(100) NOT NULL,
    change_details JSONB NOT NULL,
    confidence DECIMAL(3,2) DEFAULT 0.0,
    auto_repaired BOOLEAN DEFAULT FALSE,
    repair_details JSONB,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Template baselines for change detection
CREATE TABLE IF NOT EXISTS template_baselines (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    template_id UUID REFERENCES scraper_templates(id) ON DELETE CASCADE,
    baseline_data JSONB NOT NULL,
    baseline_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Self-healing scraper events
CREATE TABLE IF NOT EXISTS healing_events (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_id UUID REFERENCES scraping_jobs(id) ON DELETE CASCADE,
    template_id UUID REFERENCES scraper_templates(id) ON DELETE SET NULL,
    strategy VARCHAR(100) NOT NULL,
    success BOOLEAN DEFAULT FALSE,
    original_error TEXT,
    healing_result JSONB,
    attempt_count INTEGER DEFAULT 1,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- 5.2 INTEGRATION ECOSYSTEM  
-- ================================

-- Webhook configurations
CREATE TABLE IF NOT EXISTS webhook_configs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    events TEXT[] DEFAULT '{}',
    secret TEXT,
    headers JSONB DEFAULT '{}',
    retry_config JSONB DEFAULT '{"max_attempts": 3, "backoff_multiplier": 2, "initial_delay": 5000, "max_delay": 300000}',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhook delivery tracking
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    webhook_id UUID REFERENCES webhook_configs(id) ON DELETE CASCADE,
    delivery_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    success BOOLEAN DEFAULT FALSE,
    status_code INTEGER,
    response_body TEXT,
    error_message TEXT,
    duration_ms INTEGER,
    delivered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhook retry tracking
CREATE TABLE IF NOT EXISTS webhook_retries (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    webhook_id UUID REFERENCES webhook_configs(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    payload_hash VARCHAR(32) NOT NULL,
    attempt_count INTEGER DEFAULT 1,
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API keys for third-party access
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key VARCHAR(255) UNIQUE NOT NULL,
    scopes TEXT[] DEFAULT '{}',
    rate_limit INTEGER DEFAULT 1000,
    active BOOLEAN DEFAULT TRUE,
    last_used TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API request logging
CREATE TABLE IF NOT EXISTS api_requests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
    method VARCHAR(10) NOT NULL,
    path TEXT NOT NULL,
    query_params JSONB DEFAULT '{}',
    status_code INTEGER NOT NULL,
    user_agent TEXT,
    ip_address INET,
    duration_ms INTEGER,
    request_size INTEGER DEFAULT 0,
    response_size INTEGER DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Template API access permissions
CREATE TABLE IF NOT EXISTS template_api_access (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    template_id UUID REFERENCES scraper_templates(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
    permissions TEXT[] DEFAULT '{"read", "execute"}',
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    granted_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Export job tracking
CREATE TABLE IF NOT EXISTS export_jobs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    template_id UUID REFERENCES scraper_templates(id) ON DELETE SET NULL,
    format VARCHAR(20) NOT NULL,
    filters JSONB DEFAULT '{}',
    filename VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    record_count INTEGER,
    file_url TEXT,
    file_size BIGINT,
    download_url TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    request_id UUID,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- 5.3 SCALING & PERFORMANCE
-- ================================

-- Cache storage for multi-layer caching
CREATE TABLE IF NOT EXISTS cache_store (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    cache_type VARCHAR(50) DEFAULT 'general',
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    access_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cache performance metrics
CREATE TABLE IF NOT EXISTS cache_metrics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cache_layer VARCHAR(50) NOT NULL,
    type VARCHAR(10) NOT NULL, -- 'hit' or 'miss'
    key_pattern VARCHAR(100),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Worker cluster management
CREATE TABLE IF NOT EXISTS worker_nodes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    worker_id VARCHAR(100) UNIQUE NOT NULL,
    node_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'starting',
    capabilities JSONB DEFAULT '{}',
    current_jobs INTEGER DEFAULT 0,
    total_jobs INTEGER DEFAULT 0,
    memory_usage DECIMAL(5,2),
    cpu_usage DECIMAL(5,2),
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Job queue statistics
CREATE TABLE IF NOT EXISTS job_queue_stats (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    queue_name VARCHAR(100) NOT NULL,
    pending_jobs INTEGER DEFAULT 0,
    active_jobs INTEGER DEFAULT 0,
    completed_jobs INTEGER DEFAULT 0,
    failed_jobs INTEGER DEFAULT 0,
    delayed_jobs INTEGER DEFAULT 0,
    throughput_per_minute DECIMAL(10,2),
    avg_processing_time_ms INTEGER,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance metrics for templates and jobs
CREATE TABLE IF NOT EXISTS performance_metrics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    template_id UUID REFERENCES scraper_templates(id) ON DELETE CASCADE,
    job_id UUID REFERENCES scraping_jobs(id) ON DELETE CASCADE,
    metric_type VARCHAR(50) NOT NULL, -- 'execution_time', 'memory_usage', 'success_rate', etc.
    value DECIMAL(15,6) NOT NULL,
    unit VARCHAR(20), -- 'ms', 'mb', 'percent', etc.
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- System health monitoring
CREATE TABLE IF NOT EXISTS system_health (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    component VARCHAR(100) NOT NULL, -- 'database', 'redis', 'workers', etc.
    status VARCHAR(50) NOT NULL, -- 'healthy', 'warning', 'critical'
    metrics JSONB DEFAULT '{}',
    details JSONB DEFAULT '{}',
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- INDEXES FOR PERFORMANCE
-- ================================

-- Site change detection indexes
CREATE INDEX IF NOT EXISTS idx_site_changes_template_id ON site_change_detections (template_id);
CREATE INDEX IF NOT EXISTS idx_site_changes_detected_at ON site_change_detections (detected_at);
CREATE INDEX IF NOT EXISTS idx_site_changes_type ON site_change_detections (change_type);
CREATE INDEX IF NOT EXISTS idx_site_changes_confidence ON site_change_detections (confidence);

-- Template baseline indexes
CREATE INDEX IF NOT EXISTS idx_baselines_template_id ON template_baselines (template_id);
CREATE INDEX IF NOT EXISTS idx_baselines_active ON template_baselines (is_active);
CREATE INDEX IF NOT EXISTS idx_baselines_created_at ON template_baselines (created_at);

-- Healing events indexes
CREATE INDEX IF NOT EXISTS idx_healing_job_id ON healing_events (job_id);
CREATE INDEX IF NOT EXISTS idx_healing_template_id ON healing_events (template_id);
CREATE INDEX IF NOT EXISTS idx_healing_strategy ON healing_events (strategy);
CREATE INDEX IF NOT EXISTS idx_healing_success ON healing_events (success);
CREATE INDEX IF NOT EXISTS idx_healing_timestamp ON healing_events (timestamp);

-- Webhook indexes
CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON webhook_configs (user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhook_configs (active);
CREATE INDEX IF NOT EXISTS idx_webhooks_events ON webhook_configs USING GIN (events);
CREATE INDEX IF NOT EXISTS idx_webhooks_created_at ON webhook_configs (created_at);

-- Webhook delivery indexes
CREATE INDEX IF NOT EXISTS idx_deliveries_webhook_id ON webhook_deliveries (webhook_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_event_type ON webhook_deliveries (event_type);
CREATE INDEX IF NOT EXISTS idx_deliveries_success ON webhook_deliveries (success);
CREATE INDEX IF NOT EXISTS idx_deliveries_delivered_at ON webhook_deliveries (delivered_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_delivery_id ON webhook_deliveries (delivery_id);

-- Webhook retry indexes
CREATE INDEX IF NOT EXISTS idx_retries_webhook_id ON webhook_retries (webhook_id);
CREATE INDEX IF NOT EXISTS idx_retries_scheduled_for ON webhook_retries (scheduled_for);
CREATE INDEX IF NOT EXISTS idx_retries_payload_hash ON webhook_retries (payload_hash);
CREATE INDEX IF NOT EXISTS idx_retries_attempt_count ON webhook_retries (attempt_count);

-- API key indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys (active);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys (expires_at);

-- API request indexes
CREATE INDEX IF NOT EXISTS idx_api_requests_api_key_id ON api_requests (api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_requests_timestamp ON api_requests (timestamp);
CREATE INDEX IF NOT EXISTS idx_api_requests_path ON api_requests (path);
CREATE INDEX IF NOT EXISTS idx_api_requests_status_code ON api_requests (status_code);
CREATE INDEX IF NOT EXISTS idx_api_requests_method ON api_requests (method);

-- Template API access indexes
CREATE INDEX IF NOT EXISTS idx_template_access_template_id ON template_api_access (template_id);
CREATE INDEX IF NOT EXISTS idx_template_access_api_key_id ON template_api_access (api_key_id);

-- Export job indexes
CREATE INDEX IF NOT EXISTS idx_export_jobs_user_id ON export_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_export_jobs_api_key_id ON export_jobs (api_key_id);
CREATE INDEX IF NOT EXISTS idx_export_jobs_status ON export_jobs (status);
CREATE INDEX IF NOT EXISTS idx_export_jobs_created_at ON export_jobs (created_at);
CREATE INDEX IF NOT EXISTS idx_export_jobs_expires_at ON export_jobs (expires_at);

-- Cache indexes
CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache_store (expires_at);
CREATE INDEX IF NOT EXISTS idx_cache_type ON cache_store (cache_type);
CREATE INDEX IF NOT EXISTS idx_cache_last_accessed ON cache_store (last_accessed);

-- Cache metrics indexes
CREATE INDEX IF NOT EXISTS idx_cache_metrics_layer ON cache_metrics (cache_layer);
CREATE INDEX IF NOT EXISTS idx_cache_metrics_type ON cache_metrics (type);
CREATE INDEX IF NOT EXISTS idx_cache_metrics_timestamp ON cache_metrics (timestamp);
CREATE INDEX IF NOT EXISTS idx_cache_metrics_pattern ON cache_metrics (key_pattern);

-- Worker node indexes
CREATE INDEX IF NOT EXISTS idx_worker_nodes_status ON worker_nodes (status);
CREATE INDEX IF NOT EXISTS idx_worker_nodes_last_heartbeat ON worker_nodes (last_heartbeat);

-- Queue stats indexes
CREATE INDEX IF NOT EXISTS idx_queue_stats_name ON job_queue_stats (queue_name);
CREATE INDEX IF NOT EXISTS idx_queue_stats_recorded_at ON job_queue_stats (recorded_at);

-- Performance metrics indexes
CREATE INDEX IF NOT EXISTS idx_performance_template_id ON performance_metrics (template_id);
CREATE INDEX IF NOT EXISTS idx_performance_job_id ON performance_metrics (job_id);
CREATE INDEX IF NOT EXISTS idx_performance_metric_type ON performance_metrics (metric_type);
CREATE INDEX IF NOT EXISTS idx_performance_timestamp ON performance_metrics (timestamp);

-- System health indexes
CREATE INDEX IF NOT EXISTS idx_system_health_component ON system_health (component);
CREATE INDEX IF NOT EXISTS idx_system_health_status ON system_health (status);
CREATE INDEX IF NOT EXISTS idx_system_health_checked_at ON system_health (checked_at);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_template_status_created ON scraping_jobs(template_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_scraped_data_job_created ON scraped_data(job_id, created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_success_delivered ON webhook_deliveries(webhook_id, success, delivered_at);
CREATE INDEX IF NOT EXISTS idx_api_requests_key_timestamp ON api_requests(api_key_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_template_type_timestamp ON performance_metrics(template_id, metric_type, timestamp);

-- Partial indexes for active records
CREATE INDEX IF NOT EXISTS idx_webhook_configs_active_true ON webhook_configs(user_id, created_at) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_api_keys_active_true ON api_keys(user_id, created_at) WHERE active = true;

-- ================================
-- UNIQUE CONSTRAINTS
-- ================================

ALTER TABLE template_api_access ADD CONSTRAINT IF NOT EXISTS unique_template_api_access UNIQUE (template_id, api_key_id);

-- ================================
-- ENHANCED EXISTING TABLES
-- ================================

-- Add advanced fields to scraper_templates (if they exist)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scraper_templates') THEN
        ALTER TABLE scraper_templates ADD COLUMN IF NOT EXISTS last_change_detected TIMESTAMP WITH TIME ZONE;
        ALTER TABLE scraper_templates ADD COLUMN IF NOT EXISTS last_healed TIMESTAMP WITH TIME ZONE;
        ALTER TABLE scraper_templates ADD COLUMN IF NOT EXISTS last_repaired TIMESTAMP WITH TIME ZONE;
        ALTER TABLE scraper_templates ADD COLUMN IF NOT EXISTS change_details JSONB;
        ALTER TABLE scraper_templates ADD COLUMN IF NOT EXISTS repair_details JSONB;
        ALTER TABLE scraper_templates ADD COLUMN IF NOT EXISTS healing_enabled BOOLEAN DEFAULT TRUE;
        ALTER TABLE scraper_templates ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN DEFAULT TRUE;
    END IF;
END $$;

-- Add API fields to scraping_jobs (if they exist)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scraping_jobs') THEN
        ALTER TABLE scraping_jobs ADD COLUMN IF NOT EXISTS api_key_id UUID;
        ALTER TABLE scraping_jobs ADD COLUMN IF NOT EXISTS request_id UUID;
        ALTER TABLE scraping_jobs ADD COLUMN IF NOT EXISTS healing_attempted BOOLEAN DEFAULT FALSE;
        ALTER TABLE scraping_jobs ADD COLUMN IF NOT EXISTS healing_strategy VARCHAR(100);
        ALTER TABLE scraping_jobs ADD COLUMN IF NOT EXISTS healing_result JSONB;
        
        -- Add foreign key constraint if api_keys table exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'api_keys') THEN
            ALTER TABLE scraping_jobs ADD CONSTRAINT IF NOT EXISTS fk_scraping_jobs_api_key 
                FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

-- Add API access to projects (if they exist)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects') THEN
        ALTER TABLE projects ADD COLUMN IF NOT EXISTS api_access_enabled BOOLEAN DEFAULT FALSE;
        ALTER TABLE projects ADD COLUMN IF NOT EXISTS webhook_url TEXT;
        ALTER TABLE projects ADD COLUMN IF NOT EXISTS webhook_events TEXT[] DEFAULT '{}';
    END IF;
END $$;

-- ================================
-- TRIGGERS AND FUNCTIONS
-- ================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for webhook_configs
DROP TRIGGER IF EXISTS update_webhook_configs_updated_at ON webhook_configs;
CREATE TRIGGER update_webhook_configs_updated_at 
    BEFORE UPDATE ON webhook_configs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
    DELETE FROM cache_store 
    WHERE expires_at IS NOT NULL 
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to calculate template success rate
CREATE OR REPLACE FUNCTION calculate_template_success_rate(template_uuid UUID, days_back INTEGER DEFAULT 7)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    total_jobs INTEGER;
    successful_jobs INTEGER;
    success_rate DECIMAL(5,2);
BEGIN
    -- Get total jobs for template in the specified period
    SELECT COUNT(*) INTO total_jobs
    FROM scraping_jobs 
    WHERE template_id = template_uuid 
    AND created_at >= NOW() - (days_back || ' days')::INTERVAL;
    
    -- Get successful jobs
    SELECT COUNT(*) INTO successful_jobs
    FROM scraping_jobs 
    WHERE template_id = template_uuid 
    AND status = 'completed'
    AND created_at >= NOW() - (days_back || ' days')::INTERVAL;
    
    -- Calculate success rate
    IF total_jobs > 0 THEN
        success_rate = (successful_jobs::DECIMAL / total_jobs::DECIMAL) * 100;
    ELSE
        success_rate = 0;
    END IF;
    
    RETURN success_rate;
END;
$$ LANGUAGE plpgsql;

-- Function to get webhook delivery stats
CREATE OR REPLACE FUNCTION get_webhook_stats(webhook_uuid UUID DEFAULT NULL, days_back INTEGER DEFAULT 7)
RETURNS TABLE(
    total_deliveries BIGINT,
    successful_deliveries BIGINT,
    failed_deliveries BIGINT,
    success_rate DECIMAL(5,2),
    avg_duration DECIMAL(10,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_deliveries,
        COUNT(*) FILTER (WHERE success = true) as successful_deliveries,
        COUNT(*) FILTER (WHERE success = false) as failed_deliveries,
        CASE 
            WHEN COUNT(*) > 0 THEN 
                (COUNT(*) FILTER (WHERE success = true)::DECIMAL / COUNT(*)::DECIMAL) * 100
            ELSE 0
        END as success_rate,
        AVG(duration_ms) as avg_duration
    FROM webhook_deliveries
    WHERE (webhook_uuid IS NULL OR webhook_id = webhook_uuid)
    AND delivered_at >= NOW() - (days_back || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- ================================
-- VIEWS FOR ANALYTICS
-- ================================

-- View for template performance analytics
CREATE OR REPLACE VIEW template_performance_view AS
SELECT 
    st.id,
    st.name,
    st.project_id,
    st.status,
    st.created_at,
    COUNT(sj.id) as total_jobs,
    COUNT(sj.id) FILTER (WHERE sj.status = 'completed') as successful_jobs,
    COUNT(sj.id) FILTER (WHERE sj.status = 'failed') as failed_jobs,
    CASE 
        WHEN COUNT(sj.id) > 0 THEN 
            (COUNT(sj.id) FILTER (WHERE sj.status = 'completed')::DECIMAL / COUNT(sj.id)::DECIMAL) * 100
        ELSE 0
    END as success_rate,
    AVG(sj.execution_duration_ms) as avg_execution_time,
    SUM(sj.records_scraped) as total_records_scraped,
    st.last_change_detected,
    st.last_healed
FROM scraper_templates st
LEFT JOIN scraping_jobs sj ON st.id = sj.template_id 
    AND sj.created_at >= NOW() - INTERVAL '30 days'
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scraper_templates')
  AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scraping_jobs')
GROUP BY st.id, st.name, st.project_id, st.status, st.created_at, 
         st.last_change_detected, st.last_healed;

-- View for API usage analytics
CREATE OR REPLACE VIEW api_usage_view AS
SELECT 
    ak.id as api_key_id,
    ak.name as api_key_name,
    ak.user_id,
    u.email as user_email,
    COUNT(ar.id) as total_requests,
    COUNT(ar.id) FILTER (WHERE ar.timestamp >= DATE_TRUNC('month', NOW())) as requests_this_month,
    COUNT(ar.id) FILTER (WHERE ar.path LIKE '%/scrape%') as scrape_requests,
    COUNT(ar.id) FILTER (WHERE ar.status_code >= 400) as error_requests,
    AVG(ar.duration_ms) as avg_response_time,
    ak.last_used,
    ak.rate_limit
FROM api_keys ak
LEFT JOIN users u ON ak.user_id = u.id
LEFT JOIN api_requests ar ON ak.id = ar.api_key_id
WHERE ak.active = true
  AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users')
GROUP BY ak.id, ak.name, ak.user_id, u.email, ak.last_used, ak.rate_limit;

-- View for system health dashboard
CREATE OR REPLACE VIEW system_health_view AS
SELECT 
    component,
    status,
    metrics,
    details,
    checked_at,
    EXTRACT(EPOCH FROM (NOW() - checked_at)) as seconds_since_check
FROM system_health
WHERE checked_at >= NOW() - INTERVAL '1 hour'
ORDER BY checked_at DESC;

-- ================================
-- COMMENTS FOR DOCUMENTATION
-- ================================

COMMENT ON TABLE site_change_detections IS 'Tracks website structure changes detected by the AI monitoring system';
COMMENT ON TABLE healing_events IS 'Records self-healing attempts and their outcomes for scraping jobs';
COMMENT ON TABLE webhook_configs IS 'Configuration for webhook endpoints and event subscriptions';
COMMENT ON TABLE webhook_deliveries IS 'Tracking of webhook delivery attempts and results';
COMMENT ON TABLE api_keys IS 'API keys for third-party access to the scraping platform';
COMMENT ON TABLE cache_store IS 'Multi-layer cache storage for performance optimization';
COMMENT ON TABLE worker_nodes IS 'Distributed worker node registration and health monitoring';
COMMENT ON TABLE performance_metrics IS 'Performance and efficiency metrics for templates and jobs';