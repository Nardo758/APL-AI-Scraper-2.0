import React, { useEffect, useState } from 'react';
import { 
  AlertTriangle, 
  AlertCircle,
  XCircle,
  CheckCircle,
  X,
  Bell,
  BellOff,
  Filter,
  RefreshCw
} from 'lucide-react';

const AlertPanel = ({ supabase, notifications }) => {
  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [showDismissed, setShowDismissed] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    const fetchAlerts = async () => {
      try {
        // Fetch system alerts from the database
        const { data: systemAlerts } = await supabase
          .from('system_alerts')
          .select('*')
          .order('created_at', { ascending: false });

        // Fetch recent errors and issues
        const { data: recentErrors } = await supabase
          .from('scraping_executions')
          .select('id, error_message, created_at, template_name')
          .not('error_message', 'is', null)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(10);

        // Check proxy health for alerts
        const { data: proxies } = await supabase
          .from('proxy_list')
          .select('id, url, status, success_rate, last_used');

        const failedProxies = proxies?.filter(p => 
          p.status === 'failed' || p.success_rate < 0.5
        ) || [];

        // Generate alerts from data
        const generatedAlerts = [];

        // Add system alerts
        systemAlerts?.forEach(alert => {
          generatedAlerts.push({
            id: `system-${alert.id}`,
            type: 'system',
            severity: alert.severity || 'medium',
            title: alert.title,
            message: alert.message,
            timestamp: alert.created_at,
            dismissed: alert.dismissed || false,
            source: 'System'
          });
        });

        // Add error alerts
        recentErrors?.forEach(error => {
          generatedAlerts.push({
            id: `error-${error.id}`,
            type: 'error',
            severity: 'high',
            title: 'Scraping Job Failed',
            message: `Template "${error.template_name}": ${error.error_message}`,
            timestamp: error.created_at,
            dismissed: false,
            source: 'Scraper'
          });
        });

        // Add proxy alerts
        if (failedProxies.length > 0) {
          generatedAlerts.push({
            id: 'proxy-health',
            type: 'warning',
            severity: 'medium',
            title: 'Proxy Health Issues',
            message: `${failedProxies.length} proxies are failing or have low success rates`,
            timestamp: new Date().toISOString(),
            dismissed: false,
            source: 'Proxy Manager',
            details: failedProxies.map(p => `${p.url}: ${(p.success_rate * 100).toFixed(1)}%`).join(', ')
          });
        }

        // Check for high queue size
        const { data: queueStats } = await supabase
          .from('job_queue_stats')
          .select('pending_jobs, failed_jobs')
          .single();

        if (queueStats?.pending_jobs > 100) {
          generatedAlerts.push({
            id: 'queue-backlog',
            type: 'warning',
            severity: 'medium',
            title: 'Job Queue Backlog',
            message: `${queueStats.pending_jobs} jobs are pending execution`,
            timestamp: new Date().toISOString(),
            dismissed: false,
            source: 'Job Queue'
          });
        }

        if (queueStats?.failed_jobs > 10) {
          generatedAlerts.push({
            id: 'queue-failures',
            type: 'error',
            severity: 'high',
            title: 'Multiple Job Failures',
            message: `${queueStats.failed_jobs} jobs have failed recently`,
            timestamp: new Date().toISOString(),
            dismissed: false,
            source: 'Job Queue'
          });
        }

        setAlerts(generatedAlerts);

      } catch (error) {
        console.error('Error fetching alerts:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000); // Refresh every minute

    return () => clearInterval(interval);
  }, [supabase]);

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="severity-icon critical" size={16} />;
      case 'high':
        return <AlertTriangle className="severity-icon high" size={16} />;
      case 'medium':
        return <AlertCircle className="severity-icon medium" size={16} />;
      case 'low':
        return <CheckCircle className="severity-icon low" size={16} />;
      default:
        return <AlertCircle className="severity-icon medium" size={16} />;
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'medium': return 'medium';
      case 'low': return 'low';
      default: return 'medium';
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'system':
        return <AlertTriangle size={14} />;
      case 'error':
        return <XCircle size={14} />;
      case 'warning':
        return <AlertCircle size={14} />;
      default:
        return <Bell size={14} />;
    }
  };

  const dismissAlert = async (alertId) => {
    try {
      // Update local state immediately
      setAlerts(prev => prev.map(alert => 
        alert.id === alertId ? { ...alert, dismissed: true } : alert
      ));

      // Update in database if it's a system alert
      if (alertId.startsWith('system-')) {
        const systemAlertId = alertId.replace('system-', '');
        await supabase
          .from('system_alerts')
          .update({ dismissed: true })
          .eq('id', systemAlertId);
      }
    } catch (error) {
      console.error('Error dismissing alert:', error);
    }
  };

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now - date;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);

    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMinutes > 0) return `${diffMinutes}m ago`;
    return 'Just now';
  };

  const filteredAlerts = alerts.filter(alert => {
    if (!showDismissed && alert.dismissed) return false;
    if (filter === 'all') return true;
    if (filter === 'active') return !alert.dismissed;
    return alert.severity === filter;
  });

  const activeCriticalCount = alerts.filter(a => !a.dismissed && a.severity === 'critical').length;
  const activeHighCount = alerts.filter(a => !a.dismissed && a.severity === 'high').length;
  const activeMediumCount = alerts.filter(a => !a.dismissed && a.severity === 'medium').length;

  if (isLoading) {
    return (
      <div className="alert-panel loading">
        <div className="section-header">
          <h2>System Alerts</h2>
        </div>
        <div className="loading-state">
          <Bell className="spinner" size={24} />
          <span>Loading alerts...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="alert-panel">
      <div className="section-header">
        <h2>System Alerts</h2>
        <div className="alert-controls">
          <div className="alert-summary">
            {activeCriticalCount > 0 && (
              <span className="alert-count critical">{activeCriticalCount} Critical</span>
            )}
            {activeHighCount > 0 && (
              <span className="alert-count high">{activeHighCount} High</span>
            )}
            {activeMediumCount > 0 && (
              <span className="alert-count medium">{activeMediumCount} Medium</span>
            )}
            {activeCriticalCount + activeHighCount + activeMediumCount === 0 && (
              <span className="alert-count none">No active alerts</span>
            )}
          </div>
          <button 
            className="refresh-alerts"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="alert-filters">
        <button 
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          All ({alerts.length})
        </button>
        <button 
          className={filter === 'active' ? 'active' : ''}
          onClick={() => setFilter('active')}
        >
          Active ({alerts.filter(a => !a.dismissed).length})
        </button>
        <button 
          className={filter === 'critical' ? 'active' : ''}
          onClick={() => setFilter('critical')}
        >
          Critical ({activeCriticalCount})
        </button>
        <button 
          className={filter === 'high' ? 'active' : ''}
          onClick={() => setFilter('high')}
        >
          High ({activeHighCount})
        </button>
        <button
          className={`show-dismissed ${showDismissed ? 'active' : ''}`}
          onClick={() => setShowDismissed(!showDismissed)}
        >
          {showDismissed ? <BellOff size={14} /> : <Bell size={14} />}
          {showDismissed ? 'Hide' : 'Show'} Dismissed
        </button>
      </div>

      <div className="alerts-list">
        {filteredAlerts.length === 0 ? (
          <div className="empty-state">
            <CheckCircle size={48} />
            <h3>No alerts to show</h3>
            <p>
              {filter === 'all' 
                ? 'All systems are running normally'
                : `No ${filter} alerts found`
              }
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div 
              key={alert.id} 
              className={`alert-item severity-${getSeverityColor(alert.severity)} ${alert.dismissed ? 'dismissed' : ''}`}
            >
              <div className="alert-content">
                <div className="alert-header">
                  <div className="alert-severity">
                    {getSeverityIcon(alert.severity)}
                  </div>
                  <div className="alert-info">
                    <div className="alert-title">{alert.title}</div>
                    <div className="alert-meta">
                      <span className="alert-source">{alert.source}</span>
                      <span className="alert-time">{formatTimeAgo(alert.timestamp)}</span>
                    </div>
                  </div>
                  <div className="alert-actions">
                    {!alert.dismissed && (
                      <button 
                        className="dismiss-btn"
                        onClick={() => dismissAlert(alert.id)}
                        title="Dismiss alert"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="alert-message">
                  {alert.message}
                </div>

                {alert.details && (
                  <div className="alert-details">
                    <strong>Details:</strong> {alert.details}
                  </div>
                )}

                <div className="alert-footer">
                  <div className="alert-type">
                    {getTypeIcon(alert.type)}
                    <span>{alert.type}</span>
                  </div>
                  {alert.dismissed && (
                    <span className="dismissed-indicator">Dismissed</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AlertPanel;