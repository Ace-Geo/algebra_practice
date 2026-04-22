const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require("socket.io")(http, { cors: { origin: "*" } });

const rooms = {}; 

io.on("connection", (socket) => {
    socket.on("create-room", (data) => {
        socket.join(data.password);
        rooms[data.password] = {
            creatorId: socket.id,
            creatorName: data.name,
            whiteName: data.name, // Default creator to white for simplicity
            blackName: null
        };
        console.log(`Room created: ${data.password}`);
    });

    socket.on("join-attempt", (data) => {
        const room = rooms[data.password];
        if (room) {
            socket.join(data.password);
            room.blackName = data.name;
            
            // Tell the creator they are White
            io.to(room.creatorId).emit("assign-color", "white");
            // Tell the joiner they are Black
            socket.emit("assign-color", "black");
            
            // Start game for both
            io.to(data.password).emit("game-start", {
                whiteName: room.whiteName,
                blackName: room.blackName
            });
        }
    });

    socket.on("send-move", (data) => {
        socket.to(data.password).emit("receive-move", data);
    });
});

http.listen(process.env.PORT || 3000, () => console.log("Server Active"));
