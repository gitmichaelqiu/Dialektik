import { Peer, type DataConnection } from "peerjs";


export const APP_VERSION = "0.1.0";
const ROOM_PREFIX = "dialektik-room-";

export interface PeerMessage {
  type: "handshake" | "yjs-sync-step-1" | "yjs-sync-step-2" | "yjs-update" | "timer-action" | "version-reject" | "pairing-request" | "vault-sync" | "join-request" | "join-rejected" | "session-ended" | "session-state" | "shared-docs-sync" | "shared-doc-op" | "shared-cards-sync" | "handout-op" | "doc-cursor" | "custom-timers-sync";
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

  constructor() {
    // Generate a unique client peer ID
    this.peerId = `peer-${Math.random().toString(36).substring(2, 11)}`;
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
  private initPeer(customId?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.peer) {
        this.peer.destroy();
      }

      this.peer = new Peer(customId || this.peerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" }
          ]
        }
      });

      this.peer.on("open", (id) => {
        this.peerId = id;
        resolve(id);
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

    const conn = this.peer.connect(targetPeerId, {
      serialization: "json",
      metadata: this.connectMeta,
    });

    this.setupConnectionEvents(conn);
    return conn;
  }

  /**
   * Set up connection events for a newly established PeerJS channel.
   */
  private setupConnectionEvents(conn: DataConnection) {
    conn.on("open", () => {
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
      conn.send(msg);
    });

    conn.on("data", (data: any) => {
      const msg = data as PeerMessage;
      if (!msg || !msg.type) return;

      this.handleIncomingMessage(conn, msg);
    });

    conn.on("close", () => {
      this.handleConnectionClose(conn.peer);
    });

    conn.on("error", (err) => {
      console.error(`Connection error with ${conn.peer}:`, err);
      conn.close();
    });
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
        conn.send(msg);
      }
    }
  }

  /**
   * Send a packet to a specific peer in the mesh.
   */
  public sendToPeer(peerId: string, msg: PeerMessage) {
    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      conn.send(msg);
    }
  }

  /**
   * Handles peer disconnecting. Cleans list and triggers host migration if host dies.
   */
  private handleConnectionClose(closedPeerId: string) {
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
    
    this.isHost = false;
    this.roomCode = "";
  }
}
