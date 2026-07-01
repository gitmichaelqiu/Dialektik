import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { 
  Key, 
  Github, 
  Bot, 
  RefreshCw, 
  KeyRound, 
  Copy, 
  Check, 
  Users, 
  Lock 
} from "lucide-react";
import db from "../services/db";

export const Settings: React.FC = () => {
  const {
    userName,
    passphrase,
    isKeyDerived,
    githubToken,
    githubOwner,
    githubRepo,
    isGitConnected,
    aiApiKey,
    aiEndpoint,
    aiModel,
    initializeCrypto,
    saveSettings,
    syncData
  } = useApp();

  const [nameInput, setNameInput] = useState(userName);
  const [pwdInput, setPwdInput] = useState(passphrase);
  const [gitTokenInput, setGitTokenInput] = useState(githubToken);
  const [gitOwnerInput, setGitOwnerInput] = useState(githubOwner);
  const [gitRepoInput, setGitRepoInput] = useState(githubRepo);
  const [aiKeyInput, setAiKeyInput] = useState(aiApiKey);
  const [aiEndInput, setAiEndInput] = useState(aiEndpoint);
  const [aiModelInput, setAiModelInput] = useState(aiModel);

  const [isCopied, setIsCopied] = useState(false);
  const [isCryptoLoading, setIsCryptoLoading] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings({ userName: nameInput });
    alert("User profile updated successfully.");
  };

  const handleCryptoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwdInput) return;
    setIsCryptoLoading(true);
    const success = await initializeCrypto(pwdInput);
    setIsCryptoLoading(false);
    if (success) {
      alert("Encryption key successfully derived! Your local-first space is now secure.");
    }
  };

  const handleGitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings({
      githubToken: gitTokenInput,
      githubOwner: gitOwnerInput,
      githubRepo: gitRepoInput
    });
    alert("GitHub settings saved successfully.");
  };

  const handleAISubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings({
      aiApiKey: aiKeyInput,
      aiEndpoint: aiEndInput,
      aiModel: aiModelInput
    });
    alert("AI configurations saved successfully.");
  };

  const handleCopyPartnerKey = async () => {
    try {
      const configPayload = {
        githubOwner: githubOwner,
        githubRepo: githubRepo,
        githubToken: githubToken,
        passphrase: passphrase
      };
      await navigator.clipboard.writeText(JSON.stringify(configPayload));
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Clipboard copy failed", err);
    }
  };

  const handleImportConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importJson.trim()) return;

    try {
      const config = JSON.parse(importJson.trim());
      
      if (!config.passphrase) {
        alert("Invalid configuration JSON: missing passphrase.");
        return;
      }

      setIsCryptoLoading(true);
      const success = await initializeCrypto(config.passphrase);
      
      if (success) {
        await saveSettings({
          githubToken: config.githubToken || "",
          githubOwner: config.githubOwner || "",
          githubRepo: config.githubRepo || ""
        });

        setPwdInput(config.passphrase);
        setGitTokenInput(config.githubToken || "");
        setGitOwnerInput(config.githubOwner || "");
        setGitRepoInput(config.githubRepo || "");

        alert("Partner configuration successfully imported! Vault keys and settings synchronized.");
        setImportJson("");
      } else {
        alert("Failed to derive encryption key from imported passphrase.");
      }
    } catch (err: any) {
      alert(`Failed to parse configuration: ${err.message}`);
    } finally {
      setIsCryptoLoading(false);
    }
  };

  const handleSyncData = async () => {
    setIsSyncing(true);
    try {
      await syncData();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSyncing(false);
    }
  };

  const resetLocalWorkspace = async () => {
    if (window.confirm("Are you sure you want to clear ALL local database records and configs? This action is irreversible.")) {
      await db.settings.clear();
      await db.documents.clear();
      await db.cards.clear();
      await db.history.clear();
      await db.practice_sessions.clear();
      alert("Local storage wiped successfully. Reloading the page...");
      window.location.reload();
    }
  };

  return (
    <section className="settings-grid">
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

        {/* Cryptography Vault Panel */}
        <div className="panel">
          <div className="panel-header compact">
            <h2>Local Client Encryption</h2>
            <Key size={18} />
          </div>
          <form onSubmit={handleCryptoSubmit} className="space-y-3">
            <label className="field compact-field">
              <span>Passphrase</span>
              <input 
                type="password"
                value={pwdInput} 
                onChange={(e) => setPwdInput(e.target.value)} 
                placeholder="Enter memorized passphrase..."
              />
            </label>
            <div className="flex items-center justify-between text-xs text-slate-500 py-1">
              <span>Status:</span>
              <span className={`status-pill ${isKeyDerived ? "active" : "ended"}`}>
                {isKeyDerived ? "Encrypted" : "Locked"}
              </span>
            </div>
            <button 
              type="submit" 
              className="command w-full flex items-center justify-center gap-2"
              disabled={isCryptoLoading || !pwdInput.trim()}
            >
              {isCryptoLoading ? <RefreshCw size={14} className="animate-spin" /> : <KeyRound size={14} />}
              Derive Key
            </button>
          </form>
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

      {/* Column 3: GitHub Sync & Fallback */}
      <div className="space-y-4">
        {/* GitHub configuration */}
        <div className="panel">
          <div className="panel-header compact">
            <h2>GitHub Synchronization</h2>
            <Github size={18} />
          </div>
          <form onSubmit={handleGitSubmit} className="space-y-3">
            <label className="field compact-field">
              <span>Repo Owner</span>
              <input 
                value={gitOwnerInput} 
                onChange={(e) => setGitOwnerInput(e.target.value)} 
                placeholder="github-username"
              />
            </label>
            <label className="field compact-field">
              <span>Repository Name</span>
              <input 
                value={gitRepoInput} 
                onChange={(e) => setGitRepoInput(e.target.value)} 
                placeholder="debate-prep-repo"
              />
            </label>
            <label className="field compact-field">
              <span>Access Token (PAT)</span>
              <input 
                type="password"
                value={gitTokenInput} 
                onChange={(e) => setGitTokenInput(e.target.value)} 
                placeholder="github_pat_..."
              />
            </label>
            
            <div className="flex gap-2">
              <button type="submit" className="command w-full">
                Save GitHub
              </button>
              {isGitConnected && (
                <button 
                  type="button" 
                  onClick={handleSyncData} 
                  className="command primary w-full flex items-center justify-center gap-1.5"
                  disabled={isSyncing}
                >
                  <RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />
                  {isSyncing ? "Syncing..." : "Sync Now"}
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Import/Export */}
        <div className="panel">
          <div className="panel-header compact">
            <h2>Absent Partner Fallback</h2>
            <KeyRound size={18} />
          </div>
          <div className="space-y-3 text-xs">
            <button
              onClick={handleCopyPartnerKey}
              disabled={!isKeyDerived}
              className="command w-full flex items-center justify-center gap-2"
            >
              {isCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              {isCopied ? "Config Copied!" : "Export Configuration JSON"}
            </button>

            <form onSubmit={handleImportConfig} className="space-y-2 pt-1">
              <label className="field compact-field">
                <span>Import Partner vault JSON</span>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={importJson}
                    onChange={(e) => setImportJson(e.target.value)}
                    placeholder="Paste Vault JSON string..."
                    className="flex-1 text-[11px]"
                  />
                  <button
                    type="submit"
                    className="command primary py-1 px-3 shrink-0"
                    disabled={!importJson.trim()}
                  >
                    Import
                  </button>
                </div>
              </label>
            </form>
          </div>
        </div>

        {/* Reset Panel */}
        <div className="panel border-rose-200/50 bg-rose-500/5">
          <div className="panel-header compact text-rose-700">
            <h2>Destructive Options</h2>
            <Lock size={15} />
          </div>
          <button 
            type="button" 
            onClick={resetLocalWorkspace} 
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
