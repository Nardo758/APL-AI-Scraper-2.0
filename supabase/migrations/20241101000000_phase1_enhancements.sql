-- Phase 1: Database Schema Enhancements for APL AI Scraper 2.0
-- Adds market intelligence fields, enhanced tracking, and AI integration improvements

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================
-- ENHANCED SCRAPED_PROPERTIES TABLE
-- ================================

-- Add market intelligence fields to scraped_properties
DO $$ 
BEGIN
    -- Market Intelligence Fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'scraped_properties' AND column_name = 'days_on_market') THEN
        ALTER TABLE scraped_properties ADD COLUMN days_on_market INTEGER;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'scraped_properties' AND column_name = 'market_velocity') THEN
        ALTER TABLE scraped_properties ADD COLUMN market_velocity DECIMAL(5,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'scraped_properties' AND column_name = 'market_position') THEN
        ALTER TABLE scraped_properties ADD COLUMN market_position VARCHAR(20);
        -- 'above_market', 'at_market', 'below_market'
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'scraped_properties' AND column_name = 'percentile_rank') THEN
        ALTER TABLE scraped_properties ADD COLUMN percentile_rank INTEGER;
        -- 0-100 percentile ranking
    END IF;

    -- Enhanced Tracking Fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'scraped_properties' AND column_name = 'listing_status') THEN
        ALTER TABLE scraped_properties ADD COLUMN listing_status VARCHAR(20) DEFAULT 'active';
        -- 'active', 'inactive', 'pending', 'rented'
    END IF;

    -- Structured Data Fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'scraped_properties' AND column_name = 'pet_policy') THEN
        ALTER TABLE scraped_properties ADD COLUMN pet_policy JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'scraped_properties' AND column_name = 'parking_info') THEN
        ALTER TABLE scraped_properties ADD COLUMN parking_info JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'scraped_properties' AND column_name = 'lease_terms') THEN
        ALTER TABLE scraped_properties ADD COLUMN lease_terms JSONB;
    END IF;

    -- AI Enhancement Fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'scraped_properties' AND column_name = 'ai_confidence_score') THEN
        ALTER TABLE scraped_properties ADD COLUMN ai_confidence_score DECIMAL(3,2) DEFAULT 0.0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'scraped_properties' AND column_name = 'visual_analysis') THEN
        ALTER TABLE scraped_properties ADD COLUMN visual_analysis JSONB;
    END IF;
END $$;

-- ================================
-- ENHANCED SCRAPING_QUEUE TABLE
-- ================================

-- Add advanced queue management fields
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scraping_queue') THEN
        -- AI Model Selection
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'scraping_queue' AND column_name = 'preferred_ai_model') THEN
            ALTER TABLE scraping_queue ADD COLUMN preferred_ai_model VARCHAR(50) DEFAULT 'claude-3-haiku';
        END IF;
        
        -- Batch Processing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'scraping_queue' AND column_name = 'batch_id') THEN
            ALTER TABLE scraping_queue ADD COLUMN batch_id UUID;
        END IF;
        
        -- Performance Tracking
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'scraping_queue' AND column_name = 'processing_duration_ms') THEN
            ALTER TABLE scraping_queue ADD COLUMN processing_duration_ms INTEGER;
        END IF;
        
        -- Error Classification
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'scraping_queue' AND column_name = 'error_category') THEN
            ALTER TABLE scraping_queue ADD COLUMN error_category VARCHAR(50);
            -- 'network', 'parsing', 'ai_analysis', 'rate_limit', 'unknown'
        END IF;
    END IF;
END $$;

-- ================================
-- NEW TABLES FOR PHASE 1
-- ================================

-- AI Processing Batches
CREATE TABLE IF NOT EXISTS ai_processing_batches (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    batch_type VARCHAR(50) NOT NULL, -- 'claude_queue', 'gpt4v_visual', 'data_processing'
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    total_items INTEGER DEFAULT 0,
    processed_items INTEGER DEFAULT 0,
    failed_items INTEGER DEFAULT 0,
    ai_model VARCHAR(50),
    configuration JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID
);

