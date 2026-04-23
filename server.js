const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require("socket.io")(http, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

const rooms = {}; 
const roomRematchStates = {}; 

io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

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
            players: { white: null, black: null }
        };
        socket.emit("room-created", { password });
    });

    socket.on("join-attempt", (data) => {
        const { password } = data;
        const room = rooms[password];
        if (!room) {
            socket.emit("error-msg", "Room not found.");
            return;
        }
        if (room.status !== "waiting") {
            socket.emit("error-msg", "Room is already in progress.");
            return;
        }
        socket.emit("preview-settings", {
            settings: room.settings,
            creatorName: room.creatorName,
            creatorColorPref: room.settings.colorPref
        });
    });

    socket.on("confirm-join", (data) => {
        const { password, name } = data;
        const room = rooms[password];
        if (!room || room.status !== "waiting") return;

        socket.join(password);
        room.status = "playing";

        let creatorColor, joinerColor;
        const pref = room.settings.colorPref;

        if (pref === 'white') {
            creatorColor = 'white';
            joinerColor = 'black';
        } else if (pref === 'black') {
            creatorColor = 'black';
            joinerColor = 'white';
        } else {
            creatorColor = Math.random() < 0.5 ? 'white' : 'black';
            joinerColor = creatorColor === 'white' ? 'black' : 'white';
        }

        room.players[creatorColor] = room.creatorId;
        room.players[joinerColor] = socket.id;

        // Tell creator their assignment
        io.to(room.creatorId).emit("player-assignment", {
            color: creatorColor,
            settings: room.settings,
            oppName: name
        });

        // Tell joiner their assignment
        socket.emit("player-assignment", {
            color: joinerColor,
            settings: room.settings,
            oppName: room.creatorName
        });
    });

    socket.on("send-move", (data) => {
        // Broadcast move and synchronized times to the opponent
        socket.to(data.password).emit("receive-move", {
            move: data.move,
            whiteTime: data.whiteTime,
            blackTime: data.blackTime
        });
    });

    socket.on("send-chat", (data) => {
        socket.to(data.password).emit("receive-chat", {
            sender: data.senderName,
            message: data.message
        });
    });

    // --- ADMIN COMMAND HANDLERS ---

    socket.on("admin-pause-toggle", (data) => {
        io.in(data.password).emit("pause-state-updated", {
            isPaused: data.isPaused
        });
    });

    socket.on("admin-set-time", (data) => {
        io.in(data.password).emit("time-updated", {
            color: data.color,
            newTime: data.newTime
        });
    });

    socket.on("admin-place-piece", (data) => {
        // Broadcast the specific piece placement to everyone in the room
        io.in(data.password).emit("piece-placed", {
            r: data.r,
            c: data.c,
            piece: data.piece
        });
    });

    // --- GAME ACTIONS ---

    socket.on("resign", (data) => {
        socket.to(data.password).emit("opponent-resigned", { winner: data.winner });
    });

    socket.on("offer-draw", (data) => {
        socket.to(data.password).emit("draw-offered");
    });

    socket.on("draw-response", (data) => {
        io.in(data.password).emit("draw-resolved", { accepted: data.accepted });
    });

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

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
        // Clean up rooms if necessary
        for (const pass in rooms) {
            if (rooms[pass].creatorId === socket.id && rooms[pass].status === "waiting") {
                delete rooms[pass];
            }
        }
    });
});

http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
