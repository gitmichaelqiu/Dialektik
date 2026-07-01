import React, { createContext, useContext, useState, useEffect } from "react";
import { db } from "../services/db";
import { deriveKey, KeyManager } from "../services/crypto";
import { PeerMeshManager } from "../services/webrtc";
import { GitHubSyncService } from "../services/github";


interface AppContextType {
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
  githubService: GitHubSyncService | null;
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

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [passphrase, setPassphrase] = useState("");
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
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

  const [githubService, setGithubService] = useState<GitHubSyncService | null>(null);

  // Load configuration from DB on startup
  useEffect(() => {
    async function loadConfigs() {
      // 1. Try to load secure credentials from keychain
      const token = await KeyManager.get("github_token");
      const apiKey = await KeyManager.get("ai_api_key");

      if (token) setGithubToken(token);
      if (apiKey) setAiApiKey(apiKey);

      // 2. Load other configurations from Dexie db.settings
      const settings = await db.settings.toArray();
      for (const item of settings) {
        if (item.key === "github_owner") setGithubOwner(item.value);
        if (item.key === "github_repo") setGithubRepo(item.value);
        if (item.key === "ai_endpoint") setAiEndpoint(item.value);
        if (item.key === "ai_model") setAiModel(item.value);
        if (item.key === "user_name") setUserName(item.value);
      }

      // If passphrase salt is missing, generate one
      let salt = await db.settings.get("passphrase_salt");
      if (!salt) {
        const newSalt = Math.random().toString(36).substring(2, 15);
        await db.settings.put({ key: "passphrase_salt", value: newSalt });
      }
    }
    loadConfigs();
  }, []);

  // Update peer network connections list on state change
  useEffect(() => {
    meshManager.onConnectionOpen(() => {
      setIsPeerConnected(meshManager.connections.size > 0 || meshManager.isHost);
      setPeersList([...meshManager.peersList]);

      // Client automatically broadcasts a pairing-request to Host
      if (!meshManager.isHost) {
        meshManager.broadcast({
          type: "pairing-request",
          version: meshManager.appVersion,
          senderId: meshManager.peerId
        });
      }
    });

    meshManager.onConnectionClose(() => {
      setIsPeerConnected(meshManager.connections.size > 0 || meshManager.isHost);
      setPeersList([...meshManager.peersList]);
    });

    meshManager.onVersionMismatch(() => {
      alert("App version mismatch! Please refresh your browser or update the app.");
    });

    // Handle incoming match details from the host
    meshManager.onMatchDetails((details) => {
      if (details) {
        setActiveMatchName(details.matchName);
        setActiveOpponent(details.opponent);
      }
    });

    // WebRTC connection listeners for auto key-pairing sync
    meshManager.onMessage((senderId, msg) => {
      if (msg.type === "pairing-request") {
        if (meshManager.isHost) {
          setPairingRequest({ peerId: senderId });
        }
      } else if (msg.type === "vault-sync") {
        if (!meshManager.isHost && msg.payload) {
          const { githubToken: tok, githubOwner: own, githubRepo: rep, passphrase: pass } = msg.payload;
          
          initializeCrypto(pass).then((success) => {
            if (success) {
              saveSettings({
                githubToken: tok,
                githubOwner: own,
                githubRepo: rep
              }).then(() => {
                alert("Vault sync successful! Local database is now securely linked with Host.");
              });
            }
          });
        }
      }
    });
  }, []);

  // Re-initialize GitHubSyncService when credentials/cryptoKey change
  useEffect(() => {
    if (githubToken && githubOwner && githubRepo && cryptoKey) {
      const service = new GitHubSyncService({
        token: githubToken,
        repoOwner: githubOwner,
        repoName: githubRepo,
        passphraseKey: cryptoKey
      });
      setGithubService(service);
      setIsGitConnected(true);
    } else {
      setGithubService(null);
      setIsGitConnected(false);
    }
  }, [githubToken, githubOwner, githubRepo, cryptoKey]);

  /**
   * Initializes cryptography by deriving key from user passphrase
   */
  const initializeCrypto = async (pwd: string): Promise<boolean> => {
    try {
      let saltSetting = await db.settings.get("passphrase_salt");
      const salt = saltSetting ? saltSetting.value : "dialektik-default-salt";
      
      const key = await deriveKey(pwd, salt);
      setCryptoKey(key);
      setPassphrase(pwd);
      return true;
    } catch (error) {
      console.error("Crypto init failed:", error);
      return false;
    }
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
      await KeyManager.set("github_token", settings.githubToken);
      setGithubToken(settings.githubToken);
    }
    if (settings.githubOwner !== undefined) {
      await db.settings.put({ key: "github_owner", value: settings.githubOwner });
      setGithubOwner(settings.githubOwner);
    }
    if (settings.githubRepo !== undefined) {
      await db.settings.put({ key: "github_repo", value: settings.githubRepo });
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
      setIsPeerConnected(meshManager.connections.size > 0 || meshManager.isHost);
      setPeersList([...meshManager.peersList]);
    } catch (err) {
      console.error("Session creation failed:", err);
      alert("Failed to connect room. Verify network or STUN signaling.");
    }
  };

  const endSession = () => {
    meshManager.terminateSession();
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
    meshManager.sendToPeer(peerId, {
      type: "vault-sync",
      version: meshManager.appVersion,
      senderId: meshManager.peerId,
      payload: {
        githubToken,
        githubOwner,
        githubRepo,
        passphrase
      }
    });
    setPairingRequest(null);
  };

  const declinePairingRequest = () => {
    setPairingRequest(null);
  };

  /**
   * Sync GitHub repository push/pull
   */
  const syncData = async () => {
    if (!githubService) {
      alert("Please configure GitHub integration and encryption passphrase first!");
      return;
    }
    try {
      await githubService.pull();
      await githubService.push();
      alert("GitHub synchronization successful!");
    } catch (error) {
      console.error("Sync action failed:", error);
      alert("Sync failed! Check GitHub token permissions or network connectivity.");
    }
  };

  return (
    <AppContext.Provider
      value={{
        passphrase,
        isKeyDerived: cryptoKey !== null,
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
