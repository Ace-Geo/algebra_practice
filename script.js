const socket = io("https://algebra-but-better.onrender.com");

let myColor = null;
let currentPassword = null;
let tempName = "";
let whiteName = "White";
let blackName = "Black";
let isSpectator = false;
let spectatorId = null;
let boardFlipped = false;

let boardState;
let currentTurn;
let hasMoved;
let enPassantTarget;
let selected;
let isGameOver;
let isInfinite;

let whiteTime;
let blackTime;
let increment;
let moveHistory = [];
let rematchRequested = false;
let gameSettings = null;

// --- ADMIN & COMMAND STATE ---
let isAdmin = false;
let isPaused = false;
let keyBuffer = "";
// Tracks admin status for everyone in the room for the /admin list command
let adminSyncData = { white: false, black: false, spectators: [] };

// --- SOCKET LISTENERS ---

socket.on("lobby-update", (rooms) => {
    if (document.getElementById('spectator-list')) {
        renderSpectatorLobby(rooms);
    }
});

socket.on("player-assignment", (data) => {
    myColor = data.color;
    gameSettings = data.settings;
    
    if (myColor === 'spectator') {
        isSpectator = true;
        spectatorId = data.spectatorId;
        whiteName = data.whiteName || "White";
        blackName = data.blackName || "Black";
    } else if (myColor === 'white') {
        whiteName = tempName || "White";
        blackName = data.oppName;
    } else {
        blackName = tempName || "Black";
        whiteName = data.oppName;
    }
    
    const overlay = document.getElementById('setup-overlay');
    if (overlay) overlay.remove();
    
    initGameState();
    const roleMsg = isSpectator ? `Spectator #${spectatorId}` : myColor.toUpperCase();
    appendChatMessage("System", `Joined as ${roleMsg}.`, true);
});

socket.on("admin-list-sync", (data) => {
    adminSyncData = data;
});

socket.on("permission-updated", (data) => {
    isAdmin = data.isAdmin;
    appendChatMessage("Console", `Your admin permissions have been ${isAdmin ? 'granted' : 'removed'}.`, true);
});

socket.on("room-created", (data) => {
    const card = document.querySelector('.setup-card');
    card.innerHTML = `
        <h2 style="color: #779556">Room Created</h2>
        <p>Waiting for opponent...</p>
        <div style="background: #1a1a1a; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <span style="color: #bababa; font-size: 12px; display: block; margin-bottom: 5px;">ROOM PASSWORD</span>
            <strong style="font-size: 24px; letter-spacing: 2px;">${data.password}</strong>
        </div>
        <button class="action-btn" onclick="location.reload()">Cancel</button>
    `;
});

socket.on("preview-settings", (data) => {
    const card = document.querySelector('.setup-card');
    const s = data.settings;
    
    if (data.isSpectator) {
        card.innerHTML = `
            <h2 style="color: #779556">Spectate Game</h2>
            <div style="text-align: left; margin-bottom: 20px; background: #1a1a1a; padding: 15px; border-radius: 8px;">
                <p><strong>Host:</strong> ${data.creatorName}</p>
                <p><strong>Time:</strong> ${s.mins}m + ${s.inc}s</p>
            </div>
            <div class="input-group"><label>Your Username</label><input id="specName" value="Spectator"></div>
            <button class="start-btn" onclick="confirmSpectate('${data.password}')">JOIN AS SPECTATOR</button>
            <button class="action-btn" style="margin-top: 10px; width: 100%;" onclick="location.reload()">Back</button>
        `;
    } else {
        let displayColor = "RANDOM";
        if (data.creatorColorPref === 'white') displayColor = "BLACK";
        if (data.creatorColorPref === 'black') displayColor = "WHITE";

        card.innerHTML = `
            <h2 style="color: #779556">Join Room?</h2>
            <div style="text-align: left; margin-bottom: 20px; background: #1a1a1a; padding: 15px; border-radius: 8px;">
                <p><strong>Host:</strong> ${data.creatorName}</p>
                <p><strong>Time:</strong> ${s.mins}m ${s.secs}s</p>
                <p><strong>Increment:</strong> ${s.inc}s</p>
                <p><strong>Your Side:</strong> ${displayColor}</p>
            </div>
            <button class="start-btn" onclick="confirmJoin()">CONFIRM & START</button>
            <button class="action-btn" style="margin-top: 10px; width: 100%;" onclick="location.reload()">Back</button>
        `;
    }
});

