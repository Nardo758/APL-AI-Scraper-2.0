import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const SupabaseContext = createContext();

export const useSupabase = () => {
  const context = useContext(SupabaseContext);
  if (!context) {
    throw new Error('useSupabase must be used within a SupabaseProvider');
  }
  return context;
};

export const SupabaseProvider = ({ children }) => {
  const [supabase, setSupabase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'http://localhost:54321';
      const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'your-anon-key-here';
      
      const client = createClient(supabaseUrl, supabaseKey, {
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      });
      
      setSupabase(client);
      console.log('âœ… Supabase client initialized');
    } catch (err) {
      setError('Failed to initialize Supabase client');
      console.error('âŒ Supabase initialization error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const value = {
    supabase,
    loading,
    error
  };

  if (loading) {
    return (
      <div className="supabase-loading">
        <div className="loading-spinner"></div>
        <p>Connecting to database...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="supabase-error">
        <h2>Connection Error</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  );
};