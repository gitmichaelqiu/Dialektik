import React, { useState, useEffect } from "react";
import { useApp, type Debater, type Handout, type SessionState } from "../context/AppContext";
import { db, type TournamentRecord } from "../services/db";
import { DebateTimer } from "../services/timers";
import { AIService } from "../services/ai";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Clock, 
  Award,
  Calendar,
  Users,
  Trophy,
  History,
  UserCheck,
  UserX,
  FileText,
  Sparkles,
  ArrowRight,
  RefreshCw
} from "lucide-react";

export const InRound: React.FC = () => {
  const { 
    session,
    setSession,
    debateTimerRef,
    prepTimerRef,
    mesh, 
    aiApiKey, 
    aiEndpoint, 
    aiModel,
    roomCode,
    isHost,
    userName,
    setActivePage,
    startSession,
    endSession
  } = useApp();

  const isRoundStarted = !!roomCode;

  // Local state
  const [startMode, setStartMode] = useState<"host" | "join" | null>(null);
  const [matchName, setMatchName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [teamSize, setTeamSize] = useState(1);
  const [joinRoomCode, setJoinRoomCode] = useState("");
  
  // Handshake approval list (for Host to approve/reject clients)
  const [pendingRequests, setPendingRequests] = useState<Debater[]>([]);
  const [toastNotification, setToastNotification] = useState<string | null>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [pendingWinner, setPendingWinner] = useState<"affirmative" | "negative" | null>(null);

  // Timers state
  const [timerRemaining, setTimerRemaining] = useState(240000);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [prepRemaining, setPrepRemaining] = useState(180000);
  const [isPrepRunning, setIsPrepRunning] = useState(false);
  const [speechInput, setSpeechInput] = useState("04:00");
  const [prepInput, setPrepInput] = useState("03:00");

  // History state for welcome page
  const [historyList, setHistoryList] = useState<TournamentRecord[]>([]);

  // Trigger brief top-right notification alert
  const triggerToast = (msg: string) => {
    setToastNotification(msg);
    setTimeout(() => setToastNotification(null), 3000);
  };

  // Local active speaker state (whose notes are viewed/edited locally)
  const [localActiveSpeakerId, setLocalActiveSpeakerId] = useState<string | null>(null);
  const [showPositionsOnly, setShowPositionsOnly] = useState(false);

  const sanitizeSessionForBroadcast = (state: SessionState): SessionState => ({
    ...state,
    speakerNotes: {}
  });

  // Helper to broadcast session-state, stripping private notes and lobby handouts
  const broadcastSessionState = (state: SessionState) => {
    const broadcastState = sanitizeSessionForBroadcast(state);
    if (state.status === "lobby") {
      const strippedState: SessionState = {
        ...broadcastState,
        handout: { title: "", problem: "", details: "" }
      };
      mesh.broadcast({ type: "session-state", senderId: mesh.peerId, payload: strippedState });
    } else {
      mesh.broadcast({ type: "session-state", senderId: mesh.peerId, payload: broadcastState });
    }
  };

  // Load history list
  useEffect(() => {
    async function loadHistory() {
      const records = await db.history.toArray();
      records.sort((a, b) => b.timestamp - a.timestamp);
      setHistoryList(records.slice(0, 5));
    }
    if (!isRoundStarted) {
      loadHistory();
    }
  }, [isRoundStarted]);

  // Host creates a session room
  const handleHostCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName) {
      triggerToast("Please set your UserName in Settings first.");
      setActivePage("settings");
      return;
    }
    if (!matchName || !groupName) return;

    // Generate room code (4-digits/letters)
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();

    // Initialize state
    const initialSession: SessionState = {
      matchName,
      groupName,
      teamSize,
      roomCode: code,
      status: "lobby",
      handout: { title: "", problem: "", details: "" },
      debaters: [],
      speakerNotes: {},
      speechDuration: 240,
      prepDuration: 180
    };

    setSession(initialSession);
    await startSession(code, true);

    // Auto copy room code to clipboard
    try {
      await navigator.clipboard.writeText(code);
      triggerToast(`Room Code ${code} copied to clipboard!`);
    } catch {
      triggerToast(`Room ${code} created successfully!`);
    }

    setStartMode(null);
  };

  // Client requests to join session
  const handleClientJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName) {
      triggerToast("Please set your UserName in Settings first.");
      setActivePage("settings");
      return;
    }
    if (!joinRoomCode) return;
    const cleanCode = joinRoomCode.trim().toUpperCase();

    // Start PeerJS connection as Client
    await startSession(cleanCode, false);
    setStartMode(null);
    triggerToast("Connecting to Host room...");
  };

  // Synchronize timer clock ticks
  useEffect(() => {
    if (!debateTimerRef.current) {
      debateTimerRef.current = new DebateTimer(240);
    }
    if (!prepTimerRef.current) {
      prepTimerRef.current = new DebateTimer(180);
    }

    debateTimerRef.current.onTick((rem: number) => setTimerRemaining(rem));
    prepTimerRef.current.onTick((rem: number) => setPrepRemaining(rem));

    debateTimerRef.current.onEnd(() => {
      setIsTimerRunning(false);
      triggerToast("Speech time expired.");
    });

    prepTimerRef.current.onEnd(() => {
      setIsPrepRunning(false);
      triggerToast("Prep time expired.");
    });

    // Restore timer remaining and running states on tab mount
    setTimerRemaining(debateTimerRef.current.getRemaining());
    setIsTimerRunning(debateTimerRef.current.getState().isRunning);
    setPrepRemaining(prepTimerRef.current.getRemaining());
    setIsPrepRunning(prepTimerRef.current.getState().isRunning);

    return () => {
      if (debateTimerRef.current) {
        debateTimerRef.current.onTick(() => {});
        debateTimerRef.current.onEnd(() => {});
      }
      if (prepTimerRef.current) {
        prepTimerRef.current.onTick(() => {});
        prepTimerRef.current.onEnd(() => {});
      }
    };
  }, []);

  // WebRTC message listeners
  useEffect(() => {
    if (!isRoundStarted) return;

    mesh.onMessage((senderId, msg) => {
      if (msg.type === "join-request") {
        // Host receives join request
        if (isHost) {
          const newDebater: Debater = {
            id: senderId,
            name: msg.payload?.name || "Unknown Debater",
            status: "pending"
          };
          setPendingRequests(prev => {
            if (prev.some(d => d.id === senderId)) return prev;
            return [...prev, newDebater];
          });
          triggerToast(`Join request from ${newDebater.name}`);
        }
      } else if (msg.type === "session-state") {
        // Client receives synced session state
        if (!isHost) {
          const syncedSession: SessionState = msg.payload;
          setSession(prev => ({
            ...syncedSession,
            speakerNotes: prev?.speakerNotes || {}
          }));

          // Update durations if changed
          if (debateTimerRef.current && syncedSession.speechDuration !== debateTimerRef.current.getState().duration / 1000) {
            debateTimerRef.current.reset(syncedSession.speechDuration);
            setTimerRemaining(syncedSession.speechDuration * 1000);
            const m = Math.floor(syncedSession.speechDuration / 60);
            const s = syncedSession.speechDuration % 60;
            setSpeechInput(`${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
          }
          if (prepTimerRef.current && syncedSession.prepDuration !== prepTimerRef.current.getState().duration / 1000) {
            prepTimerRef.current.reset(syncedSession.prepDuration);
            setPrepRemaining(syncedSession.prepDuration * 1000);
            const m = Math.floor(syncedSession.prepDuration / 60);
            const s = syncedSession.prepDuration % 60;
            setPrepInput(`${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
          }
        }
      } else if (msg.type === "timer-action") {
        // Client receives timer controls
        const { timerType, action, durationSeconds, targetTime } = msg.payload;
        const targetTimer = timerType === "speech" ? debateTimerRef.current : prepTimerRef.current;
        const setterRunning = timerType === "speech" ? setIsTimerRunning : setIsPrepRunning;

        if (targetTimer) {
          if (action === "start") {
            const rem = Math.max(0, targetTime - Date.now());
            targetTimer.reset(rem / 1000);
            targetTimer.start();
            setterRunning(true);

            // Alert target speaker client
            if (timerType === "speech" && session?.currentSpeakerId === mesh.peerId) {
              triggerToast("📢 Your speech timer has started!");
            }
          } else if (action === "pause") {
            targetTimer.pause();
            setterRunning(false);
          } else if (action === "reset") {
            targetTimer.reset(durationSeconds);
            setterRunning(false);
          }
        }
      } else if (msg.type === "version-reject" || msg.type === "handshake") {
        // Standard WebRTC link handshakes
        if (!isHost) {
          // Client sends join request immediately after WebRTC handshake
          mesh.sendToPeer(senderId, {
            type: "join-request",
            senderId: mesh.peerId,
            payload: { name: userName }
          });
        }
      }
    });
  }, [isRoundStarted, isHost, mesh, userName, session?.speechDuration, session?.prepDuration, session?.currentSpeakerId]);

  // Host Action: Approve connecting debater
  const handleApproveDebater = (request: Debater) => {
    if (!session) return;
    const updatedDebaters = session.debaters.some(d => d.id === request.id)
      ? session.debaters.map(d => d.id === request.id ? { ...d, status: "approved" as const } : d)
      : [...session.debaters, { ...request, status: "approved" as const }];
    const nextSession = {
      ...session,
      debaters: updatedDebaters
    };
    setSession(nextSession);
    setPendingRequests(prev => prev.filter(r => r.id !== request.id));
    broadcastSessionState(nextSession);
    triggerToast(`${request.name} approved.`);
  };

  // Host Action: Reject connecting debater
  const handleRejectDebater = (request: Debater) => {
    setPendingRequests(prev => prev.filter(r => r.id !== request.id));
    mesh.sendToPeer(request.id, {
      type: "timer-action", // reuse command to exit client
      senderId: mesh.peerId,
      payload: { action: "reset", timerType: "speech", durationSeconds: 0 } // dummy to terminate
    });
    triggerToast(`${request.name} rejected.`);
  };

  // Host updates debater side/position
  const updateDebaterConfig = (debaterId: string, side: "affirmative" | "negative", position: number) => {
    if (!session) return;
    const boundedPosition = Math.min(session.teamSize, Math.max(1, position));
    const updated = session.debaters.map(d => {
      if (d.id === debaterId) {
        return { ...d, team: side, position: boundedPosition };
      }
      return d;
    });
    const nextSession = { ...session, debaters: updated };
    setSession(nextSession);
    broadcastSessionState(nextSession);
  };

  // Host updates handout fields
  const handleUpdateHandout = (fields: Partial<Handout>) => {
    if (!session) return;
    const nextSession = {
      ...session,
      handout: { ...session.handout, ...fields }
    };
    setSession(nextSession);
    // ONLY broadcast handout changes if the session is already active!
    // During lobby phase, handouts are kept local to the host until started.
    if (session.status === "active") {
      broadcastSessionState(nextSession);
    }
  };

  // Select speaker to view/write notes (host updates globally, client updates locally)
  const handleSelectSpeaker = (debaterId: string) => {
    setLocalActiveSpeakerId(debaterId);
    if (isHost && session) {
      const nextSession = { ...session, currentSpeakerId: debaterId };
      setSession(nextSession);
      broadcastSessionState(nextSession);
    }
  };

  // Host starts the active debate round
  const handleStartDebate = () => {
    if (!session) return;
    
    // Check constraints
    if (!session.handout.title.trim() || !session.handout.problem.trim()) {
      triggerToast("Complete the handout title and problem before starting.");
      return;
    }
    if (session.debaters.length === 0) {
      triggerToast("Wait for at least one debater to join the room.");
      return;
    }
    const approvedDebaters = session.debaters.filter(d => d.status === "approved");
    const invalidAssignment = approvedDebaters.some(d => !d.team || !d.position || d.position < 1 || d.position > session.teamSize);
    if (invalidAssignment) {
      triggerToast(`Assign each debater a side and position from 1 to ${session.teamSize}.`);
      return;
    }
    const duplicateSlot = approvedDebaters.some((d, index) => 
      approvedDebaters.findIndex(other => other.team === d.team && other.position === d.position) !== index
    );
    if (duplicateSlot) {
      triggerToast("Each side can use a speaker position only once.");
      return;
    }

    const nextSession = { ...session, status: "active" as const };
    setSession(nextSession);
    broadcastSessionState(nextSession);
    triggerToast("Debate Round Started! Handouts distributed.");
  };

  // Parse custom MM:SS duration
  const parseMMSS = (val: string): number => {
    const parts = val.split(":");
    if (parts.length === 2) {
      const m = parseInt(parts[0], 10);
      const s = parseInt(parts[1], 10);
      if (!isNaN(m) && !isNaN(s)) {
        return m * 60 + s;
      }
    }
    return 240;
  };

  // Host updates duration settings
  const handleTimerDurationChange = (timerType: "speech" | "prep", val: string) => {
    if (!session) return;
    const seconds = parseMMSS(val);
    const nextSession = {
      ...session,
      [timerType === "speech" ? "speechDuration" : "prepDuration"]: seconds
    };
    setSession(nextSession);

    // Reset local timer instance
    const timer = timerType === "speech" ? debateTimerRef.current : prepTimerRef.current;
    if (timer) {
      timer.reset(seconds);
      if (timerType === "speech") {
        setTimerRemaining(seconds * 1000);
      } else {
        setPrepRemaining(seconds * 1000);
      }
    }

    broadcastSessionState(nextSession);
  };

  // Sync timers trigger actions
  const handleTimerClick = (timerType: "speech" | "prep", action: "start" | "pause" | "reset") => {
    const targetTimer = timerType === "speech" ? debateTimerRef.current : prepTimerRef.current;
    const setterRunning = timerType === "speech" ? setIsTimerRunning : setIsPrepRunning;
    const duration = timerType === "speech" ? session?.speechDuration || 240 : session?.prepDuration || 180;

    if (!targetTimer) return;

    if (action === "start") {
      targetTimer.start();
      setterRunning(true);
      const state = targetTimer.getState();
      mesh.broadcast({
        type: "timer-action",
        senderId: mesh.peerId,
        payload: {
          timerType,
          action: "start",
          targetTime: state.targetTime
        }
      });

      // Alert speaker client
      if (timerType === "speech" && session?.currentSpeakerId === mesh.peerId) {
        triggerToast("📢 Your speech timer has started!");
      }
    } else if (action === "pause") {
      targetTimer.pause();
      setterRunning(false);
      mesh.broadcast({
        type: "timer-action",
        senderId: mesh.peerId,
        payload: { timerType, action: "pause" }
      });
    } else if (action === "reset") {
      targetTimer.reset(duration);
      setterRunning(false);
      mesh.broadcast({
        type: "timer-action",
        senderId: mesh.peerId,
        payload: { timerType, action: "reset", durationSeconds: duration }
      });
    }
  };

  // Both: Log speaker notes
  const handleUpdateSpeakerNote = (text: string) => {
    if (!session || !activeSpeakerId) return;
    const nextSession = {
      ...session,
      speakerNotes: {
        ...session.speakerNotes,
        [activeSpeakerId]: text
      }
    };
    setSession(nextSession);
  };

  // AI Outlining fill notes
  const handleAIOutlineFill = async () => {
    if (!session || !activeSpeakerId) return;
    try {
      const allDocs = await db.documents.toArray();
      const cases = allDocs.filter(d => (d.partnerAccess || "private") === "private");
      if (cases.length === 0) {
        triggerToast("Draft a private case document first under Documents.");
        return;
      }
      cases.sort((a, b) => b.lastModified - a.lastModified);
      const latestCase = cases[0];

      if (!aiApiKey) {
        triggerToast("Configure your AI API key under Settings first.");
        return;
      }

      const ai = new AIService({
        apiKey: aiApiKey,
        endpoint: aiEndpoint,
        model: aiModel
      });
      const notesText = await ai.autoFillFlowTable(latestCase.content);

      handleUpdateSpeakerNote(notesText);
      triggerToast("AI Outline loaded into speaker notes.");
    } catch (err: any) {
      triggerToast(`AI outline failed: ${err.message}`);
    }
  };

  // Host ends round, saves logs
  const requestEndRound = (winner: "affirmative" | "negative") => {
    setPendingWinner(winner);
  };

  const confirmEndRound = async () => {
    const winner = pendingWinner;
    if (!session) return;
    if (!winner) return;

    // Archive session logs into Dexie history store
    const roundRecord: TournamentRecord = {
      id: `history-${Math.random().toString(36).substring(2, 11)}`,
      matchName: session.matchName,
      opponentName: session.groupName,
      sides: session.debaters.find(d => d.id === mesh.peerId)?.team || "affirmative",
      winLoss: winner === (session.debaters.find(d => d.id === mesh.peerId)?.team || "affirmative") ? "win" : "loss",
      speechOrder: ["1AC", "1NC"],
      flows: session.debaters.map(d => ({
        speechId: d.name,
        notes: session.speakerNotes[d.id] || "",
        draftStatus: "accepted" as const
      })),
      tag: session.groupName,
      timestamp: Date.now()
    };

    await db.history.put(roundRecord);
    
    // Broadcast end session status to clients
    const nextSession = { ...session, status: "ended" as const, winner };
    setSession(nextSession);
    broadcastSessionState(nextSession);

    triggerToast("Session saved! Redirecting to history...");
    setPendingWinner(null);
    endSession();
    setActivePage("history");
  };

  // Exit lobby
  const handleExitSession = () => {
    setExitConfirmOpen(true);
  };

  const confirmExitSession = () => {
    endSession();
    setSession(null);
    setExitConfirmOpen(false);
    triggerToast("Exited session.");
  };

  // Format countdowns
  const formatCountdown = (ms: number): string => {
    const totalSeconds = Math.ceil(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Find current speaker debater (using local selected speaker, fallback to global active speaker)
  const activeSpeakerId = localActiveSpeakerId || session?.currentSpeakerId || "";
  const currentSpeaker = session?.debaters.find(d => d.id === activeSpeakerId);
  const currentSpeakerNotes = activeSpeakerId ? session?.speakerNotes[activeSpeakerId] || "" : "";
  const myDebaterInfo = session?.debaters.find(d => d.id === mesh.peerId);

  return (
    <div className="space-y-6 h-full flex flex-col overflow-hidden">
      {/* Toast Alert */}
      {toastNotification && (
        <div className="toast" role="status">
          {toastNotification}
        </div>
      )}

      {exitConfirmOpen && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="exit-session-title">
          <div className="confirm-dialog">
            <h2 id="exit-session-title">Exit Session?</h2>
            <p>Disconnect from the current room and return to the start screen.</p>
            <div className="confirm-actions">
              <button type="button" className="command" onClick={() => setExitConfirmOpen(false)}>
                Cancel
              </button>
              <button type="button" className="command danger-command inline-danger" onClick={confirmExitSession}>
                Exit Session
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingWinner && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="end-round-title">
          <div className="confirm-dialog">
            <h2 id="end-round-title">End Debate?</h2>
            <p>Record {pendingWinner.toUpperCase()} as the winner and save this round to history.</p>
            <div className="confirm-actions">
              <button type="button" className="command" onClick={() => setPendingWinner(null)}>
                Cancel
              </button>
              <button type="button" className="command primary" onClick={confirmEndRound}>
                Save Round
              </button>
            </div>
          </div>
        </div>
      )}

      {isRoundStarted && !session ? (
        /* ------------------ CONNECTING LOADER SCREEN ------------------ */
        <div className="flex-grow flex flex-col items-center justify-center p-8 text-center bg-white border border-slate-300 rounded-xl shadow-xs">
          <div className="flex flex-col items-center justify-center space-y-5 max-w-sm">
            <RefreshCw size={36} className="text-[#2f5d62] animate-spin" />
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-slate-800">Connecting to Room Lobby...</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Establishing secure WebRTC peer channel and awaiting Host approval request decision...
              </p>
            </div>
            <button
              type="button"
              onClick={handleExitSession}
              className="command danger-command inline-danger text-xs px-4 py-2 mt-2"
            >
              Cancel Connection
            </button>
          </div>
        </div>
      ) : isRoundStarted && session ? (
        /* ------------------ ACTIVE LIVE DEBATE ROUND SECTION ------------------ */
        <div className="space-y-6 flex-1 flex flex-col overflow-hidden">
          
          {/* Header Controls Banner */}
          <div className="bg-white border border-slate-300 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-xs">
            <div>
              <span className="eyebrow">Room Code: {session.roomCode}</span>
              <h1 className="text-xl font-bold tracking-tight text-slate-800">{session.matchName}</h1>
              <div className="text-xs text-slate-500 mt-0.5">
                Group: {session.groupName} | Debaters: {session.debaters.length}
                {myDebaterInfo?.team && (
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                    My Side: {myDebaterInfo.team.toUpperCase()} (Pos: {myDebaterInfo.position})
                  </span>
                )}
              </div>
            </div>

            {/* Session Action Commands */}
            <div className="session-actions">
              {isHost && session.status === "lobby" && (
                <button type="button" className="command primary" onClick={handleStartDebate}>
                  <Play size={16} /> Start Debate
                </button>
              )}
              {isHost && session.status === "active" && (
                <div className="flex gap-2">
                  <select 
                    onChange={(e) => requestEndRound(e.target.value as any)} 
                    defaultValue=""
                    className="bg-white text-xs border border-slate-300 rounded-lg px-2"
                  >
                    <option value="" disabled>End debate (Select Winner)</option>
                    <option value="affirmative">Affirmative Wins</option>
                    <option value="negative">Negative Wins</option>
                  </select>
                </div>
              )}
              <button type="button" className="command danger-command inline-danger" onClick={handleExitSession}>
                Exit Session
              </button>
            </div>
          </div>

          {/* Pending handshake requests alerts (Host-only overlay) */}
          {isHost && pendingRequests.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg flex items-center justify-between gap-4 animate-pulse shrink-0">
              <div className="flex items-center gap-2 text-amber-800 text-sm font-semibold">
                <Users size={16} />
                <span>Pending link request from: {pendingRequests[0].name}</span>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleApproveDebater(pendingRequests[0])}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-1 px-3 rounded-md flex items-center gap-1.5"
                >
                  <UserCheck size={14} /> Approve
                </button>
                <button 
                  onClick={() => handleRejectDebater(pendingRequests[0])}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold py-1 px-3 rounded-md flex items-center gap-1.5"
                >
                  <UserX size={14} /> Reject
                </button>
              </div>
            </div>
          )}

          {session.status === "lobby" ? (
            /* ------------------ LOBBY PREP SCREEN ------------------ */
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 min-h-0 overflow-y-auto">
              
              {/* Handouts panel */}
              <div className="panel flex flex-col justify-between">
                <div>
                  <div className="panel-header compact">
                    <h2>Debate Handouts</h2>
                    <FileText size={18} />
                  </div>
                  <p className="text-xs text-slate-500 mb-3">Draft the match problem. Handouts distribute immediately when the host starts the debate.</p>
                  
                  {isHost ? (
                    <div className="space-y-4">
                      <label className="field compact-field">
                        <span>Problem Topic Title</span>
                        <input 
                          value={session.handout.title} 
                          onChange={(e) => handleUpdateHandout({ title: e.target.value })}
                          placeholder="e.g. Subsidy tariffs on green technology..."
                        />
                      </label>
                      <label className="field compact-field">
                        <span>Problem Resolution Definition</span>
                        <textarea 
                          value={session.handout.problem} 
                          onChange={(e) => handleUpdateHandout({ problem: e.target.value })}
                          placeholder="Define the primary focus problem..."
                        />
                      </label>
                      <label className="field compact-field">
                        <span>Problem details (optional)</span>
                        <textarea 
                          value={session.handout.details || ""} 
                          onChange={(e) => handleUpdateHandout({ details: e.target.value })}
                          placeholder="Context or documentation..."
                          className="min-h-[80px]"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                      <FileText size={40} className="text-slate-350 animate-pulse" />
                      <div className="space-y-1">
                        <h3 className="text-xs font-bold text-slate-700">Awaiting Handout Distribution</h3>
                        <p className="text-[11px] text-slate-500 max-w-[240px] leading-relaxed">
                          The host is currently drafting the debate resolution. Handouts will release instantly when the match starts.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Teams & Positions assignments */}
              <div className="panel">
                <div className="panel-header compact">
                  <h2>Debaters Teams assignment</h2>
                  <Users size={18} />
                </div>
                <p className="text-xs text-slate-500 mb-4">Set sides and speaker positions. Total approved debaters: {session.debaters.length}</p>
                
                <div className="team-list">
                  {session.debaters.length === 0 ? (
                    <div className="text-center py-10 text-xs text-slate-400">
                      Waiting for debaters to join the room using code <strong>{session.roomCode}</strong>...
                    </div>
                  ) : (
                    session.debaters.map(d => (
                      <article key={d.id} className="team-row gap-3">
                        <div className="min-w-0">
                          <strong className="text-xs text-slate-700 truncate block">{d.name}</strong>
                          <span className="text-[10px] text-slate-400 font-mono">{d.id.substring(0, 8)}</span>
                        </div>
                        {isHost ? (
                          <>
                            <div className="segmented">
                              <button 
                                type="button" 
                                className={d.team === "affirmative" ? "selected" : ""} 
                                onClick={() => updateDebaterConfig(d.id, "affirmative", d.position || 1)}
                              >
                                Aff
                              </button>
                              <button 
                                type="button" 
                                className={d.team === "negative" ? "selected" : ""} 
                                onClick={() => updateDebaterConfig(d.id, "negative", d.position || 1)}
                              >
                                Neg
                              </button>
                            </div>
                            <select
                              value={d.position || 1}
                              onChange={(e) => updateDebaterConfig(d.id, d.team || "affirmative", parseInt(e.target.value, 10))}
                              className="position-input w-16"
                            >
                              {Array.from({ length: session.teamSize }, (_, index) => index + 1).map(position => (
                                <option key={position} value={position}>{position}</option>
                              ))}
                            </select>
                          </>
                        ) : (
                          <div className="text-xs font-semibold text-[#2f5d62]">
                            {d.team ? `${d.team.toUpperCase()} (Pos: ${d.position})` : "Unassigned"}
                          </div>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </div>

            </div>
          ) : (
            /* ------------------ ACTIVE DEBATE SCREEN ------------------ */
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 min-h-0 overflow-y-auto">
              
              {/* Handout & Info */}
              <div className="panel flex flex-col justify-between overflow-y-auto h-full">
                <div className="space-y-4">
                  <div className="panel-header compact border-b pb-2">
                    <h2>Match Handout</h2>
                    <Award size={18} className="text-[#2f5d62]" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">{session.handout.title}</h3>
                  <div className="space-y-3">
                    <div>
                      <span className="eyebrow">Debate Resolution</span>
                      <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
                        {session.handout.problem}
                      </p>
                    </div>
                    {session.handout.details && (
                      <div>
                        <span className="eyebrow">Problem context</span>
                        <p className="text-[11px] text-slate-500 whitespace-pre-line leading-relaxed">
                          {session.handout.details}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t space-y-2">
                  <span className="eyebrow">Debater Positions</span>
                  <div className="space-y-1.5">
                    {session.debaters.map(d => (
                      <div key={d.id} className="flex justify-between items-center text-xs bg-slate-100 p-2 rounded border">
                        <span className="font-semibold text-slate-700">{d.name}</span>
                        <span className="text-[10px] uppercase font-bold text-[#2f5d62]">
                          {d.team} (Pos {d.position})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Speech & Prep count down timers */}
              <div className="panel flex flex-col h-full overflow-y-auto">
                <div className="panel-header compact border-b pb-2">
                  <h2>Round Timers</h2>
                  <Clock size={18} className="text-[#2f5d62]" />
                </div>

                <div className="space-y-6 py-4 flex-1">
                  {/* Speech timer card */}
                  <div className="timer-row">
                    <div>
                      <strong>Speech countdown ({session.currentSpeakerId ? currentSpeaker?.name : "None"})</strong>
                      {isHost ? (
                        <input 
                          value={speechInput} 
                          onChange={(e) => setSpeechInput(e.target.value)} 
                          onBlur={(e) => handleTimerDurationChange("speech", e.target.value)} 
                          className="timer-input"
                        />
                      ) : (
                        <span>{formatCountdown(timerRemaining)}</span>
                      )}
                    </div>
                    
                    <div className="font-mono text-xl font-bold text-slate-800">
                      {formatCountdown(timerRemaining)}
                    </div>
                    
                    {isHost && (
                      <div className="row-actions">
                        <button 
                          onClick={() => handleTimerClick("speech", isTimerRunning ? "pause" : "start")}
                          className="icon-button"
                        >
                          {isTimerRunning ? <Pause size={15} /> : <Play size={15} />}
                        </button>
                        <button 
                          onClick={() => handleTimerClick("speech", "reset")}
                          className="icon-button"
                        >
                          <RotateCcw size={15} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Prep timer card */}
                  <div className="timer-row">
                    <div>
                      <strong>Partners Prep Timer</strong>
                      {isHost ? (
                        <input 
                          value={prepInput} 
                          onChange={(e) => setPrepInput(e.target.value)} 
                          onBlur={(e) => handleTimerDurationChange("prep", e.target.value)} 
                          className="timer-input"
                        />
                      ) : (
                        <span>{formatCountdown(prepRemaining)}</span>
                      )}
                    </div>

                    <div className="font-mono text-xl font-bold text-slate-800">
                      {formatCountdown(prepRemaining)}
                    </div>

                    {isHost && (
                      <div className="row-actions">
                        <button 
                          onClick={() => handleTimerClick("prep", isPrepRunning ? "pause" : "start")}
                          className="icon-button"
                        >
                          {isPrepRunning ? <Pause size={15} /> : <Play size={15} />}
                        </button>
                        <button 
                          onClick={() => handleTimerClick("prep", "reset")}
                          className="icon-button"
                        >
                          <RotateCcw size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Speakers listing to select / view notes */}
                <div className="pt-4 border-t space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="eyebrow">Select Active Speaker</span>
                    <button
                      type="button"
                      onClick={() => setShowPositionsOnly(!showPositionsOnly)}
                      className="text-[10px] bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded px-2 py-0.5 font-bold text-[#2f5d62]"
                    >
                      {showPositionsOnly ? "Show Names" : "Show Positions"}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {session.debaters.map(d => {
                      const positionText = d.team && d.position 
                        ? `${d.team === "affirmative" ? "AFF" : "NEG"} Pos ${d.position}`
                        : "Unassigned";
                      const buttonText = showPositionsOnly ? positionText : d.name;
                      
                      // Check if this speaker is currently globally speaking (marked by host)
                      const isGloballySpeaking = session.currentSpeakerId === d.id;
                      // Check if this is the locally viewed speaker for notes
                      const isLocallySelected = activeSpeakerId === d.id;

                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => handleSelectSpeaker(d.id)}
                          className={`text-xs p-2 rounded-lg border font-semibold flex items-center justify-between gap-1.5 transition-colors ${
                            isLocallySelected
                              ? "bg-[#2f5d62] border-[#2f5d62] text-white"
                              : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                          }`}
                        >
                          <span className="truncate flex-1 text-left">{buttonText}</span>
                          {isGloballySpeaking && (
                            <span className={`h-2 w-2 rounded-full shrink-0 ${isLocallySelected ? "bg-white animate-pulse" : "bg-emerald-500 animate-pulse"}`} title="Speaking" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Speaker Notes */}
              <div className="panel flex flex-col h-full overflow-y-auto">
                <div className="panel-header compact border-b pb-2">
                  <h2>In-Round Notes</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAIOutlineFill}
                      title="AI outline topic"
                      className="text-[10px] bg-[#dfe7e1] border border-[#c5d5c9] text-[#2c504c] px-2 py-0.5 rounded flex items-center gap-1.5"
                    >
                      <Sparkles size={11} /> AI Outline
                    </button>
                  </div>
                </div>

                <div className="flex-1 flex flex-col py-3">
                  <span className="eyebrow block mb-2">
                    Active Speaker Notes: {currentSpeaker ? currentSpeaker.name : "None selected"}
                  </span>
                  <textarea
                    value={currentSpeakerNotes}
                    onChange={(e) => handleUpdateSpeakerNote(e.target.value)}
                    disabled={!activeSpeakerId}
                    placeholder={
                      activeSpeakerId 
                        ? `Type markdown notes for ${currentSpeaker?.name}...` 
                        : "Select an active speaker to log speech notes..."
                    }
                    className="w-full h-full bg-slate-50 border rounded-lg p-3 resize-none text-xs leading-relaxed focus:outline-none"
                  />
                </div>
              </div>

            </div>
          )}

        </div>
      ) : (
        /* ------------------ STARTING DEBATE PIPELINE SELECTION ------------------ */
        <div className="flex-grow flex flex-col lg:flex-row gap-6 min-h-0 overflow-y-auto">
          {/* Main Welcome Hero */}
          <div className="flex-1 bg-white border border-slate-300 rounded-xl p-8 flex flex-col justify-center items-center text-center space-y-6 shadow-xs">
            <Award size={48} className="text-[#2f5d62]" />
            <div className="max-w-md space-y-2">
              <h2 className="text-xl font-bold tracking-tight text-slate-800">Start Debate Session</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Connect and sync debate sheets in real-time with your partner, manage speech countdowns, and run human-in-the-loop AI outline assistants.
              </p>
            </div>
            
            <div className="flex gap-4">
              <button
                onClick={() => setStartMode("host")}
                className="bg-[#2f5d62] hover:bg-[#3b7379] text-white text-xs font-bold px-6 py-3 rounded-xl transition-all shadow-md flex items-center gap-2"
              >
                Host Match Session
              </button>
              <button
                onClick={() => setStartMode("join")}
                className="command text-xs font-bold px-6 py-3 rounded-xl transition-all flex items-center gap-2"
              >
                Join Match Session
              </button>
            </div>

            {/* Host inputs details */}
            {startMode === "host" && (
              <form onSubmit={handleHostCreate} className="w-full max-w-sm border-t pt-6 space-y-4 text-left">
                <label className="field compact-field">
                  <span>Debate Match Name</span>
                  <input 
                    value={matchName} 
                    onChange={(e) => setMatchName(e.target.value)} 
                    placeholder="e.g. State Debate Finals Round 1..."
                    required 
                  />
                </label>
                <label className="field compact-field">
                  <span>Debaters School / Group Name</span>
                  <input 
                    value={groupName} 
                    onChange={(e) => setGroupName(e.target.value)} 
                    placeholder="e.g. Lincoln High School debate club..."
                    required 
                  />
                </label>
                <label className="field compact-field">
                  <span>Position Team Size</span>
                  <input 
                    type="number"
                    min={1}
                    max={4}
                    value={teamSize} 
                    onChange={(e) => setTeamSize(parseInt(e.target.value, 10))} 
                    required 
                  />
                </label>
                <button type="submit" className="command primary w-full flex items-center justify-center gap-2">
                  Launch Room Lobby <ArrowRight size={14} />
                </button>
              </form>
            )}

            {/* Join inputs details */}
            {startMode === "join" && (
              <form onSubmit={handleClientJoin} className="w-full max-w-sm border-t pt-6 space-y-4 text-left">
                <label className="field compact-field">
                  <span>Host Room Code</span>
                  <input 
                    value={joinRoomCode} 
                    onChange={(e) => setJoinRoomCode(e.target.value)} 
                    placeholder="Enter 4-digit code..."
                    required 
                  />
                </label>
                <button type="submit" className="command primary w-full flex items-center justify-center gap-2">
                  Submit Join Request <ArrowRight size={14} />
                </button>
              </form>
            )}
          </div>

          {/* Right side: Session History lists */}
          <div className="w-full lg:w-80 bg-white border border-slate-300 rounded-xl p-6 flex flex-col overflow-hidden shadow-xs">
            <div className="flex items-center gap-2 mb-4 border-b pb-2">
              <History size={16} className="text-[#2f5d62]" />
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Recent Sessions</h3>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {historyList.map((rec) => (
                <div key={rec.id} className="bg-slate-50 border border-slate-200 p-3.5 rounded-lg space-y-1.5 text-left">
                  <div className="flex items-center justify-between text-[9px] text-slate-400">
                    <span className="flex items-center gap-1 font-medium">
                      <Calendar size={10} /> {new Date(rec.timestamp).toLocaleDateString()}
                    </span>
                    <span className={`px-1 rounded font-bold uppercase text-[8px] ${
                      rec.winLoss === "win" ? "bg-emerald-100 text-emerald-700 border" : "bg-rose-100 text-rose-700 border"
                    }`}>
                      {rec.winLoss}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-800 truncate">{rec.matchName}</h4>
                    <span className="text-[10px] text-slate-500 font-medium truncate block">
                      vs. {rec.opponentName} | Side: {rec.sides}
                    </span>
                  </div>
                </div>
              ))}

              {historyList.length === 0 && (
                <div className="text-center py-10 text-slate-400 text-xs flex flex-col justify-center items-center gap-2 h-full">
                  <Trophy size={20} className="text-slate-200" />
                  <span>No debate sessions archived.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InRound;
