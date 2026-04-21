const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require("socket.io")(http, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

// This object remembers the settings for every active room password
const roomSettings = {}; 

io.on("connection", (socket) => {
    socket.on("join-room", (data) => {
        const { password, name, mins } = data;
        const room = io.sockets.adapter.rooms.get(password);
        const numClients = room ? room.size : 0;

        if (numClients === 0) {
            // First player (White) sets the rules
            socket.join(password);
            roomSettings[password] = { 
                mins: mins, 
                whiteName: name 
            };
            socket.emit("player-assignment", { 
                color: "white", 
                settings: roomSettings[password] 
            });
            console.log(`Room ${password} created by ${name} with ${mins} mins.`);
        } else if (numClients === 1) {
            // Second player (Black) joins and receives the saved rules
            socket.join(password);
            const settings = roomSettings[password];
            
            socket.emit("player-assignment", { 
                color: "black", 
                settings: settings, 
                blackName: name 
            });
            
            // Notify the White player that an opponent has joined
            socket.to(password).emit("opponent-joined", { blackName: name });
            console.log(`User ${name} joined room ${password} as black.`);
        } else {
            socket.emit("error-msg", "Room is full!");
        }
    });

    socket.on("send-move", (data) => {
        // Send move and current turn's time to keep clocks synced
        socket.to(data.password).emit("receive-move", data);
    });

    socket.on("disconnecting", () => {
        // Optional: Clean up room settings when room is empty
        for (const room of socket.rooms) {
            const clients = io.sockets.adapter.rooms.get(room);
            if (clients && clients.size === 1) delete roomSettings[room];
        }
    });
});

http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
