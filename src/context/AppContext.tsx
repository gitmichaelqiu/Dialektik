import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { db } from "../services/db";
import { KeyManager } from "../services/crypto";
import { PeerMeshManager } from "../services/webrtc";
import { notify } from "../utils/notifications";


export interface Debater {
  id: string;
  name: string;
  status: "pending" | "approved" | "rejected";
  team?: "affirmative" | "negative";
  position?: number;
}

export interface Handout {
  title: string;
  problem: string;
  details?: string;
}

export interface SessionState {
  matchName: string;
  groupName: string;
  teamSize: number;
  roomCode: string;
  status: "lobby" | "active" | "ended";
  handout: Handout;
  debaters: Debater[];
  currentSpeakerId?: string;
  speakerNotes: Record<string, string>; // debaterId -> markdown notes
  speechDuration: number; // seconds
  prepDuration: number; // seconds
}

interface AppContextType {
  session: SessionState | null;
  setSession: React.Dispatch<React.SetStateAction<SessionState | null>>;
  debateTimerRef: React.MutableRefObject<any | null>;
  prepTimerRef: React.MutableRefObject<any | null>;
  passphrase: string;
  isKeyDerived: boolean;
  roomCode: string;
  isHost: boolean;
  isPeerConnected: boolean;
  peersList: string[];
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
  isGitConnected: boolean;
  aiApiKey: string;
  aiEndpoint: string;
  aiModel: string;
  userName: string;
  mesh: PeerMeshManager;
  githubService: null;
  activePage: string;
  setActivePage: (page: any) => void;
  initializeCrypto: (passphrase: string) => Promise<boolean>;
  saveSettings: (settings: {
    userName?: string;
    githubToken?: string;
    githubOwner?: string;
    githubRepo?: string;
    aiApiKey?: string;
    aiEndpoint?: string;
    aiModel?: string;
  }) => Promise<void>;
  activeMatchName: string;
  activeOpponent: string;
  pairingRequest: { peerId: string } | null;
  approvePairingRequest: (peerId: string) => void;
  declinePairingRequest: () => void;
  hostSession: (code: string, matchName: string, opponent: string) => Promise<void>;
  joinSession: (code: string) => Promise<void>;
  startSession: (code: string, host: boolean) => Promise<void>;
  endSession: () => void;
  syncData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

const meshManager = new PeerMeshManager();
const ACTIVE_SESSION_KEY = "dialektik.activeSession";
const ACTIVE_ROOM_KEY = "dialektik.activeRoom";

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSessionState] = useState<SessionState | null>(null);
  const debateTimerRef = useRef<any | null>(null);
  const prepTimerRef = useRef<any | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [isPeerConnected, setIsPeerConnected] = useState(false);
  const [peersList, setPeersList] = useState<string[]>([]);
  const [activePage, setActivePage] = useState("settings"); // start on settings to configure keys
 
  // Active debate session details
  const [activeMatchName, setActiveMatchName] = useState("");
  const [activeOpponent, setActiveOpponent] = useState("");
  const [pairingRequest, setPairingRequest] = useState<{ peerId: string } | null>(null);

  // Config states
  const [githubToken, setGithubToken] = useState("");
  const [githubOwner, setGithubOwner] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [isGitConnected, setIsGitConnected] = useState(false);

  const [aiApiKey, setAiApiKey] = useState("");
  const [aiEndpoint, setAiEndpoint] = useState("https://api.openai.com/v1");
  const [aiModel, setAiModel] = useState("gpt-4o");
  const [userName, setUserName] = useState("");

  const githubService = null;

  const setSession: React.Dispatch<React.SetStateAction<SessionState | null>> = (value) => {
    setSessionState(prev => {
      const next = typeof value === "function" ? (value as (prev: SessionState | null) => SessionState | null)(prev) : value;
      if (next && next.status !== "ended") {
        localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(next));
      } else {
        localStorage.removeItem(ACTIVE_SESSION_KEY);
      }
      return next;
    });
  };

  // Load configuration from DB on startup
  useEffect(() => {
    async function loadConfigs() {
      // 1. Try to load secure credentials from keychain
      const apiKey = await KeyManager.get("ai_api_key");

      if (apiKey) setAiApiKey(apiKey);

      // 2. Load other configurations from Dexie db.settings
      const settings = await db.settings.toArray();
      for (const item of settings) {
        if (item.key === "ai_endpoint") setAiEndpoint(item.value);
        if (item.key === "ai_model") setAiModel(item.value);
        if (item.key === "user_name") setUserName(item.value);
      }
    }
    loadConfigs();
  }, []);

  useEffect(() => {
    const storedSession = localStorage.getItem(ACTIVE_SESSION_KEY);
    const storedRoom = localStorage.getItem(ACTIVE_ROOM_KEY);
    if (!storedSession || !storedRoom) return;

    try {
      const restoredSession = JSON.parse(storedSession) as SessionState;
      const restoredRoom = JSON.parse(storedRoom) as { code: string; host: boolean };
      if (!restoredSession || !restoredRoom.code || restoredSession.status === "ended") return;

      setSessionState(restoredSession);
      setActivePage("inround");
      startSession(restoredRoom.code, restoredRoom.host);
    } catch (err) {
      console.error("Failed to restore active room:", err);
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      localStorage.removeItem(ACTIVE_ROOM_KEY);
    }
  }, []);

  // Update peer network connections list on state change
  useEffect(() => {
    meshManager.onConnectionOpen(() => {
      setIsPeerConnected(meshManager.connections.size > 0 || meshManager.isHost);
      setPeersList([...meshManager.peersList]);

    });

    meshManager.onConnectionClose(() => {
      setIsPeerConnected(meshManager.connections.size > 0 || meshManager.isHost);
      setPeersList([...meshManager.peersList]);
    });

    meshManager.onVersionMismatch(() => {
      notify("App version mismatch. Please refresh your browser or update the app.");
    });

    // Handle incoming match details from the host
    meshManager.onMatchDetails((details) => {
      if (details) {
        setActiveMatchName(details.matchName);
        setActiveOpponent(details.opponent);
      }
    });

    // WebRTC connection listeners
    meshManager.onMessage((_senderId, msg) => {
      if (msg.type === "session-state") {
        if (!meshManager.isHost && msg.payload) {
          setSession(prev => ({
            ...msg.payload,
            speakerNotes: prev?.speakerNotes || {}
          }));
        }
      }
    });
  }, []);

  /**
   * Local client encryption is currently disabled; keep this as a no-op for older UI flows.
   */
  const initializeCrypto = async (pwd: string): Promise<boolean> => {
    setPassphrase(pwd);
    return true;
  };

  /**
   * Save configuration settings securely
   */
  const saveSettings = async (settings: {
    userName?: string;
    githubToken?: string;
    githubOwner?: string;
    githubRepo?: string;
    aiApiKey?: string;
    aiEndpoint?: string;
    aiModel?: string;
  }) => {
    if (settings.userName !== undefined) {
      await db.settings.put({ key: "user_name", value: settings.userName });
      setUserName(settings.userName);
    }
    if (settings.githubToken !== undefined) {
      setGithubToken(settings.githubToken);
    }
    if (settings.githubOwner !== undefined) {
      setGithubOwner(settings.githubOwner);
    }
    if (settings.githubRepo !== undefined) {
      setGithubRepo(settings.githubRepo);
    }
    if (settings.aiApiKey !== undefined) {
      await KeyManager.set("ai_api_key", settings.aiApiKey);
      setAiApiKey(settings.aiApiKey);
    }
    if (settings.aiEndpoint !== undefined) {
      await db.settings.put({ key: "ai_endpoint", value: settings.aiEndpoint });
      setAiEndpoint(settings.aiEndpoint);
    }
    if (settings.aiModel !== undefined) {
      await db.settings.put({ key: "ai_model", value: settings.aiModel });
      setAiModel(settings.aiModel);
    }
  };

  /**
   * Room Session Actions
   */
  const startSession = async (code: string, host: boolean) => {
    try {
      if (host) {
        await meshManager.createRoom(code);
        setIsHost(true);
      } else {
        await meshManager.joinRoom(code);
        setIsHost(false);
      }
      setRoomCode(code);
      localStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify({ code, host }));
      setIsPeerConnected(meshManager.connections.size > 0 || meshManager.isHost);
      setPeersList([...meshManager.peersList]);
    } catch (err) {
      console.error("Session creation failed:", err);
      notify("Failed to connect room. Verify network or STUN signaling.");
    }
  };

  const endSession = () => {
    meshManager.terminateSession();
    setSession(null);
    localStorage.removeItem(ACTIVE_ROOM_KEY);
    if (debateTimerRef.current) {
      debateTimerRef.current.reset();
      debateTimerRef.current = null;
    }
    if (prepTimerRef.current) {
      prepTimerRef.current.reset();
      prepTimerRef.current = null;
    }
    setRoomCode("");
    setIsHost(false);
    setIsPeerConnected(false);
    setPeersList([]);
    setActiveMatchName("");
    setActiveOpponent("");
    setPairingRequest(null);
    meshManager.matchDetails = null;
  };

  const hostSession = async (code: string, matchName: string, opponent: string) => {
    setActiveMatchName(matchName);
    setActiveOpponent(opponent);
    meshManager.matchDetails = { matchName, opponent };
    await startSession(code, true);
  };

  const joinSession = async (code: string) => {
    await startSession(code, false);
  };

  const approvePairingRequest = (peerId: string) => {
    void peerId;
    setPairingRequest(null);
  };

  const declinePairingRequest = () => {
    setPairingRequest(null);
  };

  /**
   * Sync GitHub repository push/pull
   */
  const syncData = async () => {
    setIsGitConnected(false);
  };

  return (
    <AppContext.Provider
      value={{
        session,
        setSession,
        debateTimerRef,
        prepTimerRef,
        passphrase,
        isKeyDerived: true,
        roomCode,
        isHost,
        isPeerConnected,
        peersList,
        githubToken,
        githubOwner,
        githubRepo,
        isGitConnected,
        aiApiKey,
        aiEndpoint,
        aiModel,
        userName,
        activeMatchName,
        activeOpponent,
        pairingRequest,
        approvePairingRequest,
        declinePairingRequest,
        hostSession,
        joinSession,
        mesh: meshManager,
        githubService,
        activePage,
        setActivePage,
        initializeCrypto,
        saveSettings,
        startSession,
        endSession,
        syncData
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within an AppProvider");
  return context;
};
