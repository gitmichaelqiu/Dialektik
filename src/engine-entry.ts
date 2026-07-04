/**
 * engine-entry.ts
 *
 * Headless engine bundle for the Flutter WebView bridge.
 * Runs inside a hidden WebView (no DOM needed) and exposes:
 *   window.dialektikEngine.dispatch(actionJson: string) → void
 *
 * State changes are pushed to Flutter via:
 *   window.FlutterChannel.postMessage(snapshotJson: string)
 *
 * The engine re-uses the exact same services as the Tauri backend:
 *   - PeerMeshManager  (webrtc.ts)   – real WebRTC P2P via PeerJS
 *   - PeerJSYjsProvider (yjs-provider.ts) – CRDT document sync
 *   - DialektikDatabase (db.ts)       – IndexedDB persistence
 *   - AIService         (ai.ts)       – OpenAI-compatible API
 */

import * as Y from "yjs";
import Dexie from "dexie";
import { PeerMeshManager, type PeerMessage } from "./services/webrtc";
import { PeerJSYjsProvider } from "./services/yjs-provider";
import { AIService } from "./services/ai";

// ─────────────────────────────────────────────
// DB  (mirrors db.ts but inline for bundle isolation)
// ─────────────────────────────────────────────
interface AppSetting { key: string; value: any }
interface DebateDocument {
  id: string; name: string; type: string; content: string;
  lastModified: number; encryptedHash?: string;
  partnerAccess?: string; ownerId?: string; ownerName?: string;
}
interface EvidenceCard {
  id: string; title: string; sourceUrl: string; text: string;
  hash: string; timestamp: number; docId?: string;
  author: string; folder?: string;
}
interface TournamentRecord {
  id: string; matchName: string; speechOrder: string[];
  sides: string; opponentName: string; winLoss: string;
  flows: { speechId: string; notes: string }[]; tag: string; timestamp: number;
}
interface AiChat { id: string; title: string; messages: { role: string; text: string; timestamp: number }[] }
interface TextSplice {
  index: number;
  deleteCount: number;
  insertText: string;
}

class DialektikDB extends Dexie {
  settings!: Dexie.Table<AppSetting, string>;
  documents!: Dexie.Table<DebateDocument, string>;
  cards!: Dexie.Table<EvidenceCard, string>;
  history!: Dexie.Table<TournamentRecord, string>;
  aiChats!: Dexie.Table<AiChat, string>;

  constructor() {
    super("DialektikDB");
    this.version(2).stores({
      settings: "key",
      documents: "id, name, type, lastModified",
      cards: "id, hash, title, docId",
      history: "id, matchName, winLoss, timestamp",
      aiChats: "id, title",
    });
  }
}

const db = new DialektikDB();

// ─────────────────────────────────────────────
// Engine State
// ─────────────────────────────────────────────
interface Debater { id: string; name: string; status: string; team?: string; position?: number; disconnected?: boolean }
interface SessionState {
  roomCode: string; matchName: string; groupName: string; status: string;
  handout: { title: string; problem: string; details: string };
  debaters: Debater[]; currentSpeakerId?: string;
  speakerNotes: Record<string, string>;
  speechRemainingMs: number; speechRunning: boolean;
  prepRemainingMs: number; prepRunning: boolean;
  customTimers: { id: string; name: string; remainingMs: number; running: boolean; durationMs: number }[];
  pendingRequests: { id: string; name: string }[];
  isHost: boolean;
}

const mesh = new PeerMeshManager();
let session: SessionState | null = null;
let yjsProviders: Map<string, PeerJSYjsProvider> = new Map();
let yjsDocs: Map<string, Y.Doc> = new Map();
let userId = "";
let userName = "";
let activePage = "inround";
let lastRoomCode = "";
let lastRoomIsHost = false;
const rejectedPeers = new Set<string>();
const peerUserId = new Map<string, string>();
let aiEndpoint = "https://api.openai.com/v1";
let aiModel = "gpt-4o";
let aiApiKey = "";
let hasAiKey = false;
let aiChats: AiChat[] = [];
let activeAiChatId: string | null = null;
let aiLoading = false;
let timerInterval: ReturnType<typeof setInterval> | null = null;
let lastTick = Date.now();
let systemBrightness: "light" | "dark" = "light";

// Detect and watch system dark mode via prefers-color-scheme media query.
try {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  systemBrightness = mq.matches ? "dark" : "light";
  mq.addEventListener("change", (e) => {
    systemBrightness = e.matches ? "dark" : "light";
    emitSnapshot();
  });
} catch (_) {
  // matchMedia not available (unlikely in modern WebView/browser)
}

// ─────────────────────────────────────────────
// Snapshot emission
// ─────────────────────────────────────────────
// Reliable snapshot delivery: write to a global variable that Flutter's
// polling reads via evaluateJavascript. The FlutterChannel.postMessage
// push path (callHandler) is unreliable for event-driven state changes.
let __latestSnapshot: string | null = null;

