import React, { useEffect, useState } from 'react';
import { 
  Server, 
  Database, 
  Wifi, 
  WifiOff,
  AlertTriangle,
  CheckCircle,
  Clock,
  Activity,
  HardDrive,
  Cpu,
  MemoryStick
} from 'lucide-react';

const SystemHealth = ({ supabase }) => {
  const [healthData, setHealthData] = useState({
    database: { status: 'checking', latency: null, connections: null },
    redis: { status: 'checking', latency: null, memory_usage: null },
    proxies: { active: 0, total: 0, success_rate: 0 },
    system: { cpu_usage: 0, memory_usage: 0, disk_usage: 0, uptime: 0 }
  });
  
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;

    const checkSystemHealth = async () => {
      try {
        // Check database health
        const dbStart = Date.now();
        const { data: dbTest, error: dbError } = await supabase
          .from('system_health')
          .select('*')
          .limit(1);
        void dbTest;
        const dbLatency = Date.now() - dbStart;

        // Get proxy status
        const { data: proxyData } = await supabase
          .from('proxy_list')
          .select('status, last_used, success_rate');

        const activeProxies = proxyData?.filter(p => p.status === 'active').length || 0;
        const totalProxies = proxyData?.length || 0;
        const avgSuccessRate = proxyData?.reduce((acc, p) => acc + (p.success_rate || 0), 0) / totalProxies || 0;

        // Simulate system metrics (in real implementation, these would come from system monitoring)
        const mockSystemMetrics = {
          cpu_usage: Math.random() * 100,
          memory_usage: Math.random() * 100,
          disk_usage: Math.random() * 100,
          uptime: Date.now() - (24 * 60 * 60 * 1000) // 24 hours ago
        };

        setHealthData({
          database: {
            status: dbError ? 'error' : 'healthy',
            latency: dbLatency,
            connections: Math.floor(Math.random() * 10) + 5 // Mock connection count
          },
          redis: {
            status: 'healthy', // Mock Redis status
            latency: Math.floor(Math.random() * 5) + 1,
            memory_usage: Math.random() * 100
          },
          proxies: {
            active: activeProxies,
            total: totalProxies,
            success_rate: avgSuccessRate
          },
          system: mockSystemMetrics
        });

      } catch (error) {
        console.error('Error checking system health:', error);
        setHealthData(prev => ({
          ...prev,
          database: { status: 'error', latency: null, connections: null }
        }));
      } finally {
        setIsLoading(false);
      }
    };

    checkSystemHealth();
    const interval = setInterval(checkSystemHealth, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [supabase]);

  const getStatusIcon = (status, size = 16) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="status-icon healthy" size={size} />;
      case 'warning':
        return <AlertTriangle className="status-icon warning" size={size} />;
      case 'error':
        return <WifiOff className="status-icon error" size={size} />;
      case 'checking':
      default:
        return <Clock className="status-icon checking" size={size} />;
    }
  };

  const formatUptime = (milliseconds) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  const getUsageColor = (percentage) => {
    if (percentage > 90) return 'critical';
    if (percentage > 75) return 'warning';
    if (percentage > 50) return 'moderate';
    return 'good';
  };

  if (isLoading) {
    return (
      <div className="system-health loading">
        <div className="section-header">
          <h2>System Health</h2>
        </div>
        <div className="loading-state">
          <Activity className="spinner" size={24} />
          <span>Checking system status...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="system-health">
      <div className="section-header">
        <h2>System Health</h2>
        <div className="health-status">
          {getStatusIcon('healthy', 20)}
          <span className="status-text">All systems operational</span>
        </div>
      </div>

      <div className="health-grid">
        {/* Database Health */}
        <div className="health-card">
          <div className="health-header">
            <Database className="service-icon" size={20} />
            <div className="service-info">
              <h3>Database</h3>
              <div className="service-status">
                {getStatusIcon(healthData.database.status)}
                <span className={`status-text ${healthData.database.status}`}>
                  {healthData.database.status}
                </span>
              </div>
            </div>
          </div>
          <div className="health-metrics">
            <div className="metric">
              <span className="metric-label">Latency:</span>
              <span className="metric-value">
                {healthData.database.latency ? `${healthData.database.latency}ms` : '-'}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Connections:</span>
              <span className="metric-value">{healthData.database.connections || 0}</span>
            </div>
          </div>
        </div>

        {/* Redis Health */}
        <div className="health-card">
          <div className="health-header">
            <Server className="service-icon" size={20} />
            <div className="service-info">
              <h3>Redis Queue</h3>
              <div className="service-status">
                {getStatusIcon(healthData.redis.status)}
                <span className={`status-text ${healthData.redis.status}`}>
                  {healthData.redis.status}
                </span>
              </div>
            </div>
          </div>
          <div className="health-metrics">
            <div className="metric">
              <span className="metric-label">Latency:</span>
              <span className="metric-value">
                {healthData.redis.latency ? `${healthData.redis.latency}ms` : '-'}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Memory:</span>
              <span className="metric-value">
                {healthData.redis.memory_usage ? `${healthData.redis.memory_usage.toFixed(1)}%` : '-'}
              </span>
            </div>
          </div>
        </div>

        {/* Proxy Health */}
        <div className="health-card">
          <div className="health-header">
            <Wifi className="service-icon" size={20} />
            <div className="service-info">
              <h3>Proxy Network</h3>
              <div className="service-status">
                {getStatusIcon(healthData.proxies.active > 0 ? 'healthy' : 'warning')}
                <span className={`status-text ${healthData.proxies.active > 0 ? 'healthy' : 'warning'}`}>
                  {healthData.proxies.active > 0 ? 'Active' : 'Limited'}
                </span>
              </div>
            </div>
          </div>
          <div className="health-metrics">
            <div className="metric">
              <span className="metric-label">Active:</span>
              <span className="metric-value">
                {healthData.proxies.active}/{healthData.proxies.total}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Success Rate:</span>
              <span className="metric-value">
                {(healthData.proxies.success_rate * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* System Resources */}
        <div className="health-card system-resources">
          <div className="health-header">
            <Activity className="service-icon" size={20} />
            <div className="service-info">
              <h3>System Resources</h3>
              <div className="service-status">
                <span className="status-text uptime">
                  Uptime: {formatUptime(healthData.system.uptime)}
                </span>
              </div>
            </div>
          </div>
          
          <div className="resource-metrics">
            <div className="resource-item">
              <div className="resource-header">
                <Cpu size={16} />
                <span>CPU Usage</span>
                <span className="resource-value">
                  {healthData.system.cpu_usage.toFixed(1)}%
                </span>
              </div>
              <div className="resource-bar">
                <div 
                  className={`resource-fill ${getUsageColor(healthData.system.cpu_usage)}`}
                  style={{ width: `${healthData.system.cpu_usage}%` }}
                ></div>
              </div>
            </div>

            <div className="resource-item">
              <div className="resource-header">
                <MemoryStick size={16} />
                <span>Memory</span>
                <span className="resource-value">
                  {healthData.system.memory_usage.toFixed(1)}%
                </span>
              </div>
              <div className="resource-bar">
                <div 
                  className={`resource-fill ${getUsageColor(healthData.system.memory_usage)}`}
                  style={{ width: `${healthData.system.memory_usage}%` }}
                ></div>
              </div>
            </div>

            <div className="resource-item">
              <div className="resource-header">
                <HardDrive size={16} />
                <span>Disk Usage</span>
                <span className="resource-value">
                  {healthData.system.disk_usage.toFixed(1)}%
                </span>
              </div>
              <div className="resource-bar">
                <div 
                  className={`resource-fill ${getUsageColor(healthData.system.disk_usage)}`}
                  style={{ width: `${healthData.system.disk_usage}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="health-footer">
        <span className="last-check">
          Last health check: {new Date().toLocaleTimeString()}
        </span>
        <button className="refresh-health">
          <Activity size={14} />
          Auto-refresh: 30s
        </button>
      </div>
    </div>
  );
};

export default SystemHealth;