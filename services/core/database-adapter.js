// services/core/database-adapter.js
// Adapter to map our application schema to the existing Supabase database tables

class DatabaseAdapter {
  constructor(supabase) {
    this.supabase = supabase;
  }

  // Map scraping_jobs table operations to scrape_jobs table
  async getScrapingJob(jobId) {
    const { data, error } = await this.supabase
      .from('scrape_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) throw error;

    // Map the fields to our expected schema
    return {
      id: data.id,
      url: data.apartment_url, // Map apartment_url to url
      status: data.status,
      attempts: data.attempt_count, // Map attempt_count to attempts
      config: data.payload?.config || {}, // Extract config from payload
      result: data.payload?.result || null, // Extract result from payload
      created_at: data.created_at,
      started_at: data.started_at,
      completed_at: data.finished_at
    };
  }

  async updateScrapingJob(jobId, updates) {
    // Map our field names to the actual table field names
    const dbUpdates = {};

    if (updates.status) dbUpdates.status = updates.status;
    if (updates.attempts !== undefined) dbUpdates.attempt_count = updates.attempts;
    if (updates.started_at) dbUpdates.started_at = updates.started_at;
    if (updates.completed_at) dbUpdates.finished_at = updates.completed_at;

    // Store config and result in payload
    if (updates.config || updates.result) {
      const { data: currentData } = await this.supabase
        .from('scrape_jobs')
        .select('payload')
        .eq('id', jobId)
        .single();

      const currentPayload = currentData?.payload || {};
      dbUpdates.payload = {
        ...currentPayload,
        ...(updates.config && { config: updates.config }),
        ...(updates.result && { result: updates.result })
      };
    }

    const { error } = await this.supabase
      .from('scrape_jobs')
      .update(dbUpdates)
      .eq('id', jobId);

    if (error) throw error;
  }

  async createScrapingJob(jobData) {
    const dbData = {
      apartment_url: jobData.url,
      status: jobData.status || 'pending',
      attempt_count: jobData.attempts || 0,
      payload: {
        config: jobData.config || {},
        result: jobData.result || null
      }
    };

    const { data, error } = await this.supabase
      .from('scrape_jobs')
      .insert(dbData)
      .select()
      .single();

    if (error) throw error;

    return this.getScrapingJob(data.id);
  }

  // For scraped data, we'll use the payload field in scrape_jobs for now
  // In a full implementation, we might create a separate table or use scraped_properties
  async storeScrapedData(jobId, scrapedData) {
    const { data: currentData } = await this.supabase
      .from('scrape_jobs')
      .select('payload')
      .eq('id', jobId)
      .single();

    const currentPayload = currentData?.payload || {};
    const updatedPayload = {
      ...currentPayload,
      result: scrapedData
    };

    const { error } = await this.supabase
      .from('scrape_jobs')
      .update({ payload: updatedPayload })
      .eq('id', jobId);

    if (error) throw error;
  }
}

module.exports = { DatabaseAdapter };