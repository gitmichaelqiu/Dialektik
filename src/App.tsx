import { AppProvider, useApp } from "./context/AppContext";
import { Documents } from "./pages/Documents";
import { InRound } from "./pages/InRound";
import { Records } from "./pages/Records";
import { Practice } from "./pages/Practice";
import { Settings } from "./pages/Settings";
import { 
  FileText, 
  Activity, 
  History, 
  UserRound, 
  Settings as SettingsIcon,
  Wifi,
  WifiOff,
  CloudLightning,
  CloudOff
} from "lucide-react";

function AppContent() {
  const { 
    activePage, 
    setActivePage, 
    isPeerConnected, 
    isGitConnected, 
    roomCode,
    pairingRequest,
    approvePairingRequest,
    declinePairingRequest
  } = useApp();

  return (
    <div className="flex h-screen w-screen bg-slate-900 text-slate-100 overflow-hidden font-sans select-none">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-950 flex flex-col justify-between border-r border-slate-800 shrink-0">
        <div>
          {/* Logo */}
          <div className="p-6 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white tracking-wider">
              Δ
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                Dialektik
              </h1>
              <span className="text-xs text-slate-500 font-medium uppercase tracking-widest">
                NSDA Club Portal
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="px-4 space-y-1">
            <button
              onClick={() => setActivePage("documents")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activePage === "documents"
                  ? "bg-indigo-600/10 text-indigo-400 border-l-2 border-indigo-500 pl-3"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              }`}
            >
              <FileText size={18} />
              Shared Documents
            </button>

            <button
              onClick={() => setActivePage("inround")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activePage === "inround"
                  ? "bg-indigo-600/10 text-indigo-400 border-l-2 border-indigo-500 pl-3"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              }`}
            >
              <Activity size={18} />
              In-Round UI
            </button>

            <button
              onClick={() => setActivePage("records")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activePage === "records"
                  ? "bg-indigo-600/10 text-indigo-400 border-l-2 border-indigo-500 pl-3"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              }`}
            >
              <History size={18} />
              Tournament Records
            </button>

            <button
              onClick={() => setActivePage("practice")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activePage === "practice"
                  ? "bg-indigo-600/10 text-indigo-400 border-l-2 border-indigo-500 pl-3"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              }`}
            >
              <UserRound size={18} />
              Practice Debate
            </button>

            <button
              onClick={() => setActivePage("settings")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activePage === "settings"
                  ? "bg-indigo-600/10 text-indigo-400 border-l-2 border-indigo-500 pl-3"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              }`}
            >
              <SettingsIcon size={18} />
              User Settings
            </button>
          </nav>
        </div>

        {/* Connection Status Footers */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 space-y-2">
          {/* Peer connection status */}
          <div className="flex items-center justify-between text-xs text-slate-400 px-2">
            <span className="flex items-center gap-1.5">
              {isPeerConnected ? (
                <Wifi size={12} className="text-emerald-500 animate-pulse" />
              ) : (
                <WifiOff size={12} className="text-rose-500" />
              )}
              Peer Link
            </span>
            <span className="font-semibold text-[10px] tracking-wider uppercase">
              {isPeerConnected ? "Active" : "Offline"}
            </span>
          </div>

          {/* GitHub Sync status */}
          <div className="flex items-center justify-between text-xs text-slate-400 px-2">
            <span className="flex items-center gap-1.5">
              {isGitConnected ? (
                <CloudLightning size={12} className="text-emerald-500" />
              ) : (
                <CloudOff size={12} className="text-slate-650" />
              )}
              GitHub Sync
            </span>
            <span className="font-semibold text-[10px] tracking-wider uppercase">
              {isGitConnected ? "Synced" : "Manual"}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-900">
        {/* Header Bar */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-900/60 backdrop-blur shrink-0">
          <h2 className="text-lg font-semibold tracking-tight text-white capitalize">
            {activePage === "inround" ? "In-Round UI" : activePage.replace("-", " ")}
          </h2>
          <div className="flex items-center gap-4">
            <div className="text-xs text-slate-400 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
              Session Code: <span className="font-mono text-indigo-400 font-bold">{roomCode || "None"}</span>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-900">
          {activePage === "documents" && <Documents />}
          {activePage === "inround" && <InRound />}
          {activePage === "records" && <Records />}
          {activePage === "practice" && <Practice />}
          {activePage === "settings" && <Settings />}
        </div>
      </main>

      {/* P2P Vault Key Approval Modal */}
      {pairingRequest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-center">
            <CloudLightning className="mx-auto text-indigo-400 animate-bounce" size={32} />
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-white">Partner Vault Sync Request</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                A debate partner (Peer: <span className="font-mono text-indigo-300 font-bold">{pairingRequest.peerId.substring(0, 10)}...</span>) is connecting. 
                Allow them to securely synchronize your private case encryption vault and GitHub keys over WebRTC?
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => approvePairingRequest(pairingRequest.peerId)}
                className="flex-grow bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 rounded-lg transition-colors"
              >
                Approve & Share Keys
              </button>
              <button
                onClick={declinePairingRequest}
                className="flex-grow bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2.5 rounded-lg transition-colors border border-slate-700"
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
