const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require("socket.io")(http, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

io.on("connection", (socket) => {
    socket.on("join-room", (password) => {
        const room = io.sockets.adapter.rooms.get(password);
        const numClients = room ? room.size : 0;

        if (numClients < 2) {
            socket.join(password);
            // If 0 people were there, you are player 1 (White). 
            // If 1 person was there, you are player 2 (Black).
            const assignedColor = (numClients === 0) ? "white" : "black";
            socket.emit("player-assignment", assignedColor);
            console.log(`User joined room ${password} as ${assignedColor}`);
        } else {
            socket.emit("error-msg", "Room is full!");
        }
    });

    socket.on("send-move", (data) => {
        // Sends move to the other person in the same password room
        socket.to(data.password).emit("receive-move", data.move);
    });
});

http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