socket.on("receive-move", (data) => {
    whiteTime = data.whiteTime;
    blackTime = data.blackTime;
    handleActualMove(data.move.from, data.move.to, false);
});

socket.on("receive-chat", (data) => { appendChatMessage(data.sender, data.message); });

socket.on("pause-state-updated", (data) => {
    isPaused = data.isPaused;
    if (window.chessIntervalInstance) clearInterval(window.chessIntervalInstance);
    if (!isPaused && !isGameOver && !isInfinite) startTimer();
    appendChatMessage("Console", isPaused ? "Game Paused by Admin" : "Game Resumed by Admin", true);
    render(); 
});

socket.on("time-updated", (data) => {
    if (data.color === 'white') whiteTime = data.newTime;
    else blackTime = data.newTime;
    updateTimerDisplay();
    appendChatMessage("Console", `${data.color.toUpperCase()} time set to ${formatTime(data.newTime)}`, true);
});

socket.on("increment-updated", (data) => {
    increment = data.newInc;
    appendChatMessage("Console", `Increment set to ${increment}s`, true);
});

socket.on("piece-placed", (data) => {
    boardState[data.r][data.c] = data.piece;
    render();
    appendChatMessage("Console", "Board modified by Admin", true);
});

socket.on("board-reset-triggered", () => {
    resetBoardStateOnly();
    render();
    appendChatMessage("Console", "Board reset by Admin", true);
});

socket.on("opponent-resigned", (data) => {
    const status = `${data.winner.toUpperCase()} WINS BY RESIGNATION`;
    isGameOver = true;
    if (window.chessIntervalInstance) clearInterval(window.chessIntervalInstance);
    showResultModal(status);
    render(status);
});

socket.on("draw-offered", () => { if (!isSpectator) showDrawOffer(); });

socket.on("draw-resolved", (data) => {
    if (data.accepted) {
        const status = "GAME DRAWN BY AGREEMENT";
        isGameOver = true;
        if (window.chessIntervalInstance) clearInterval(window.chessIntervalInstance);
        showResultModal(status);
        render(status);
    } else {
        showStatusMessage("Draw offer declined");
    }
});

socket.on("rematch-offered", () => {
    const btn = document.getElementById('rematch-btn');
    if (btn) { btn.innerText = "Accept Rematch"; btn.classList.add('rematch-ready'); }
});

socket.on("rematch-canceled", () => {
    const btn = document.getElementById('rematch-btn');
    if (btn) { btn.innerText = "Request Rematch"; btn.classList.remove('rematch-ready'); }
});

socket.on("rematch-start", () => {
    if (isSpectator) { initGameState(); return; }
    rematchRequested = false;
    myColor = (myColor === 'white' ? 'black' : 'white');
    let oldWhite = whiteName; whiteName = blackName; blackName = oldWhite;
    document.getElementById('game-over-overlay')?.remove();
    document.getElementById('reopen-results-btn')?.remove();
    initGameState();
});

socket.on("error-msg", (msg) => { alert(msg); });

// --- CHAT & COMMAND HANDLERS ---

function appendChatMessage(sender, message, isSystem = false) {
    const msgContainer = document.getElementById('chat-messages');
    if (!msgContainer) return;
    const div = document.createElement('div');
    div.className = isSystem ? 'chat-msg system' : 'chat-msg';
    div.innerHTML = isSystem ? message : `<b>${sender}:</b> ${message}`;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg || !currentPassword) return;

    if (msg.startsWith("/") && isAdmin) {
        handleAdminCommand(msg);
        input.value = '';
        return;
    }

    let myName = (myColor === 'white' ? whiteName : blackName);
    if (isSpectator) myName = `${tempName} (spectator)`;

    socket.emit("send-chat", { password: currentPassword, message: msg, senderName: myName });
    appendChatMessage("You", msg);
    input.value = '';
}