function setSnapshot(json: string) {
  __latestSnapshot = json;
}

function postSnapshot() {
  try {
    const snapshot = buildSnapshot();
    const json = JSON.stringify(snapshot);
    setSnapshot(json);
  } catch (e) {
    console.error("[engine] postSnapshot error:", e);
  }
}

async function buildSnapshot() {
  const docs = await db.documents.toArray();
  const cards = await db.cards.toArray();
  const history = await db.history.orderBy("timestamp").reverse().toArray();
  const settings = await db.settings.toArray();

  let currentUserName = userName;
  let currentAiEndpoint = aiEndpoint;
  let currentAiModel = aiModel;
  let githubOwner = "";
  let githubRepo = "";

  for (const s of settings) {
    if (s.key === "user_name") currentUserName = s.value;
    if (s.key === "ai_endpoint") currentAiEndpoint = s.value;
    if (s.key === "ai_model") currentAiModel = s.value;
    if (s.key === "ai_api_key") { aiApiKey = s.value; hasAiKey = !!s.value; }
    if (s.key === "github_owner") githubOwner = s.value;
    if (s.key === "github_repo") githubRepo = s.value;
  }

  return {
    activePage,
    systemBrightness,
    lastRoomCode: session ? "" : lastRoomCode,
    lastRoomIsHost: session ? false : lastRoomIsHost,
    documents: docs.map(d => ({
      id: d.id, name: d.name, content: d.content,
      partnerAccess: d.partnerAccess ?? "private",
      encryptedHash: d.encryptedHash ?? "write",
      ownerId: d.ownerId, ownerName: d.ownerName,
      lastModified: d.lastModified,
    })),
    cards: cards.map(c => ({
      id: c.id, title: c.title, text: c.text, sourceUrl: c.sourceUrl,
      docId: c.docId, folder: c.folder ?? "private",
    })),
    history: history.map(h => ({
      id: h.id, matchName: h.matchName, opponentName: h.opponentName,
      sides: h.sides, winLoss: h.winLoss, timestamp: h.timestamp, flows: h.flows,
    })),
    session: session ? serializeSession(session) : null,
    ai: {
      chats: aiChats.map(c => ({ id: c.id, title: c.title, messages: c.messages })),
      activeChatId: activeAiChatId,
      loading: aiLoading,
    },
    settings: {
      userId,
      userName: currentUserName,
      aiEndpoint: currentAiEndpoint,
      aiModel: currentAiModel,
      hasAiKey,
      githubOwner,
      githubRepo,
      hasGithubToken: false,
    },
  };
}

function serializeSession(s: SessionState) {
  return { ...s };
}

function toTextSplice(payload: any): TextSplice | null {
  const index = Number(payload?.index);
  const deleteCount = Number(payload?.deleteCount);
  const insertText = payload?.insertText;
  if (!Number.isFinite(index) || !Number.isFinite(deleteCount) || typeof insertText !== "string") {
    return null;
  }
  return {
    index: Math.max(0, Math.trunc(index)),
    deleteCount: Math.max(0, Math.trunc(deleteCount)),
    insertText,
  };
}

function applyTextSplice(text: string, edit: TextSplice): string {
  const start = Math.min(edit.index, text.length);
  const end = Math.min(start + edit.deleteCount, text.length);
  return text.slice(0, start) + edit.insertText + text.slice(end);
}

async function applyDocumentSplice(id: string, edit: TextSplice) {
  const existing = await db.documents.get(id);
  if (!existing) return null;
  const content = applyTextSplice(existing.content ?? "", edit);
  const lastModified = Date.now();
  await db.documents.update(id, { content, lastModified });
  return { ...existing, content, lastModified };
}

function applyHandoutSplice(field: string, edit: TextSplice) {
  if (!session) return false;
  if (field !== "title" && field !== "problem" && field !== "details") return false;
  const current = session.handout[field] ?? "";
  session.handout = {
    ...session.handout,
    [field]: applyTextSplice(current, edit),
  };
  return true;
}

async function emitSnapshot() {
  try {
    const snapshot = await buildSnapshot();
    const json = JSON.stringify(snapshot);
    setSnapshot(json);
  } catch (e) {
    console.error("[engine] emitSnapshot error:", e);
  }
}

