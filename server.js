const express = require('express');
const http = require('http').createServer(express());
const io = require("socket.io")(http, { cors: { origin: "*" } });

const roomSettings = {}; 

io.on("connection", (socket) => {
    socket.on("create-room", (data) => {
        socket.join(data.password);
        let color = data.preferredColor === 'random' ? (Math.random() > 0.5 ? 'white' : 'black') : data.preferredColor;
        roomSettings[data.password] = { 
            mins: data.mins, secs: data.secs, inc: data.inc, 
            whiteName: color==='white'?data.name:null, blackName: color==='black'?data.name:null,
            creatorColor: color, creatorId: socket.id 
        };
        socket.emit("waiting-for-opponent");
    });

    socket.on("join-attempt", (data) => {
        const s = roomSettings[data.password];
        if (s) socket.emit("confirm-settings", { creatorName: s.whiteName || s.blackName });
    });

    socket.on("join-confirmed", (data) => {
        const s = roomSettings[data.password];
        socket.join(data.password);
        const joinerColor = s.creatorColor === 'white' ? 'black' : 'white';
        if (joinerColor === 'white') s.whiteName = data.name; else s.blackName = data.name;
        io.to(data.password).emit("game-start", { settings: s, whiteName: s.whiteName, blackName: s.blackName });
        socket.emit("assign-color", joinerColor);
        io.to(s.creatorId).emit("assign-color", s.creatorColor);
    });

    socket.on("send-move", (d) => socket.to(d.password).emit("receive-move", d));
});

http.listen(process.env.PORT || 3000);
