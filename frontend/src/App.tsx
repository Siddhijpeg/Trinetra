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
import { CaseProvider, useCaseContext } from './context/CaseContext';
import { ThemeProvider } from './context/ThemeContext';

const breadcrumbMap: Record<string, string> = {
  command:         'Command Center',
  cases:           'Cases',
  'case-detail':   'Cases / Active Investigation',
  prediction:      'Prediction Engine',
  geo:             'Geo Intelligence',
  'fraud-network': 'Fraud Network',
  osint:           'OSINT Intelligence',
  alerts:          'Alert Center',
  copilot:         'AI Copilot',
  reports:         'Reports',
  datasources:     'Data Sources',
  audit:           'Security & Audit',
};

interface AuthState {
  isLoggedIn: boolean;
  role: string;
  officerId: string;
}

// Inner component so it can use useCaseContext
function AppInner({ auth }: { auth: AuthState }) {
  const [activeScreen, setActiveScreen] = useState('command');
  const { setActiveCase, activeCaseId } = useCaseContext();

  const navigate = (screen: string) => setActiveScreen(screen);

  const openCase = (caseId?: string) => {
    if (caseId) setActiveCase(caseId);
    navigate('case-detail');
  };

  const renderScreen = () => {
    switch (activeScreen) {
      case 'command':
        return <CommandCenter onOpenCase={openCase} />;
      case 'cases':
        return <Cases onOpenCase={openCase} />;
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
        return <AlertCenter onOpenCase={openCase} />;
      case 'copilot':
        return <AICopilot onOpenCase={() => openCase()} />;
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
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 border card-theme">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" style={{ color: 'var(--text-muted)' }}/>
                  <rect x="12" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" style={{ color: 'var(--text-muted)' }}/>
                  <rect x="3" y="12" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" style={{ color: 'var(--text-muted)' }}/>
                  <rect x="12" y="12" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" style={{ color: 'var(--text-muted)' }}/>
                </svg>
              </div>
              <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{breadcrumbMap[activeScreen] || 'Under Construction'}</div>
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>This section is coming soon.</div>
            </div>
          </div>
        );
    }
  };

  const isCopilot = activeScreen === 'copilot';
  const crumb = activeScreen === 'case-detail'
    ? `Cases / ${activeCaseId}`
    : breadcrumbMap[activeScreen];

  return (
    <div className="flex h-full overflow-hidden" style={{ backgroundColor: 'var(--app-bg)' }}>
      <Sidebar
        active={activeScreen === 'case-detail' ? 'cases' : activeScreen}
        onNavigate={navigate}
        officerId={auth.officerId}
        role={auth.role}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          breadcrumb={crumb}
          onCopilotOpen={() => navigate('copilot')}
          officerId={auth.officerId}
        />
        <main className={`flex-1 overflow-auto ${isCopilot ? 'overflow-hidden flex flex-col' : ''}`}>
          {renderScreen()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ isLoggedIn: false, role: '', officerId: '' });

  const handleLogin = (role: string, officerId: string) => {
    setAuth({ isLoggedIn: true, role, officerId });
  };

  if (!auth.isLoggedIn) {
    return (
      <ThemeProvider>
        <Login onLogin={handleLogin} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <CaseProvider>
        <AppInner auth={auth} />
      </CaseProvider>
    </ThemeProvider>
  );
}