-- Visual Analysis Results (GPT-4V specific)
CREATE TABLE IF NOT EXISTS visual_analysis_results (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    property_id UUID,
    external_id VARCHAR(255),
    image_url TEXT,
    analysis_type VARCHAR(50), -- 'listing_page', 'property_photo', 'floor_plan', 'amenity_image'
    ai_model VARCHAR(50) DEFAULT 'gpt-4-vision-preview',
    elements_detected JSONB, -- Interactive elements, forms, navigation
    confidence_score DECIMAL(3,2),
    processing_time_ms INTEGER,
    raw_response JSONB,
    error_message TEXT,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Market Intelligence Cache
CREATE TABLE IF NOT EXISTS market_intelligence_cache (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cache_key VARCHAR(255) UNIQUE NOT NULL,
    zip_code VARCHAR(10),
    property_type VARCHAR(50),
    bedrooms INTEGER,
    bathrooms DECIMAL(2,1),
    market_data JSONB NOT NULL,
    percentiles JSONB, -- Price percentile data
    trends JSONB, -- Market trend analysis
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Apartment Website Configurations
CREATE TABLE IF NOT EXISTS apartment_websites (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    base_url TEXT NOT NULL,
    website_type VARCHAR(50), -- 'property_marketing', 'management_company', 'listing_aggregator'
    scraping_config JSONB NOT NULL,
    ai_analysis_config JSONB DEFAULT '{}',
    rate_limit_config JSONB DEFAULT '{"requests_per_minute": 30, "concurrent_requests": 2}',
    last_successful_scrape TIMESTAMP WITH TIME ZONE,
    success_rate DECIMAL(5,2) DEFAULT 0.0,
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'inactive', 'maintenance'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- ENHANCED FUNCTIONS
-- ================================

-- Function to calculate market position
CREATE OR REPLACE FUNCTION calculate_market_position(
    p_price INTEGER,
    p_zip_code VARCHAR(10),
    p_bedrooms INTEGER,
    p_bathrooms DECIMAL(2,1)
) RETURNS VARCHAR(20) AS $$
DECLARE
    market_median INTEGER;
    position VARCHAR(20);
BEGIN
    -- Get market median for similar properties
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY current_price)::INTEGER
    INTO market_median
    FROM scraped_properties
    WHERE zip_code = p_zip_code
    AND bedrooms = p_bedrooms
    AND ABS(bathrooms - p_bathrooms) <= 0.5
    AND current_price IS NOT NULL
    AND listing_status = 'active'
    AND last_seen_at >= NOW() - INTERVAL '30 days';
    
    -- Determine position
    IF market_median IS NULL THEN
        position = 'unknown';
    ELSIF p_price > market_median * 1.1 THEN
        position = 'above_market';
    ELSIF p_price < market_median * 0.9 THEN
        position = 'below_market';
    ELSE
        position = 'at_market';
    END IF;
    
    RETURN position;
END;
$$ LANGUAGE plpgsql;

-- Function to update market intelligence
CREATE OR REPLACE FUNCTION update_market_intelligence()
RETURNS TRIGGER AS $$
BEGIN
    -- Update market position
    NEW.market_position = calculate_market_position(
        NEW.current_price,
        NEW.zip_code,
        NEW.bedrooms,
        NEW.bathrooms
    );
    
    -- Calculate days on market if first_seen_at exists
    IF NEW.first_seen_at IS NOT NULL THEN
        NEW.days_on_market = EXTRACT(days FROM NOW() - NEW.first_seen_at)::INTEGER;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function for intelligent queue prioritization
CREATE OR REPLACE FUNCTION calculate_enhanced_priority_score(
    p_property_id VARCHAR(255),
    p_days_since_last_scrape INTEGER,
    p_volatility_score INTEGER,
    p_success_rate NUMERIC,
    p_scrape_attempts INTEGER,
    p_market_demand DECIMAL DEFAULT 1.0
) RETURNS INTEGER AS $$
DECLARE
    base_score INTEGER := 50;
    time_score INTEGER;
    volatility_component INTEGER;
    reliability_score INTEGER;
    demand_multiplier DECIMAL;
BEGIN
    -- Time-based scoring (more urgent for stale data)
    time_score := LEAST(p_days_since_last_scrape * 8, 40);
    
    -- Volatility-based scoring
    volatility_component := (p_volatility_score * 35 / 100)::int;
    
    -- Reliability-based scoring
    reliability_score := CASE 
        WHEN p_success_rate > 0.9 THEN -5
        WHEN p_success_rate > 0.7 THEN 0
        ELSE 10
    END;
    
    -- Failure penalty
    IF p_scrape_attempts > 3 AND p_success_rate < 0.5 THEN
        reliability_score := reliability_score - 25;
    END IF;
    
    -- Market demand multiplier
    demand_multiplier := GREATEST(p_market_demand, 0.5);
    
    RETURN ((base_score + time_score + volatility_component + reliability_score) * demand_multiplier)::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- ================================
-- TRIGGERS
-- ================================

-- Trigger to auto-update market intelligence
DROP TRIGGER IF EXISTS trigger_update_market_intelligence ON scraped_properties;
CREATE TRIGGER trigger_update_market_intelligence
    BEFORE INSERT OR UPDATE ON scraped_properties
    FOR EACH ROW
    EXECUTE FUNCTION update_market_intelligence();

-- ================================
-- INDEXES FOR PERFORMANCE
-- ================================

-- Market intelligence indexes
CREATE INDEX IF NOT EXISTS idx_scraped_properties_market_position ON scraped_properties (market_position);
CREATE INDEX IF NOT EXISTS idx_scraped_properties_percentile_rank ON scraped_properties (percentile_rank);
CREATE INDEX IF NOT EXISTS idx_scraped_properties_days_on_market ON scraped_properties (days_on_market);
CREATE INDEX IF NOT EXISTS idx_scraped_properties_listing_status ON scraped_properties (listing_status);

-- AI processing indexes
CREATE INDEX IF NOT EXISTS idx_ai_batches_status ON ai_processing_batches (status);
CREATE INDEX IF NOT EXISTS idx_ai_batches_type ON ai_processing_batches (batch_type);
CREATE INDEX IF NOT EXISTS idx_ai_batches_created_at ON ai_processing_batches (created_at);

-- Visual analysis indexes
CREATE INDEX IF NOT EXISTS idx_visual_analysis_property_id ON visual_analysis_results (property_id);
CREATE INDEX IF NOT EXISTS idx_visual_analysis_external_id ON visual_analysis_results (external_id);
CREATE INDEX IF NOT EXISTS idx_visual_analysis_type ON visual_analysis_results (analysis_type);
CREATE INDEX IF NOT EXISTS idx_visual_analysis_confidence ON visual_analysis_results (confidence_score);

-- Market cache indexes
CREATE INDEX IF NOT EXISTS idx_market_cache_zip_type ON market_intelligence_cache (zip_code, property_type);
CREATE INDEX IF NOT EXISTS idx_market_cache_expires_at ON market_intelligence_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_market_cache_last_accessed ON market_intelligence_cache (last_accessed);

-- Website config indexes
CREATE INDEX IF NOT EXISTS idx_apartment_websites_status ON apartment_websites (status);
CREATE INDEX IF NOT EXISTS idx_apartment_websites_type ON apartment_websites (website_type);
CREATE INDEX IF NOT EXISTS idx_apartment_websites_success_rate ON apartment_websites (success_rate);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_scraped_properties_location_market ON scraped_properties(zip_code, bedrooms, bathrooms, listing_status, last_seen_at);
CREATE INDEX IF NOT EXISTS idx_scraped_properties_price_analysis ON scraped_properties(current_price, market_position, percentile_rank) WHERE listing_status = 'active';

-- ================================
-- COMMENTS FOR DOCUMENTATION
-- ================================

COMMENT ON TABLE ai_processing_batches IS 'Tracks AI processing batches for Claude and GPT-4V operations';
COMMENT ON TABLE visual_analysis_results IS 'Stores GPT-4V visual analysis results for property images and web pages';
COMMENT ON TABLE market_intelligence_cache IS 'Caches market analysis data to improve performance';
COMMENT ON TABLE apartment_websites IS 'Configuration and metadata for apartment listing websites';

COMMENT ON COLUMN scraped_properties.days_on_market IS 'Number of days the property has been listed';
COMMENT ON COLUMN scraped_properties.market_position IS 'Position relative to market: above_market, at_market, below_market';
COMMENT ON COLUMN scraped_properties.percentile_rank IS 'Price percentile rank (0-100) compared to similar properties';
COMMENT ON COLUMN scraped_properties.ai_confidence_score IS 'AI confidence score for data extraction accuracy (0.0-1.0)';