const COMMANDS_HELP = {
    "pause": { desc: "Pauses/resumes clocks.", usage: "/pause <true/false>" },
    "time": { desc: "Sets player time.", usage: "/time <white/black> <min> <sec>" },
    "increment": { desc: "Sets increment.", usage: "/increment <sec>" },
    "place": { desc: "Places piece.", usage: "/place <sq> <color> <piece>" },
    "reset": { desc: "Resets pieces.", usage: "/reset" },
    "admin": { desc: "Lists statuses or toggles permission.", usage: "/admin <list or Color/ID> <true/false>" },
    "help": { desc: "Shows commands.", usage: "/help <cmd>" }
};

function handleAdminCommand(cmd) {
    const args = cmd.split(' ');
    const baseCmd = args[0].toLowerCase().substring(1);

    if (baseCmd === "help") {
        appendChatMessage("Console", "Available Commands:", true);
        for (const k in COMMANDS_HELP) appendChatMessage("Console", `/${k} - ${COMMANDS_HELP[k].desc}`, true);
    } 
    else if (baseCmd === "admin") {
        const target = args[1]?.toLowerCase();
        if (target === "list") {
            let list = `<b>Players:</b><br>White (${whiteName}): Admin=${adminSyncData.white}<br>Black (${blackName}): Admin=${adminSyncData.black}<br><b>Spectators:</b>`;
            if (adminSyncData.spectators.length === 0) list += "<br>None";
            adminSyncData.spectators.forEach(s => {
                list += `<br>Spectator ${s.id} (${s.name}): Admin=${s.isAdmin}`;
            });
            appendChatMessage("Console", list, true);
        } else if (target && (args[2] === "true" || args[2] === "false")) {
            socket.emit("admin-permission-toggle", { password: currentPassword, target: target, isAdmin: args[2] === 'true' });
        } else {
            appendChatMessage("Console", `Usage: ${COMMANDS_HELP.admin.usage}`, true);
        }
    }
    else if (baseCmd === "pause") {
        socket.emit("admin-pause-toggle", { password: currentPassword, isPaused: args[1] === "true" });
    }
    else if (baseCmd === "time") {
        const t = (parseInt(args[2]) * 60) + parseInt(args[3]);
        socket.emit("admin-set-time", { password: currentPassword, color: args[1], newTime: t });
    }
    else if (baseCmd === "increment") {
        socket.emit("admin-set-increment", { password: currentPassword, newInc: parseInt(args[1]) });
    }
    else if (baseCmd === "reset") {
        socket.emit("admin-reset-board", { password: currentPassword });
    }
    else if (baseCmd === "place") {
        // [Place logic same as before, emits admin-place-piece]
    }
}
// --- LOBBY & SPECTATOR UI ---

window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    keyBuffer += e.key;
    if (keyBuffer.length > 2) keyBuffer = keyBuffer.slice(-2);
    if (keyBuffer === "[]") {
        if (!currentPassword) {
            const card = document.querySelector('.setup-card');
            if (card && !document.getElementById('spectator-list')) {
                const listDiv = document.createElement('div');
                listDiv.id = 'spectator-list';
                listDiv.style.marginTop = '20px';
                card.appendChild(listDiv);
                appendChatMessage("System", "Lobby viewing enabled.", true);
            }
        } else {
            isAdmin = true;
            appendChatMessage("Console", "Admin mode enabled.", true);
        }
        keyBuffer = "";
    }
});

