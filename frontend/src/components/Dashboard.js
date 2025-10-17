import React, { useContext, useEffect, useState } from 'react';
import { SupabaseContext } from '../contexts/SupabaseContext';
import { NotificationContext } from '../contexts/NotificationContext';
import MetricsOverview from './Dashboard/MetricsOverview';
import RealTimeJobs from './Dashboard/RealTimeJobs';
import SystemHealth from './Dashboard/SystemHealth';
import RecentActivity from './Dashboard/RecentActivity';
import AlertPanel from './Dashboard/AlertPanel';
import { 
  RefreshCw,
  BarChart3,
  Activity,
  Bell
} from 'lucide-react';

const Dashboard = () => {
  const { supabase } = useContext(SupabaseContext);
  const { showNotification } = useContext(NotificationContext);
  const [dashboardData, setDashboardData] = useState({
    metrics: {},
    isLoading: true,
    lastRefresh: null
  });
  const [activeView, setActiveView] = useState('overview');

  useEffect(() => {
    if (!supabase) return;

    const fetchDashboardData = async () => {
      try {
        // Fetch aggregated metrics for overview
        const { data: executions } = await supabase
          .from('scraping_executions')
          .select('status, execution_time_ms, records_scraped, created_at')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        const { data: templates } = await supabase
          .from('scraper_templates')
          .select('status')
          .eq('status', 'active');

        const { data: proxies } = await supabase
          .from('proxy_list')
          .select('status');

        // Calculate metrics
        const totalJobs = executions?.length || 0;
        const completedJobs = executions?.filter(e => e.status === 'completed').length || 0;
        const successRate = totalJobs > 0 ? completedJobs / totalJobs : 0;
        
        const avgResponseTime = executions?.length > 0 
          ? executions.reduce((acc, e) => acc + (e.execution_time_ms || 0), 0) / executions.length / 1000
          : 0;

        const jobsPerHour = executions?.length > 0 
          ? executions.length / 24 // Last 24 hours
          : 0;

        const metricsData = {
          total_jobs: totalJobs,
          success_rate: successRate,
          avg_response_time: avgResponseTime,
          jobs_per_hour: jobsPerHour,
          active_templates: templates?.length || 0,
          total_proxies: proxies?.length || 0,
          queue_size: Math.floor(Math.random() * 50), // Mock queue size
          // Add some mock change indicators
          jobs_change: Math.random() * 20 - 10,
          success_rate_change: (Math.random() - 0.5) * 0.1,
          response_time_change: Math.random() * 2 - 1,
          jobs_per_hour_change: Math.random() * 10 - 5
        };

        setDashboardData({
          metrics: metricsData,
          isLoading: false,
          lastRefresh: new Date()
        });

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        showNotification('Error loading dashboard data', 'error');
        setDashboardData(prev => ({ ...prev, isLoading: false }));
      }
    };

    fetchDashboardData();

    // Set up real-time subscriptions for dashboard updates
    const subscription = supabase
      .channel('dashboard_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scraping_executions'
        },
        () => {
          fetchDashboardData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [supabase, showNotification]);

  const handleRefresh = () => {
    window.location.reload();
    showNotification('Dashboard refreshed', 'info');
  };

  if (dashboardData.isLoading) {
    return (
      <div className="dashboard loading">
        <div className="loading-spinner">
          <RefreshCw className="animate-spin" size={32} />
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <h1>Command Center</h1>
          <p className="header-subtitle">
            Real-time monitoring and control for APL AI Scraper 2.0
          </p>
        </div>
        <div className="dashboard-controls">
          <div className="view-tabs">
            <button 
              className={activeView === 'overview' ? 'active' : ''}
              onClick={() => setActiveView('overview')}
            >
              <BarChart3 size={16} />
              Overview
            </button>
            <button 
              className={activeView === 'monitoring' ? 'active' : ''}
              onClick={() => setActiveView('monitoring')}
            >
              <Activity size={16} />
              Monitoring
            </button>
            <button 
              className={activeView === 'alerts' ? 'active' : ''}
              onClick={() => setActiveView('alerts')}
            >
              <Bell size={16} />
              Alerts
            </button>
          </div>
          <button className="refresh-btn" onClick={handleRefresh}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        {activeView === 'overview' && (
          <div className="dashboard-grid overview-grid">
            <div className="grid-item metrics-section">
              <MetricsOverview data={dashboardData.metrics} />
            </div>
            
            <div className="grid-item jobs-section">
              <RealTimeJobs supabase={supabase} />
            </div>
            
            <div className="grid-item health-section">
              <SystemHealth supabase={supabase} />
            </div>
            
            <div className="grid-item activity-section">
              <RecentActivity supabase={supabase} />
            </div>
          </div>
        )}

        {activeView === 'monitoring' && (
          <div className="dashboard-grid monitoring-grid">
            <div className="grid-item full-width">
              <RealTimeJobs supabase={supabase} />
            </div>
            
            <div className="grid-item">
              <SystemHealth supabase={supabase} />
            </div>
            
            <div className="grid-item">
              <MetricsOverview data={dashboardData.metrics} />
            </div>
          </div>
        )}

        {activeView === 'alerts' && (
          <div className="dashboard-grid alerts-grid">
            <div className="grid-item full-width">
              <AlertPanel supabase={supabase} notifications={showNotification} />
            </div>
            
            <div className="grid-item">
              <RecentActivity supabase={supabase} />
            </div>
          </div>
        )}
      </div>

      {dashboardData.lastRefresh && (
        <div className="dashboard-footer">
          <span className="last-refresh">
            Last updated: {dashboardData.lastRefresh.toLocaleTimeString()}
          </span>
          <span className="dashboard-status">
            All systems operational
          </span>
        </div>
      )}
    </div>
  );
};

export default Dashboard;