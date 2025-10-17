import React, { useEffect, useState } from 'react';
import { 
  Play, 
  Pause, 
  Clock, 
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader,
  Monitor,
  Globe
} from 'lucide-react';

const RealTimeJobs = ({ supabase }) => {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!supabase) return;

    const fetchJobs = async () => {
      try {
        const { data, error } = await supabase
          .from('scraping_executions')
          .select(`
            id,
            status,
            created_at,
            completed_at,
            error_message,
            records_scraped,
            template_name,
            proxy_used,
            execution_time_ms
          `)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) throw error;
        setJobs(data || []);
      } catch (error) {
        console.error('Error fetching jobs:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchJobs();

    // Set up real-time subscription
    const subscription = supabase
      .channel('scraping_executions_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scraping_executions'
        },
        (payload) => {
          console.log('Job update:', payload);
          fetchJobs(); // Refresh jobs list
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [supabase]);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'running':
        return <Loader className="status-icon running" size={16} />;
      case 'completed':
        return <CheckCircle className="status-icon completed" size={16} />;
      case 'failed':
        return <XCircle className="status-icon failed" size={16} />;
      case 'queued':
        return <Clock className="status-icon queued" size={16} />;
      case 'paused':
        return <Pause className="status-icon paused" size={16} />;
      default:
        return <AlertCircle className="status-icon unknown" size={16} />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return 'blue';
      case 'completed': return 'green';
      case 'failed': return 'red';
      case 'queued': return 'yellow';
      case 'paused': return 'gray';
      default: return 'gray';
    }
  };

  const formatDuration = (ms) => {
    if (!ms) return '-';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatTimeAgo = (dateString) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now - date;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMinutes > 0) return `${diffMinutes}m ago`;
    return 'Just now';
  };

  const filteredJobs = jobs.filter(job => {
    if (filter === 'all') return true;
    return job.status === filter;
  });

  const statusCounts = jobs.reduce((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="real-time-jobs loading">
        <div className="section-header">
          <h2>Real-Time Jobs</h2>
        </div>
        <div className="loading-state">
          <Loader className="spinner" size={24} />
          <span>Loading jobs...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="real-time-jobs">
      <div className="section-header">
        <h2>Real-Time Jobs</h2>
        <div className="job-filters">
          <button 
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All ({jobs.length})
          </button>
          <button 
            className={filter === 'running' ? 'active' : ''}
            onClick={() => setFilter('running')}
          >
            Running ({statusCounts.running || 0})
          </button>
          <button 
            className={filter === 'completed' ? 'active' : ''}
            onClick={() => setFilter('completed')}
          >
            Completed ({statusCounts.completed || 0})
          </button>
          <button 
            className={filter === 'failed' ? 'active' : ''}
            onClick={() => setFilter('failed')}
          >
            Failed ({statusCounts.failed || 0})
          </button>
        </div>
      </div>

      <div className="jobs-list">
        {filteredJobs.length === 0 ? (
          <div className="empty-state">
            <Monitor size={48} />
            <h3>No jobs found</h3>
            <p>No scraping jobs match the current filter</p>
          </div>
        ) : (
          filteredJobs.map((job) => (
            <div key={job.id} className={`job-item status-${job.status}`}>
              <div className="job-header">
                <div className="job-status">
                  {getStatusIcon(job.status)}
                  <span className={`status-text ${getStatusColor(job.status)}`}>
                    {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                  </span>
                </div>
                <div className="job-time">
                  {formatTimeAgo(job.created_at)}
                </div>
              </div>

              <div className="job-details">
                <div className="job-template">
                  <strong>{job.template_name || 'Unknown Template'}</strong>
                </div>
                
                <div className="job-metrics">
                  <div className="metric">
                    <span className="metric-label">Records:</span>
                    <span className="metric-value">{job.records_scraped || 0}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Duration:</span>
                    <span className="metric-value">
                      {formatDuration(job.execution_time_ms)}
                    </span>
                  </div>
                  {job.proxy_used && (
                    <div className="metric">
                      <Globe size={14} />
                      <span className="metric-value">{job.proxy_used}</span>
                    </div>
                  )}
                </div>

                {job.error_message && (
                  <div className="job-error">
                    <AlertCircle size={14} />
                    <span className="error-text">{job.error_message}</span>
                  </div>
                )}
              </div>

              <div className="job-progress">
                <div className={`progress-bar status-${job.status}`}>
                  <div 
                    className="progress-fill"
                    style={{
                      width: job.status === 'completed' ? '100%' : 
                             job.status === 'running' ? '60%' : '0%'
                    }}
                  ></div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {filteredJobs.length > 0 && (
        <div className="jobs-footer">
          <span className="jobs-count">
            Showing {filteredJobs.length} of {jobs.length} jobs
          </span>
          <button className="refresh-btn">
            <Loader size={14} />
            Auto-refresh active
          </button>
        </div>
      )}
    </div>
  );
};

export default RealTimeJobs;