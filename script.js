const socket = io("https://algebra-but-better.onrender.com");

// --- PERSISTENT STATE ---
let myColor = null;
let currentPassword = null;
let tempName = "";
let whiteName = "White";
let blackName = "Black";
let boardState = [];
let currentTurn = 'white';
let isAdmin = false;
let isPaused = false;
let isGameOver = false;
let isInfinite = false;
let whiteTime = 0;
let blackTime = 0;
let increment = 0;
let hasMoved = {};
let moveHistory = [];
let selected = null;
let enPassantTarget = null;
let gameSettings = null;
let keyBuffer = "";

// --- MODULE 1: PERSISTENT CHAT ---
// This function runs ONCE to build the shell
function initChatUI() {
    if (document.getElementById('chat-panel')) return;
    const layout = document.getElementById('main-layout');
    
    const chatPanel = document.createElement('div');
    chatPanel.id = 'chat-panel';
    chatPanel.innerHTML = `
        <div id="chat-header">GAME CHAT</div>
        <div id="chat-messages"></div>
        <div id="chat-input-area">
            <input type="text" id="chat-input" placeholder="Type a message..." autocomplete="off">
            <button id="chat-send-btn">Send</button>
        </div>
    `;
    layout.appendChild(chatPanel);

    const inp = document.getElementById('chat-input');
    // Prevent board hotkeys from triggering while typing
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    inp.onkeypress = (e) => { if (e.key === 'Enter') sendChatMessage(); };
    document.getElementById('chat-send-btn').onclick = sendChatMessage;
}

function appendChatMessage(sender, message, isSystem = false) {
    const msgCont = document.getElementById('chat-messages');
    if (!msgCont) return;
    const div = document.createElement('div');
    div.className = isSystem ? 'chat-msg system' : 'chat-msg';
    div.innerHTML = isSystem ? message : `<b>${sender}:</b> ${message}`;
    msgCont.appendChild(div);
    msgCont.scrollTop = msgCont.scrollHeight;
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    // LOCAL COMMAND INTERCEPTOR (Bypasses Socket)
    if (msg.startsWith("/") && isAdmin) {
        const lower = msg.toLowerCase();
        const parts = lower.split(" ");
        
        if (parts[0] === "/help") {
            appendChatMessage("Console", "--- ADMIN COMMANDS ---", true);
            appendChatMessage("Console", "/pause <true/false> - Stop clocks", true);
            appendChatMessage("Console", "/time <white/black> <m> <s> - Set time", true);
        } else if (parts[0] === "/pause") {
            const state = parts[1] === "true";
            socket.emit("admin-pause-toggle", { password: currentPassword, isPaused: state });
        } else if (parts[0] === "/time") {
            const color = parts[1];
            const m = parseInt(parts[2]);
            const s = parseInt(parts[3]);
            if (!isNaN(m) && !isNaN(s)) {
                socket.emit("admin-set-time", { password: currentPassword, color: color, newTime: (m * 60) + s });
            }
        }
        input.value = '';
        return;
    }

    if (!currentPassword) return;
    socket.emit("send-chat", { password: currentPassword, message: msg, senderName: (myColor === 'white' ? whiteName : blackName) });
    appendChatMessage("You", msg);
    input.value = '';
}

// --- MODULE 2: INDEPENDENT BOARD ---
function renderBoard() {
    let gameArea = document.getElementById('game-area');
    if (!gameArea) {
        gameArea = document.createElement('div');
        gameArea.id = 'game-area';
        const side = document.getElementById('side-panel');
        document.getElementById('main-layout').insertBefore(gameArea, side);
    }

    const check = isTeamInCheck(currentTurn, boardState);
    let hints = (selected && !isGameOver) ? getLegalMoves(currentTurn).filter(m => m.from.r === selected.r && m.from.c === selected.c).map(m => m.to) : [];
    const range = (myColor === 'black') ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

    let html = `<div class="player-bar"><span>${myColor === 'black' ? whiteName : blackName}</span><div id="timer-${myColor === 'black' ? 'white' : 'black'}" class="timer"></div></div>`;
    html += `<div id="board-container"><div id="board">`;
    
    for (let r of range) {
        for (let c of range) {
            const piece = boardState[r][c];
            const isKingCheck = check && piece === (currentTurn === 'white' ? '♔' : '♚');
            const isSel = selected && selected.r === r && selected.c === c;
            const hint = hints.find(h => h.r === r && h.c === c);
            
            html += `<div class="square ${(r+c)%2===0?'white-sq':'black-sq'} ${isKingCheck?'king-check':''} ${isSel?'selected':''}" onclick="handleSquareClick(${r},${c})">`;
            if (hint) html += `<div class="${piece===''?'hint-dot':'hint-capture'}"></div>`;
            if (piece !== '') html += `<span class="piece ${isWhite(piece)?'w-piece':'b-piece'}">${piece}</span>`;
            html += `</div>`;
        }
    }
    
    html += `</div></div>`;
    html += `<div class="player-bar"><span>${myColor === 'white' ? whiteName : blackName} (YOU)</span><div id="timer-${myColor}" class="timer"></div></div>`;
    gameArea.innerHTML = html;
    updateTimerDisplay();
}

