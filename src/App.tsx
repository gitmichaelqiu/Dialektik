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
  Settings as SettingsIcon,
  ShieldCheck,
  CloudLightning
} from "lucide-react";

function AppContent() {
  const { 
    activePage, 
    setActivePage, 
    isPeerConnected, 
    isGitConnected, 
    pairingRequest,
    approvePairingRequest,
    declinePairingRequest,
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

        {/* Security Vault Indicator */}
        <div className="sync-card flex flex-col gap-1 text-slate-350">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-500" />
            <strong>Vault Online</strong>
          </div>
          <span className="text-[10px] text-slate-400 block">
            P2P Link: {isPeerConnected ? "Active" : "Offline"}
          </span>
          <span className="text-[10px] text-slate-400 block">
            GitHub Sync: {isGitConnected ? "Synced" : "Manual"}
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

      {/* P2P Vault Key Approval Modal */}
      {pairingRequest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white border border-slate-300 rounded-xl p-6 shadow-2xl space-y-4 text-center">
            <CloudLightning className="mx-auto text-[#2f5d62]" size={32} />
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-slate-800">Partner Vault Sync Request</h3>
              <p className="text-xs text-slate-500 leading-relaxed text-left">
                A debate partner (Peer: <span className="font-mono text-[#2f5d62] font-bold">{pairingRequest.peerId.substring(0, 10)}...</span>) is connecting. 
                Allow them to securely synchronize your private case encryption vault and GitHub keys over WebRTC?
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => approvePairingRequest(pairingRequest.peerId)}
                className="flex-grow command primary text-xs font-bold py-2.5 rounded-lg transition-colors"
              >
                Approve & Share
              </button>
              <button
                type="button"
                onClick={declinePairingRequest}
                className="flex-grow command text-xs font-bold py-2.5 rounded-lg transition-colors"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
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
