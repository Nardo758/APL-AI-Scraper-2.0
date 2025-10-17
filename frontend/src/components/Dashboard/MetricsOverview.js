import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  CheckCircle, 
  XCircle,
  Database,
  Zap 
} from 'lucide-react';

const MetricsOverview = ({ data }) => {
  const metrics = [
    {
      title: 'Total Jobs',
      value: data.total_jobs || 0,
      change: data.jobs_change || 0,
      icon: <Database className="metric-icon" />,
      color: 'blue',
      format: 'number'
    },
    {
      title: 'Success Rate',
      value: (data.success_rate || 0) * 100,
      change: (data.success_rate_change || 0) * 100,
      icon: <CheckCircle className="metric-icon" />,
      color: 'green',
      format: 'percentage'
    },
    {
      title: 'Avg Response Time',
      value: data.avg_response_time || 0,
      change: data.response_time_change || 0,
      icon: <Clock className="metric-icon" />,
      color: 'orange',
      format: 'time'
    },
    {
      title: 'Jobs/Hour',
      value: data.jobs_per_hour || 0,
      change: data.jobs_per_hour_change || 0,
      icon: <Zap className="metric-icon" />,
      color: 'purple',
      format: 'number'
    }
  ];

  const formatValue = (value, format) => {
    switch (format) {
      case 'percentage':
        return `${value.toFixed(1)}%`;
      case 'time':
        return `${value.toFixed(2)}s`;
      case 'number':
        return value.toLocaleString();
      default:
        return value.toString();
    }
  };

  const getChangeIcon = (change) => {
    if (change > 0) {
      return <TrendingUp className="change-icon positive" size={14} />;
    } else if (change < 0) {
      return <TrendingDown className="change-icon negative" size={14} />;
    }
    return null;
  };

  return (
    <div className="metrics-overview">
      <div className="section-header">
        <h2>Performance Metrics</h2>
        <span className="update-time">
          Last updated: {new Date().toLocaleTimeString()}
        </span>
      </div>
      
      <div className="metrics-grid">
        {metrics.map((metric, index) => (
          <div key={index} className={`metric-card metric-${metric.color}`}>
            <div className="metric-header">
              <div className="metric-icon-wrapper">
                {metric.icon}
              </div>
              <div className="metric-values">
                <div className="metric-value">
                  {formatValue(metric.value, metric.format)}
                </div>
                {metric.change !== 0 && (
                  <div className="metric-change">
                    {getChangeIcon(metric.change)}
                    <span className={metric.change > 0 ? 'positive' : 'negative'}>
                      {Math.abs(metric.change).toFixed(1)}
                      {metric.format === 'percentage' ? 'pp' : '%'}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="metric-title">{metric.title}</div>
            <div className="metric-sparkline">
              {/* Placeholder for mini chart - could be enhanced with actual data */}
              <div className="sparkline-placeholder"></div>
            </div>
          </div>
        ))}
      </div>

      <div className="metrics-summary">
        <div className="summary-item">
          <span className="summary-label">Active Templates:</span>
          <span className="summary-value">{data.active_templates || 0}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Total Proxies:</span>
          <span className="summary-value">{data.total_proxies || 0}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Queue Size:</span>
          <span className="summary-value">{data.queue_size || 0}</span>
        </div>
      </div>
    </div>
  );
};

export default MetricsOverview;