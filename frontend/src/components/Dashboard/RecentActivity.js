import React, { useEffect, useState } from 'react';
import { 
  Clock, 
  User, 
  FileText, 
  Play, 
  Database,
  Settings,
  Upload,
  Download,
  AlertCircle,
  CheckCircle,
  XCircle
} from 'lucide-react';

const RecentActivity = ({ supabase }) => {
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;

    const fetchRecentActivity = async () => {
      try {
        // Fetch recent scraping executions
        const { data: executions } = await supabase
          .from('scraping_executions')
          .select(`
            id,
            status,
            created_at,
            template_name,
            records_scraped,
            error_message
          `)
          .order('created_at', { ascending: false })
          .limit(10);

        // Fetch recent training sessions
        const { data: trainingSessions } = await supabase
          .from('training_sessions')
          .select(`
            id,
            status,
            created_at,
            session_name,
            interactions_count
          `)
          .order('created_at', { ascending: false })
          .limit(5);

        // Fetch recent scraper templates
        const { data: templates } = await supabase
          .from('scraper_templates')
          .select(`
            id,
            created_at,
            updated_at,
            name,
            status
          `)
          .order('updated_at', { ascending: false })
          .limit(5);

        // Combine and format activities
        const allActivities = [];

        // Add execution activities
        executions?.forEach(exec => {
          allActivities.push({
            id: `exec-${exec.id}`,
            type: 'execution',
            title: `Scraping job ${exec.status}`,
            description: `Template: ${exec.template_name} â€¢ ${exec.records_scraped || 0} records`,
            status: exec.status,
            timestamp: exec.created_at,
            icon: <Play size={16} />,
            details: exec.error_message
          });
        });

        // Add training activities
        trainingSessions?.forEach(session => {
          allActivities.push({
            id: `training-${session.id}`,
            type: 'training',
            title: `Training session ${session.status}`,
            description: `${session.session_name} â€¢ ${session.interactions_count || 0} interactions`,
            status: session.status,
            timestamp: session.created_at,
            icon: <User size={16} />
          });
        });

        // Add template activities
        templates?.forEach(template => {
          const isNew = new Date(template.created_at).getTime() === new Date(template.updated_at).getTime();
          allActivities.push({
            id: `template-${template.id}`,
            type: 'template',
            title: isNew ? 'New template created' : 'Template updated',
            description: template.name,
            status: template.status,
            timestamp: template.updated_at,
            icon: <FileText size={16} />
          });
        });

        // Sort by timestamp and take most recent 15
        allActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setActivities(allActivities.slice(0, 15));

      } catch (error) {
        console.error('Error fetching recent activity:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecentActivity();

    // Set up real-time subscription for activity updates
    const subscription = supabase
      .channel('activity_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scraping_executions'
        },
        () => fetchRecentActivity()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public', 
          table: 'training_sessions'
        },
        () => fetchRecentActivity()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scraper_templates'
        },
        () => fetchRecentActivity()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [supabase]);

  const getActivityIcon = (activity) => {
    switch (activity.type) {
      case 'execution':
        return activity.icon;
      case 'training':
        return activity.icon;
      case 'template':
        return activity.icon;
      case 'system':
        return <Settings size={16} />;
      case 'data':
        return activity.status === 'import' ? <Upload size={16} /> : <Download size={16} />;
      default:
        return <Database size={16} />;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
      case 'active':
      case 'success':
        return <CheckCircle className="status-icon success" size={12} />;
      case 'failed':
      case 'error':
        return <XCircle className="status-icon error" size={12} />;
      case 'running':
      case 'in_progress':
        return <Clock className="status-icon running" size={12} />;
      default:
        return <AlertCircle className="status-icon warning" size={12} />;
    }
  };

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now - date;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMinutes > 0) return `${diffMinutes}m ago`;
    return 'Just now';
  };

  const getActivityTypeColor = (type) => {
    switch (type) {
      case 'execution': return 'blue';
      case 'training': return 'purple';
      case 'template': return 'green';
      case 'system': return 'orange';
      case 'data': return 'cyan';
      default: return 'gray';
    }
  };

  if (isLoading) {
    return (
      <div className="recent-activity loading">
        <div className="section-header">
          <h2>Recent Activity</h2>
        </div>
        <div className="loading-state">
          <Clock className="spinner" size={24} />
          <span>Loading activity...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="recent-activity">
      <div className="section-header">
        <h2>Recent Activity</h2>
        <div className="activity-summary">
          <span className="activity-count">{activities.length} recent events</span>
        </div>
      </div>

      <div className="activity-feed">
        {activities.length === 0 ? (
          <div className="empty-state">
            <Clock size={48} />
            <h3>No recent activity</h3>
            <p>Activity will appear here as you use the system</p>
          </div>
        ) : (
          activities.map((activity) => (
            <div 
              key={activity.id} 
              className={`activity-item type-${activity.type}`}
            >
              <div className="activity-timeline">
                <div className={`activity-dot ${getActivityTypeColor(activity.type)}`}>
                  {getActivityIcon(activity)}
                </div>
                <div className="timeline-line"></div>
              </div>

              <div className="activity-content">
                <div className="activity-header">
                  <div className="activity-title">
                    <span className="title-text">{activity.title}</span>
                    {activity.status && getStatusIcon(activity.status)}
                  </div>
                  <div className="activity-time">
                    {formatTimeAgo(activity.timestamp)}
                  </div>
                </div>

                <div className="activity-description">
                  {activity.description}
                </div>

                {activity.details && (
                  <div className="activity-details">
                    <AlertCircle size={12} />
                    <span className="details-text">{activity.details}</span>
                  </div>
                )}

                <div className="activity-meta">
                  <span className={`activity-type type-${activity.type}`}>
                    {activity.type}
                  </span>
                  {activity.status && (
                    <span className={`activity-status status-${activity.status}`}>
                      {activity.status}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {activities.length > 0 && (
        <div className="activity-footer">
          <button className="view-all-btn">
            View All Activity
          </button>
          <span className="auto-refresh">
            <Clock size={12} />
            Auto-updating
          </span>
        </div>
      )}
    </div>
  );
};

export default RecentActivity;