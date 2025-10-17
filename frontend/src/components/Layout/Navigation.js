import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  Home, 
  FolderOpen, 
  Bot, 
  GraduationCap, 
  Database, 
  BarChart3, 
  Settings,
  Activity
} from 'lucide-react';
import './Navigation.css';

const Navigation = () => {
  const location = useLocation();

  const navItems = [
    {
      path: '/',
      icon: <Home size={20} />,
      label: 'Dashboard',
      exact: true
    },
    {
      path: '/projects',
      icon: <FolderOpen size={20} />,
      label: 'Projects'
    },
    {
      path: '/scrapers',
      icon: <Bot size={20} />,
      label: 'Scrapers'
    },
    {
      path: '/training',
      icon: <GraduationCap size={20} />,
      label: 'Training'
    },
    {
      path: '/data',
      icon: <Database size={20} />,
      label: 'Data Explorer'
    },
    {
      path: '/analytics',
      icon: <BarChart3 size={20} />,
      label: 'Analytics'
    }
  ];

  return (
    <nav className="navigation">
      <div className="nav-header">
        <div className="nav-logo">
          <Activity size={24} />
          <span className="nav-title">APL AI Scraper</span>
        </div>
        <div className="nav-version">v2.0</div>
      </div>

      <div className="nav-menu">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => 
              `nav-item ${isActive ? 'active' : ''}`
            }
            end={item.exact}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </div>

      <div className="nav-footer">
        <div className="nav-item nav-settings">
          <span className="nav-icon">
            <Settings size={20} />
          </span>
          <span className="nav-label">Settings</span>
        </div>
        
        <div className="nav-status">
          <div className="status-indicator online"></div>
          <span className="status-text">System Online</span>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;