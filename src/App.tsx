import { AppProvider, useApp } from "./context/AppContext";
import { Documents } from "./pages/Documents";
import { InRound } from "./pages/InRound";
import { History } from "./pages/History";
import { AI } from "./pages/AI";
import { Settings } from "./pages/Settings";
import { motion } from "framer-motion";
import { 
  FileText, 
  Radio, 
  Bot,
  History as HistoryIcon, 
  Settings as SettingsIcon,
  Wifi,
  WifiOff
} from "lucide-react";

function AppContent() {
  const { 
    activePage, 
    setActivePage, 
    isPeerConnected, 
    userName
  } = useApp();

  const navItems = [
    { id: "inround", label: "In-Round", icon: Radio },
    { id: "documents", label: "Documents", icon: FileText },
    { id: "ai", label: "AI Coach", icon: Bot },
    { id: "history", label: "History", icon: HistoryIcon },
    { id: "settings", label: "Settings", icon: SettingsIcon }
  ];

  return (
    <div className="app-shell select-none">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">Δ</div>
          <div>
            <strong>Dialektik</strong>
            <span>{userName || "No user set"}</span>
          </div>
        </div>

        <nav aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon;
            const selected = activePage === item.id;

            return (
              <button
                key={item.id}
                type="button"
                className={selected ? "active" : ""}
                onClick={() => setActivePage(item.id)}
                aria-current={selected ? "page" : undefined}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <motion.div
          className="sync-card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div className="flex items-center gap-2">
            {isPeerConnected ? (
              <Wifi size={18} className="text-emerald-700" />
            ) : (
              <WifiOff size={18} className="text-muted-foreground" />
            )}
            <strong>Peer Sync</strong>
          </div>
          <span>{isPeerConnected ? "P2P link active" : "Offline until a room connects"}</span>
          <span>Recovery through peers in active rooms</span>
        </motion.div>
      </aside>

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
