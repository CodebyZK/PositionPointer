const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3005;
const wss = new WebSocketServer({ port: PORT });

// Map of roomCode -> [wsA, wsB]
const rooms = new Map();

wss.on("connection", (ws) => {
  let roomCode = null;

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    // First message from a client must be { type: "join", room: "..." }
    if (msg.type === "join") {
      roomCode = msg.room;

      if (!rooms.has(roomCode)) {
        rooms.set(roomCode, []);
      }

      const peers = rooms.get(roomCode);

      if (peers.length >= 2) {
        ws.send(JSON.stringify({ type: "error", message: "Room is full" }));
        ws.close();
        return;
      }

      peers.push(ws);
      console.log(`[${roomCode}] joined (${peers.length}/2)`);

      // Notify both peers when the room is full
      if (peers.length === 2) {
        const ready = JSON.stringify({ type: "ready" });
        peers[0].send(ready);
        peers[1].send(ready);
        console.log(`[${roomCode}] both peers connected`);
      }
      return;
    }

    // All other messages (location updates) are relayed to the other peer
    if (!roomCode) return;

    const peers = rooms.get(roomCode);
    if (!peers) return;

    for (const peer of peers) {
      if (peer !== ws && peer.readyState === peer.OPEN) {
        peer.send(JSON.stringify(msg));
      }
    }
  });

  ws.on("close", () => {
    if (!roomCode) return;

    const peers = rooms.get(roomCode);
    if (!peers) return;

    const remaining = peers.filter((p) => p !== ws);

    if (remaining.length === 0) {
      rooms.delete(roomCode);
      console.log(`[${roomCode}] room closed`);
    } else {
      rooms.set(roomCode, remaining);
      remaining[0].send(JSON.stringify({ type: "peer_disconnected" }));
      console.log(`[${roomCode}] peer disconnected (1/2 remaining)`);
    }
  });
});

console.log(`Beam Pointer WebSocket server listening on port ${PORT}`);
