import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { 
  Bot, 
  Users, 
  Lock,
  Radio
} from "lucide-react";
import db from "../services/db";

export const Settings: React.FC = () => {
  const {
    userName,
    aiApiKey,
    aiEndpoint,
    aiModel,
    saveSettings
  } = useApp();

  const [nameInput, setNameInput] = useState(userName);
  const [aiKeyInput, setAiKeyInput] = useState(aiApiKey);
  const [aiEndInput, setAiEndInput] = useState(aiEndpoint);
  const [aiModelInput, setAiModelInput] = useState(aiModel);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const showNotice = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(null), 2500);
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings({ userName: nameInput });
    showNotice("User profile saved.");
  };

  const handleAISubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings({
      aiApiKey: aiKeyInput,
      aiEndpoint: aiEndInput,
      aiModel: aiModelInput
    });
    showNotice("AI settings saved.");
  };

  const resetLocalWorkspace = async () => {
    await db.settings.clear();
    await db.documents.clear();
    await db.cards.clear();
    await db.history.clear();
    await db.practice_sessions.clear();
    localStorage.clear();
    window.location.reload();
  };

  return (
    <section className="settings-grid">
      {notice && <div className="toast" role="status">{notice}</div>}
      {resetConfirmOpen && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="reset-workspace-title">
          <div className="confirm-dialog">
            <h2 id="reset-workspace-title">Reset Workspace?</h2>
            <p>All local settings, documents, evidence cards, history, and active room data will be removed.</p>
            <div className="confirm-actions">
              <button type="button" className="command" onClick={() => setResetConfirmOpen(false)}>
                Cancel
              </button>
              <button type="button" className="command danger-command inline-danger" onClick={resetLocalWorkspace}>
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Column 1: User Profile & Security */}
      <div className="space-y-4">
        {/* Profile Panel */}
        <div className="panel">
          <div className="panel-header compact">
            <h2>User Profile</h2>
            <Users size={18} />
          </div>
          <form onSubmit={handleProfileSubmit} className="space-y-3">
            <label className="field compact-field">
              <span>UserName *</span>
              <input 
                value={nameInput} 
                onChange={(e) => setNameInput(e.target.value)} 
                placeholder="Enter user name..."
                required
              />
            </label>
            <button type="submit" className="command primary w-full">
              Save Profile
            </button>
          </form>
        </div>

        <div className="panel">
          <div className="panel-header compact">
            <h2>Peer Sync Policy</h2>
            <Radio size={18} />
          </div>
          <p className="inline-note">
            GitHub sync, local client encryption setup, and absent-partner fallback are disabled for now. Shared files recover through connected peers in active rooms.
          </p>
        </div>
      </div>

      {/* Column 2: AI Configuration Server */}
      <div className="space-y-4">
        <div className="panel">
          <div className="panel-header compact">
            <h2>AI LLM Configuration</h2>
            <Bot size={18} />
          </div>
          <form onSubmit={handleAISubmit} className="space-y-4">
            <label className="field compact-field">
              <span>API Base URL</span>
              <input 
                value={aiEndInput} 
                onChange={(e) => setAiEndInput(e.target.value)} 
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label className="field compact-field">
              <span>Model Name</span>
              <input 
                value={aiModelInput} 
                onChange={(e) => setAiModelInput(e.target.value)} 
                placeholder="gpt-4o"
              />
            </label>
            <label className="field compact-field">
              <span>API Key</span>
              <input 
                type="password"
                value={aiKeyInput} 
                onChange={(e) => setAiKeyInput(e.target.value)} 
                placeholder="sk-..."
              />
            </label>
            <button type="submit" className="command primary w-full">
              Save AI Settings
            </button>
          </form>
        </div>
      </div>

      <div className="space-y-4">
        {/* Reset Panel */}
        <div className="panel border-rose-200/50 bg-rose-500/5">
          <div className="panel-header compact text-rose-700">
            <h2>Destructive Options</h2>
            <Lock size={15} />
          </div>
          <button 
            type="button" 
            onClick={() => setResetConfirmOpen(true)} 
            className="command w-full danger-command inline-danger"
          >
            Reset Local Workspace
          </button>
        </div>
      </div>
    </section>
  );
};

export default Settings;
