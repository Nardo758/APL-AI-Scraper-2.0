import React, { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '../../contexts/SupabaseContext';
import { useNotifications } from '../../contexts/NotificationContext';
import MetricsOverview from './MetricsOverview';
import RealTimeJobs from './RealTimeJobs';
import SystemHealth from './SystemHealth';
import RecentActivity from './RecentActivity';
import AlertPanel from './AlertPanel';
import './Dashboard.css';

const Dashboard = () => {
  const { supabase } = useSupabase();
  const { addNotification } = useNotifications();
  const [dashboardData, setDashboardData] = useState({
    metrics: {},
    activeJobs: [],
    systemHealth: {},
    recentActivity: []
  });
  const [loading, setLoading] = useState(true);

  const handleJobUpdate = useCallback((payload) => {
    if (payload.eventType === 'INSERT' && payload.new.status === 'running') {
      // New job started
      setDashboardData(prev => ({
        ...prev,
        activeJobs: [payload.new, ...prev.activeJobs.slice(0, 9)],
        recentActivity: [payload.new, ...prev.recentActivity.slice(0, 19)]
      }));
    } else if (payload.eventType === 'UPDATE') {
      // Job status changed
      setDashboardData(prev => ({
        ...prev,
        activeJobs: prev.activeJobs.map(job => 
          job.id === payload.new.id ? payload.new : job
        ).filter(job => job.status === 'running'),
        recentActivity: [payload.new, ...prev.recentActivity.slice(0, 19)]
      }));

      // Show notification for completed/failed jobs
      if (payload.new.status === 'completed') {
        addNotification('success', `Job completed: ${payload.new.url}`);
      } else if (payload.new.status === 'failed') {
        addNotification('error', `Job failed: ${payload.new.url}`);
      }
    }
  }, [addNotification]);

  const loadDashboardData = useCallback(async () => {
    try {
      // Load dashboard metrics from API
      const response = await fetch('/api/dashboard/metrics');
      const metrics = await response.json();

      // Load active jobs
      const { data: jobs } = await supabase
        .from('scraping_executions')
        .select(`
          *,
          scraper_templates(name, version)
        `)
        .eq('status', 'running')
        .order('created_at', { ascending: false })
        .limit(10);

      // Load system health
      const healthResponse = await fetch('/api/system/status');
      const systemHealth = await healthResponse.json();

      // Load recent activity
      const { data: activity } = await supabase
        .from('scraping_executions')
        .select(`
          *,
          scraper_templates(name)
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      setDashboardData({
        metrics: metrics || {},
        activeJobs: jobs || [],
        systemHealth: systemHealth || {},
        recentActivity: activity || []
      });
    } catch (error) {
      console.error('Dashboard data load error:', error);
      addNotification('error', 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [supabase, addNotification]);

  const setupRealtimeSubscriptions = useCallback(() => {
    // Real-time job updates
    const jobSubscription = supabase
      .channel('jobs-channel')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'scraping_executions' },
        (payload) => {
          handleJobUpdate(payload);
        }
      )
      .subscribe();

    // System health updates
    const healthSubscription = supabase
      .channel('health-channel')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'system_health' },
        (payload) => {
          setDashboardData(prev => ({
            ...prev,
            systemHealth: payload.new
          }));
        }
      )
      .subscribe();

    return () => {
      jobSubscription.unsubscribe();
      healthSubscription.unsubscribe();
    };
  }, [supabase, handleJobUpdate]);

  // loadDashboardData and setupRealtimeSubscriptions are stable via useCallback
  // and safe to include in the effect deps so subscriptions won't re-subscribe
  // unnecessarily when their references are stable.
  useEffect(() => {
    let cleanup = null;
    (async () => {
      await loadDashboardData();
      cleanup = setupRealtimeSubscriptions();
    })();

    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [loadDashboardData, setupRealtimeSubscriptions]);

  const handleNewScrapingJob = () => {
    // Navigate to scrapers page or show job creation modal
    window.location.href = '/scrapers';
  };

  const handleHealthCheck = async () => {
    try {
      const response = await fetch('/api/system/status');
      const health = await response.json();
      
      if (health.services) {
        const failedServices = Object.entries(health.services)
          .filter(([name, status]) => !status)
          .map(([name]) => name);
          
        if (failedServices.length > 0) {
          addNotification('warning', `Services need attention: ${failedServices.join(', ')}`);
        } else {
          addNotification('success', 'All systems operational');
        }
      }
    } catch (error) {
      addNotification('error', 'Health check failed');
    }
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <h1>Command Center</h1>
          <p>Monitor and manage your AI scraping operations</p>
        </div>
        <div className="dashboard-actions">
          <button className="btn btn-primary" onClick={handleNewScrapingJob}>
            New Scraping Job
          </button>
          <button className="btn btn-secondary" onClick={handleHealthCheck}>
            Run Health Check
          </button>
        </div>
      </div>

      <AlertPanel />

      <div className="dashboard-grid">
        <div className="grid-column main-column">
          <MetricsOverview data={dashboardData.metrics} />
          <RealTimeJobs jobs={dashboardData.activeJobs} />
        </div>
        
        <div className="grid-column side-column">
          <SystemHealth data={dashboardData.systemHealth} />
          <RecentActivity activities={dashboardData.recentActivity} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;