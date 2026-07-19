import { Peer, type DataConnection } from "peerjs";
import { decodeMessage, encodeMessage } from "./message-codec";


export const APP_VERSION = "0.1.1";
const ROOM_PREFIX = "dialektik-room-";

// Keep only STUN by default. If a user configures TURN, it is appended below;
// ICE then prefers direct host/STUN candidates and uses the configured relay
// only when the direct connectivity checks fail.
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
];

export interface TurnServerConfig {
  urls: string[];
  username: string;
  credential: string;
}

export interface PeerMessage {
  type: "handshake" | "yjs-sync-step-1" | "yjs-sync-step-2" | "yjs-update" | "timer-action" | "version-reject" | "pairing-request" | "vault-sync" | "join-request" | "join-approved" | "join-rejected" | "session-ended" | "session-state" | "shared-docs-sync" | "shared-doc-op" | "shared-doc-sync-request" | "shared-doc-manual-sync" | "shared-cards-sync" | "handout-op" | "doc-cursor" | "custom-timers-sync";
  version?: string;
  senderId: string;
  payload?: any;
}

export type ConnectionCallback = (peerId: string, conn: DataConnection) => void;
export type MessageCallback = (senderId: string, msg: PeerMessage) => void;

/**
 * WebRTC P2P mesh network manager using PeerJS.
 * Coordinates room connections, full-mesh pairing, version handshake, and host migration.
 */
export class PeerMeshManager {
  public peer: Peer | null = null;
  public connections: Map<string, DataConnection> = new Map();
  public peerId: string;
  public roomCode: string = "";
  public isHost: boolean = false;
  public peersList: string[] = []; // list of all peer IDs in the mesh
  public appVersion: string = APP_VERSION;
  public matchDetails: { matchName: string; opponent: string } | null = null;

  private onConnectionOpenCallbacks: ConnectionCallback[] = [];
  private onConnectionCloseCallbacks: ((peerId: string) => void)[] = [];
  private onMessageCallbacks: MessageCallback[] = [];
  private onVersionMismatchCallback: (() => void) | null = null;
  private onHostMigrationCallback: ((newHostId: string) => void) | null = null;
  private onMatchDetailsCallback: ((details: any) => void) | null = null;
  /** Fires when a new peer connects (before the data channel opens). */
  private onPeerConnectingCallbacks: ((peerId: string, metadata?: any) => void)[] = [];
  private reconnectAttempts = new Map<string, number>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private turnServer: TurnServerConfig | null = null;
  private sendQueues = new Map<string, Promise<void>>();

  constructor() {
    // Generate a unique client peer ID
    this.peerId = this.createClientPeerId();
  }

  private createClientPeerId() {
    return `peer-${Math.random().toString(36).substring(2, 11)}`;
  }

  public setTurnServer(config: TurnServerConfig | null) {
    this.turnServer = config && config.urls.length > 0 && config.username && config.credential
      ? config
      : null;
  }

  private iceServers() {
    return this.turnServer
      ? [...ICE_SERVERS, this.turnServer]
      : ICE_SERVERS;
  }

  /**
   * Register event handlers
   */
  public onConnectionOpen(cb: ConnectionCallback) {
    this.onConnectionOpenCallbacks.push(cb);
    return () => {
      this.onConnectionOpenCallbacks = this.onConnectionOpenCallbacks.filter(item => item !== cb);
    };
  }
  public onConnectionClose(cb: (peerId: string) => void) {
    this.onConnectionCloseCallbacks.push(cb);
    return () => {
      this.onConnectionCloseCallbacks = this.onConnectionCloseCallbacks.filter(item => item !== cb);
    };
  }
  public onMessage(cb: MessageCallback) {
    this.onMessageCallbacks.push(cb);
    return () => {
      this.onMessageCallbacks = this.onMessageCallbacks.filter(item => item !== cb);
    };
  }
  public onVersionMismatch(cb: () => void) { this.onVersionMismatchCallback = cb; }
  public onHostMigration(cb: (newHostId: string) => void) { this.onHostMigrationCallback = cb; }
  public onMatchDetails(cb: (details: any) => void) { this.onMatchDetailsCallback = cb; }
  public onPeerConnecting(cb: (peerId: string, metadata?: any) => void) {
    this.onPeerConnectingCallbacks.push(cb);
    return () => {
      this.onPeerConnectingCallbacks = this.onPeerConnectingCallbacks.filter(item => item !== cb);
    };
  }