// ─────────────────────────────────────────────
// Timer tick
// ─────────────────────────────────────────────
function startTimerLoop() {
  if (timerInterval) return;
  lastTick = Date.now();
  let heartbeatTick = 0;
  timerInterval = setInterval(() => {
    const now = Date.now();
    const elapsed = now - lastTick;
    lastTick = now;
    if (!session) return;
    let changed = false;

    if (session.speechRunning && session.speechRemainingMs > 0) {
      session.speechRemainingMs = Math.max(0, session.speechRemainingMs - elapsed);
      if (session.speechRemainingMs === 0) session.speechRunning = false;
      changed = true;
    }
    if (session.prepRunning && session.prepRemainingMs > 0) {
      session.prepRemainingMs = Math.max(0, session.prepRemainingMs - elapsed);
      if (session.prepRemainingMs === 0) session.prepRunning = false;
      changed = true;
    }
    session.customTimers = session.customTimers.map(t => {
      if (!t.running) return t;
      const next = Math.max(0, t.remainingMs - elapsed);
      changed = true;
      return { ...t, remainingMs: next, running: next > 0 };
    });

    // Emit on timer changes, and also emit a heartbeat every ~1 s to flush
    // any pending state (e.g. pendingRequests) to Flutter even when the
    // first emitSnapshot from an event handler was missed by the stream.
    heartbeatTick += elapsed;
    if (changed || heartbeatTick >= 1000) {
      heartbeatTick = 0;
      // Re-check system brightness — matchMedia change events can be slow
      // or missed on desktop (WKWebView).
      try {
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const next = mq.matches ? "dark" : "light";
        if (next !== systemBrightness) systemBrightness = next;
      } catch (_) {}
      emitSnapshot();
    }
  }, 250);
}

// ─────────────────────────────────────────────
// Startup: load config from DB
// ─────────────────────────────────────────────
async function loadConfig() {
  const settings = await db.settings.toArray();
  for (const s of settings) {
    if (s.key === "user_id") userId = s.value;
    if (s.key === "user_name") userName = s.value;
    if (s.key === "ai_endpoint") aiEndpoint = s.value;
    if (s.key === "ai_model") aiModel = s.value;
    if (s.key === "ai_api_key") { aiApiKey = s.value; hasAiKey = !!s.value; }
  }
  if (!userId) {
    userId = crypto.randomUUID();
    await db.settings.put({ key: "user_id", value: userId });
  }
  aiChats = await db.aiChats.toArray();
  if (aiChats.length === 0) {
    const initChat: AiChat = {
      id: `chat-${Date.now()}`, title: "New Chat",
      messages: [{ role: "assistant", text: "I can help prepare blocks, summaries, and weighing.", timestamp: Date.now() }],
    };
    await db.aiChats.put(initChat);
    aiChats = [initChat];
    activeAiChatId = initChat.id;
  } else {
    activeAiChatId = aiChats[0].id;
  }
}

// ─────────────────────────────────────────────
// WebRTC mesh event handlers
// ─────────────────────────────────────────────
function setupMeshHandlers() {
  mesh.onConnectionOpen((_peerId, _conn) => {
    emitSnapshot();
    syncPublicDocsToPeers();
  });

  mesh.onConnectionClose((peerId) => {
    // Mark the disconnected debater.
    const uid = peerUserId.get(peerId);
    if (uid && session) {
      session.debaters = session.debaters.map(d =>
        d.id === uid ? { ...d, disconnected: true } : d
      );
      // Also clean up any pending request from this peer.
      session.pendingRequests = session.pendingRequests.filter(r => r.id !== uid);
    }
    emitSnapshot();
  });

  mesh.onMessage((_senderId, msg: PeerMessage) => {
    handlePeerMessage(msg);
  });

  // Early-connect: when PeerJS relay delivers the connection request
  // (before WebRTC data channel opens). The client embeds userId & userName
  // in connection metadata. If metadata isn't available (different PeerJS
  // version), fall back to using the peer ID as a placeholder — the actual
  // join-request will arrive later via the handshake flow.
  mesh.onPeerConnecting((peerId, meta) => {
    if (mesh.isHost && session) {
      const requesterId = meta?.userId || peerId;
      const requesterName = meta?.userName || "Connecting…";
      peerUserId.set(peerId, requesterId);
      // If this peer was previously rejected, don't add to pending.
      if (rejectedPeers.has(requesterId)) return;
      const already = session.pendingRequests.some(r => r.id === requesterId);
      if (!already) {
        session.pendingRequests = [...session.pendingRequests, {
          id: requesterId,
          name: requesterName,
        }];
        emitSnapshot();
      }
    }
  });
}

async function syncPublicDocsToPeers() {
  if (mesh.connections.size === 0) return;
  const all = await db.documents.toArray();
  const publicDocs = all.filter(d => d.partnerAccess === "public" || d.partnerAccess === "team");
  if (publicDocs.length === 0) return;
  mesh.broadcast({
    type: "shared-docs-sync",
    senderId: mesh.peerId,
    payload: { docs: publicDocs, removeIds: [] },
  });
}

