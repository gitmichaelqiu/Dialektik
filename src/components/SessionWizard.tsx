import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { Users, UserPlus, Play, ArrowLeft, X, RefreshCw, Radio } from "lucide-react";

interface SessionWizardProps {
  onClose: () => void;
}

export const SessionWizard: React.FC<SessionWizardProps> = ({ onClose }) => {
  const { 
    isPeerConnected, 
    hostSession, 
    joinSession 
  } = useApp();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [role, setRole] = useState<"host" | "client" | null>(null);

  // Host inputs
  const [matchName, setMatchName] = useState("");
  const [opponent, setOpponent] = useState("");
  const [side, setSide] = useState<"affirmative" | "negative">("affirmative");

  // Client inputs
  const [code, setCode] = useState("");

  const [generatedCode, setGeneratedCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Automatically close wizard once WebRTC P2P connects
  useEffect(() => {
    if (isPeerConnected) {
      onClose();
    }
  }, [isPeerConnected, onClose]);

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
    // Generate random 4-digit code
    const randomCode = Math.floor(1000 + Math.random() * 9000).toString();
    setGeneratedCode(randomCode);
    
    try {
      await hostSession(randomCode, matchName, opponent, side);
      setStep(3);
    } catch (err) {
      console.error(err);
      alert("Failed to initialize host room. Check network.");
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
      setStep(3); // show handshaking step
    } catch (err) {
      console.error(err);
      alert("Failed to join room. Verify the code and ensure the host is online.");
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/30">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button 
                onClick={handleBack} 
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <h3 className="text-sm font-bold text-white tracking-wide">
              {step === 1 && "Start Debate Session"}
              {step === 2 && (role === "host" ? "Configure Match Details" : "Enter Room Code")}
              {step === 3 && (role === "host" ? "Share Room Code" : "Establishing Link")}
            </h3>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 space-y-6">
          
          {/* STEP 1: Select Role */}
          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option Host */}
              <button
                onClick={() => handleSelectRole("host")}
                className="flex flex-col items-center justify-center p-6 bg-slate-950 border border-slate-800 hover:border-indigo-500 rounded-xl text-center group transition-all duration-200 space-y-4"
              >
                <div className="p-4 rounded-full bg-indigo-600/10 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-200">
                  <Users size={28} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">
                    Host a Match
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Set up a new debate match, manage timers, and invite your partner or opponent.
                  </p>
                </div>
              </button>

              {/* Option Client */}
              <button
                onClick={() => handleSelectRole("client")}
                className="flex flex-col items-center justify-center p-6 bg-slate-950 border border-slate-800 hover:border-indigo-500 rounded-xl text-center group transition-all duration-200 space-y-4"
              >
                <div className="p-4 rounded-full bg-indigo-600/10 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-200">
                  <UserPlus size={28} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">
                    Join a Match
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Enter a 4-digit code provided by your partner or host to sync flow sheets instantly.
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* STEP 2 (Host): Match Config Form */}
          {step === 2 && role === "host" && (
            <form onSubmit={handleHostSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">Tournament / Match Name</label>
                <input
                  required
                  type="text"
                  value={matchName}
                  onChange={(e) => setMatchName(e.target.value)}
                  placeholder="e.g. NSDA Finals Round 3"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-xs text-slate-100 placeholder-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">Opponent Team/Debater Code</label>
                <input
                  type="text"
                  value={opponent}
                  onChange={(e) => setOpponent(e.target.value)}
                  placeholder="e.g. Lincoln High School AB"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-xs text-slate-100 placeholder-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">Select Debate Side</label>
                <div className="bg-slate-950 p-1 rounded-lg border border-slate-850 flex">
                  <button
                    type="button"
                    onClick={() => setSide("affirmative")}
                    className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${
                      side === "affirmative" 
                        ? "bg-indigo-600 text-white shadow" 
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Affirmative (Pro)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSide("negative")}
                    className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${
                      side === "negative" 
                        ? "bg-indigo-600 text-white shadow" 
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Negative (Con)
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                Generate Room & Start hosting
              </button>
            </form>
          )}

          {/* STEP 2 (Client): Enter code */}
          {step === 2 && role === "client" && (
            <form onSubmit={handleClientSubmit} className="space-y-5">
              <div className="space-y-2 text-center">
                <label className="text-xs text-slate-400 font-medium block">Enter 4-Digit Room Code</label>
                <p className="text-[10px] text-slate-500">Ask the host of the room for the generated pairing code.</p>
                <input
                  required
                  maxLength={4}
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 1234"
                  className="w-48 bg-slate-950 border border-slate-800 rounded-lg py-3 text-lg font-mono font-bold tracking-widest text-center text-slate-100 placeholder-slate-700 focus:outline-none focus:border-indigo-500 mx-auto"
                />
              </div>

              <button
                type="submit"
                disabled={code.length !== 4 || isLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-850 text-white text-xs font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                Connect to Room
              </button>
            </form>
          )}

          {/* STEP 3 (Host waiting): Display room code and spin */}
          {step === 3 && role === "host" && (
            <div className="flex flex-col items-center justify-center space-y-6 py-4 text-center">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Room Pairing Code</span>
                <div className="font-mono text-5xl font-extrabold text-indigo-400 tracking-widest animate-pulse">
                  {generatedCode}
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                <Radio size={14} className="text-indigo-400 animate-ping" />
                Waiting for partner to join...
              </div>

              <div className="text-[10px] text-slate-500 max-w-xs leading-relaxed">
                Provide this 4-digit code to your debate partner. Once they join, this screen will close and you will proceed to the debate sheet.
              </div>
            </div>
          )}

          {/* STEP 3 (Client handshaking) */}
          {step === 3 && role === "client" && (
            <div className="flex flex-col items-center justify-center space-y-4 py-8 text-center">
              <RefreshCw size={36} className="text-indigo-500 animate-spin" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-200">Connecting to Host Room...</h4>
                <p className="text-[10px] text-slate-500">Syncing flow outlines and version handshakes.</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
