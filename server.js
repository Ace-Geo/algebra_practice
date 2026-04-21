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
            // First person is white, second person is black
            const assignedColor = (numClients === 0) ? "white" : "black";
            socket.emit("player-assignment", assignedColor);
        } else {
            socket.emit("error-msg", "This room is full! Try a different password.");
        }
    });

    socket.on("send-move", (data) => {
        // Send move only to the person in the same password room
        socket.to(data.password).emit("receive-move", data.move);
    });
});

http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
