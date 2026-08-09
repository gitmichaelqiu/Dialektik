export type Page = "inround" | "documents" | "evidence" | "ai" | "history" | "settings";

export interface DebateDocument {
  id: string;
  name: string;
  content: string;
  type?: string;
  sourceType?: string;
  externalUrl?: string;
  partnerAccess?: string;
  encryptedHash?: string;
  ownerName?: string;
  lastModified?: number;
  contentRevision?: number;
  partnerLine?: number;
  partnerName?: string;
}

export interface EvidenceCard {
  id: string;
  title: string;
  text: string;
  sourceUrl?: string;
  folder?: string;
  author?: string;
  docId?: string;
}

export interface HistoryRecord {
  id: string;
  matchName: string;
  opponentName?: string;
  sides?: string;
  winLoss?: string;
  timestamp: number;
  flows?: { speechId: string; notes: string }[];
}

export interface SessionState {
  roomCode: string;
  matchName: string;
  groupName?: string;
  eventFormat?: string;
  eventName?: string;
  status: string;
  isHost: boolean;
  documentIds: string[];
  handout?: { title: string; problem: string; details: string };
  speechRemainingMs: number;
  speechRunning: boolean;
  prepRemainingMs: number;
  prepRunning: boolean;
  speechOrder: { id: string; label: string; durationMs: number; team?: string }[];
  currentSpeechIndex: number;
  currentSpeakerId?: string;
  speakerNotes?: Record<string, string>;
  autoAdvance?: boolean;
  customTimers?: { id: string; name: string; remainingMs: number; running: boolean; durationMs: number }[];
  debaters: { id: string; name: string; status: string; team?: string; position?: number }[];
  pendingRequests?: { id: string; name: string }[];
}

export interface Snapshot {
  activePage: Page;
  documents: DebateDocument[];
  cards: EvidenceCard[];
  history: HistoryRecord[];
  session: SessionState | null;
  lastRoomCode?: string;
  ai: {
    chats: { id: string; title: string; messages: { role: string; text: string; timestamp: number }[] }[];
    activeChatId?: string;
    loading?: boolean;
    citedDocIds?: string[];
  };
  settings: {
    userName: string;
    userId: string;
    aiEndpoint: string;
    aiModel: string;
    hasAiKey: boolean;
    turnServerUrl: string;
    turnUsername: string;
    turnCredential: string;
    manualDocumentSync: boolean;
    joinRequestNotifications: boolean;
  };
}

export const emptySnapshot: Snapshot = {
  activePage: "inround",
  documents: [],
  cards: [],
  history: [],
  session: null,
  ai: { chats: [] },
  settings: {
    userName: "",
    userId: "",
    aiEndpoint: "",
    aiModel: "",
    hasAiKey: false,
    turnServerUrl: "",
    turnUsername: "",
    turnCredential: "",
    manualDocumentSync: false,
    joinRequestNotifications: false,
  },
};
