const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3005;
const wss = new WebSocketServer({ port: PORT });

// roomCode -> Map<id, { ws, id, name }>
const rooms = new Map();
let nextId = 1;

function broadcast(room, exclude, msg) {
  const data = JSON.stringify(msg);
  for (const [, peer] of room) {
    if (peer.ws !== exclude && peer.ws.readyState === peer.ws.OPEN) {
      peer.ws.send(data);
    }
  }
}

wss.on("connection", (ws) => {
  let roomCode = null;
  let myId     = null;
  let myName   = "";

  ws.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.type === "join") {
      roomCode = msg.room;
      myName   = String(msg.name || "").slice(0, 32);
      myId     = String(nextId++);

      if (!rooms.has(roomCode)) rooms.set(roomCode, new Map());
      const room = rooms.get(roomCode);

      // Tell the new joiner who is already in the room
      const existing = [...room.values()].map(p => ({ id: p.id, name: p.name }));
      ws.send(JSON.stringify({ type: "joined", yourId: myId, peers: existing }));

      // Notify existing members about the new joiner
      broadcast(room, ws, { type: "peer_joined", id: myId, name: myName });

      room.set(myId, { ws, id: myId, name: myName });
      console.log(`[${roomCode}] ${myName} joined (${room.size} in room)`);
      return;
    }

    if (!roomCode || !myId) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    if (msg.type === "location") {
      // Stamp with sender id/name and relay to all other peers
      broadcast(room, ws, { ...msg, id: myId, name: myName });
    }
  });

  ws.on("close", () => {
    if (!roomCode || !myId) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    room.delete(myId);
    console.log(`[${roomCode}] ${myName} left (${room.size} remaining)`);

    if (room.size === 0) {
      rooms.delete(roomCode);
      console.log(`[${roomCode}] room closed`);
    } else {
      broadcast(room, null, { type: "peer_disconnected", id: myId });
    }
  });
});

console.log(`Beam Pointer WebSocket server listening on port ${PORT}`);
