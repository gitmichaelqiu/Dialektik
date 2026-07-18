import http from "node:http";
import { WebSocketServer } from "ws";

const port = Number(process.env.PORT || 8787);
const rooms = new Map();
const roomTtlMs = 30 * 60 * 1000;

function roomFor(code) {
  let room = rooms.get(code);
  if (!room) {
    room = { clients: new Map(), expiresAt: Date.now() + roomTtlMs };
    rooms.set(code, room);
  }
  room.expiresAt = Date.now() + roomTtlMs;
  return room;
}

function send(socket, value) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(value));
}

function removeClient(client) {
  if (!client.roomCode || !client.userId) return;
  const room = rooms.get(client.roomCode);
  if (!room) return;
  if (room.clients.get(client.userId) === client) {
    room.clients.delete(client.userId);
  }
  if (room.clients.size === 0) rooms.delete(client.roomCode);
}

const server = http.createServer((request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  response.writeHead(404);
  response.end();
});

const wss = new WebSocketServer({ server });
wss.on("connection", (client) => {
  client.on("message", (raw) => {
    let packet;
    try {
      packet = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (packet.type === "hello") {
      if (!packet.roomCode || !packet.userId) return client.close(1008, "Invalid hello");
      removeClient(client);
      const room = roomFor(packet.roomCode);
      const previous = room.clients.get(packet.userId);
      if (previous && previous !== client) previous.close(4001, "Replaced by a newer connection");
      client.roomCode = packet.roomCode;
      client.userId = packet.userId;
      client.peerId = packet.peerId || packet.userId;
      client.isHost = packet.isHost === true;
      room.clients.set(client.userId, client);
      send(client, { type: "hello-ack" });
      return;
    }

    if (packet.type !== "relay" || !client.roomCode || !packet.message) return;
    const room = rooms.get(client.roomCode);
    if (!room) return;
    room.expiresAt = Date.now() + roomTtlMs;
    const envelope = {
      type: "relay-message",
      senderId: client.peerId,
      senderUserId: client.userId,
      message: packet.message,
    };
    if (packet.targetUserId) {
      const target = room.clients.get(packet.targetUserId);
      if (target) send(target, envelope);
    } else {
      for (const target of room.clients.values()) {
        if (target !== client) send(target, envelope);
      }
    }
  });
  client.on("close", () => removeClient(client));
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.expiresAt <= now) {
      for (const client of room.clients.values()) client.close(4000, "Room expired");
      rooms.delete(code);
    }
  }
}, 60_000).unref();

server.listen(port, () => {
  console.log(`Dialektik relay listening on :${port}`);
});
