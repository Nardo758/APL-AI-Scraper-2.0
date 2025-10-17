import React, { createContext, useContext, useState, useCallback } from 'react';
import toast, { Toaster } from 'react-hot-toast';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((type, message, options = {}) => {
    const id = Date.now() + Math.random();
    
    const notification = {
      id,
      type,
      message,
      timestamp: new Date(),
      ...options
    };

    setNotifications(prev => [notification, ...prev.slice(0, 99)]); // Keep last 100

    // Show toast notification
    switch (type) {
      case 'success':
        toast.success(message, {
          id: id.toString(),
          duration: options.duration || 4000,
          position: 'top-right',
        });
        break;
      case 'error':
        toast.error(message, {
          id: id.toString(),
          duration: options.duration || 6000,
          position: 'top-right',
        });
        break;
      case 'warning':
        toast(message, {
          id: id.toString(),
          duration: options.duration || 5000,
          position: 'top-right',
          icon: 'âš ï¸',
        });
        break;
      case 'info':
      default:
        toast(message, {
          id: id.toString(),
          duration: options.duration || 4000,
          position: 'top-right',
          icon: 'â„¹ï¸',
        });
        break;
    }

    return id;
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    toast.dismiss(id.toString());
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
    toast.dismiss();
  }, []);

  const value = {
    notifications,
    addNotification,
    removeNotification,
    clearAllNotifications
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <Toaster
        position="top-right"
        reverseOrder={false}
        gutter={8}
        containerClassName=""
        containerStyle={{}}
        toastOptions={{
          // Default options for all toasts
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
            fontSize: '14px',
            borderRadius: '8px',
            padding: '12px 16px',
          },
          success: {
            style: {
              background: '#10b981',
            },
          },
          error: {
            style: {
              background: '#ef4444',
            },
          },
        }}
      />
    </NotificationContext.Provider>
  );
};