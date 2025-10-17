import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { SupabaseProvider } from './contexts/SupabaseContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Dashboard from './components/Dashboard/Dashboard';
import Projects from './components/Projects/Projects';
import Scrapers from './components/Scrapers/Scrapers';
import Training from './components/Training/Training';
import DataExplorer from './components/DataExplorer/DataExplorer';
import Analytics from './components/Analytics/Analytics';
import Navigation from './components/Layout/Navigation';
import './App.css';

function App() {
  return (
    <SupabaseProvider>
      <NotificationProvider>
        <Router>
          <div className="app">
            <Navigation />
            <main className="main-content">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/scrapers" element={<Scrapers />} />
                <Route path="/training" element={<Training />} />
                <Route path="/data" element={<DataExplorer />} />
                <Route path="/analytics" element={<Analytics />} />
              </Routes>
            </main>
          </div>
        </Router>
      </NotificationProvider>
    </SupabaseProvider>
  );
}

export default App;