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
  Plus,
  Trash2,
  Wifi
} from "lucide-react";
import { 
  Button, 
  TextInput, 
  Textarea,
  Text, 
  Stack, 
  Group, 
  Select,
  SegmentedControl,
  Paper, 
  Badge, 
  Title, 
  Grid,
  ScrollArea,
  ActionIcon,
  Modal,
  Notification,
  Loader,
  Card,
  Alert,
  SimpleGrid
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

interface CustomTimer {
  id: string;
  name: string;
  durationSeconds: number;
  remainingMs: number;
  running: boolean;
  targetTime?: number;
}

type CustomTimerAction = "start" | "pause" | "reset" | "remove";

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
    userId,
    userName,
    setActivePage,
    startSession,
    endSession
  } = useApp();
  const isMobile = useMediaQuery("(max-width: 48em)");

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
  const [customTimers, setCustomTimers] = useState<CustomTimer[]>([]);
  const [customTimerName, setCustomTimerName] = useState("");
  const [customTimerDuration, setCustomTimerDuration] = useState("01:00");
  const [savedRoom, setSavedRoom] = useState<{ code: string; host: boolean } | null>(null);
  const customTimersRef = React.useRef<CustomTimer[]>([]);

  // History state for welcome page
  const [historyList, setHistoryList] = useState<TournamentRecord[]>([]);

  // Trigger brief notification alert
  const triggerToast = (msg: string) => {
    setToastNotification(msg);
    setTimeout(() => setToastNotification(null), 3000);
  };

  // Local active speaker state
  const [localActiveSpeakerId, setLocalActiveSpeakerId] = useState<string | null>(null);
  const [showPositionsOnly, setShowPositionsOnly] = useState(false);

  const sanitizeSessionForBroadcast = (state: SessionState): SessionState => ({
    ...state,
    speakerNotes: {}
  });

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

  const broadcastCustomTimers = (timers: CustomTimer[]) => {
    if (!isHost) return;
    mesh.broadcast({
      type: "custom-timers-sync",
      senderId: mesh.peerId,
      payload: { timers }
    });
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

  useEffect(() => {
    customTimersRef.current = customTimers;
  }, [customTimers]);

  useEffect(() => {
    if (isRoundStarted) return;
    const storedRoom = localStorage.getItem("dialektik.activeRoom");
    if (!storedRoom) {
      setSavedRoom(null);
      return;
    }
    try {
      const parsed = JSON.parse(storedRoom) as { code: string; host: boolean };
      setSavedRoom(parsed?.code ? parsed : null);
    } catch {
      setSavedRoom(null);
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

    const code = Math.random().toString(36).substring(2, 6).toUpperCase();

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

    const unsubscribe = mesh.onMessage((senderId, msg) => {
      if (msg.type === "join-request") {
        if (isHost) {
          const newDebater: Debater = {
            id: msg.payload?.id || senderId,
            name: msg.payload?.name || "Unknown Debater",
            status: "pending",
            connectionId: senderId
          };
          setPendingRequests(prev => {
            if (prev.some(d => d.id === newDebater.id)) {
              return prev.map(d => d.id === newDebater.id ? newDebater : d);
            }
            return [...prev, newDebater];
          });
          triggerToast(`Join request from ${newDebater.name}`);
        }
      } else if (msg.type === "session-state") {
        if (!isHost) {
          const syncedSession: SessionState = msg.payload;
          setSession(prev => ({
            ...syncedSession,
            speakerNotes: prev?.speakerNotes || {}
          }));

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
        const { timerType, action, durationSeconds, targetTime } = msg.payload;
        const targetTimer = timerType === "speech" ? debateTimerRef.current : prepTimerRef.current;
        const setterRunning = timerType === "speech" ? setIsTimerRunning : setIsPrepRunning;

        if (targetTimer) {
          if (action === "start") {
            const rem = Math.max(0, targetTime - Date.now());
            targetTimer.reset(rem / 1000);
            targetTimer.start();
            setterRunning(true);

            if (timerType === "speech" && session?.currentSpeakerId === userId) {
              triggerToast("Your speech timer has started.");
            }
          } else if (action === "pause") {
            targetTimer.pause();
            setterRunning(false);
          } else if (action === "reset") {
            targetTimer.reset(durationSeconds);
            setterRunning(false);
          }
        }
      } else if (msg.type === "custom-timers-sync") {
        if (!isHost && Array.isArray(msg.payload?.timers)) {
          setCustomTimers(msg.payload.timers);
        }
      } else if (msg.type === "version-reject" || msg.type === "handshake") {
        if (!isHost) {
          mesh.sendToPeer(senderId, {
            type: "join-request",
            senderId: mesh.peerId,
            payload: { id: userId, name: userName }
          });
        } else {
          broadcastCustomTimers(customTimersRef.current);
        }
      }
    });
    return unsubscribe;
  }, [isRoundStarted, isHost, mesh, userId, userName, session?.speechDuration, session?.prepDuration, session?.currentSpeakerId]);

  const handleApproveDebater = (request: Debater) => {
    if (!session) return;
    const updatedDebaters = session.debaters.some(d => d.id === request.id)
      ? session.debaters.map(d => d.id === request.id ? { ...d, name: request.name, connectionId: request.connectionId, status: "approved" as const } : d)
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

  const handleRejectDebater = (request: Debater) => {
    setPendingRequests(prev => prev.filter(r => r.id !== request.id));
    mesh.sendToPeer(request.connectionId || request.id, {
      type: "timer-action",
      senderId: mesh.peerId,
      payload: { action: "reset", timerType: "speech", durationSeconds: 0 }
    });
    triggerToast(`${request.name} rejected.`);
  };

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

  const handleUpdateHandout = (fields: Partial<Handout>) => {
    if (!session) return;
    const nextSession = {
      ...session,
      handout: { ...session.handout, ...fields }
    };
    setSession(nextSession);
    if (session.status === "active") {
      broadcastSessionState(nextSession);
    }
  };

  const handleSelectSpeaker = (debaterId: string) => {
    setLocalActiveSpeakerId(debaterId);
    if (isHost && session) {
      const nextSession = { ...session, currentSpeakerId: debaterId };
      setSession(nextSession);
      broadcastSessionState(nextSession);
    }
  };

  const handleStartDebate = () => {
    if (!session) return;
    
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

  useEffect(() => {
    if (!customTimers.some(timer => timer.running)) return;
    const interval = window.setInterval(() => {
      setCustomTimers(prev => prev.map(timer => {
        if (!timer.running || !timer.targetTime) return timer;
        const remainingMs = Math.max(0, timer.targetTime - Date.now());
        if (remainingMs === 0) {
          triggerToast(`${timer.name} timer ended.`);
          if (isHost) {
            const endedTimers = prev.map(item => item.id === timer.id ? { ...item, remainingMs, running: false, targetTime: undefined } : item);
            window.setTimeout(() => broadcastCustomTimers(endedTimers), 0);
          }
          return { ...timer, remainingMs, running: false, targetTime: undefined };
        }
        return { ...timer, remainingMs };
      }));
    }, 250);
    return () => window.clearInterval(interval);
  }, [customTimers]);

  const handleAddCustomTimer = () => {
    const name = customTimerName.trim();
    const durationSeconds = parseMMSS(customTimerDuration);
    if (!name || durationSeconds <= 0) return;
    setCustomTimers(prev => {
      const nextTimers = [
        ...prev,
        {
        id: `timer-${Math.random().toString(36).slice(2, 10)}`,
        name,
        durationSeconds,
        remainingMs: durationSeconds * 1000,
        running: false
      }
      ];
      broadcastCustomTimers(nextTimers);
      return nextTimers;
    });
    setCustomTimerName("");
    setCustomTimerDuration("01:00");
  };

  const handleCustomTimerAction = (id: string, action: CustomTimerAction) => {
    setCustomTimers(prev => {
      const nextTimers = action === "remove" ? prev.filter(timer => timer.id !== id) : prev.map(timer => {
        if (timer.id !== id) return timer;
        if (action === "start") {
          return { ...timer, running: true, targetTime: Date.now() + timer.remainingMs };
        }
        if (action === "pause") {
          return { ...timer, running: false, targetTime: undefined };
        }
        return { ...timer, running: false, remainingMs: timer.durationSeconds * 1000, targetTime: undefined };
      });
      broadcastCustomTimers(nextTimers);
      return nextTimers;
    });
  };

  const handleQuickRejoin = async () => {
    if (!savedRoom?.code) return;
    await startSession(savedRoom.code, savedRoom.host);
    triggerToast(`Rejoining room ${savedRoom.code}...`);
  };

  const handleTimerDurationChange = (timerType: "speech" | "prep", val: string) => {
    if (!session) return;
    const seconds = parseMMSS(val);
    const nextSession = {
      ...session,
      [timerType === "speech" ? "speechDuration" : "prepDuration"]: seconds
    };
    setSession(nextSession);

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

      if (timerType === "speech" && session?.currentSpeakerId === userId) {
        triggerToast("Your speech timer has started.");
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

  const requestEndRound = (winner: "affirmative" | "negative") => {
    setPendingWinner(winner);
  };

  const confirmEndRound = async () => {
    const winner = pendingWinner;
    if (!session) return;
    if (!winner) return;

    const roundRecord: TournamentRecord = {
      id: `history-${Math.random().toString(36).substring(2, 11)}`,
      matchName: session.matchName,
      opponentName: session.groupName,
      sides: session.debaters.find(d => d.id === userId)?.team || "affirmative",
      winLoss: winner === (session.debaters.find(d => d.id === userId)?.team || "affirmative") ? "win" : "loss",
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
    
    const nextSession = { ...session, status: "ended" as const, winner };
    setSession(nextSession);
    broadcastSessionState(nextSession);

    triggerToast("Session saved! Redirecting to history...");
    setPendingWinner(null);
    endSession();
    setActivePage("history");
  };

  const handleExitSession = () => {
    setExitConfirmOpen(true);
  };

  const confirmExitSession = () => {
    endSession();
    setSession(null);
    setExitConfirmOpen(false);
    triggerToast("Exited session.");
  };

  const formatCountdown = (ms: number): string => {
    const totalSeconds = Math.ceil(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const activeSpeakerId = localActiveSpeakerId || session?.currentSpeakerId || "";
  const currentSpeaker = session?.debaters.find(d => d.id === activeSpeakerId);
  const currentSpeakerNotes = activeSpeakerId ? session?.speakerNotes[activeSpeakerId] || "" : "";
  const myDebaterInfo = session?.debaters.find(d => d.id === userId);

  return (
    <Stack gap="md" style={{ flex: 1, height: "100%", minHeight: 0, overflow: isMobile ? "auto" : "hidden" }}>
      {toastNotification && (
        <Notification
          color="teal"
          onClose={() => setToastNotification(null)}
          style={{ position: "fixed", top: 72, right: 20, zIndex: 1000, width: "min(360px, calc(100vw - 32px))", boxShadow: "var(--mantine-shadow-md)" }}
        >
          {toastNotification}
        </Notification>
      )}

      <Modal 
        opened={exitConfirmOpen} 
        onClose={() => setExitConfirmOpen(false)} 
        title={<Text fw={700}>Exit Session?</Text>}
        centered
      >
        <Stack gap="md">
          <Text size="sm">Disconnect from the current room and return to the start screen.</Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="outline" onClick={() => setExitConfirmOpen(false)}>Cancel</Button>
            <Button color="red" onClick={confirmExitSession}>Exit Session</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal 
        opened={!!pendingWinner} 
        onClose={() => setPendingWinner(null)} 
        title={<Text fw={700}>End Debate?</Text>}
        centered
      >
        <Stack gap="md">
          <Text size="sm">Record {pendingWinner} as the winner and save this round to history.</Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="outline" onClick={() => setPendingWinner(null)}>Cancel</Button>
            <Button color="teal" onClick={confirmEndRound}>Save Round</Button>
          </Group>
        </Stack>
      </Modal>

      {isRoundStarted && !session ? (
        /* ------------------ CONNECTING LOADER SCREEN ------------------ */
        <Card withBorder p="xl" radius="md" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Stack align="center" gap="md" style={{ maxWidth: 360, textAlign: "center" }}>
            <Loader size="lg" color="teal" />
            <Stack gap={4}>
              <Title order={5}>Connecting to Room Lobby...</Title>
              <Text size="xs" c="dimmed" style={{ lineHeight: 1.4 }}>
                Establishing secure WebRTC peer channel and awaiting Host approval request decision...
              </Text>
            </Stack>
            <Button color="red" variant="outline" size="xs" onClick={handleExitSession}>
              Cancel Connection
            </Button>
          </Stack>
        </Card>
      ) : isRoundStarted && session ? (
        /* ------------------ ACTIVE LIVE DEBATE ROUND SECTION ------------------ */
        <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
          {/* Header Controls Banner */}
          <Card withBorder p="sm" radius="md">
            <Group justify="space-between" align="center">
              <Stack gap={2}>
                <Text size="xs" fw={700} c="dimmed">Room code: {session.roomCode}</Text>
                <Title order={4}>{session.matchName}</Title>
                <Group gap="xs">
                  <Text size="xs" c="dimmed">Group: {session.groupName} • Debaters: {session.debaters.length}</Text>
                  {myDebaterInfo?.team && (
                    <Badge color="teal" variant="light" size="xs">
                      My side: {myDebaterInfo.team} (Pos: {myDebaterInfo.position})
                    </Badge>
                  )}
                </Group>
              </Stack>

              <Group gap="xs">
                {isHost && session.status === "lobby" && (
                  <Button onClick={handleStartDebate} color="teal" leftSection={<Play size={14} />} size="xs">
                    Start Debate
                  </Button>
                )}
                {isHost && session.status === "active" && (
                  <Select
                    placeholder="End debate (Select Winner)"
                    onChange={(val) => requestEndRound(val as any)}
                    data={[
                      { label: "Affirmative Wins", value: "affirmative" },
                      { label: "Negative Wins", value: "negative" }
                    ]}
                    size="xs"
                    style={{ width: 200 }}
                  />
                )}
                <Button variant="outline" color="red" size="xs" onClick={handleExitSession}>
                  Exit Session
                </Button>
              </Group>
            </Group>
          </Card>

          {/* Pending requests overlay */}
          {isHost && pendingRequests.length > 0 && (
            <Alert color="orange" title="Pending Link Request" icon={<Users size={16} />}>
              <Group justify="space-between" align="center">
                <Text size="xs">Pending link request from: {pendingRequests[0].name}</Text>
                <Group gap="xs">
                  <Button size="xs" color="teal" leftSection={<UserCheck size={12} />} onClick={() => handleApproveDebater(pendingRequests[0])}>
                    Approve
                  </Button>
                  <Button size="xs" color="red" variant="outline" leftSection={<UserX size={12} />} onClick={() => handleRejectDebater(pendingRequests[0])}>
                    Reject
                  </Button>
                </Group>
              </Group>
            </Alert>
          )}

          {session.status === "lobby" ? (
            /* ------------------ LOBBY PREP SCREEN ------------------ */
            <Grid
              style={{ flex: 1, height: isMobile ? "auto" : "100%", minHeight: 0, overflow: isMobile ? "visible" : "hidden" }}
              styles={{ inner: { height: isMobile ? "auto" : "100%" } }}
              align="stretch"
              gutter="md"
            >
              {/* Handouts panel */}
              <Grid.Col span={{ base: 12, md: 6 }} style={{ display: "flex", flexDirection: "column", height: isMobile ? "calc(100dvh - 150px)" : "100%", minHeight: 0 }}>
                <Card withBorder p="sm" radius="md" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
                    <Group justify="space-between" align="center">
                      <Text fw={700} size="sm">Debate Handouts</Text>
                      <FileText size={17} color="var(--mantine-color-gray-6)" />
                    </Group>
                    <Text size="xs" c="dimmed">Draft the match problem. Handouts distribute immediately when host starts the debate.</Text>

                    {isHost ? (
                      <Stack gap="sm" style={{ flex: 1 }}>
                        <TextInput 
                          label="Problem Topic Title"
                          value={session.handout.title} 
                          onChange={(e) => handleUpdateHandout({ title: e.target.value })}
                          placeholder="e.g. Subsidy tariffs on green technology..."
                          size="xs"
                        />
                        <Textarea 
                          label="Problem Resolution Definition"
                          value={session.handout.problem} 
                          onChange={(e) => handleUpdateHandout({ problem: e.target.value })}
                          placeholder="Define the primary focus problem..."
                          size="xs"
                          rows={4}
                        />
                        <Textarea 
                          label="Problem details (optional)"
                          value={session.handout.details || ""} 
                          onChange={(e) => handleUpdateHandout({ details: e.target.value })}
                          placeholder="Context or documentation..."
                          size="xs"
                          rows={4}
                        />
                      </Stack>
                    ) : (
                      <Stack align="center" justify="center" style={{ flex: 1 }} gap="xs">
                        <FileText size={36} color="var(--mantine-color-gray-4)" />
                        <Text size="xs" fw={700}>Awaiting Handout Distribution</Text>
                        <Text size="xs" c="dimmed" style={{ textAlign: "center", maxWidth: 280, lineHeight: 1.4 }}>
                          The host is currently drafting the debate resolution. Handouts will release instantly when the match starts.
                        </Text>
                      </Stack>
                    )}
                  </Stack>
                </Card>
              </Grid.Col>

              {/* Teams & Positions assignments */}
              <Grid.Col span={{ base: 12, md: 6 }} style={{ display: "flex", flexDirection: "column", height: isMobile ? "calc(100dvh - 150px)" : "100%", minHeight: 0 }}>
                <Card withBorder p="sm" radius="md" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
                    <Group justify="space-between" align="center">
                      <Text fw={700} size="sm">Debaters Teams Assignment</Text>
                      <Users size={17} color="var(--mantine-color-gray-6)" />
                    </Group>
                    <Text size="xs" c="dimmed">Set sides and speaker positions. Total approved debaters: {session.debaters.length}</Text>
                    
                    <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto" offsetScrollbars>
                      <Stack gap="xs">
                        {session.debaters.length === 0 ? (
                          <Text size="xs" c="dimmed" style={{ textAlign: "center", padding: "40px 0" }}>
                            Waiting for debaters to join using code <strong>{session.roomCode}</strong>...
                          </Text>
                        ) : (
                          session.debaters.map(d => (
                            <Paper key={d.id} withBorder p="sm" radius="md" bg="var(--mantine-color-gray-0)">
                              <Group justify="space-between" wrap="nowrap">
                                <Stack gap={2}>
                                  <Text size="xs" fw={700}>{d.name}</Text>
                                  <Text size="xs" c="dimmed" style={{ fontFamily: "monospace" }}>{d.id.substring(0, 8)}</Text>
                                </Stack>

                                {isHost ? (
                                  <Group gap="xs">
                                    <SegmentedControl
                                      value={d.team || "affirmative"}
                                      onChange={(val) => updateDebaterConfig(d.id, val as any, d.position || 1)}
                                      data={[
                                        { label: "Aff", value: "affirmative" },
                                        { label: "Neg", value: "negative" }
                                      ]}
                                      size="xs"
                                      color="teal"
                                    />
                                    <Select
                                      value={String(d.position || 1)}
                                      onChange={(val) => updateDebaterConfig(d.id, d.team || "affirmative", parseInt(val || "1", 10))}
                                      data={Array.from({ length: session.teamSize }, (_, index) => String(index + 1))}
                                      size="xs"
                                      style={{ width: 60 }}
                                    />
                                  </Group>
                                ) : (
                                  <Badge color="teal" variant="light" size="xs">
                                    {d.team ? `${d.team} (Pos: ${d.position})` : "Unassigned"}
                                  </Badge>
                                )}
                              </Group>
                            </Paper>
                          ))
                        )}
                      </Stack>
                    </ScrollArea>
                  </Stack>
                </Card>
              </Grid.Col>
            </Grid>
          ) : (
            /* ------------------ ACTIVE DEBATE SCREEN ------------------ */
            <Grid
              style={{ flex: 1, height: isMobile ? "auto" : "100%", minHeight: 0, overflow: isMobile ? "visible" : "hidden" }}
              styles={{ inner: { height: isMobile ? "auto" : "100%" } }}
              align="stretch"
              gutter="md"
            >
              {/* Handout & Info */}
              <Grid.Col span={{ base: 12, md: 4 }} style={{ display: "flex", flexDirection: "column", height: isMobile ? "calc(100dvh - 150px)" : "100%", minHeight: 0 }}>
                <Card withBorder p="sm" radius="md" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
                    <Group justify="space-between" align="center">
                      <Text fw={700} size="sm">Match Handout</Text>
                      <Award size={18} color="var(--mantine-color-teal-6)" />
                    </Group>

                    <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto" offsetScrollbars>
                      <Stack gap="md">
                        <Title order={5}>{session.handout.title}</Title>
                        
                        <Stack gap={4}>
                          <Text size="xs" fw={700} c="dimmed">Debate resolution</Text>
                          <Paper withBorder p="xs" radius="md" bg="var(--mantine-color-gray-0)">
                            <Text size="xs" style={{ lineHeight: 1.5 }}>{session.handout.problem}</Text>
                          </Paper>
                        </Stack>

                        {session.handout.details && (
                          <Stack gap={4}>
                            <Text size="xs" fw={700} c="dimmed">Problem context</Text>
                            <Text size="xs" c="dimmed" style={{ whiteSpace: "pre-line", lineHeight: 1.4 }}>
                              {session.handout.details}
                            </Text>
                          </Stack>
                        )}

                        <Stack gap="xs" style={{ borderTop: "1px solid var(--mantine-color-gray-2)", paddingTop: "var(--mantine-spacing-xs)" }}>
                          <Text size="xs" fw={700} c="dimmed">Debater positions</Text>
                          {session.debaters.map(d => (
                            <Paper key={d.id} withBorder p="xs" radius="md">
                              <Group justify="space-between" align="center">
                                <Text size="xs" fw={700}>{d.name}</Text>
                                <Badge size="xs" color="teal">{d.team} (Pos {d.position})</Badge>
                              </Group>
                            </Paper>
                          ))}
                        </Stack>
                      </Stack>
                    </ScrollArea>
                  </Stack>
                </Card>
              </Grid.Col>

              {/* Speech & Prep count down timers */}
              <Grid.Col span={{ base: 12, md: 4 }} style={{ display: "flex", flexDirection: "column", height: isMobile ? "calc(100dvh - 150px)" : "100%", minHeight: 0 }}>
                <Card withBorder p="sm" radius="md" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
                    <Group justify="space-between" align="center">
                      <Text fw={700} size="sm">Round Timers</Text>
                      <Clock size={18} color="var(--mantine-color-teal-6)" />
                    </Group>

                    <Stack gap="md" style={{ flex: 1 }}>
                      {/* Speech timer */}
                      <Paper withBorder p="sm" radius="md">
                        <Group justify="space-between" align="center">
                          <Stack gap={2}>
                            <Text size="xs" fw={700}>Speech countdown ({session.currentSpeakerId ? currentSpeaker?.name : "None"})</Text>
                            {isHost ? (
                              <TextInput 
                                size="xs"
                                value={speechInput} 
                                onChange={(e) => setSpeechInput(e.target.value)} 
                                onBlur={(e) => handleTimerDurationChange("speech", e.target.value)} 
                                placeholder="04:00"
                                style={{ width: 70 }}
                              />
                            ) : (
                              <Text size="xs" c="dimmed">{formatCountdown(timerRemaining)}</Text>
                            )}
                          </Stack>
                          
                          <Text size="lg" fw={900} style={{ fontFamily: "monospace", fontSize: "22px" }}>
                            {formatCountdown(timerRemaining)}
                          </Text>

                          {isHost && (
                            <Group gap={6}>
                              <ActionIcon size="sm" color="teal" onClick={() => handleTimerClick("speech", isTimerRunning ? "pause" : "start")}>
                                {isTimerRunning ? <Pause size={13} /> : <Play size={13} />}
                              </ActionIcon>
                              <ActionIcon size="sm" variant="outline" color="teal" onClick={() => handleTimerClick("speech", "reset")}>
                                <RotateCcw size={13} />
                              </ActionIcon>
                            </Group>
                          )}
                        </Group>
                      </Paper>

                      {/* Prep timer */}
                      <Paper withBorder p="sm" radius="md">
                        <Group justify="space-between" align="center">
                          <Stack gap={2}>
                            <Text size="xs" fw={700}>Partners Prep Timer</Text>
                            {isHost ? (
                              <TextInput 
                                size="xs"
                                value={prepInput} 
                                onChange={(e) => setPrepInput(e.target.value)} 
                                onBlur={(e) => handleTimerDurationChange("prep", e.target.value)} 
                                placeholder="03:00"
                                style={{ width: 70 }}
                              />
                            ) : (
                              <Text size="xs" c="dimmed">{formatCountdown(prepRemaining)}</Text>
                            )}
                          </Stack>
                          
                          <Text size="lg" fw={900} style={{ fontFamily: "monospace", fontSize: "22px" }}>
                            {formatCountdown(prepRemaining)}
                          </Text>

                          {isHost && (
                            <Group gap={6}>
                              <ActionIcon size="sm" color="teal" onClick={() => handleTimerClick("prep", isPrepRunning ? "pause" : "start")}>
                                {isPrepRunning ? <Pause size={13} /> : <Play size={13} />}
                              </ActionIcon>
                              <ActionIcon size="sm" variant="outline" color="teal" onClick={() => handleTimerClick("prep", "reset")}>
                                <RotateCcw size={13} />
                              </ActionIcon>
                            </Group>
                          )}
                        </Group>
                      </Paper>

                      <Stack gap="xs">
                        <Group justify="space-between" align="center">
                          <Text size="xs" fw={700} c="dimmed">Custom timers</Text>
                        </Group>

                        {isHost && (
                          <Group gap="xs" wrap="nowrap">
                            <TextInput
                              value={customTimerName}
                              onChange={(e) => setCustomTimerName(e.target.value)}
                              placeholder="Name"
                              size="xs"
                              style={{ flex: 1 }}
                            />
                            <TextInput
                              value={customTimerDuration}
                              onChange={(e) => setCustomTimerDuration(e.target.value)}
                              placeholder="01:00"
                              size="xs"
                              style={{ width: 72 }}
                            />
                            <ActionIcon
                              color="teal"
                              size="sm"
                              onClick={handleAddCustomTimer}
                              disabled={!customTimerName.trim()}
                            >
                              <Plus size={13} />
                            </ActionIcon>
                          </Group>
                        )}

                        <ScrollArea.Autosize mah={160} type="auto" offsetScrollbars>
                          <Stack gap="xs" pr="xs">
                            {customTimers.map(timer => (
                              <Paper key={timer.id} withBorder p="xs" radius="md">
                                <Group justify="space-between" align="center" wrap="nowrap">
                                  <Stack gap={1} style={{ minWidth: 0 }}>
                                    <Text size="xs" fw={700} truncate>{timer.name}</Text>
                                    <Text size="xs" c="dimmed" style={{ fontFamily: "monospace" }}>{formatCountdown(timer.remainingMs)}</Text>
                                  </Stack>
                                  <Group gap={4} wrap="nowrap">
                                    <ActionIcon size="sm" color="teal" onClick={() => handleCustomTimerAction(timer.id, timer.running ? "pause" : "start")}>
                                      {timer.running ? <Pause size={13} /> : <Play size={13} />}
                                    </ActionIcon>
                                    <ActionIcon size="sm" variant="outline" color="teal" onClick={() => handleCustomTimerAction(timer.id, "reset")}>
                                      <RotateCcw size={13} />
                                    </ActionIcon>
                                    <ActionIcon size="sm" variant="subtle" color="red" onClick={() => handleCustomTimerAction(timer.id, "remove")}>
                                      <Trash2 size={13} />
                                    </ActionIcon>
                                  </Group>
                                </Group>
                              </Paper>
                            ))}
                            {customTimers.length === 0 && (
                              <Text size="xs" c="dimmed" ta="center" py="sm">No custom timers yet.</Text>
                            )}
                          </Stack>
                        </ScrollArea.Autosize>
                      </Stack>
                    </Stack>

                    {/* Select Active Speaker */}
                    <Stack gap="xs" style={{ borderTop: "1px solid var(--mantine-color-gray-2)", paddingTop: "var(--mantine-spacing-sm)" }}>
                      <Group justify="space-between" align="center">
                        <Text size="xs" fw={700} c="dimmed">Select active speaker</Text>
                        <Button 
                          size="xs" 
                          variant="light" 
                          color="teal" 
                          onClick={() => setShowPositionsOnly(!showPositionsOnly)}
                        >
                          {showPositionsOnly ? "Show Names" : "Show Positions"}
                        </Button>
                      </Group>

                      <SimpleGrid cols={2} spacing="xs">
                        {session.debaters.map(d => {
                          const positionText = d.team && d.position 
                            ? `${d.team === "affirmative" ? "AFF" : "NEG"} Pos ${d.position}`
                            : "Unassigned";
                          const buttonText = showPositionsOnly ? positionText : d.name;
                          const isGloballySpeaking = session.currentSpeakerId === d.id;
                          const isLocallySelected = activeSpeakerId === d.id;

                          return (
                            <Button
                              key={d.id}
                              onClick={() => handleSelectSpeaker(d.id)}
                              variant={isLocallySelected ? "filled" : "light"}
                              color="teal"
                              size="xs"
                              rightSection={isGloballySpeaking && (
                                <Badge color="red" variant="filled" circle style={{ width: 6, height: 6, minWidth: 6, padding: 0 }} />
                              )}
                            >
                              <Text size="xs" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {buttonText}
                              </Text>
                            </Button>
                          );
                        })}
                      </SimpleGrid>
                    </Stack>
                  </Stack>
                </Card>
              </Grid.Col>

              {/* Speaker Notes */}
              <Grid.Col span={{ base: 12, md: 4 }} style={{ display: "flex", flexDirection: "column", height: isMobile ? "calc(100dvh - 150px)" : "100%", minHeight: 0 }}>
                <Card withBorder p="sm" radius="md" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
                    <Group justify="space-between" align="center">
                      <Text fw={700} size="sm">In-Round Notes</Text>
                      <Button 
                        size="xs" 
                        variant="light" 
                        color="teal" 
                        onClick={handleAIOutlineFill}
                        leftSection={<Sparkles size={12} />}
                      >
                        AI Outline
                      </Button>
                    </Group>

                    <Stack gap="xs" style={{ flex: 1 }}>
                      <Text size="xs" fw={700} c="dimmed">
                        Active speaker: {currentSpeaker ? currentSpeaker.name : "None selected"}
                      </Text>
                      <Textarea
                        value={currentSpeakerNotes}
                        onChange={(e) => handleUpdateSpeakerNote(e.target.value)}
                        disabled={!activeSpeakerId}
                        placeholder={
                          activeSpeakerId 
                            ? `Type markdown notes for ${currentSpeaker?.name}...` 
                            : "Select an active speaker to log speech notes..."
                        }
                        rows={14}
                        size="xs"
                        style={{ flex: 1, display: "flex", flexDirection: "column" }}
                        styles={{ root: { flex: 1, display: "flex", flexDirection: "column" }, wrapper: { flex: 1 }, input: { height: "100%", resize: "none" } }}
                      />
                    </Stack>
                  </Stack>
                </Card>
              </Grid.Col>
            </Grid>
          )}
        </Stack>
      ) : (
        /* ------------------ STARTING DEBATE PIPELINE SELECTION ------------------ */
        <Grid
          style={{ flex: 1, height: isMobile ? "auto" : "100%", minHeight: 0, overflow: isMobile ? "visible" : "hidden" }}
          styles={{ inner: { height: isMobile ? "auto" : "100%" } }}
          align="stretch"
          gutter="md"
        >
          {/* Main Welcome Hero */}
          <Grid.Col span={{ base: 12, md: 8 }} style={{ display: "flex", flexDirection: "column", height: isMobile ? "calc(100dvh - 88px)" : "100%", minHeight: 0 }}>
            <Card withBorder p="xl" radius="md" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Stack align="center" gap="md" style={{ maxWidth: 440, textAlign: "center" }}>
                <Award size={48} color="var(--mantine-color-teal-6)" />
                <Stack gap={4}>
                  <Title order={4}>Start Debate Session</Title>
                  <Text size="xs" c="dimmed" style={{ lineHeight: 1.5 }}>
                    Connect and sync debate sheets in real-time with your partner, manage speech countdowns, and run human-in-the-loop AI outline assistants.
                  </Text>
                </Stack>

                <Group gap="md" justify="center" mt="md">
                  <Button onClick={() => setStartMode("host")} color="teal">
                    Host Match Session
                  </Button>
                  <Button onClick={() => setStartMode("join")} color="teal" variant="outline">
                    Join Match Session
                  </Button>
                </Group>

                {startMode === "host" && (
                  <form onSubmit={handleHostCreate} style={{ width: "100%", borderTop: "1px solid var(--mantine-color-gray-2)", paddingTop: "var(--mantine-spacing-md)", textAlign: "left" }}>
                    <Stack gap="xs">
                      <TextInput 
                        label="Debate Match Name"
                        value={matchName} 
                        onChange={(e) => setMatchName(e.target.value)} 
                        placeholder="e.g. State Debate Finals Round 1..."
                        required 
                        size="xs"
                      />
                      <TextInput 
                        label="Debaters School / Group Name"
                        value={groupName} 
                        onChange={(e) => setGroupName(e.target.value)} 
                        placeholder="e.g. Lincoln High School debate club..."
                        required 
                        size="xs"
                      />
                      <Select 
                        label="Position Team Size"
                        value={String(teamSize)} 
                        onChange={(val) => setTeamSize(parseInt(val || "1", 10))}
                        data={["1", "2", "3", "4"]}
                        required 
                        size="xs"
                      />
                      <Button type="submit" color="teal" mt="sm" rightSection={<ArrowRight size={14} />} fullWidth>
                        Launch Room Lobby
                      </Button>
                    </Stack>
                  </form>
                )}

                {startMode === "join" && (
                  <form onSubmit={handleClientJoin} style={{ width: "100%", borderTop: "1px solid var(--mantine-color-gray-2)", paddingTop: "var(--mantine-spacing-md)", textAlign: "left" }}>
                    <Stack gap="xs">
                      <TextInput 
                        label="Host Room Code"
                        value={joinRoomCode} 
                        onChange={(e) => setJoinRoomCode(e.target.value)} 
                        placeholder="Enter 4-digit code..."
                        required 
                        size="xs"
                      />
                      <Button type="submit" color="teal" mt="sm" rightSection={<ArrowRight size={14} />} fullWidth>
                        Submit Join Request
                      </Button>
                    </Stack>
                  </form>
                )}
              </Stack>
            </Card>
          </Grid.Col>

          {/* Right side: Session History lists */}
          <Grid.Col span={{ base: 12, md: 4 }} style={{ display: "flex", flexDirection: "column", height: isMobile ? "calc(100dvh - 88px)" : "100%", minHeight: 0 }}>
            <Card withBorder p="sm" radius="md" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
                <Group justify="space-between" align="center" style={{ borderBottom: "1px solid var(--mantine-color-gray-2)", paddingBottom: "var(--mantine-spacing-xs)" }}>
                  <Text size="xs" fw={700} c="dimmed">Recent sessions</Text>
                  <History size={16} color="var(--mantine-color-teal-6)" />
                </Group>

                <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto" offsetScrollbars>
                  <Stack gap="xs">
                    {savedRoom && (
                      <Paper withBorder p="xs" radius="md" bg="var(--mantine-color-teal-0)">
                        <Group justify="space-between" align="center" wrap="nowrap">
                          <Stack gap={2}>
                            <Group gap={4}>
                              <Wifi size={12} color="var(--mantine-color-teal-6)" />
                              <Text size="xs" fw={700}>Quick rejoin</Text>
                            </Group>
                            <Text size="xs" c="dimmed">Room {savedRoom.code}</Text>
                          </Stack>
                          <Button size="xs" color="teal" variant="light" onClick={handleQuickRejoin}>
                            Rejoin
                          </Button>
                        </Group>
                      </Paper>
                    )}

                    {historyList.map((rec) => (
                      <Paper key={rec.id} withBorder p="xs" radius="md" bg="var(--mantine-color-gray-0)">
                        <Stack gap={4}>
                          <Group justify="space-between" align="center">
                            <Group gap={4}>
                              <Calendar size={10} color="var(--mantine-color-gray-5)" />
                              <Text size="xs" c="dimmed">{new Date(rec.timestamp).toLocaleDateString()}</Text>
                            </Group>
                            <Badge color={rec.winLoss === "win" ? "teal" : "red"} size="xs">
                              {rec.winLoss}
                            </Badge>
                          </Group>
                          
                          <Stack gap={2}>
                            <Text size="xs" fw={700}>{rec.matchName}</Text>
                            <Text size="xs" c="dimmed">vs. {rec.opponentName} | Side: {rec.sides}</Text>
                          </Stack>
                        </Stack>
                      </Paper>
                    ))}

                    {historyList.length === 0 && (
                      <Stack align="center" justify="center" style={{ padding: "40px 0" }} gap="xs">
                        <Trophy size={20} color="var(--mantine-color-gray-3)" />
                        <Text size="xs" c="dimmed">No debate sessions archived.</Text>
                      </Stack>
                    )}
                  </Stack>
                </ScrollArea>
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>
      )}
    </Stack>
  );
};

export default InRound;
