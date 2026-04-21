const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require("socket.io")(http, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

io.on("connection", (socket) => {
    socket.on("join-room", (roomId) => socket.join(roomId));
    socket.on("send-move", (data) => {
        socket.to(data.roomId).emit("receive-move", data.move);
    });
});

http.listen(PORT, () => console.log(`Server listening on ${PORT}`));