  /**
   * Initializes a PeerJS instance connected to the signaling server.
   */
  private async initPeer(customId?: string): Promise<string> {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
      // PeerJS releases an ID asynchronously. Waiting here prevents a quick
      // exit/re-host cycle from racing the PeerServer and reporting the old
      // host ID as already taken.
      await new Promise(resolve => setTimeout(resolve, 350));
    }

    return new Promise((resolve, reject) => {

      // PeerJS keeps a recently closed ID reserved for a short period. A
      // client that retries a failed join must therefore get a new ID; room
      // hosts continue to use the deterministic room host ID.
      if (!customId) {
        this.peerId = this.createClientPeerId();
      }

      this.peer = new Peer(customId || this.peerId, {
        debug: 1,
        config: {
          iceServers: this.iceServers(),
          sdpSemantics: "unified-plan",
        }
      });

      this.peer.on("open", (id) => {
        this.peerId = id;
        resolve(id);
      });

      this.peer.on("disconnected", () => {
        // PeerJS may lose its signaling WebSocket during a Wi-Fi/cellular
        // handoff even though the existing data channels are still usable.
        // Reconnect the signaling socket so future mesh joins can complete.
        const peer = this.peer;
        if (peer && !peer.destroyed) {
          peer.reconnect();
        }
      });

      this.peer.on("connection", (conn) => {
        this.handleIncomingConnection(conn);
        // Register in connections immediately so broadcasts (document
        // scope changes, session-state, etc.) work even before the
        // handshake message arrives over the data channel.
        this.connections.set(conn.peer, conn);
        // Fire early-connect callbacks so the host learns about the
        // joining peer via PeerJS metadata before the data channel opens.
        const meta = (conn as any).metadata;
        for (const cb of this.onPeerConnectingCallbacks) {
          cb(conn.peer, meta);
        }
      });

      this.peer.on("error", (err) => {
        console.error("PeerJS Error:", err);
        reject(err);
      });
    });
  }

  /**
   * Host starts a new room. Creates a PeerJS instance with the host ID pattern.
   */
  public async createRoom(code: string): Promise<string> {
    this.roomCode = code;
    this.isHost = true;
    const hostId = `${ROOM_PREFIX}${code}-host`;
    
    try {
      await this.initPeer(hostId);
      this.peersList = [this.peerId];
      return code;
    } catch (err) {
      console.error("Failed to host room with code", code, err);
      throw err;
    }
  }

  /**
   * Join an existing room using a 4-digit code.
   */
  public async joinRoom(code: string): Promise<void> {
    this.roomCode = code;
    this.isHost = false;
    
    // Initialize standard peer client
    await this.initPeer();
    
    // Connect to host
    const hostId = `${ROOM_PREFIX}${code}-host`;
    this.connectToPeer(hostId);
  }

  /**
   * Connect to a specific peer in the mesh.
   */
  /** Attach metadata (userId, userName) so the host learns about a joining
   *  client before the WebRTC data channel opens. */
  public connectMeta: { userId?: string; userName?: string } = {};

  public connectToPeer(targetPeerId: string): DataConnection {
    if (!this.peer) throw new Error("Peer not initialized");

    const existing = this.connections.get(targetPeerId);
    if (existing) return existing;

    const conn = this.peer.connect(targetPeerId, {
      serialization: "json",
      metadata: this.connectMeta,
    });

    // Register the connection before its handshake so mesh-list broadcasts do
    // not initiate a second channel while this one is still negotiating.
    this.connections.set(targetPeerId, conn);
    this.setupConnectionEvents(conn);
    return conn;
  }

  /**
   * Set up connection events for a newly established PeerJS channel.
   */
  private setupConnectionEvents(conn: DataConnection) {
    conn.on("open", () => {
      this.reconnectAttempts.delete(conn.peer);
      const reconnectTimer = this.reconnectTimers.get(conn.peer);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        this.reconnectTimers.delete(conn.peer);
      }
      // 1. Send version handshake
      const msg: PeerMessage = {
        type: "handshake",
        version: this.appVersion,
        senderId: this.peerId,
        payload: {
          isHost: this.isHost,
          peersList: this.peersList,
          matchDetails: this.matchDetails
        }
      };
      this.send(conn, msg);
    });

    conn.on("data", async (data: any) => {
      const msg = await decodeMessage<PeerMessage>(data);
      if (!msg || !msg.type) return;

      this.handleIncomingMessage(conn, msg);
    });

    conn.on("close", () => {
      this.handleConnectionClose(conn.peer, conn);
    });

    conn.on("error", (err) => {
      console.error(`Connection error with ${conn.peer}:`, err);
      conn.close();
      this.scheduleReconnect(conn.peer);
    });
  }

  private scheduleReconnect(peerId: string) {
    if (!this.peer || this.peer.destroyed || !this.roomCode) return;
    if (this.reconnectTimers.has(peerId)) return;

    const attempt = (this.reconnectAttempts.get(peerId) || 0) + 1;
    this.reconnectAttempts.set(peerId, attempt);
    const delay = Math.min(1000 * 2 ** (attempt - 1), 10000);
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(peerId);
      if (!this.peer || this.peer.destroyed || this.connections.has(peerId)) return;
      console.log(`Retrying connection to ${peerId} (attempt ${attempt})`);
      this.connectToPeer(peerId);
    }, delay);
    this.reconnectTimers.set(peerId, timer);
  }

  private handleIncomingConnection(conn: DataConnection) {
    this.setupConnectionEvents(conn);
  }

  /**
   * Process incoming custom P2P mesh network packets.
   */
  private handleIncomingMessage(conn: DataConnection, msg: PeerMessage) {
    if (msg.type === "handshake") {
      // Version verification
      if (msg.version !== this.appVersion) {
        console.warn(`Version mismatch! Connected peer: ${msg.version}, Local peer: ${this.appVersion}`);
        conn.send({ type: "version-reject", senderId: this.peerId });
        setTimeout(() => conn.close(), 500);
        if (this.onVersionMismatchCallback) this.onVersionMismatchCallback();
        return;
      }

      this.connections.set(msg.senderId, conn);

      // Host logic: update the room mesh list and broadcast it
      if (this.isHost) {
        if (!this.peersList.includes(msg.senderId)) {
          this.peersList.push(msg.senderId);
        }
        this.broadcastMeshList();
      } else {
        // Client logic: connect to other peers if host sent list
        if (msg.payload && Array.isArray(msg.payload.peersList)) {
          const remotePeers = msg.payload.peersList as string[];
          for (const pid of remotePeers) {
            if (pid !== this.peerId && !this.connections.has(pid)) {
              this.connectToPeer(pid);
            }
          }
        }
        
        // Sync match details on client
        if (msg.payload && msg.payload.matchDetails) {
          this.matchDetails = msg.payload.matchDetails;
          if (this.onMatchDetailsCallback) {
            this.onMatchDetailsCallback(msg.payload.matchDetails);
          }
        }
      }

      // Fire open callbacks
      for (const cb of this.onConnectionOpenCallbacks) {
        cb(msg.senderId, conn);
      }

      // Forward handshake to general message callbacks so components register links
      for (const cb of this.onMessageCallbacks) {
        cb(msg.senderId, msg);
      }
    } else if (msg.type === "version-reject") {
      console.error("Connection rejected due to version mismatch");
      conn.close();
      if (this.onVersionMismatchCallback) this.onVersionMismatchCallback();
    } else {
      // General message forwarder
      for (const cb of this.onMessageCallbacks) {
        cb(msg.senderId, msg);
      }
    }
  }

  /**
   * Broadcaster for Host to let all clients know who is in the room
   * so they can establish a full mesh.
   */
  private broadcastMeshList() {
    const msg: PeerMessage = {
      type: "handshake",
      version: this.appVersion,
      senderId: this.peerId,
      payload: {
        isHost: this.isHost,
        peersList: this.peersList
      }
    };
    this.broadcast(msg);
  }

  /**
   * Send a packet to all connected peers in the mesh.
   */
  public broadcast(msg: PeerMessage) {
    for (const [_, conn] of this.connections) {
      if (conn.open) {
        this.send(conn, msg);
      }
    }
  }

  /**
   * Send a packet to a specific peer in the mesh.
   */
  public sendToPeer(peerId: string, msg: PeerMessage) {
    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      this.send(conn, msg);
    }
  }

  private send(conn: DataConnection, msg: PeerMessage) {
    const previous = this.sendQueues.get(conn.peer) ?? Promise.resolve();
    const next = previous.then(async () => {
      if (!conn.open) return;
      conn.send(await encodeMessage(msg));
    }).catch(error => console.error(`Failed to send message to ${conn.peer}:`, error));
    this.sendQueues.set(conn.peer, next);
    void next.finally(() => {
      if (this.sendQueues.get(conn.peer) === next) this.sendQueues.delete(conn.peer);
    });
  }

  /**
   * Handles peer disconnecting. Cleans list and triggers host migration if host dies.
   */
  private handleConnectionClose(closedPeerId: string, closedConnection?: DataConnection) {
    if (
      closedConnection &&
      this.connections.get(closedPeerId) !== closedConnection
    ) {
      return;
    }
    this.connections.delete(closedPeerId);

    if (this.isHost) {
      this.peersList = this.peersList.filter(id => id !== closedPeerId);
      this.broadcastMeshList();
    }

    // Fire close callback
    for (const cb of this.onConnectionCloseCallbacks) {
      cb(closedPeerId);
    }

    // Host Migration Check
    const isHostClosed = closedPeerId.endsWith("-host");
    if (!this.isHost && isHostClosed) {
      this.migrateHost();
    }
  }

  /**
   * Host Migration algorithm:
   * Elects the lexicographically smallest peer ID to become the new host.
   */
  private async migrateHost() {
    console.log("Host disconnected! Starting Host Migration...");
    
    // Get all peer IDs including ourselves, filtering out the dead host
    const activePeers = Array.from(this.connections.keys())
      .filter(id => !id.endsWith("-host"))
      .concat(this.peerId)
      .sort();

    const newHostId = activePeers[0];
    console.log(`New Host elected: ${newHostId}`);

    if (newHostId === this.peerId) {
      console.log("I am the new host! Re-registering room as host...");
      this.isHost = true;
      this.peersList = activePeers;
      
      // Re-initialize as host
      const hostId = `${ROOM_PREFIX}${this.roomCode}-host`;
      await this.initPeer(hostId);
      console.log("Host migration completed. Now hosting.");
    }

    if (this.onHostMigrationCallback) {
      this.onHostMigrationCallback(newHostId);
    }
  }

  /**
   * Terminate session and clean up connections.
   */
  public terminateSession() {
    // Send session terminate warning
    const termMsg: PeerMessage = {
      type: "version-reject", // will force peers to close
      senderId: this.peerId
    };
    this.broadcast(termMsg);

    // Clean up
    for (const [_, conn] of this.connections) {
      conn.close();
    }
    this.connections.clear();
    this.peersList = [];

    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }

    for (const timer of this.reconnectTimers.values()) clearTimeout(timer);
    this.reconnectTimers.clear();
    this.reconnectAttempts.clear();
    
    this.isHost = false;
    this.roomCode = "";
  }
}
