const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
let roomRematchStates = {}; 

io.on("connection", (socket) => {
    socket.on("create-room", (data) => {
        const { password, name, mins, secs, inc, colorPref } = data;
        if (rooms[password]) {
            socket.emit("error-msg", "Room already exists");
            return;
        }
        rooms[password] = {
            creator: socket.id,
            creatorName: name,
            settings: { mins, secs, inc },
            colorPref,
            players: [{ id: socket.id, name }]
        };
        socket.join(password);
        socket.emit("room-created", { password });
    });

    socket.on("join-attempt", (data) => {
        const room = rooms[data.password];
        if (!room) return socket.emit("error-msg", "Room not found");
        if (room.players.length >= 2) return socket.emit("error-msg", "Room full");
        
        socket.emit("preview-settings", {
            settings: room.settings,
            creatorName: room.creatorName,
            creatorColorPref: room.colorPref
        });
    });

    socket.on("confirm-join", (data) => {
        const room = rooms[data.password];
        if (!room || room.players.length >= 2) return;

        const guestName = data.name || "Guest";
        room.players.push({ id: socket.id, name: guestName });
        socket.join(data.password);

        let whiteId, blackId;
        const creator = room.players[0];
        const guest = room.players[1];

        if (room.colorPref === 'white') {
            whiteId = creator.id; blackId = guest.id;
        } else if (room.colorPref === 'black') {
            whiteId = guest.id; blackId = creator.id;
        } else {
            if (Math.random() > 0.5) {
                whiteId = creator.id; blackId = guest.id;
            } else {
                whiteId = guest.id; blackId = creator.id;
            }
        }

        io.to(whiteId).emit("player-assignment", { color: 'white', settings: room.settings, oppName: guest.id === whiteId ? creator.name : guest.name });
        io.to(blackId).emit("player-assignment", { color: 'black', settings: room.settings, oppName: guest.id === blackId ? creator.name : guest.name });
    });

    socket.on("send-move", (data) => {
        socket.to(data.password).emit("receive-move", data);
    });

    socket.on("resign", (data) => {
        io.in(data.password).emit("opponent-resigned", { winner: data.winner });
    });

    socket.on("offer-draw", (data) => {
        socket.to(data.password).emit("draw-offered");
    });

    socket.on("draw-response", (data) => {
        io.in(data.password).emit("draw-resolved", { accepted: data.accepted });
    });

    // --- REMATCH HANDSHAKE ---
    socket.on("rematch-request", (data) => {
        const roomPass = data.password;
        if (!roomRematchStates[roomPass]) roomRematchStates[roomPass] = new Set();

        roomRematchStates[roomPass].add(socket.id);
        socket.to(roomPass).emit("rematch-offered");

        if (roomRematchStates[roomPass].size === 2) {
            roomRematchStates[roomPass].clear();
            io.in(roomPass).emit("rematch-start");
        }
    });

    socket.on("disconnecting", () => {
        for (const room of socket.rooms) {
            if (rooms[room]) delete rooms[room];
            if (roomRematchStates[room]) delete roomRematchStates[room];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