function renderSpectatorLobby(rooms) {
    const container = document.getElementById('spectator-list');
    if (!container) return;
    container.innerHTML = `<hr><h3 style="color:#779556">Active Games</h3>`;
    if (rooms.length === 0) container.innerHTML += `<p style="font-size:12px">No active matches found.</p>`;
    rooms.forEach(r => {
        const item = document.createElement('div');
        item.className = "room-item"; // style this in css for better look
        item.style.padding = "10px"; item.style.background = "#1a1a1a"; item.style.marginBottom = "5px"; item.style.borderRadius = "4px";
        item.innerHTML = `
            <div style="font-size:13px"><b>${r.whiteName}</b> vs <b>${r.blackName}</b></div>
            <div style="font-size:11px; color:#888">${r.settings.mins}m + ${r.settings.inc}s</div>
            <button class="action-btn" style="padding:4px 8px; font-size:11px; margin-top:5px" onclick="spectateGame('${r.password}')">Spectate Match</button>
        `;
        container.appendChild(item);
    });
}

function spectateGame(pass) {
    socket.emit("join-attempt", { password: pass, isSpectator: true });
}

function confirmSpectate(pass) {
    currentPassword = pass;
    tempName = document.getElementById('specName').value;
    socket.emit("confirm-join", { password: pass, name: tempName, isSpectator: true });
}

// --- CORE CHESS LOGIC ---

const isWhite = (piece) => ['♖', '♘', '♗', '♕', '♔', '♙'].includes(piece);
const getTeam = (piece) => piece === '' ? null : (isWhite(piece) ? 'white' : 'black');

// ... [Insert all movement logic: getNotation, canAttackSquare, canMoveTo, isSquareAttacked, isTeamInCheck, getLegalMoves from previous script.js] ...

function handleActualMove(from, to, isLocal) {
    if (isGameOver) return;
    const movingPiece = boardState[from.r][from.c];
    const targetPiece = boardState[to.r][to.c];
    const team = currentTurn;

    // Handle Castling/EP/Promotion...
    const isEP = (movingPiece === '♙' || movingPiece === '♟') && enPassantTarget && enPassantTarget.r === to.r && enPassantTarget.c === to.c;
    if (isEP) boardState[from.r][to.c] = '';
    
    if ((movingPiece === '♔' || movingPiece === '♚') && Math.abs(from.c - to.c) === 2) {
        const rCol = to.c === 6 ? 7 : 0; const nCol = to.c === 6 ? 5 : 3;
        boardState[to.r][nCol] = boardState[to.r][rCol]; boardState[to.r][rCol] = '';
    }

    boardState[to.r][to.c] = movingPiece; boardState[from.r][from.c] = '';
    
    if (movingPiece === '♙' && to.r === 0) boardState[to.r][to.c] = '♕';
    if (movingPiece === '♟' && to.r === 7) boardState[to.r][to.c] = '♛';

    if (!isInfinite && isLocal) { if (team === 'white') whiteTime += increment; else blackTime += increment; }
    
    enPassantTarget = (movingPiece === '♙' || movingPiece === '♟') && Math.abs(from.r - to.r) === 2 ? { r: (from.r + to.r) / 2, c: to.c } : null;
    currentTurn = (team === 'white' ? 'black' : 'white');

    if (isLocal) socket.emit("send-move", { password: currentPassword, move: { from, to }, whiteTime, blackTime });
    render();
}

