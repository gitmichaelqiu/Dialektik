import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { db, type TournamentRecord } from "../services/db";
import { DebateTimer } from "../services/timers";
import { AIService } from "../services/ai";
import { SessionWizard } from "../components/SessionWizard";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Plus, 
  ShieldAlert, 
  Check, 
  Clock, 
  Award,
  Calendar,
  Users,
  Trophy,
  History
} from "lucide-react";

// Standard Public Forum Debate speech template
const PF_SPEECHES = [
  { id: "1AC", name: "1st Aff Constructive", duration: 240 },
  { id: "1NC", name: "1st Neg Constructive", duration: 240 },
  { id: "2AC", name: "2nd Aff Rebuttal", duration: 240 },
  { id: "2NC", name: "2nd Neg Rebuttal", duration: 240 },
  { id: "1AR", name: "1st Aff Summary", duration: 180 },
  { id: "1NR", name: "1st Neg Summary", duration: 180 },
  { id: "2AR", name: "2nd Aff Final Focus", duration: 180 },
  { id: "2NR", name: "2nd Neg Final Focus", duration: 180 }
];

export const InRound: React.FC = () => {
  const { 
    isPeerConnected, 
    mesh, 
    aiApiKey, 
    aiEndpoint, 
    aiModel,
    activeMatchName,
    activeOpponent,
    activeSide,
    roomCode,
    endSession
  } = useApp();

  const isRoundStarted = !!roomCode;

  // Local state
  const [showWizard, setShowWizard] = useState(false);
  const [historyList, setHistoryList] = useState<TournamentRecord[]>([]);

  // Flows state
  const [flows, setFlows] = useState<Record<string, { notes: string; draftStatus: "draft" | "accepted" }>>({});
  
  // Timer state
  const [activeSpeech, setActiveSpeech] = useState("1AC");
  const [timerRemaining, setTimerRemaining] = useState(240000); // 4 minutes in ms
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  const [prepRemaining, setPrepRemaining] = useState(180000); // 3 minutes prep in ms
  const [isPrepRunning, setIsPrepRunning] = useState(false);

  const debateTimerRef = useRef<DebateTimer | null>(null);
  const prepTimerRef = useRef<DebateTimer | null>(null);

  // Load history list on startup or when round closes
  useEffect(() => {
    async function loadHistory() {
      const records = await db.history.toArray();
      records.sort((a, b) => b.timestamp - a.timestamp);
      setHistoryList(records.slice(0, 5)); // show latest 5 rounds
    }
    if (!isRoundStarted) {
      loadHistory();
    }
  }, [isRoundStarted]);

  // Reactive flows mapping when session joins
  useEffect(() => {
    if (isRoundStarted && Object.keys(flows).length === 0) {
      const initialFlows: Record<string, { notes: string; draftStatus: "draft" | "accepted" }> = {};
      PF_SPEECHES.forEach((s) => {
        initialFlows[s.id] = { notes: "", draftStatus: "accepted" };
      });
      setFlows(initialFlows);
    } else if (!isRoundStarted) {
      setFlows({});
    }
  }, [isRoundStarted]);

  // Initialize timer instances
  useEffect(() => {
    debateTimerRef.current = new DebateTimer(240); // 4 min
    prepTimerRef.current = new DebateTimer(180); // 3 min

    debateTimerRef.current.onTick((rem) => setTimerRemaining(rem));
    prepTimerRef.current.onTick((rem) => setPrepRemaining(rem));

    debateTimerRef.current.onEnd(() => {
      setIsTimerRunning(false);
      alert("Speech time expired!");
    });

    prepTimerRef.current.onEnd(() => {
      setIsPrepRunning(false);
      alert("Prep time expired!");
    });

    // WebRTC room timer sync listeners
    mesh.onMessage((_senderId, msg) => {
      if (msg.type === "timer-action") {
        const { timerType, action, durationSeconds, targetTime } = msg.payload;
        const targetTimer = timerType === "speech" ? debateTimerRef.current : prepTimerRef.current;
        const setterRunning = timerType === "speech" ? setIsTimerRunning : setIsPrepRunning;

        if (targetTimer) {
          if (action === "start") {
            // Recalculate remaining based on absolute remote targetTime to prevent sync lag
            const rem = Math.max(0, targetTime - Date.now());
            targetTimer.reset(rem / 1000);
            targetTimer.start();
            setterRunning(true);
          } else if (action === "pause") {
            targetTimer.pause();
            setterRunning(false);
          } else if (action === "reset") {
            targetTimer.reset(durationSeconds);
            setterRunning(false);
          }
        }
      }
    });

    return () => {
      if (debateTimerRef.current) debateTimerRef.current.reset();
      if (prepTimerRef.current) prepTimerRef.current.reset();
    };
  }, [mesh]);

  // Timer controls with P2P sync broadcast
  const handleTimerAction = (timerType: "speech" | "prep", action: "start" | "pause" | "reset") => {
    const targetTimer = timerType === "speech" ? debateTimerRef.current : prepTimerRef.current;
    const setterRunning = timerType === "speech" ? setIsTimerRunning : setIsPrepRunning;
    const duration = timerType === "speech" 
      ? PF_SPEECHES.find(s => s.id === activeSpeech)?.duration || 240
      : 180;

    if (!targetTimer) return;

    if (action === "start") {
      targetTimer.start();
      setterRunning(true);

      // Broadcast start with targetTime
      const state = targetTimer.getState();
      if (isPeerConnected) {
        mesh.broadcast({
          type: "timer-action",
          senderId: mesh.peerId,
          payload: {
            timerType,
            action: "start",
            targetTime: state.targetTime
          }
        });
      }
    } else if (action === "pause") {
      targetTimer.pause();
      setterRunning(false);

      if (isPeerConnected) {
        mesh.broadcast({
          type: "timer-action",
          senderId: mesh.peerId,
          payload: { timerType, action: "pause" }
        });
      }
    } else if (action === "reset") {
      targetTimer.reset(duration);
      setterRunning(false);

      if (isPeerConnected) {
        mesh.broadcast({
          type: "timer-action",
          senderId: mesh.peerId,
          payload: { timerType, action: "reset", durationSeconds: duration }
        });
      }
    }
  };

  const handleSpeechChange = (speechId: string) => {
    setActiveSpeech(speechId);
    const speech = PF_SPEECHES.find((s) => s.id === speechId);
    if (speech && debateTimerRef.current) {
      debateTimerRef.current.reset(speech.duration);
      setTimerRemaining(speech.duration * 1000);
      setIsTimerRunning(false);
    }
  };

  const updateFlowNote = (speechId: string, text: string) => {
    setFlows((prev) => ({
      ...prev,
      [speechId]: {
        ...prev[speechId],
        notes: text
      }
    }));
  };

  // AI Outlining Auto-Fill
  const triggerAIOutlining = async () => {
    try {
      const cases = await db.documents.where("type").equals("case").toArray();
      if (cases.length === 0) {
        alert("No case documents found. Please draft a constructive case in the Shared Documents tab first!");
        return;
      }

      // Sort to get the latest modified case
      cases.sort((a, b) => b.lastModified - a.lastModified);
      const latestCase = cases[0];

      let notesText = "";
      if (aiApiKey) {
        const ai = new AIService({
          apiKey: aiApiKey,
          endpoint: aiEndpoint,
          model: aiModel
        });
        notesText = await ai.autoFillFlowTable(latestCase.content);
      } else {
        // Mock fallback if API Key is not set
        notesText = `**[AI DRAFT OUTLINE - MOCK FALLBACK]**\n- **Case Outline for: ${latestCase.name}**\n- **Contention 1: Economic Recovery**\n  - Trade tariffs trigger global supply chain blocks.\n  - Cites: Smith 2024 (Economy)\n- **Contention 2: Carbon Neutrality**\n  - Green subsidies trigger clean innovation shift.`;
      }

      setFlows((prev) => ({
        ...prev,
        [activeSpeech]: {
          notes: notesText,
          draftStatus: "draft"
        }
      }));
    } catch (err: any) {
      console.error("AI Outlining failed:", err);
      alert(`AI Outlining failed: ${err.message}`);
    }
  };

  const acceptAIDraft = (speechId: string) => {
    setFlows((prev) => ({
      ...prev,
      [speechId]: {
        ...prev[speechId],
        draftStatus: "accepted"
      }
    }));
  };

  // Save round history to DB
  const saveRound = async (result: "win" | "loss" | "pending") => {
    if (!isRoundStarted) return;

    const roundRecord: TournamentRecord = {
      id: `record-${Math.random().toString(36).substring(2, 11)}`,
      matchName: activeMatchName,
      speechOrder: PF_SPEECHES.map((s) => s.id),
      sides: activeSide,
      opponentName: activeOpponent || "Unknown Opponent",
      winLoss: result,
      flows: Object.entries(flows).map(([speechId, data]) => ({
        speechId,
        notes: data.notes,
        draftStatus: data.draftStatus
      })),
      tag: "Round Archivist",
      timestamp: Date.now()
    };

    await db.history.put(roundRecord);
    alert(`Debate round archived successfully as: ${result.toUpperCase()}!`);
    endSession();
  };

  // Helper to format ms into m:ss
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.ceil(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
      
      {/* Active Debate Session View */}
      {isRoundStarted ? (
        <>
          {/* 1. Header Configurations & Timers Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 shrink-0 bg-slate-950 p-4 border border-slate-800 rounded-xl">
            {/* Active Round Info */}
            <div className="flex flex-col justify-between h-full space-y-2">
              <div>
                <h4 className="text-sm font-bold text-white truncate">{activeMatchName}</h4>
                <span className="text-[10px] text-slate-400 font-mono">
                  Vs. {activeOpponent || "Unknown Opponent"} | Side: <span className="text-indigo-400 font-bold capitalize">{activeSide}</span>
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => saveRound("win")}
                  className="flex-1 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  <Check size={12} /> Win
                </button>
                <button
                  onClick={() => saveRound("loss")}
                  className="flex-1 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 text-[10px] font-bold py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  <ShieldAlert size={12} /> Loss
                </button>
                <button
                  onClick={endSession}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-350 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>

            {/* Shared Speech Timer */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <Clock size={11} /> Speech Timer ({activeSpeech})
                </span>
                <div className="font-mono text-3xl font-bold text-white tracking-widest">
                  {formatTime(timerRemaining)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTimerAction("speech", isTimerRunning ? "pause" : "start")}
                  className={`p-2.5 rounded-lg text-white transition-colors ${
                    isTimerRunning ? "bg-amber-600 hover:bg-amber-500" : "bg-indigo-600 hover:bg-indigo-500"
                  }`}
                >
                  {isTimerRunning ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button
                  onClick={() => handleTimerAction("speech", "reset")}
                  className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                >
                  <RotateCcw size={16} />
                </button>
              </div>
            </div>

            {/* Shared Prep Timer */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <Clock size={11} /> Prep Timer
                </span>
                <div className="font-mono text-3xl font-bold text-white tracking-widest">
                  {formatTime(prepRemaining)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTimerAction("prep", isPrepRunning ? "pause" : "start")}
                  className={`p-2.5 rounded-lg text-white transition-colors ${
                    isPrepRunning ? "bg-amber-600 hover:bg-amber-500" : "bg-indigo-600 hover:bg-indigo-500"
                  }`}
                >
                  {isPrepRunning ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button
                  onClick={() => handleTimerAction("prep", "reset")}
                  className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                >
                  <RotateCcw size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* 2. Flowing Table note-taking grid */}
          <div className="flex-1 min-h-0 bg-slate-950 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
            {/* Speeches Selector Bar */}
            <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 overflow-x-auto gap-2">
              <div className="flex gap-2">
                {PF_SPEECHES.map((speech) => (
                  <button
                    key={speech.id}
                    onClick={() => handleSpeechChange(speech.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                      activeSpeech === speech.id
                        ? "bg-indigo-600 text-white shadow-md"
                        : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                    }`}
                  >
                    {speech.id}
                  </button>
                ))}
              </div>
              <button
                onClick={triggerAIOutlining}
                className="bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shrink-0"
              >
                <Plus size={10} /> AI Outlining Auto-Fill
              </button>
            </div>

            {/* Note-taking Grid columns */}
            <div className="flex-1 overflow-x-auto p-4 flex gap-4 min-w-0 bg-slate-950/40">
              {PF_SPEECHES.map((s) => {
                const isActive = activeSpeech === s.id;
                const flow = flows[s.id];

                return (
                  <div
                    key={s.id}
                    className={`w-80 flex-shrink-0 flex flex-col border rounded-xl overflow-hidden bg-slate-900/40 transition-all ${
                      isActive ? "border-indigo-500 bg-indigo-500/5" : "border-slate-850"
                    }`}
                  >
                    {/* Header */}
                    <div className="p-3 border-b border-slate-850 bg-slate-950/40 flex items-center justify-between">
                      <div className="min-w-0">
                        <strong className="text-xs text-white block">{s.id}</strong>
                        <span className="text-[10px] text-slate-500 truncate block">{s.name}</span>
                      </div>
                      {flow?.draftStatus === "draft" && (
                        <button
                          onClick={() => acceptAIDraft(s.id)}
                          title="Accept AI Draft"
                          className="bg-emerald-600 hover:bg-emerald-500 text-white p-1 rounded transition-colors"
                        >
                          <Check size={10} />
                        </button>
                      )}
                    </div>

                    {/* Flow body text area */}
                    <div className="flex-1 relative flex flex-col p-3">
                      {flow?.draftStatus === "draft" && (
                        <div className="absolute top-2 right-2 bg-amber-600/25 border border-amber-500/35 text-[9px] font-bold text-amber-400 px-2 py-0.5 rounded flex items-center gap-1 z-10">
                          <ShieldAlert size={10} /> Review AI Draft
                        </div>
                      )}
                      <textarea
                        value={flow?.notes || ""}
                        onChange={(e) => updateFlowNote(s.id, e.target.value)}
                        placeholder={`Log arguments and notes for ${s.id}...`}
                        className={`w-full h-full bg-transparent border-0 resize-none text-xs leading-relaxed focus:outline-none focus:ring-0 ${
                          flow?.draftStatus === "draft" ? "text-amber-300 font-mono" : "text-slate-350"
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        /* Welcome / Start Session Pipeline Layout */
        <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden min-h-0">
          
          {/* Main Welcome Hero */}
          <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-8 flex flex-col justify-center items-center text-center space-y-6">
            <Award size={48} className="text-indigo-500 animate-pulse" />
            <div className="max-w-md space-y-2">
              <h2 className="text-xl font-bold tracking-tight text-white">In-Round Flow Sheets & timers</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Connect and sync debate sheets in real-time with your partner, manage speech countdowns, and run human-in-the-loop AI outline assistants.
              </p>
            </div>
            
            <button
              onClick={() => setShowWizard(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold px-6 py-3 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20 active:scale-95 duration-100 flex items-center gap-2"
            >
              <Plus size={16} /> Start New Debate Session
            </button>
          </div>

          {/* Side: Session History List */}
          <div className="w-full lg:w-96 bg-slate-950 border border-slate-800 rounded-xl p-6 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <History size={16} className="text-indigo-400" />
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Recent Sessions</h3>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {historyList.map((rec) => (
                <div key={rec.id} className="bg-slate-900 border border-slate-850 p-3.5 rounded-lg space-y-2 relative">
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span className="flex items-center gap-1 font-medium">
                      <Calendar size={10} /> {new Date(rec.timestamp).toLocaleDateString()}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded font-bold uppercase tracking-wider text-[8px] ${
                      rec.winLoss === "win" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}>
                      {rec.winLoss}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-200 truncate">{rec.matchName}</h4>
                    <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1 mt-0.5 capitalize">
                      <Users size={10} className="text-indigo-400" /> vs. {rec.opponentName} | {rec.sides}
                    </span>
                  </div>
                </div>
              ))}

              {historyList.length === 0 && (
                <div className="text-center py-10 text-slate-600 text-xs flex flex-col justify-center items-center gap-2 h-full">
                  <Trophy size={20} className="text-slate-800" />
                  <span>No debate rounds archived yet.</span>
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* Guided Session Wizard Modal */}
      {showWizard && (
        <SessionWizard onClose={() => setShowWizard(false)} />
      )}

    </div>
  );
};
export default InRound;
