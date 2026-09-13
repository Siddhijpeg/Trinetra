import React, { useState } from 'react';
import Login from './screens/Login';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import CommandCenter from './screens/CommandCenter';
import Cases from './screens/Cases';
import CaseWorkspace from './screens/CaseWorkspace';
import FraudNetwork from './screens/FraudNetwork';
import GeoIntelligence from './screens/GeoIntelligence';
import OSINTIntelligence from './screens/OSINTIntelligence';
import AlertCenter from './screens/AlertCenter';
import AICopilot from './screens/AICopilot';
import PredictionEngine from './screens/PredictionEngine';
import DataSources from './screens/DataSources';
import Reports from './screens/Reports';
import AuditLogs from './screens/AuditLogs';

const breadcrumbMap: Record<string, string> = {
  command:      'Command Center',
  cases:        'Cases',
  'case-detail':'Cases / NCRP-26-81942',
  prediction:   'Prediction Engine',
  geo:          'Geo Intelligence',
  'fraud-network': 'Fraud Network',
  osint:        'OSINT Intelligence',
  alerts:       'Alert Center',
  copilot:      'AI Copilot',
  reports:      'Reports',
  datasources:  'Data Sources',
  audit:        'Security & Audit',
};

interface AuthState {
  isLoggedIn: boolean;
  role: string;
  officerId: string;
}

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ isLoggedIn: false, role: '', officerId: '' });
  const [activeScreen, setActiveScreen] = useState('command');

  const navigate = (screen: string) => setActiveScreen(screen);

  const handleLogin = (role: string, officerId: string) => {
    setAuth({ isLoggedIn: true, role, officerId });
  };

  // Not logged in → show Login screen
  if (!auth.isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  const renderScreen = () => {
    switch (activeScreen) {
      case 'command':
        return <CommandCenter onOpenCase={() => navigate('case-detail')} />;
      case 'cases':
        return <Cases onOpenCase={() => navigate('case-detail')} />;
      case 'case-detail':
        return <CaseWorkspace onBack={() => navigate('cases')} />;
      case 'prediction':
        return <PredictionEngine />;
      case 'geo':
        return <GeoIntelligence />;
      case 'fraud-network':
        return <FraudNetwork />;
      case 'osint':
        return <OSINTIntelligence />;
      case 'alerts':
        return <AlertCenter onOpenCase={() => navigate('case-detail')} />;
      case 'copilot':
        return <AICopilot onOpenCase={() => navigate('case-detail')} />;
      case 'reports':
        return <Reports />;
      case 'datasources':
        return <DataSources />;
      case 'audit':
        return <AuditLogs />;
      default:
        return (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#F7F8FA] border border-[#E2E8F0] flex items-center justify-center mx-auto mb-4">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#94A3B8" strokeWidth="1.4"/>
                  <rect x="12" y="3" width="7" height="7" rx="1.5" stroke="#94A3B8" strokeWidth="1.4"/>
                  <rect x="3" y="12" width="7" height="7" rx="1.5" stroke="#94A3B8" strokeWidth="1.4"/>
                  <rect x="12" y="12" width="7" height="7" rx="1.5" stroke="#94A3B8" strokeWidth="1.4"/>
                </svg>
              </div>
              <div className="font-semibold text-[#0F172A] mb-1">{breadcrumbMap[activeScreen] || 'Under Construction'}</div>
              <div className="text-sm text-[#94A3B8]">This section is coming soon.</div>
            </div>
          </div>
        );
    }
  };

  const isCopilot = activeScreen === 'copilot';

  return (
    <div className="flex h-full overflow-hidden bg-[#F7F8FA]">
      {/* Sidebar */}
      <Sidebar
        active={activeScreen === 'case-detail' ? 'cases' : activeScreen}
        onNavigate={navigate}
        officerId={auth.officerId}
        role={auth.role}
      />

      {/* Main Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <TopBar
          breadcrumb={breadcrumbMap[activeScreen]}
          onCopilotOpen={() => navigate('copilot')}
          officerId={auth.officerId}
        />

        {/* Screen Content */}
        <main className={`flex-1 overflow-auto ${isCopilot ? 'overflow-hidden flex flex-col' : ''}`}>
          {renderScreen()}
        </main>
      </div>
    </div>
  );
}