async function handlePeerMessage(msg: PeerMessage) {
  if (!msg?.type) return;

  switch (msg.type) {
    case "join-rejected": {
      if (!mesh.isHost && session) {
        // Host rejected our join request — exit the pending state.
        session = null;
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        await emitSnapshot();
      }
      break;
    }

    case "join-request": {
      if (mesh.isHost && session) {
        const payload = msg.payload || {};
        const requesterId = payload.id as string || msg.senderId;
        const requesterName = payload.name as string || "Unknown";
        const already = session.pendingRequests.some(r => r.id === requesterId);
        if (!already) {
          session.pendingRequests = [...session.pendingRequests, { id: requesterId, name: requesterName }];
          await emitSnapshot();
        }
      }
      break;
    }

    case "session-state": {
      if (!mesh.isHost && msg.payload) {
        const incoming = msg.payload as Partial<SessionState>;
        if (session) {
          // Don't accept broadcast until the host has approved us.
          // Check if our userId appears in the debaters list.
          if (incoming.debaters && !incoming.debaters.some(d => d.id === userId)) {
            break;
          }
          session = {
            ...incoming as SessionState,
            speakerNotes: session.speakerNotes,
            isHost: false,
          };
        }
        await emitSnapshot();
      }
      break;
    }

    case "shared-docs-sync": {
      const { docs = [], removeIds = [] } = msg.payload || {};
      for (const id of removeIds as string[]) {
        const existing = await db.documents.get(id);
        if (existing && existing.ownerId !== userId) {
          await db.documents.delete(id);
        }
      }
      for (const doc of docs as DebateDocument[]) {
        const existing = await db.documents.get(doc.id);
        if (existing?.ownerId === userId) continue;
        if (!existing) {
          await db.documents.put(doc);
        } else if (doc.lastModified > existing.lastModified) {
          await db.documents.update(doc.id, {
            name: doc.name, content: doc.content,
            lastModified: doc.lastModified,
            partnerAccess: doc.partnerAccess,
            encryptedHash: doc.encryptedHash,
            ownerId: doc.ownerId, ownerName: doc.ownerName,
          });
        }
      }
      await emitSnapshot();
      break;
    }

    case "shared-doc-op": {
      const { id } = msg.payload || {};
      const edit = toTextSplice(msg.payload);
      if (typeof id !== "string" || !edit) break;
      const updated = await applyDocumentSplice(id, edit);
      if (updated?.partnerAccess !== "private") {
        await emitSnapshot();
      }
      break;
    }

    case "handout-op": {
      const { field } = msg.payload || {};
      const edit = toTextSplice(msg.payload);
      if (typeof field !== "string" || !edit) break;
      if (applyHandoutSplice(field, edit)) {
        await emitSnapshot();
      }
      break;
    }

    case "session-ended": {
      // The host (or peer) closed the session.
      if (session) {
        session = null;
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        await emitSnapshot();
      }
      break;
    }

    case "handshake": {
      if (mesh.isHost && session) {
        // If this peer was rejected, notify them over the now-open channel.
        const uid = peerUserId.get(msg.senderId);
        if (uid && rejectedPeers.has(uid)) {
          mesh.sendToPeer(msg.senderId, {
            type: "join-rejected",
            senderId: mesh.peerId,
          });
          break;
        }
        broadcastSessionState();
      }
      // When a peer connects to us (as client), send our join-request
      if (!mesh.isHost && session) {
        mesh.sendToPeer(msg.senderId, {
          type: "join-request",
          senderId: mesh.peerId,
          payload: { id: userId, name: userName },
        });
      }
      break;
    }

    case "timer-action": {
      if (!mesh.isHost && session && msg.payload) {
        const { timerType, action, durationSeconds, targetTime } = msg.payload;
        if (timerType === "speech") {
          if (action === "start" && targetTime) {
            session.speechRemainingMs = Math.max(0, targetTime - Date.now());
            session.speechRunning = true;
          } else if (action === "pause") {
            session.speechRunning = false;
          } else if (action === "reset") {
            session.speechRemainingMs = (durationSeconds || 240) * 1000;
            session.speechRunning = false;
          }
        } else if (timerType === "prep") {
          if (action === "start" && targetTime) {
            session.prepRemainingMs = Math.max(0, targetTime - Date.now());
            session.prepRunning = true;
          } else if (action === "pause") {
            session.prepRunning = false;
          } else if (action === "reset") {
            session.prepRemainingMs = (durationSeconds || 180) * 1000;
            session.prepRunning = false;
          }
        }
        await emitSnapshot();
      }
      break;
    }

    case "custom-timers-sync": {
      if (!mesh.isHost && session && Array.isArray(msg.payload?.timers)) {
        session.customTimers = msg.payload.timers;
        await emitSnapshot();
      }
      break;
    }
  }
}

// ─────────────────────────────────────────────
// Session helpers
// ─────────────────────────────────────────────
function broadcastSessionState() {
  if (!session) return;
  const sanitized = { ...session, speakerNotes: {} };
  mesh.broadcast({ type: "session-state", senderId: mesh.peerId, payload: sanitized });
}

