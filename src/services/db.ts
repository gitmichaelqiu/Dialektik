import Dexie, { type Table } from "dexie";

// Interfaces for database schemas

export interface AppSetting {
  key: string;
  value: any;
}

export interface DebateDocument {
  id: string; // UUID or path-like key
  name: string; // e.g. "Affirmative Case 1.md"
  type: "case" | "block";
  content: string; // markdown or JSON content
  lastModified: number;
  encryptedHash?: string; // SHA-256 hash of plaintext for sync comparison
  partnerAccess?: string; // partnership access group identifier
  ownerId?: string;
  ownerName?: string;
}

export interface EvidenceCard {
  id: string; // SHA-256 of text
  title: string; // card tag/citation
  sourceUrl: string;
  text: string; // body text of the card
  hash: string; // SHA-256 computed on import/creation (anti-tamper)
  timestamp: number;
  docId?: string; // associated document id
  author: string;
}

export interface MatchFlow {
  speechId: string; // e.g. "1AC", "1NC"
  notes: string; // markdown notes/flow text
  draftStatus: "draft" | "accepted"; // human-in-the-loop reviewable
}

export interface TournamentRecord {
  id: string;
  matchName: string; // e.g. "NSDA Nationals Round 1"
  speechOrder: string[]; // e.g. ["1AC", "1NC", "2AC", "2NC", "1AR", "1NR", "2AR", "2NR"]
  sides: "affirmative" | "negative";
  opponentName: string;
  winLoss: "win" | "loss" | "pending";
  flows: MatchFlow[]; // Flows for each speech in the round
  tag: string; // author tagging
  timestamp: number;
}

export interface PracticeSession {
  id: string;
  topic: string;
  side: "affirmative" | "negative";
  transcripts: { role: "user" | "ai"; text: string; timestamp: number }[];
  scorecard?: {
    score: number; // 1-100 rating
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
  };
  timestamp: number;
}

// Dexie Database definition
class DialektikDatabase extends Dexie {
  settings!: Table<AppSetting, string>;
  documents!: Table<DebateDocument, string>;
  cards!: Table<EvidenceCard, string>;
  history!: Table<TournamentRecord, string>;
  practice_sessions!: Table<PracticeSession, string>;

  constructor() {
    super("DialektikDB");
    this.version(1).stores({
      settings: "key",
      documents: "id, name, type, lastModified",
      cards: "id, hash, title, docId",
      history: "id, matchName, winLoss, timestamp",
      practice_sessions: "id, timestamp"
    });
  }
}

export const db = new DialektikDatabase();
export default db;