// --- MODULE 3: ENGINE LOGIC ---
function handleSquareClick(r, c) {
    if (isGameOver || currentTurn !== myColor) return;
    if (selected) {
        const moves = getLegalMoves(currentTurn).filter(m => m.from.r === selected.r && m.from.c === selected.c);
        if (moves.some(m => m.to.r === r && m.to.c === c)) {
            handleActualMove(selected, { r, c }, true);
            return;
        }
    }
    if (getTeam(boardState[r][c]) === currentTurn) {
        selected = { r, c };
    } else {
        selected = null;
    }
    renderBoard();
}

function handleActualMove(from, to, isLocal) {
    const piece = boardState[from.r][from.c];
    const team = currentTurn;
    
    // Castling
    if ((piece === '♔' || piece === '♚') && Math.abs(from.c - to.c) === 2) {
        const rC = to.c === 6 ? 7 : 0;
        const nC = to.c === 6 ? 5 : 3;
        boardState[from.r][nC] = boardState[from.r][rC];
        boardState[from.r][rC] = '';
    }

    // En Passant
    if ((piece === '♙' || piece === '♟') && enPassantTarget && to.r === enPassantTarget.r && to.c === enPassantTarget.c) {
        boardState[from.r][to.c] = '';
    }

    boardState[to.r][to.c] = piece;
    boardState[from.r][from.c] = '';
    
    // Promotion
    if (piece === '♙' && to.r === 0) boardState[to.r][to.c] = '♕';
    if (piece === '♟' && to.r === 7) boardState[to.r][to.c] = '♛';

    if (isLocal) {
        if (team === 'white') whiteTime += increment; else blackTime += increment;
        socket.emit("send-move", { password: currentPassword, move: { from, to }, whiteTime, blackTime });
    }

    enPassantTarget = (piece === '♙' || piece === '♟') && Math.abs(from.r - to.r) === 2 ? { r: (from.r + to.r) / 2, c: to.c } : null;
    hasMoved[`${from.r},${from.c}`] = true;
    currentTurn = (team === 'white' ? 'black' : 'white');
    selected = null;

    if (getLegalMoves(currentTurn).length === 0) {
        isGameOver = true;
        const msg = isTeamInCheck(currentTurn, boardState) ? `CHECKMATE: ${team.toUpperCase()} WINS` : "STALEMATE";
        appendChatMessage("System", msg, true);
    }
    renderBoard();
}

// --- SYSTEM BOOT ---
function initGameState() {
    boardState = [
        ['♜','♞','♝','♛','♚','♝','♞','♜'],['♟','♟','♟','♟','♟','♟','♟','♟'],
        ['','','','','','','',''],['','','','','','','',''],
        ['','','','','','','',''],['','','','','','','',''],
        ['♙','♙','♙','♙','♙','♙','♙','♙'],['♖','♘','♗','♕','♔','♗','♘','♖']
    ];
    currentTurn = 'white';
    isGameOver = false;
    
    if (gameSettings) {
        whiteTime = (parseInt(gameSettings.mins) * 60) + parseInt(gameSettings.secs);
        blackTime = whiteTime;
        increment = parseInt(gameSettings.inc) || 0;
        isInfinite = (whiteTime === 0);
    }
    
    // Static Layout Build
    document.getElementById('main-layout').innerHTML = '<div id="side-panel"></div>';
    initChatUI();
    
    if (window.timerIdx) clearInterval(window.timerIdx);
    if (!isInfinite) {
        window.timerIdx = setInterval(() => {
            if (isGameOver || isPaused) return;
            if (currentTurn === 'white') whiteTime--; else blackTime--;
            updateTimerDisplay();
            if (whiteTime <= 0 || blackTime <= 0) {
                isGameOver = true;
                appendChatMessage("System", "TIME OUT", true);
            }
        }, 1000);
    }
    renderBoard();
}

function updateTimerDisplay() {
    const w = document.getElementById('timer-white');
    const b = document.getElementById('timer-black');
    if (w) { w.textContent = formatTime(whiteTime); w.className = `timer ${currentTurn==='white'?'active':''}`; }
    if (b) { b.textContent = formatTime(blackTime); b.className = `timer ${currentTurn==='black'?'active':''}`; }
}

function formatTime(s) {
    if (isInfinite) return "∞";
    const sec = Math.max(0, s);
    return `${Math.floor(sec/60)}:${(sec%60).toString().padStart(2,'0')}`;
}

