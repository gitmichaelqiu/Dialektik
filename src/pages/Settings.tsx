import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { Key, Github, Bot, RefreshCw, KeyRound, Copy, Check } from "lucide-react";


export const Settings: React.FC = () => {
  const {
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

  const [pwdInput, setPwdInput] = useState(passphrase);
  const [gitTokenInput, setGitTokenInput] = useState(githubToken);
  const [gitOwnerInput, setGitOwnerInput] = useState(githubOwner);
  const [gitRepoInput, setGitRepoInput] = useState(githubRepo);
  const [aiKeyInput, setAiKeyInput] = useState(aiApiKey);
  const [aiEndInput, setAiEndInput] = useState(aiEndpoint);
  const [aiModelInput, setAiModelInput] = useState(aiModel);


  
  // Status hooks
  const [isCopied, setIsCopied] = useState(false);
  const [isCryptoLoading, setIsCryptoLoading] = useState(false);
  const [importJson, setImportJson] = useState("");

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
    alert("AI configuration saved successfully.");
  };

  const handleCopyPartnerKey = async () => {
    try {
      // Create fallback configuration payload
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

        // Update input states
        setPwdInput(config.passphrase);
        setGitTokenInput(config.githubToken || "");
        setGitOwnerInput(config.githubOwner || "");
        setGitRepoInput(config.githubRepo || "");

        alert("Partner configuration successfully imported! Encryption keys and GitHub sync derived.");
        setImportJson("");
      } else {
        alert("Failed to derive encryption key from imported passphrase.");
      }
    } catch (err: any) {
      console.error(err);
      alert(`Failed to parse configuration: ${err.message}`);
    } finally {
      setIsCryptoLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl pb-16">
      {/* 1. Client-Side Encryption Setup */}
      <section className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-600/10 text-indigo-400">
              <Key size={20} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Local-First Client Encryption</h3>
              <p className="text-xs text-slate-500">Derives an AES-256 key from a passphrase to keep prep files private.</p>
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            isKeyDerived ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
          }`}>
            {isKeyDerived ? "Encrypted Vault Ready" : "Vault Locked"}
          </span>
        </div>

        <form onSubmit={handleCryptoSubmit} className="flex gap-4 items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs text-slate-400 font-medium">Memorized Passphrase</label>
            <input
              type="password"
              value={pwdInput}
              onChange={(e) => setPwdInput(e.target.value)}
              placeholder="Enter encryption passphrase..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={isCryptoLoading}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2 h-[42px]"
          >
            {isCryptoLoading ? <RefreshCw size={16} className="animate-spin" /> : <KeyRound size={16} />}
            Derive Key
          </button>
        </form>
      </section>

      {/* 2. Partner Key Fallback (Absent Partner UI) */}
      <section className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-600/10 text-indigo-400">
            <KeyRound size={20} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Absent Partner Sync Fallback</h3>
            <p className="text-xs text-slate-500">Provide setup config directly to your partner to authorize sync access.</p>
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          If your partner needs access, copy the encrypted vault setup JSON below. They can paste this in their settings to initialize the identical sync repository and AES keys.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-300">Export Configuration</h4>
            <button
              onClick={handleCopyPartnerKey}
              disabled={!isKeyDerived}
              className="w-full bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2"
            >
              {isCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              {isCopied ? "Config Copied!" : "Copy Vault Configuration JSON"}
            </button>
          </div>

          <form onSubmit={handleImportConfig} className="space-y-2">
            <h4 className="text-xs font-bold text-slate-300">Import Partner Configuration</h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                placeholder="Paste Vault JSON here..."
                className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-750 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={!importJson.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-850 text-white text-xs font-semibold px-4 rounded-lg transition-colors shrink-0"
              >
                Import
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* 4. GitHub Sync & Repository Configuration */}
      <section className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-600/10 text-indigo-400">
              <Github size={20} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">GitHub Synchronization Repo</h3>
              <p className="text-xs text-slate-500">Establish a private git sync storage to automatically backup encrypted prep files.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              isGitConnected ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-800 text-slate-500"
            }`}>
              {isGitConnected ? "Sync Connection Active" : "Not Configured"}
            </span>
            {isGitConnected && (
              <button
                onClick={syncData}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <RefreshCw size={12} /> Sync Now
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleGitSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">GitHub Repository Owner</label>
              <input
                type="text"
                value={gitOwnerInput}
                onChange={(e) => setGitOwnerInput(e.target.value)}
                placeholder="e.g. github-username"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">Private Sync Repo Name</label>
              <input
                type="text"
                value={gitRepoInput}
                onChange={(e) => setGitRepoInput(e.target.value)}
                placeholder="e.g. debate-prep-repository"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-medium">GitHub Personal Access Token (PAT)</label>
            <input
              type="password"
              value={gitTokenInput}
              onChange={(e) => setGitTokenInput(e.target.value)}
              placeholder="github_pat_..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Save GitHub Settings
          </button>
        </form>
      </section>

      {/* 5. OpenAI API and LLM Configuration */}
      <section className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-600/10 text-indigo-400">
            <Bot size={20} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">AI LLM Pipeline (OpenAI Compatible)</h3>
            <p className="text-xs text-slate-500">Configure language models for flows auto-fill, card cutting and sparring partners.</p>
          </div>
        </div>

        <form onSubmit={handleAISubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">API Endpoint Server</label>
              <input
                type="text"
                value={aiEndInput}
                onChange={(e) => setAiEndInput(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">Model Identifier</label>
              <input
                type="text"
                value={aiModelInput}
                onChange={(e) => setAiModelInput(e.target.value)}
                placeholder="gpt-4o"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-medium">API Key</label>
            <input
              type="password"
              value={aiKeyInput}
              onChange={(e) => setAiKeyInput(e.target.value)}
              placeholder="sk-..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Save AI Configurations
          </button>
        </form>
      </section>
    </div>
  );
};
export default Settings;
