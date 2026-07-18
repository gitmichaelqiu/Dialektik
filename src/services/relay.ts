import type { PeerMessage } from "./webrtc";
import { decodeMessage, encodeMessage } from "./message-codec";

declare const __DIALEKTIK_RELAY_URL__: string;

type RelayIncoming = (message: PeerMessage) => void;

interface RelayEnvelope {
  type: "relay-message";
  senderId: string;
  senderUserId: string;
  message: unknown;
}

interface RelaySocket extends WebSocket {
  __dialektikReady?: boolean;
}

/**
 * Small application-message fallback for networks where WebRTC ICE fails.
 * The server only holds room membership in memory and forwards encrypted or
 * application-level messages; it does not persist room contents.
 */
export class RelayClient {
  private socket: RelaySocket | null = null;
  private roomCode = "";
  private userId = "";
  private peerId = "";

  constructor(private readonly onMessage: RelayIncoming) {}

  public async connect(
    roomCode: string,
    userId: string,
    userName: string,
    peerId: string,
    isHost: boolean,
  ): Promise<void> {
    this.disconnect();
    this.roomCode = roomCode;
    this.userId = userId;
    this.peerId = peerId;

    const url = this.relayUrl();
    if (!url) return;

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url) as RelaySocket;
      this.socket = socket;
      let settled = false;
      socket.onopen = () => {
        socket.__dialektikReady = true;
        socket.send(JSON.stringify({
          type: "hello",
          roomCode,
          userId,
          userName,
          peerId,
          isHost,
        }));
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      socket.onmessage = (event) => {
        try {
          const envelope = JSON.parse(String(event.data)) as RelayEnvelope;
          if (envelope.type === "relay-message" && envelope.message) {
            void decodeMessage<PeerMessage>(envelope.message).then(message => {
              if (message) this.onMessage(message);
            });
          }
        } catch (error) {
          console.error("[relay] Invalid message:", error);
        }
      };
      socket.onerror = (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
        console.error("[relay] Connection error:", error);
      };
      socket.onclose = () => {
        if (this.socket === socket) this.socket = null;
      };
    });
  }

  public async send(message: PeerMessage, targetUserId?: string) {
    const socket = this.socket;
    if (!socket?.__dialektikReady || socket.readyState !== WebSocket.OPEN) return;
    const encoded = await encodeMessage(message);
    socket.send(JSON.stringify({
      type: "relay",
      roomCode: this.roomCode,
      senderUserId: this.userId,
      targetUserId,
      message: { ...(encoded as Record<string, unknown>), senderId: this.peerId },
    }));
  }

  public disconnect() {
    this.socket?.close();
    this.socket = null;
  }

  private relayUrl(): string | null {
    const configured = (globalThis as typeof globalThis & {
      __DIALEKTIK_RELAY_URL?: string;
    }).__DIALEKTIK_RELAY_URL;
    return configured || __DIALEKTIK_RELAY_URL__ || "ws://localhost:8787";
  }
}
