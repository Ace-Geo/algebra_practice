const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require("socket.io")(http, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const rooms = {}; 
const roomRematchStates = {}; 

function getActiveRooms() {
    return Object.keys(rooms).map(pass => {
        const r = rooms[pass];
        return {
            password: pass,
            whiteName: r.whiteName || "Player 1",
            blackName: r.blackName || "Player 2",
            settings: r.settings,
            status: r.status
        };
    });
}

io.on("connection", (socket) => {
    socket.emit("lobby-update", getActiveRooms());

    socket.on("create-room", (data) => {
        const { password, name, mins, secs, inc, colorPref } = data;
        if (rooms[password]) {
            socket.emit("error-msg", "Room password already in use.");
            return;
        }
        socket.join(password);
        rooms[password] = {
            creatorId: socket.id,
            creatorName: name,
            settings: { mins, secs, inc, colorPref },
            status: "waiting",
            players: { white: null, black: null },
            spectators: [],
            whiteName: null,
            blackName: null,
            adminStates: { white: false, black: false }
        };
        io.emit("lobby-update", getActiveRooms());
        socket.emit("room-created", { password });
    });

    socket.on("join-attempt", (data) => {
        const { password, isSpectator } = data;
        const room = rooms[password];
        if (!room) return socket.emit("error-msg", "Room not found.");
        if (!isSpectator && room.status !== "waiting") return socket.emit("error-msg", "Room full.");
        
        socket.emit("preview-settings", {
            creatorName: room.creatorName,
            settings: room.settings,
            creatorColorPref: room.settings.colorPref,
            isSpectator: !!isSpectator,
            password: password
        });
    });

    socket.on("confirm-join", (data) => {
        const { password, name, isSpectator } = data;
        const room = rooms[password];
        if (!room) return;
        socket.join(password);

        if (isSpectator) {
            const specId = room.spectators.length + 1;
            room.spectators.push({ id: specId, socketId: socket.id, name: name, isAdmin: false });
            socket.emit("player-assignment", { color: 'spectator', spectatorId: specId, settings: room.settings, whiteName: room.whiteName, blackName: room.blackName });
            socket.to(password).emit("receive-chat", { message: `${name} is spectating.`, sender: "System" });
        } else {
            if (room.status !== "waiting") return;
            room.status = "active";
            const joinerId = socket.id;
            const pref = room.settings.colorPref;
            if (pref === 'white' || (pref === 'random' && Math.random() < 0.5)) {
                room.players.white = room.creatorId; room.players.black = joinerId;
                room.whiteName = room.creatorName; room.blackName = name;
            } else {
                room.players.white = joinerId; room.players.black = room.creatorId;
                room.whiteName = name; room.blackName = room.creatorName;
            }
            io.to(room.players.white).emit("player-assignment", { color: 'white', settings: room.settings, oppName: room.blackName });
            io.to(room.players.black).emit("player-assignment", { color: 'black', settings: room.settings, oppName: room.whiteName });
            io.emit("lobby-update", getActiveRooms());
        }
    });

    socket.on("send-move", (data) => { socket.to(data.password).emit("receive-move", data); });
    socket.on("send-chat", (data) => { socket.to(data.password).emit("receive-chat", { message: data.message, sender: data.senderName }); });
    socket.on("admin-pause-toggle", (data) => { io.in(data.password).emit("pause-state-updated", { isPaused: data.isPaused }); });
    socket.on("admin-set-time", (data) => { io.in(data.password).emit("time-updated", { color: data.color, newTime: data.newTime }); });
    socket.on("admin-set-increment", (data) => { io.in(data.password).emit("increment-updated", { newInc: data.newInc }); });
    socket.on("admin-place-piece", (data) => { io.in(data.password).emit("piece-placed", { r: data.r, c: data.c, piece: data.piece }); });
    socket.on("admin-reset-board", (data) => { io.in(data.password).emit("board-reset-triggered"); });

    socket.on("admin-permission-toggle", (data) => {
        const room = rooms[data.password];
        if (!room) return;
        let targetId = null;
        if (data.targetColor === 'white') { targetId = room.players.white; room.adminStates.white = data.isAdmin; }
        else if (data.targetColor === 'black') { targetId = room.players.black; room.adminStates.black = data.isAdmin; }
        else {
            const s = room.spectators.find(x => x.id == data.targetColor);
            if (s) { targetId = s.socketId; s.isAdmin = data.isAdmin; }
        }
        if (targetId) io.to(targetId).emit("permission-updated", { isAdmin: data.isAdmin });
        io.in(data.password).emit("admin-list-sync", { white: room.adminStates.white, black: room.adminStates.black, spectators: room.spectators.map(s => ({id: s.id, name: s.name, isAdmin: s.isAdmin})) });
    });

    socket.on("resign", (data) => { socket.to(data.password).emit("opponent-resigned", { winner: data.winner }); });
    socket.on("offer-draw", (data) => { socket.to(data.password).emit("draw-offered"); });
    socket.on("draw-response", (data) => { io.in(data.password).emit("draw-resolved", { accepted: data.accepted }); });

    socket.on("rematch-request", (data) => {
        const pass = data.password;
        if (!roomRematchStates[pass]) roomRematchStates[pass] = new Set();
        if (roomRematchStates[pass].has(socket.id)) {
            roomRematchStates[pass].delete(socket.id);
            socket.to(pass).emit("rematch-canceled");
        } else {
            roomRematchStates[pass].add(socket.id);
            socket.to(pass).emit("rematch-offered");
            if (roomRematchStates[pass].size === 2) {
                delete roomRematchStates[pass];
                io.in(pass).emit("rematch-start");
            }
        }
    });

    socket.on("disconnecting", () => {
        socket.rooms.forEach(p => {
            if (rooms[p]) {
                if (socket.id === rooms[p].players.white || socket.id === rooms[p].players.black) {
                    delete rooms[p];
                    io.emit("lobby-update", getActiveRooms());
                } else {
                    rooms[p].spectators = rooms[p].spectators.filter(s => s.socketId !== socket.id);
                }
            }
        });
    });
});

http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
