import React, { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { Bot, Lock, Radio, RotateCcw, Save, Users } from "lucide-react";
import db from "../services/db";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

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

  useEffect(() => setNameInput(userName), [userName]);
  useEffect(() => setAiKeyInput(aiApiKey), [aiApiKey]);
  useEffect(() => setAiEndInput(aiEndpoint), [aiEndpoint]);
  useEffect(() => setAiModelInput(aiModel), [aiModel]);

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
              <Button type="button" variant="outline" onClick={() => setResetConfirmOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={resetLocalWorkspace}>
                Reset
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>User Profile</CardTitle>
                <CardDescription>Your display name for room pairing and shared rounds.</CardDescription>
              </div>
              <Users size={18} className="text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user-name">User name</Label>
                <Input
                  id="user-name"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Enter your name"
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                <Save size={16} /> Save Profile
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Peer Sync Policy</CardTitle>
                <CardDescription>How this workspace recovers shared room data.</CardDescription>
              </div>
              <Radio size={18} className="text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="inline-note">
              GitHub sync, local client encryption setup, and absent-partner fallback are disabled for now. Shared files recover through connected peers in active rooms.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>AI Configuration</CardTitle>
                <CardDescription>Connect the debate assistant to your preferred OpenAI-compatible endpoint.</CardDescription>
              </div>
              <Bot size={18} className="text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAISubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ai-endpoint">API base URL</Label>
                <Input
                  id="ai-endpoint"
                  value={aiEndInput}
                  onChange={(e) => setAiEndInput(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-model">Model name</Label>
                <Input
                  id="ai-model"
                  value={aiModelInput}
                  onChange={(e) => setAiModelInput(e.target.value)}
                  placeholder="gpt-4o"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-key">API key</Label>
                <Input
                  id="ai-key"
                  type="password"
                  value={aiKeyInput}
                  onChange={(e) => setAiKeyInput(e.target.value)}
                  placeholder="sk-..."
                />
              </div>
              <Button type="submit" className="w-full">
                <Save size={16} /> Save AI Settings
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <div className="flex items-center justify-between gap-4 text-destructive">
              <div>
                <CardTitle>Destructive Options</CardTitle>
                <CardDescription className="text-destructive/75">Reset local data only when you want a clean workspace.</CardDescription>
              </div>
              <Lock size={18} />
            </div>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setResetConfirmOpen(true)}
              className="w-full"
            >
              <RotateCcw size={16} /> Reset Local Workspace
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

export default Settings;
