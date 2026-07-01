import { AppProvider, useApp } from "./context/AppContext";
import { Documents } from "./pages/Documents";
import { InRound } from "./pages/InRound";
import { History } from "./pages/History";
import { AI } from "./pages/AI";
import { Settings } from "./pages/Settings";
import { 
  FileText, 
  Radio, 
  Bot,
  History as HistoryIcon, 
  Settings as SettingsIcon
} from "lucide-react";

function AppContent() {
  const { 
    activePage, 
    setActivePage, 
    isPeerConnected, 
    userName
  } = useApp();

  return (
    <div className="app-shell select-none">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        {/* Brand Lockup */}
        <div className="brand-lockup">
          <div className="brand-mark">Δ</div>
          <div>
            <strong>Dialektik</strong>
            <span>{userName || "No user set"}</span>
          </div>
        </div>

        {/* Primary Tabs */}
        <nav aria-label="Primary">
          <button 
            type="button" 
            className={activePage === "inround" ? "active" : ""} 
            onClick={() => setActivePage("inround")}
          >
            <Radio size={18} />
            In-Round
          </button>
          <button 
            type="button" 
            className={activePage === "documents" ? "active" : ""} 
            onClick={() => setActivePage("documents")}
          >
            <FileText size={18} />
            Documents
          </button>
          <button 
            type="button" 
            className={activePage === "ai" ? "active" : ""} 
            onClick={() => setActivePage("ai")}
          >
            <Bot size={18} />
            AI
          </button>
          <button 
            type="button" 
            className={activePage === "history" ? "active" : ""} 
            onClick={() => setActivePage("history")}
          >
            <HistoryIcon size={18} />
            History
          </button>
          <button 
            type="button" 
            className={activePage === "settings" ? "active" : ""} 
            onClick={() => setActivePage("settings")}
          >
            <SettingsIcon size={18} />
            Settings
          </button>
        </nav>

        {/* Peer Status Indicator */}
        <div className="sync-card flex flex-col gap-1 text-slate-350">
          <div className="flex items-center gap-2">
            <Radio size={18} className="text-emerald-500" />
            <strong>Peer Sync</strong>
          </div>
          <span className="text-[10px] text-slate-400 block">
            P2P Link: {isPeerConnected ? "Active" : "Offline"}
          </span>
          <span className="text-[10px] text-slate-400 block">
            Recovery: peers only
          </span>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="main-pane overflow-y-auto">
        {activePage === "inround" && <InRound />}
        {activePage === "documents" && <Documents />}
        {activePage === "ai" && <AI />}
        {activePage === "history" && <History />}
        {activePage === "settings" && <Settings />}
      </main>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