function render(forcedStatus) {
    const layout = document.getElementById('main-layout'); 
    if (!layout) return;

    // Save Chat
    const chatMsgs = document.getElementById('chat-messages')?.innerHTML || "";
    const chatVal = document.getElementById('chat-input')?.value || "";

    layout.innerHTML = '';
    
    // Add Chat Panel
    const chatPanel = document.createElement('div');
    chatPanel.id = 'chat-panel';
    chatPanel.innerHTML = `
        <div id="chat-header">GAME CHAT</div>
        <div id="chat-messages">${chatMsgs}</div>
        <div id="chat-input-area">
            <input type="text" id="chat-input" placeholder="Type a message..." autocomplete="off">
            <button id="chat-send-btn">Send</button>
        </div>
    `;
    const newInp = chatPanel.querySelector('#chat-input');
    newInp.value = chatVal;
    newInp.addEventListener('keydown', (e) => e.stopPropagation());
    newInp.onkeypress = (e) => { if (e.key === 'Enter') sendChatMessage(); };
    chatPanel.querySelector('#chat-send-btn').onclick = sendChatMessage;
    layout.appendChild(chatPanel);

    // Board View Setup
    const gameArea = document.createElement('div');
    gameArea.id = 'game-area';
    
    // Determine Perspective
    // If boardFlipped is true, we reverse the usual perspective
    let viewAs;
    if (isSpectator) {
        viewAs = boardFlipped ? 'black' : 'white';
    } else {
        viewAs = boardFlipped ? (myColor === 'white' ? 'black' : 'white') : myColor;
    }
    
    const range = (viewAs === 'black') ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];

    const createBar = (name, id) => {
        const bar = document.createElement('div');
        bar.className = 'player-bar';
        bar.innerHTML = `<span class="player-name">${name} ${myColor === id ? '(YOU)' : ''}</span><div id="timer-${id}" class="timer">--:--</div>`;
        return bar;
    };

    if (viewAs === 'black') gameArea.appendChild(createBar(whiteName, 'white'));
    else gameArea.appendChild(createBar(blackName, 'black'));

    const boardEl = document.createElement('div');
    boardEl.id = 'board';
    for (let r of range) {
        for (let c of range) {
            const sq = document.createElement('div');
            sq.className = `square ${(r+c)%2===0 ? 'white-sq' : 'black-sq'}`;
            if (boardState[r][c]) {
                const s = document.createElement('span');
                s.className = `piece ${isWhite(boardState[r][c]) ? 'w-piece' : 'b-piece'}`;
                s.textContent = boardState[r][c];
                sq.appendChild(s);
            }
            sq.onclick = () => {
                if (isSpectator || isGameOver || currentTurn !== myColor) return;
                // [Insert original square selection/move logic]
            };
            boardEl.appendChild(sq);
        }
    }
    const cont = document.createElement('div'); cont.id = 'board-container';
    cont.appendChild(boardEl); gameArea.appendChild(cont);

    if (viewAs === 'black') gameArea.appendChild(createBar(blackName, 'black'));
    else gameArea.appendChild(createBar(whiteName, 'white'));
    layout.appendChild(gameArea);

    // Side Panel
    const side = document.createElement('div');
    side.id = 'side-panel';
    side.innerHTML = `
        <div id="status-box"><div id="status-text">${forcedStatus || currentTurn.toUpperCase() + "'S TURN"}</div></div>
        <div id="notification-area"></div>
        <div class="btn-row"></div>
        <div id="history-container"></div>
    `;
    const btnRow = side.querySelector('.btn-row');
    if (isSpectator) {
        btnRow.innerHTML = `
            <button class="action-btn" onclick="boardFlipped = !boardFlipped; render();">Flip Board</button>
            <button class="action-btn" onclick="location.reload()">Return to Lobby</button>
        `;
    } else {
        btnRow.innerHTML = `
            <button class="action-btn" onclick="offerDraw()">Offer Draw</button>
            <button class="action-btn" onclick="resignGame()">Resign</button>
        `;
    }
    layout.appendChild(side);
    updateTimerDisplay();
}

function resetBoardStateOnly() {
    boardState = [
        ['♜', '♞', '♝', '♛', '♚', '♝', '♞', '♜'], ['♟', '♟', '♟', '♟', '♟', '♟', '♟', '♟'],
        ['', '', '', '', '', '', '', ''], ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''], ['', '', '', '', '', '', '', ''],
        ['♙', '♙', '♙', '♙', '♙', '♙', '♙', '♙'], ['♖', '♘', '♗', '♕', '♔', '♗', '♘', '♖']
    ];
}

// ... [Remaining UI helpers: formatTime, updateTimerDisplay, showSetup, etc. same as before] ...

window.onload = showSetup;
