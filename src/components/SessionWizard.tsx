import React, { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { ArrowLeft, Play, Radio, RefreshCw, UserPlus, Users, X } from "lucide-react";
import { notify } from "../utils/notifications";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface SessionWizardProps {
  onClose: () => void;
}

export const SessionWizard: React.FC<SessionWizardProps> = ({ onClose }) => {
  const { isPeerConnected, hostSession, joinSession } = useApp();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [role, setRole] = useState<"host" | "client" | null>(null);
  const [matchName, setMatchName] = useState("");
  const [opponent, setOpponent] = useState("");
  const [code, setCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isPeerConnected) onClose();
  }, [isPeerConnected, onClose]);

  const title =
    step === 1
      ? "Start Debate Session"
      : step === 2 && role === "host"
        ? "Configure Match"
        : step === 2
          ? "Enter Room Code"
          : role === "host"
            ? "Share Room Code"
            : "Establishing Link";

  const handleSelectRole = (selectedRole: "host" | "client") => {
    setRole(selectedRole);
    setStep(2);
  };

  const handleBack = () => {
    if (step === 2) {
      setRole(null);
      setStep(1);
    } else if (step === 3) {
      setStep(2);
    }
  };

  const handleHostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchName.trim()) return;

    setIsLoading(true);
    const randomCode = Math.floor(1000 + Math.random() * 9000).toString();
    setGeneratedCode(randomCode);

    try {
      await hostSession(randomCode, matchName, opponent);
      setStep(3);
    } catch (err) {
      console.error(err);
      notify("Failed to initialize host room. Check network.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 4) return;

    setIsLoading(true);
    try {
      await joinSession(code);
      setStep(3);
    } catch (err) {
      console.error(err);
      notify("Failed to join room. Verify the code and ensure the host is online.");
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 p-4 backdrop-blur-md">
      <Card className="w-full max-w-lg overflow-hidden shadow-2xl">
        <CardHeader className="border-b border-border bg-muted/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {step > 1 && (
                <Button type="button" variant="ghost" size="icon" onClick={handleBack} aria-label="Back">
                  <ArrowLeft size={16} />
                </Button>
              )}
              <div>
                <CardTitle>{title}</CardTitle>
                <CardDescription>
                  {role === "client" ? "Join a live room from a host code." : "Create a synced debate room."}
                </CardDescription>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X size={16} />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          {step === 1 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => handleSelectRole("host")}
                className="group flex min-h-48 flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card p-6 text-center transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="rounded-full bg-primary/10 p-4 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Users size={28} />
                </span>
                <span>
                  <strong className="block text-sm text-foreground">Host a Match</strong>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    Manage the room, timers, debaters, and handout release.
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectRole("client")}
                className="group flex min-h-48 flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card p-6 text-center transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="rounded-full bg-primary/10 p-4 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <UserPlus size={28} />
                </span>
                <span>
                  <strong className="block text-sm text-foreground">Join a Match</strong>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    Connect with a code from the host and sync shared materials.
                  </span>
                </span>
              </button>
            </div>
          )}

          {step === 2 && role === "host" && (
            <form onSubmit={handleHostSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="match-name">Tournament or match name</Label>
                <Input
                  id="match-name"
                  required
                  value={matchName}
                  onChange={(e) => setMatchName(e.target.value)}
                  placeholder="e.g. NSDA Finals Round 3"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="opponent">Opponent team or debater code</Label>
                <Input
                  id="opponent"
                  value={opponent}
                  onChange={(e) => setOpponent(e.target.value)}
                  placeholder="e.g. Lincoln High School AB"
                />
              </div>
              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? <RefreshCw className="animate-spin" /> : <Play />}
                Generate Room & Start Hosting
              </Button>
            </form>
          )}

          {step === 2 && role === "client" && (
            <form onSubmit={handleClientSubmit} className="space-y-5">
              <div className="space-y-2 text-center">
                <Label htmlFor="room-code" className="block">Room code</Label>
                <p className="text-xs text-muted-foreground">Ask the host for the generated 4-digit pairing code.</p>
                <Input
                  id="room-code"
                  required
                  maxLength={4}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="1234"
                  className="mx-auto w-48 text-center font-mono text-lg font-bold tracking-widest"
                />
              </div>
              <Button type="submit" disabled={code.length !== 4 || isLoading} className="w-full">
                {isLoading ? <RefreshCw className="animate-spin" /> : <Play />}
                Connect to Room
              </Button>
            </form>
          )}

          {step === 3 && role === "host" && (
            <div className="flex flex-col items-center justify-center gap-5 py-6 text-center">
              <div>
                <span className="eyebrow">Room Pairing Code</span>
                <div className="font-mono text-5xl font-extrabold tracking-widest text-primary">{generatedCode}</div>
              </div>
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Radio size={16} className="text-primary" />
                Waiting for partner to join
              </div>
            </div>
          )}

          {step === 3 && role === "client" && (
            <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
              <RefreshCw size={36} className="animate-spin text-primary" />
              <div>
                <h4 className="text-sm font-bold text-foreground">Connecting to host room</h4>
                <p className="mt-1 text-xs text-muted-foreground">Syncing flow outlines and version handshakes.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SessionWizard;