// ─────────────────────────────────────────────
// Action dispatcher
// ─────────────────────────────────────────────
async function dispatch(actionJson: string) {
  let action: { type: string; payload?: any };
  try {
    action = JSON.parse(actionJson);
  } catch {
    console.error("[engine] Invalid action JSON:", actionJson);
    return;
  }

  const { type, payload = {} } = action;

  // ── Settings ──────────────────────────────
  if (type === "settings.save") {
    if (payload.userName !== undefined) {
      userName = payload.userName;
      await db.settings.put({ key: "user_name", value: userName });
    }
    if (payload.aiApiKey !== undefined) {
      aiApiKey = payload.aiApiKey;
      hasAiKey = !!aiApiKey;
      await db.settings.put({ key: "ai_api_key", value: aiApiKey });
    }
    if (payload.aiEndpoint !== undefined) {
      aiEndpoint = payload.aiEndpoint;
      await db.settings.put({ key: "ai_endpoint", value: aiEndpoint });
    }
    if (payload.aiModel !== undefined) {
      aiModel = payload.aiModel;
      await db.settings.put({ key: "ai_model", value: aiModel });
    }
    // Update debater name if in session
    if (session && userId) {
      const newName = payload.userName?.trim() || userName;
      session.debaters = session.debaters.map(d =>
        d.id === userId ? { ...d, name: newName } : d
      );
    }
    await emitSnapshot();
    return;
  }

  // ── Navigation ────────────────────────────
  if (type === "app.setActivePage") {
    if (payload.page) activePage = payload.page;
    await emitSnapshot();
    return;
  }

  // ── Documents ─────────────────────────────
  if (type === "document.create") {
    const name = (payload.name || "Untitled").trim();
    const safeName = name.endsWith(".md") ? name : `${name}.md`;
    const finalName = await uniqueDocName(safeName);
    const doc: DebateDocument = {
      id: `doc-${Date.now()}`, name: finalName, type: "case", content: "",
      lastModified: Date.now(),
      partnerAccess: payload.folder || "private",
      encryptedHash: payload.mode || "write",
      ownerId: userId, ownerName: userName,
    };
    await db.documents.put(doc);
    if (doc.partnerAccess !== "private") syncPublicDocsToPeers();
    await emitSnapshot();
    return;
  }

  if (type === "document.updateContent") {
    const { id, content } = payload;
    if (!id || content === undefined) return;
    await db.documents.update(id, { content, lastModified: Date.now() });
    const updated = await db.documents.get(id);
    if (updated && updated.partnerAccess !== "private") {
      // Broadcast the change to peers so they see live updates.
      mesh.broadcast({
        type: "shared-docs-sync",
        senderId: mesh.peerId,
        payload: { docs: [{ ...updated, content }], removeIds: [] },
      });
    }
    await emitSnapshot();
    return;
  }

  if (type === "document.spliceContent") {
    const { id } = payload;
    const edit = toTextSplice(payload);
    if (typeof id !== "string" || !edit) return;
    const updated = await applyDocumentSplice(id, edit);
    if (updated && updated.partnerAccess !== "private") {
      mesh.broadcast({
        type: "shared-doc-op",
        senderId: mesh.peerId,
        payload: { id, ...edit },
      });
    }
    await emitSnapshot();
    return;
  }

  if (type === "document.rename") {
    const { id, name } = payload;
    if (!id || !name) return;
    const safeName = name.endsWith(".md") ? name : `${name}.md`;
    const finalName = await uniqueDocName(safeName, id);
    await db.documents.update(id, { name: finalName, lastModified: Date.now() });
    await emitSnapshot();
    return;
  }

  if (type === "document.move") {
    const { id, folder } = payload;
    if (!id) return;
    const prev = await db.documents.get(id);
    await db.documents.update(id, { partnerAccess: folder, lastModified: Date.now() });
    // Broadcast scope change to peers.
    const wasShared = prev?.partnerAccess && prev.partnerAccess !== "private";
    const isShared = folder !== "private";
    if (isShared) {
      // Document became shared — push it.
      const updated = await db.documents.get(id);
      if (updated) {
        mesh.broadcast({
          type: "shared-docs-sync",
          senderId: mesh.peerId,
          payload: { docs: [updated], removeIds: [] },
        });
      }
    } else if (wasShared) {
      // Document was removed from shared scope — tell peers to delete.
      mesh.broadcast({
        type: "shared-docs-sync",
        senderId: mesh.peerId,
        payload: { docs: [], removeIds: [id] },
      });
    }
    await emitSnapshot();
    return;
  }

  if (type === "document.setMode") {
    const { id, mode } = payload;
    if (!id) return;
    await db.documents.update(id, { encryptedHash: mode, lastModified: Date.now() });
    const updated = await db.documents.get(id);
    if (updated && updated.partnerAccess !== "private") {
      mesh.broadcast({
        type: "shared-docs-sync",
        senderId: mesh.peerId,
        payload: { docs: [updated], removeIds: [] },
      });
    }
    await emitSnapshot();
    return;
  }

  if (type === "document.duplicate") {
    const { id } = payload;
    const source = await db.documents.get(id);
    if (!source) return;
    const baseName = source.name.replace(".md", "_copy.md");
    const finalName = await uniqueDocName(baseName);
    const copy: DebateDocument = {
      ...source,
      id: `doc-${Date.now()}`, name: finalName,
      lastModified: Date.now(), ownerId: userId, ownerName: userName,
    };
    await db.documents.put(copy);
    await emitSnapshot();
    return;
  }

  if (type === "document.delete") {
    await db.documents.delete(payload.id);
    // Notify peers about removal
    if (mesh.connections.size > 0) {
      mesh.broadcast({
        type: "shared-docs-sync",
        senderId: mesh.peerId,
        payload: { docs: [], removeIds: [payload.id] },
      });
    }
    await emitSnapshot();
    return;
  }

  // ── Evidence Cards ────────────────────────
  if (type === "card.create") {
    const { title, text, sourceUrl, docId, folder } = payload;
    if (!title?.trim() || !text?.trim()) return;
    const card: EvidenceCard = {
      id: `card-${Date.now()}`, title: title.trim(), text: text.trim(),
      sourceUrl: sourceUrl || "", hash: "", timestamp: Date.now(),
      author: userName, docId, folder: folder || "private",
    };
    await db.cards.put(card);
    await emitSnapshot();
    return;
  }

  if (type === "card.delete") {
    await db.cards.delete(payload.id);
    await emitSnapshot();
    return;
  }

  // ── Session: Host ─────────────────────────
  if (type === "session.host") {
    const code = generateRoomCode();
    const participate = payload.participate !== false;
    lastRoomCode = code;
    lastRoomIsHost = true;
    session = {
      roomCode: code,
      matchName: payload.matchName?.trim() || "Practice Round",
      groupName: payload.groupName?.trim() || "Dialektik Team",
      status: "lobby",
      handout: { title: "", problem: "", details: "" },
      debaters: participate
        ? [{ id: userId, name: userName || "Host", status: "approved", team: "affirmative", position: 1 }]
        : [],
      currentSpeakerId: undefined,
      speakerNotes: {},
      speechRemainingMs: 240000, speechRunning: false,
      prepRemainingMs: 180000, prepRunning: false,
      customTimers: [],
      pendingRequests: [],
      isHost: true,
    };
    startTimerLoop();
    try {
      await mesh.createRoom(code);
    } catch (e) {
      console.error("[engine] createRoom failed:", e);
    }
    await emitSnapshot();
    return;
  }

  // ── Session: Join ─────────────────────────
  if (type === "session.join") {
    const code = (payload.roomCode || "").trim().toUpperCase();
    if (!code) return;
    // Pass identity metadata so the host learns about us via
    // PeerJS connection metadata (before the data channel opens).
    mesh.connectMeta = { userId, userName };
    lastRoomCode = code;
    lastRoomIsHost = false;
    session = {
      roomCode: code, matchName: "", groupName: "",
      status: "pending_approval",
      handout: { title: "", problem: "", details: "" },
      debaters: [], speakerNotes: {},
      speechRemainingMs: 240000, speechRunning: false,
      prepRemainingMs: 180000, prepRunning: false,
      customTimers: [], pendingRequests: [], isHost: false,
    };
    startTimerLoop();
    try {
      await mesh.joinRoom(code);
      // After the WebRTC handshake fires (mesh.onConnectionOpen / handshake message),
      // the engine sends the join-request packet automatically via handlePeerMessage.
    } catch (e) {
      console.error("[engine] joinRoom failed:", e);
      // Host unreachable — clear the session so the client can retry.
      session = null;
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    }
    await emitSnapshot();
    return;
  }

  // ── Session: Exit ─────────────────────────
  if (type === "session.exit") {
    // Notify peers before tearing down so they know the session ended.
    mesh.broadcast({ type: "session-ended", senderId: mesh.peerId });
    // Small delay to let the broadcast go out before closing connections.
    await new Promise(r => setTimeout(r, 100));
    mesh.terminateSession();
    session = null;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    yjsProviders.forEach(p => p.destroy());
    yjsProviders.clear();
    yjsDocs.clear();
    // Clean up shared files not owned by us — they belong to the session.
    const allDocs = await db.documents.toArray();
    for (const d of allDocs) {
      if (d.ownerId !== userId && d.partnerAccess !== "private") {
        await db.documents.delete(d.id);
      }
    }
    const allCards = await db.cards.toArray();
    for (const c of allCards) {
      if (c.author !== userName && c.folder && c.folder !== "private") {
        await db.cards.delete(c.id);
      }
    }
    await emitSnapshot();
    return;
  }

  // ── Session: Approve join ─────────────────
  if (type === "session.approveJoin") {
    if (!session) return;
    const { id } = payload;
    const req = session.pendingRequests.find(r => r.id === id);
    if (!req) return;
    session.pendingRequests = session.pendingRequests.filter(r => r.id !== id);
    const alreadyIn = session.debaters.some(d => d.id === id);
    if (!alreadyIn) {
      session.debaters = [...session.debaters, {
        id: req.id, name: req.name, status: "approved",
        team: "negative", position: 1,
      }];
    }
    broadcastSessionState();
    await emitSnapshot();
    return;
  }

  // ── Session: Reject join ──────────────────
  if (type === "session.rejectJoin") {
    if (!session) return;
    session.pendingRequests = session.pendingRequests.filter(r => r.id !== payload.id);
    const rejectedId = payload.id as string;
    if (rejectedId) rejectedPeers.add(rejectedId);
    await emitSnapshot();
    return;
  }

  // ── Session: Start debate ─────────────────
  if (type === "session.startDebate") {
    if (!session) return;
    session.status = "active";
    broadcastSessionState();
    await emitSnapshot();
    return;
  }

  // ── Session: Update handout ───────────────
  if (type === "session.updateHandout") {
    if (!session) return;
    session.handout = {
      title: payload.title || "", problem: payload.problem || "", details: payload.details || "",
    };
    if (session.status === "active") broadcastSessionState();
    await emitSnapshot();
    return;
  }

  if (type === "session.spliceHandout") {
    const { field } = payload;
    const edit = toTextSplice(payload);
    if (typeof field !== "string" || !edit) return;
    if (!applyHandoutSplice(field, edit)) return;
    mesh.broadcast({
      type: "handout-op",
      senderId: mesh.peerId,
      payload: { field, ...edit },
    });
    await emitSnapshot();
    return;
  }

  // ── Session: Assign debater ───────────────
  if (type === "session.assignDebater") {
    if (!session) return;
    session.debaters = session.debaters.map(d =>
      d.id === payload.id ? { ...d, team: payload.team, position: payload.position } : d
    );
    broadcastSessionState();
    await emitSnapshot();
    return;
  }

  // ── Session: Select speaker ───────────────
  if (type === "session.selectSpeaker") {
    if (!session) return;
    session.currentSpeakerId = payload.id;
    broadcastSessionState();
    await emitSnapshot();
    return;
  }

  // ── Session: Speaker notes ────────────────
  if (type === "session.updateNotes") {
    if (!session) return;
    const { speakerId, text } = payload;
    if (!speakerId) return;
    session.speakerNotes = { ...session.speakerNotes, [speakerId]: text };
    // Notes stay local – never broadcast
    await emitSnapshot();
    return;
  }

  // ── Session: Save round ───────────────────
  if (type === "session.saveRound") {
    if (!session) return;
    const winner = payload.winner as string || "affirmative";
    const mySide = session.debaters.find(d => d.id === userId)?.team || "affirmative";
    const isWin = winner === mySide;
    const flows = session.debaters.map(d => ({
      speechId: d.name, notes: session!.speakerNotes[d.id] || "",
    }));
    const record: TournamentRecord = {
      id: `history-${Date.now()}`,
      matchName: session.matchName, opponentName: session.groupName,
      sides: mySide, winLoss: isWin ? "win" : "loss",
      speechOrder: [], flows, tag: "", timestamp: Date.now(),
    };
    await db.history.put(record);
    mesh.terminateSession();
    session = null;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    await emitSnapshot();
    return;
  }

  // ── Timers ────────────────────────────────
  if (type === "timer.action") {
    if (!session) return;
    const { timerType, action: act, durationSeconds } = payload;
    const durMs = (durationSeconds || (timerType === "speech" ? 240 : 180)) * 1000;
    if (timerType === "speech") {
      if (act === "start") session.speechRunning = true;
      else if (act === "pause") session.speechRunning = false;
      else if (act === "reset") { session.speechRemainingMs = durMs; session.speechRunning = false; }
    } else if (timerType === "prep") {
      if (act === "start") session.prepRunning = true;
      else if (act === "pause") session.prepRunning = false;
      else if (act === "reset") { session.prepRemainingMs = durMs; session.prepRunning = false; }
    }
    if (mesh.isHost) {
      const targetTime = act === "start" ? Date.now() + (timerType === "speech" ? session.speechRemainingMs : session.prepRemainingMs) : undefined;
      mesh.broadcast({
        type: "timer-action", senderId: mesh.peerId,
        payload: { timerType, action: act, durationSeconds, targetTime },
      });
    }
    await emitSnapshot();
    return;
  }

  if (type === "customTimer.create") {
    if (!session) return;
    const { name, duration } = payload;
    if (!name?.trim()) return;
    const durationMs = parseDurationMs(duration);
    session.customTimers = [...session.customTimers, {
      id: `timer-${Date.now()}`, name: name.trim(),
      remainingMs: durationMs, running: false, durationMs,
    }];
    if (mesh.isHost) broadcastCustomTimers();
    await emitSnapshot();
    return;
  }

  if (type === "customTimer.delete") {
    if (!session) return;
    session.customTimers = session.customTimers.filter(t => t.id !== payload.id);
    if (mesh.isHost) broadcastCustomTimers();
    await emitSnapshot();
    return;
  }

  if (type === "customTimer.action") {
    if (!session) return;
    const { id, action: act } = payload;
    session.customTimers = session.customTimers.map(t => {
      if (t.id !== id) return t;
      if (act === "start") return { ...t, running: true };
      if (act === "pause") return { ...t, running: false };
      if (act === "reset") return { ...t, running: false, remainingMs: t.durationMs };
      return t;
    });
    if (mesh.isHost) broadcastCustomTimers();
    await emitSnapshot();
    return;
  }

  // ── AI ────────────────────────────────────
  if (type === "ai.newChat") {
    const chat: AiChat = {
      id: `chat-${Date.now()}`, title: "New Chat",
      messages: [{ role: "assistant", text: "I can help prepare blocks, summaries, and weighing.", timestamp: Date.now() }],
    };
    await db.aiChats.put(chat);
    aiChats = [...aiChats, chat];
    activeAiChatId = chat.id;
    await emitSnapshot();
    return;
  }

  if (type === "ai.selectChat") {
    activeAiChatId = payload.id;
    await emitSnapshot();
    return;
  }

  if (type === "ai.renameChat") {
    const { id, title } = payload;
    aiChats = aiChats.map(c => c.id === id ? { ...c, title: title.trim() } : c);
    const chat = aiChats.find(c => c.id === id);
    if (chat) await db.aiChats.put(chat);
    await emitSnapshot();
    return;
  }

  if (type === "ai.deleteChat") {
    await db.aiChats.delete(payload.id);
    aiChats = aiChats.filter(c => c.id !== payload.id);
    activeAiChatId = aiChats.length > 0 ? aiChats[0].id : null;
    await emitSnapshot();
    return;
  }

  if (type === "ai.sendMessage") {
    const { text } = payload;
    if (!text?.trim()) return;
    const chatId = activeAiChatId;
    if (!chatId) return;

    // Append user message immediately
    aiChats = aiChats.map(c => {
      if (c.id !== chatId) return c;
      const isNew = c.title === "New Chat";
      return {
        ...c,
        title: isNew ? text.trim().split(" ").slice(0, 4).join(" ") : c.title,
        messages: [...c.messages, { role: "user", text: text.trim(), timestamp: Date.now() }],
      };
    });
    aiLoading = true;
    await emitSnapshot();

    // Real AI call
    try {
      const chat = aiChats.find(c => c.id === chatId)!;
      const ai = new AIService({ apiKey: aiApiKey, endpoint: aiEndpoint, model: aiModel });
      const history = chat.messages.map(m => ({ role: m.role, text: m.text }));
      const topic = session?.handout?.title || "NSDA debate";
      const response = await ai.sparringPartner(topic, "affirmative", history);
      aiChats = aiChats.map(c => {
        if (c.id !== chatId) return c;
        return { ...c, messages: [...c.messages, { role: "assistant", text: response, timestamp: Date.now() }] };
      });
    } catch (e: any) {
      aiChats = aiChats.map(c => {
        if (c.id !== chatId) return c;
        return { ...c, messages: [...c.messages, { role: "assistant", text: `Error: ${e?.message || "AI call failed."}`, timestamp: Date.now() }] };
      });
    }
    // Persist updated chat
    const updatedChat = aiChats.find(c => c.id === chatId);
    if (updatedChat) await db.aiChats.put(updatedChat);
    aiLoading = false;
    await emitSnapshot();
    return;
  }

  // ── History ───────────────────────────────
  if (type === "history.delete") {
    await db.history.delete(payload.id);
    await emitSnapshot();
    return;
  }

  // ── Workspace reset ───────────────────────
  if (type === "workspace.reset") {
    session = null;
    mesh.terminateSession();
    await emitSnapshot();
    return;
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function broadcastCustomTimers() {
  if (!session) return;
  mesh.broadcast({ type: "custom-timers-sync", senderId: mesh.peerId, payload: { timers: session.customTimers } });
}

function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function parseDurationMs(duration: string): number {
  if (!duration) return 60000;
  const parts = duration.split(":");
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseInt(parts[1], 10);
    if (!isNaN(m) && !isNaN(s)) return (m * 60 + s) * 1000;
  }
  return 60000;
}

async function uniqueDocName(name: string, currentId?: string): Promise<string> {
  const existing = await db.documents.toArray();
  const taken = new Set(existing.filter(d => d.id !== currentId).map(d => d.name.toLowerCase()));
  const base = name.replace(/\.md$/i, "");
  let candidate = name;
  let i = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base}_${i}.md`;
    i++;
  }
  return candidate;
}

// ─────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────
async function bootstrap() {
  await loadConfig();
  setupMeshHandlers();
  startTimerLoop();
  await emitSnapshot();

  // Expose public API on window
  (window as any).dialektikEngine = {
    dispatch: (actionJson: string) => {
      dispatch(actionJson).catch(e => console.error("[engine] dispatch error:", e));
    },
    getSnapshot: async () => {
      return JSON.stringify(await buildSnapshot());
    },
    getLatestSnapshot: () => {
      return __latestSnapshot;
    },
  };

  console.log("[engine] Dialektik JS engine ready. userId:", userId);
}

bootstrap().catch(e => console.error("[engine] bootstrap error:", e));
