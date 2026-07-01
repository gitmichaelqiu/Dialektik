import * as Y from "yjs";
import { PeerMeshManager, type PeerMessage } from "./webrtc";

// Convert Uint8Array to Base64 string for P2P transmission
function uint8ArrayToBase64(arr: Uint8Array): string {
  let binary = "";
  const len = arr.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

// Convert Base64 string to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Custom Yjs P2P Sync Provider.
 * Integrates Yjs CRDT with the PeerJS mesh connections, enabling real-time collaboration.
 */
export class PeerJSYjsProvider {
  public doc: Y.Doc;
  public mesh: PeerMeshManager;
  private roomName: string;
  private unsubscribeConnectionOpen: (() => void) | null = null;
  private unsubscribeMessage: (() => void) | null = null;

  constructor(doc: Y.Doc, mesh: PeerMeshManager, roomName: string) {
    this.doc = doc;
    this.mesh = mesh;
    this.roomName = roomName;

    // Set up local doc changes sync to P2P mesh
    this.doc.on("update", this.handleDocUpdate);

    // Set up incoming network messages binding
    this.unsubscribeConnectionOpen = this.mesh.onConnectionOpen(this.handlePeerConnect);
    this.unsubscribeMessage = this.mesh.onMessage(this.handleIncomingP2PMessage);

    for (const conn of this.mesh.connections.values()) {
      if (conn.open) {
        this.handlePeerConnect(conn.peer, conn);
      }
    }
  }

  /**
   * Cleans up listeners on destroy
   */
  public destroy() {
    this.doc.off("update", this.handleDocUpdate);
    this.unsubscribeConnectionOpen?.();
    this.unsubscribeMessage?.();
    this.unsubscribeConnectionOpen = null;
    this.unsubscribeMessage = null;
  }

  /**
   * Called when local document is edited. Broadcasts CRDT changes.
   */
  private handleDocUpdate = (update: Uint8Array, origin: any) => {
    // If the update was triggered by another peer via this provider, skip broadcasting
    if (origin === this) return;

    const base64Update = uint8ArrayToBase64(update);
    this.mesh.broadcast({
      type: "yjs-update",
      senderId: this.mesh.peerId,
      payload: { roomName: this.roomName, update: base64Update }
    });
  };

  /**
   * Called when a new P2P mesh connection is established.
   * Starts Yjs Sync Protocol Step 1: Send local state vector.
   */
  private handlePeerConnect = (_peerId: string, conn: any) => {
    const stateVector = Y.encodeStateVector(this.doc);
    const base64Sv = uint8ArrayToBase64(stateVector);

    conn.send({
      type: "yjs-sync-step-1",
      senderId: this.mesh.peerId,
      payload: { roomName: this.roomName, sv: base64Sv }
    });
  };

  /**
   * Processes incoming Yjs updates from the WebRTC mesh
   */
  private handleIncomingP2PMessage = (senderId: string, msg: PeerMessage) => {
    const conn = this.mesh.connections.get(senderId);
    if (!conn) return;
    if (msg.payload?.roomName !== this.roomName) return;

    switch (msg.type) {
      case "yjs-sync-step-1": {
        // Step 1: Received peer state vector. Compile missing updates and send back as Step 2.
        if (msg.payload && msg.payload.sv) {
          const sv = base64ToUint8Array(msg.payload.sv);
          const update = Y.encodeStateAsUpdate(this.doc, sv);
          const base64Update = uint8ArrayToBase64(update);

          conn.send({
            type: "yjs-sync-step-2",
            senderId: this.mesh.peerId,
            payload: { roomName: this.roomName, update: base64Update }
          });
        }
        break;
      }

      case "yjs-sync-step-2": {
        // Step 2: Received missing updates. Apply locally.
        if (msg.payload && msg.payload.update) {
          const update = base64ToUint8Array(msg.payload.update);
          Y.applyUpdate(this.doc, update, this); // origin is set to 'this' to avoid echo
        }
        break;
      }

      case "yjs-update": {
        // Real-time update: Apply directly.
        if (msg.payload && msg.payload.update) {
          const update = base64ToUint8Array(msg.payload.update);
          Y.applyUpdate(this.doc, update, this);
        }
        break;
      }
    }
  };
}