// --- SOCKET EVENTS ---
socket.on("player-assignment", (data) => {
    myColor = data.color; gameSettings = data.settings;
    const overlay = document.getElementById('setup-overlay');
    if (overlay) overlay.remove();
    initGameState();
});
socket.on("receive-move", (data) => { 
    whiteTime = data.whiteTime; 
    blackTime = data.blackTime; 
    handleActualMove(data.move.from, data.move.to, false); 
});
socket.on("receive-chat", (data) => appendChatMessage(data.sender, data.message));
socket.on("pause-state-updated", (data) => { 
    isPaused = data.isPaused; 
    appendChatMessage("Console", isPaused ? "Game Paused" : "Game Resumed", true); 
});
socket.on("time-updated", (data) => {
    if (data.color === 'white') whiteTime = data.newTime; else blackTime = data.newTime;
    updateTimerDisplay();
});

// --- CHESS UTILS ---
const isWhite = (p) => ['♖','♘','♗','♕','♔','♙'].includes(p);
const getTeam = (p) => p===''?null:(isWhite(p)?'white':'black');
function canMoveTo(fR, fC, tR, tC, p, b) {
    const dr = tR - fR, dc = tC - fC, adr = Math.abs(dr), adc = Math.abs(dc), team = getTeam(p);
    if (b[tR][tC] !== '' && getTeam(b[tR][tC]) === team) return false;
    const path = (r1, c1, r2, c2) => {
        const sr = r2===r1?0:(r2-r1)/Math.abs(r2-r1), sc = c2===c1?0:(c2-c1)/Math.abs(c2-c1);
        let currR = r1+sr, currC = c1+sc;
        while(currR!==r2 || currC!==c2) { if(b[currR][currC]!=='') return false; currR+=sr; currC+=sc; }
        return true;
    };
    if (p==='♙'||p==='♟') {
        const dir = team==='white'?-1:1;
        if (dc===0 && b[tR][tC]==='') {
            if (dr===dir) return true;
            if (dr===2*dir && fR===(team==='white'?6:1) && b[fR+dir][fC]==='') return true;
        }
        if (adc===1 && dr===dir) {
            if (b[tR][tC] !== '') return true;
            if (enPassantTarget && enPassantTarget.r===tR && enPassantTarget.c===tC) return true;
        }
        return false;
    }
    if (p==='♖'||p==='♜') return (dr===0 || dc===0) && path(fR, fC, tR, tC);
    if (p==='♘'||p==='♞') return (adr===2 && adc===1) || (adr===1 && adc===2);
    if (p==='♗'||p==='♝') return adr===adc && path(fR, fC, tR, tC);
    if (p==='♕'||p==='♛') return (adr===adc || dr===0 || dc===0) && path(fR, fC, tR, tC);
    if (p==='♔'||p==='♚') {
        if (adc===2 && !hasMoved[`${fR},${fC}`]) return path(fR, fC, fR, tC===6?7:0);
        return adr<=1 && adc<=1;
    }
    return false;
}
function isTeamInCheck(t, b) {
    let k; for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(b[r][c]===(t==='white'?'♔':'♚')) k={r,c};
    if(!k) return false;
    const opp = t==='white'?'black':'white';
    for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(getTeam(b[r][c])===opp) if(canMoveTo(r,c,k.r,k.c,b[r][c],b)) return true;
    return false;
}
function getLegalMoves(t) {
    let m = [];
    for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
        if(getTeam(boardState[r][c])===t) {
            for(let tr=0;tr<8;tr++) for(let tc=0;tc<8;tc++) {
                if(canMoveTo(r,c,tr,tc,boardState[r][c],boardState)) {
                    const nb = boardState.map(row=>[...row]); nb[tr][tc]=boardState[r][c]; nb[r][c]='';
                    if(!isTeamInCheck(t, nb)) m.push({from:{r,c},to:{r:tr,c:tc}});
                }
            }
        }
    }
    return m;
}

// --- SETUP SCREEN ---
function showSetup() {
    const overlay = document.createElement('div'); overlay.id = 'setup-overlay';
    overlay.innerHTML = `<div class="setup-card">
        <h2 style="color:#779556">Chess Lobby</h2>
        <input id="roomPass" placeholder="Room Password">
        <input id="uName" placeholder="Your Name" value="Player">
        <button class="start-btn" onclick="createRoom()">Create Room</button>
        <button class="action-btn" onclick="joinRoom()">Join Room</button>
    </div>`;
    document.body.appendChild(overlay);
}
function createRoom() {
    currentPassword = document.getElementById('roomPass').value;
    tempName = document.getElementById('uName').value;
    socket.emit("create-room", { password: currentPassword, name: tempName, mins: 10, secs: 0, inc: 0, colorPref: 'white' });
}
function joinRoom() {
    currentPassword = document.getElementById('roomPass').value;
    tempName = document.getElementById('uName').value;
    socket.emit("join-attempt", { password: currentPassword });
}
socket.on("preview-settings", () => socket.emit("confirm-join", { password: currentPassword, name: tempName }));

// --- ADMIN ACTIVATION ---
window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    keyBuffer += e.key; if(keyBuffer.length > 2) keyBuffer = keyBuffer.slice(-2);
    if(keyBuffer === "[]") { isAdmin = true; appendChatMessage("Console", "ADMIN ENABLED", true); }
});

window.onload = showSetup;
