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

let isAdmin = false;
let isPaused = false;
let keyBuffer = "";
let adminSyncData = { white: false, black: false, spectators: [] };

// --- SOCKET LISTENERS ---

socket.on("lobby-update", (rooms) => {
    const container = document.getElementById('spectator-list');
    if (container) renderSpectatorLobby(rooms);
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
    const roleMsg = isSpectator ? `Spectator #${spectatorId}` : `playing as ${myColor.toUpperCase()}`;
    appendChatMessage("System", `Joined ${roleMsg}.`, true);
});

socket.on("admin-list-sync", (data) => { adminSyncData = data; });

socket.on("permission-updated", (data) => {
    isAdmin = data.isAdmin;
    appendChatMessage("Console", `Admin permissions ${isAdmin ? 'granted' : 'removed'}.`, true);
});

socket.on("room-created", (data) => {
    const card = document.querySelector('.setup-card');
    card.innerHTML = `<h2 style="color: #779556">Room Created</h2><p>Waiting for opponent...</p><div style="background: #1a1a1a; padding: 15px; border-radius: 8px; margin: 20px 0;"><span style="color: #bababa; font-size: 12px; display: block; margin-bottom: 5px;">ROOM PASSWORD</span><strong style="font-size: 24px; letter-spacing: 2px;">${data.password}</strong></div><button class="action-btn" onclick="location.reload()">Cancel</button>`;
});

socket.on("preview-settings", (data) => {
    const card = document.querySelector('.setup-card');
    const s = data.settings;
    if (data.isSpectator) {
        card.innerHTML = `<h2 style="color: #779556">Spectate Game</h2><div style="text-align: left; margin-bottom: 20px; background: #1a1a1a; padding: 15px; border-radius: 8px;"><p><strong>Host:</strong> ${data.creatorName}</p><p><strong>Time:</strong> ${s.mins}m + ${s.inc}s</p></div><div class="input-group"><label>Your Username</label><input id="specName" value="Spectator"></div><button class="start-btn" onclick="confirmSpectate('${data.password}')">JOIN AS SPECTATOR</button><button class="action-btn" style="margin-top: 10px; width: 100%;" onclick="location.reload()">Back</button>`;
    } else {
        let dc = data.creatorColorPref === 'white' ? "BLACK" : (data.creatorColorPref === 'black' ? "WHITE" : "RANDOM");
        card.innerHTML = `<h2 style="color: #779556">Join Room?</h2><div style="text-align: left; margin-bottom: 20px; background: #1a1a1a; padding: 15px; border-radius: 8px;"><p><strong>Host:</strong> ${data.creatorName}</p><p><strong>Time:</strong> ${s.mins}m ${s.secs}s</p><p><strong>Increment:</strong> ${s.inc}s</p><p><strong>Your Side:</strong> ${dc}</p></div><button class="start-btn" onclick="confirmJoin()">CONFIRM & START</button><button class="action-btn" style="margin-top: 10px; width: 100%;" onclick="location.reload()">Back</button>`;
    }
});

socket.on("receive-move", (data) => { whiteTime = data.whiteTime; blackTime = data.blackTime; handleActualMove(data.move.from, data.move.to, false); });
socket.on("receive-chat", (data) => { appendChatMessage(data.sender, data.message); });
socket.on("pause-state-updated", (data) => {
    isPaused = data.isPaused;
    if (window.chessIntervalInstance) clearInterval(window.chessIntervalInstance);
    if (!isPaused && !isGameOver && !isInfinite) startTimer();
    appendChatMessage("Console", isPaused ? "Paused" : "Resumed", true);
    render(); 
});

socket.on("time-updated", (data) => { if (data.color === 'white') whiteTime = data.newTime; else blackTime = data.newTime; updateTimerDisplay(); });
socket.on("increment-updated", (data) => { increment = data.newInc; });
socket.on("piece-placed", (data) => { boardState[data.r][data.c] = data.piece; render(); });
socket.on("board-reset-triggered", () => { initGameState(); });
socket.on("opponent-resigned", (data) => { endGame(`${data.winner.toUpperCase()} WINS BY RESIGNATION`); });
socket.on("draw-offered", () => { if (!isSpectator) showDrawOffer(); });
socket.on("draw-resolved", (data) => { if (data.accepted) endGame("DRAW BY AGREEMENT"); else showStatusMessage("Declined"); });
socket.on("rematch-offered", () => { const b = document.getElementById('rematch-btn'); if (b) { b.innerText = "Accept Rematch"; b.classList.add('rematch-ready'); } });
socket.on("rematch-canceled", () => { const b = document.getElementById('rematch-btn'); if (b) { b.innerText = "Request Rematch"; b.classList.remove('rematch-ready'); } });
socket.on("rematch-start", () => { if (isSpectator) { initGameState(); return; } rematchRequested = false; myColor = (myColor === 'white' ? 'black' : 'white'); let ow = whiteName; whiteName = blackName; blackName = ow; document.getElementById('game-over-overlay')?.remove(); document.getElementById('reopen-results-btn')?.remove(); initGameState(); });
socket.on("error-msg", (m) => alert(m));

// --- CHAT & ADMIN ---

function appendChatMessage(sender, message, isSystem = false) {
    const c = document.getElementById('chat-messages'); if (!c) return;
    const d = document.createElement('div'); d.className = isSystem ? 'chat-msg system' : 'chat-msg';
    d.innerHTML = isSystem ? message : `<b>${sender}:</b> ${message}`;
    c.appendChild(d); c.scrollTop = c.scrollHeight;
}

function sendChatMessage() {
    const i = document.getElementById('chat-input'); const m = i.value.trim();
    if (!m || !currentPassword) return;
    if (m.startsWith("/") && isAdmin) { handleAdminCommand(m); i.value = ''; return; }
    let name = isSpectator ? `${tempName} (spec)` : (myColor === 'white' ? whiteName : blackName);
    socket.emit("send-chat", { password: currentPassword, message: m, senderName: name });
    appendChatMessage("You", m); i.value = '';
}

function handleAdminCommand(cmd) {
    const args = cmd.split(' '); const base = args[0].toLowerCase().substring(1);
    if (base === "admin") {
        if (args[1] === "list") {
            let s = `White: ${adminSyncData.white}, Black: ${adminSyncData.black}<br>Specs: ` + adminSyncData.spectators.map(x => `${x.id}(${x.name}):${x.isAdmin}`).join(", ");
            appendChatMessage("Console", s, true);
        } else if (args[1] && args[2]) {
            socket.emit("admin-permission-toggle", { password: currentPassword, targetColor: args[1], isAdmin: args[2] === 'true' });
        }
    } else if (base === "pause") socket.emit("admin-pause-toggle", { password: currentPassword, isPaused: args[1] === "true" });
    else if (base === "time") socket.emit("admin-set-time", { password: currentPassword, color: args[1], newTime: (parseInt(args[2])*60)+parseInt(args[3]) });
    else if (base === "increment") socket.emit("admin-set-increment", { password: currentPassword, newInc: parseInt(args[1]) });
    else if (base === "reset") socket.emit("admin-reset-board", { password: currentPassword });
    else if (base === "place") {
        const c = args[1].charCodeAt(0)-97, r = 8-parseInt(args[1][1]);
        const p = {white:{p:'♙',r:'♖',n:'♘',b:'♗',q:'♕',k:'♔'},black:{p:'♟',r:'♜',n:'♞',b:'♝',q:'♛',k:'♚'}};
        const piece = p[args[2].toLowerCase()]?.[args[3].toLowerCase()];
        if (piece) socket.emit("admin-place-piece", { password: currentPassword, r, c, piece });
    }
}

// --- LOGIC ---
const isWhite = (p) => ['♖', '♘', '♗', '♕', '♔', '♙'].includes(p);
const getTeam = (p) => p === '' ? null : (isWhite(p) ? 'white' : 'black');
function getNotation(r, c) { return String.fromCharCode(97 + c) + (8 - r); }

function canAttackSquare(fR, fC, tR, tC, b) {
    const p = b[fR][fC]; if (!p) return false;
    const type = p.toLowerCase(), dr = tR-fR, dc = tC-fC, adr = Math.abs(dr), adc = Math.abs(dc);
    if (p === '♙') return dr === -1 && adc === 1;
    if (p === '♟') return dr === 1 && adc === 1;
    if (type === '♖' || type === '♜') { if (dr!==0 && dc!==0) return false; let sr=dr===0?0:dr/adr, sc=dc===0?0:dc/adc; for(let i=1; i<Math.max(adr,adc); i++) if(b[fR+i*sr][fC+i*sc]!=='') return false; return true; }
    if (type === '♘' || type === '♞') return (adr===2 && adc===1) || (adr===1 && adc===2);
    if (type === '♗' || type === '♝') { if (adr!==adc) return false; let sr=dr/adr, sc=dc/adc; for(let i=1; i<adr; i++) if(b[fR+i*sr][fC+i*sc]!=='') return false; return true; }
    if (type === '♕' || type === '♛') { if (dr!==0 && dc!==0 && adr!==adc) return false; let sr=dr===0?0:dr/adr, sc=dc===0?0:dc/adc; for(let i=1; i<Math.max(adr,adc); i++) if(b[fR+i*sr][fC+i*sc]!=='') return false; return true; }
    if (type === '♔' || type === '♚') return adr<=1 && adc<=1;
    return false;
}

function canMoveTo(fR, fC, tR, tC, b, h, m) {
    const p = b[fR][fC], t = b[tR][tC]; if (getTeam(p) === getTeam(t)) return false;
    const dr = tR-fR, dc = tC-fC, adr = Math.abs(dr), adc = Math.abs(dc);
    if (p === '♙' || p === '♟') {
        const dir = p === '♙' ? -1 : 1;
        if (dc === 0) {
            if (dr === dir && t === '') return true;
            if (dr === 2*dir && t === '' && b[fR+dir][fC] === '' && (p==='♙'?fR===6:fR===1)) return true;
        } else if (adc === 1 && dr === dir) {
            if (t !== '' || (enPassantTarget && enPassantTarget.r === tR && enPassantTarget.c === tC)) return true;
        }
        return false;
    }
    if ((p==='♔'||p==='♚') && adr===0 && adc===2) {
        if (isSquareAttacked(fR, fC, getTeam(p)==='white'?'black':'white', b)) return false;
        let rookCol = tC === 6 ? 7 : 0;
        if (m[getNotation(fR, rookCol)] || b[fR][rookCol].toLowerCase() !== (p==='♔'?'♖':'♜')) return false;
        if (tC === 6) { if(b[fR][5]!==''||b[fR][6]!=='') return false; if(isSquareAttacked(fR, 5, getTeam(p)==='white'?'black':'white', b)) return false; }
        else { if(b[fR][1]!==''||b[fR][2]!==''||b[fR][3]!=='') return false; if(isSquareAttacked(fR, 3, getTeam(p)==='white'?'black':'white', b)) return false; }
        return true;
    }
    return canAttackSquare(fR, fC, tR, tC, b);
}

function isSquareAttacked(r, c, col, b) { for(let i=0; i<8; i++) for(let j=0; j<8; j++) if(getTeam(b[i][j])===col && canAttackSquare(i,j,r,c,b)) return true; return false; }
function isTeamInCheck(team, b) { let kr, kc, king=team==='white'?'♔':'♚'; for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(b[r][c]===king){kr=r;kc=c;break;} return isSquareAttacked(kr,kc,team==='white'?'black':'white',b); }
function getLegalMoves(r, c, b, h, m) {
    const moves = [];
    for(let tr=0; tr<8; tr++) for(let tc=0; tc<8; tc++) {
        if (canMoveTo(r,c,tr,tc,b,h,m)) {
            const nb = b.map(row => [...row]); const p = nb[r][c];
            if ((p==='♙'||p==='♟') && enPassantTarget && enPassantTarget.r===tr && enPassantTarget.c===tc) nb[r][tc] = '';
            nb[tr][tc] = p; nb[r][c] = '';
            if (!isTeamInCheck(getTeam(p), nb)) moves.push({r:tr, c:tc});
        }
    }
    return moves;
}

function handleActualMove(f, t, local) {
    if (isGameOver) return;
    const p = boardState[f.r][f.c], team = currentTurn;
    if ((p==='♙'||p==='♟') && enPassantTarget && enPassantTarget.r===t.r && enPassantTarget.c===t.c) boardState[f.r][t.c] = '';
    if ((p==='♔'||p==='♚') && Math.abs(f.c-t.c) === 2) {
        let rc = t.c===6?7:0, nc = t.c===6?5:3; boardState[t.r][nc] = boardState[t.r][rc]; boardState[t.r][rc] = '';
    }
    boardState[t.r][t.c] = p; boardState[f.r][f.c] = '';
    if (p==='♙' && t.r===0) boardState[t.r][t.c] = '♕'; if (p==='♟' && t.r===7) boardState[t.r][t.c] = '♛';
    if (!isInfinite && local) { if(team==='white') whiteTime+=increment; else blackTime+=increment; }
    enPassantTarget = (p==='♙'||p==='♟') && Math.abs(f.r-t.r)===2 ? {r:(f.r+t.r)/2, c:t.c} : null;
    hasMoved[getNotation(f.r,f.c)] = true; currentTurn = currentTurn==='white'?'black':'white';
    if (local) socket.emit("send-move", { password: currentPassword, move:{from:f, to:t}, whiteTime, blackTime });
    render();
}

function render(forcedStatus) {
    const l = document.getElementById('main-layout'); if (!l) return;
    const chatH = document.getElementById('chat-messages')?.innerHTML || "";
    const chatV = document.getElementById('chat-input')?.value || "";
    l.innerHTML = '';
    const cp = document.createElement('div'); cp.id = 'chat-panel';
    cp.innerHTML = `<div id="chat-header">GAME CHAT</div><div id="chat-messages">${chatH}</div><div id="chat-input-area"><input type="text" id="chat-input" placeholder="Type..." autocomplete="off"><button id="chat-send-btn">Send</button></div>`;
    const inp = cp.querySelector('#chat-input'); inp.value = chatV;
    inp.addEventListener('keydown', e => e.stopPropagation());
    inp.onkeypress = e => { if(e.key==='Enter') sendChatMessage(); };
    cp.querySelector('#chat-send-btn').onclick = sendChatMessage;
    l.appendChild(cp);

    const ga = document.createElement('div'); ga.id = 'game-area';
    let view = isSpectator ? (boardFlipped ? 'black' : 'white') : (boardFlipped ? (myColor==='white'?'black':'white') : myColor);
    const range = view === 'black' ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];
    const bar = (n, id) => { const d = document.createElement('div'); d.className='player-bar'; d.innerHTML=`<span class='player-name'>${n} ${myColor===id?'(YOU)':''}</span><div id='timer-${id}' class='timer'>--:--</div>`; return d; };

    ga.appendChild(bar(view==='black'?whiteName:blackName, view==='black'?'white':'black'));
    const be = document.createElement('div'); be.id = 'board';
    const lm = selected ? getLegalMoves(selected.r, selected.c, boardState, moveHistory, hasMoved) : [];
    for (let r of range) for (let c of range) {
        const sq = document.createElement('div'); sq.className = `square ${(r+c)%2===0?'white-sq':'black-sq'}`;
        if (lm.some(m => m.r===r && m.c===c)) { const d = document.createElement('div'); d.className = boardState[r][c]===''?'move-dot':'capture-circle'; sq.appendChild(d); }
        if (boardState[r][c]) { const s = document.createElement('span'); s.className=`piece ${isWhite(boardState[r][c])?'w-piece':'b-piece'}`; s.textContent=boardState[r][c]; sq.appendChild(s); }
        sq.onclick = () => {
            if (isSpectator || isGameOver || isPaused || currentTurn !== myColor) return;
            const isL = lm.some(m => m.r===r && m.c===c);
            if (selected && isL) { handleActualMove(selected, {r,c}, true); selected=null; }
            else { if (getTeam(boardState[r][c])===myColor) selected={r,c}; else selected=null; }
            render();
        };
        be.appendChild(sq);
    }
    const c = document.createElement('div'); c.id='board-container'; c.appendChild(be); ga.appendChild(c);
    ga.appendChild(bar(view==='black'?blackName:whiteName, view==='black'?'black':'white'));
    l.appendChild(ga);

    const sp = document.createElement('div'); sp.id='side-panel';
    sp.innerHTML = `<div id="status-box"><div id="status-text">${forcedStatus || currentTurn.toUpperCase()+"'S TURN"}</div></div><div id="notification-area"></div><div class="btn-row"></div><div id="history-container"></div>`;
    const br = sp.querySelector('.btn-row');
    if (isSpectator) br.innerHTML = `<button class="action-btn" onclick="boardFlipped=!boardFlipped;render();">Flip</button><button class="action-btn" onclick="location.reload()">Lobby</button>`;
    else br.innerHTML = `<button class="action-btn" onclick="offerDraw()">Draw</button><button class="action-btn" onclick="resignGame()">Resign</button>`;
    l.appendChild(sp); updateTimerDisplay();
}

function initGameState() {
    boardState = [['♜','♞','♝','♛','♚','♝','♞','♜'],['♟','♟','♟','♟','♟','♟','♟','♟'],['','','','','','','',''],['','','','','','','',''],['','','','','','','',''],['','','','','','','',''],['♙','♙','♙','♙','♙','♙','♙','♙'],['♖','♘','♗','♕','♔','♗','♘','♖']];
    currentTurn = 'white'; isGameOver = false; isPaused = false; hasMoved = {};
    if (gameSettings) { whiteTime = (parseInt(gameSettings.mins)*60)+parseInt(gameSettings.secs); blackTime = whiteTime; increment = parseInt(gameSettings.inc)||0; isInfinite = whiteTime === 0; }
    if (window.chessIntervalInstance) clearInterval(window.chessIntervalInstance);
    if (!isInfinite) startTimer();
    render();
}

function switchTab(t) {
    document.getElementById('create-sect').style.display = t==='create'?'block':'none'; document.getElementById('join-sect').style.display = t==='join'?'block':'none';
    document.getElementById('tab-create').className = t==='create'?'active':''; document.getElementById('tab-join').className = t==='join'?'active':'';
}

function createRoom() {
    const p = document.getElementById('roomPass').value, n = document.getElementById('uName').value; if (!p||!n) return;
    currentPassword = p; tempName = n;
    socket.emit("create-room", { password:p, name:n, mins:document.getElementById('tMin').value, secs:document.getElementById('tSec').value, inc:document.getElementById('tInc').value, colorPref:'random' });
}

function joinRoom() {
    const p = document.getElementById('joinPass').value, n = document.getElementById('joinName').value; if (!p||!n) return;
    currentPassword = p; tempName = n; socket.emit("join-attempt", { password:p });
}

function confirmJoin() { socket.emit("confirm-join", { password:currentPassword, name:tempName, isSpectator:false }); }
function confirmSpectate(p) { currentPassword=p; tempName=document.getElementById('specName').value; socket.emit("confirm-join", { password:p, name:tempName, isSpectator:true }); }
function spectateGame(p) { socket.emit("join-attempt", { password:p, isSpectator:true }); }

function renderSpectatorLobby(rooms) {
    const c = document.getElementById('spectator-list'); if (!c) return;
    c.innerHTML = `<hr><h3 style="color:#779556">Active Games</h3>`;
    const active = rooms.filter(r => r.status === "active");
    if (active.length === 0) c.innerHTML += `<p style="font-size:12px">None</p>`;
    active.forEach(r => {
        const d = document.createElement('div'); d.style.padding="10px"; d.style.background="#1a1a1a"; d.style.marginBottom="5px"; d.style.borderRadius="4px";
        d.innerHTML = `<div style="font-size:13px"><b>${r.whiteName}</b> vs <b>${r.blackName}</b></div><button class="action-btn" style="padding:4px 8px; font-size:11px; margin-top:5px" onclick="spectateGame('${r.password}')">Spectate</button>`;
        c.appendChild(d);
    });
}

function showSetup() {
    const o = document.createElement('div'); o.id = 'setup-overlay';
    o.innerHTML = `<div class="setup-card"><div class="tabs"><button id="tab-create" class="active" onclick="switchTab('create')">Create</button><button id="tab-join" onclick="switchTab('join')">Join</button></div><div id="create-sect"><div class="input-group"><label>Room Password</label><input id="roomPass"></div><div class="input-group"><label>Name</label><input id="uName" value="Player 1"></div><div class="input-group"><label>Time</label><div style="display:flex;gap:5px;"><input type="number" id="tMin" value="10"><input type="number" id="tSec" value="0"><input type="number" id="tInc" value="0"></div></div><button class="start-btn" onclick="createRoom()">CREATE</button></div><div id="join-sect" style="display:none;"><div class="input-group"><label>Password</label><input id="joinPass"></div><div class="input-group"><label>Name</label><input id="joinName" value="Player 2"></div><button class="start-btn" onclick="joinRoom()">FIND</button></div></div>`;
    document.body.appendChild(o);
}

window.addEventListener('keydown', e => {
    if (document.activeElement.tagName === 'INPUT') return;
    keyBuffer += e.key; if (keyBuffer.length > 2) keyBuffer = keyBuffer.slice(-2);
    if (keyBuffer === "[]") {
        if (!currentPassword) {
            const card = document.querySelector('.setup-card');
            if (card && !document.getElementById('spectator-list')) {
                const l = document.createElement('div'); l.id = 'spectator-list'; l.style.marginTop = '20px';
                card.appendChild(l); appendChatMessage("System", "Lobby view enabled.", true);
            }
        } else { isAdmin = true; appendChatMessage("Console", "Admin active.", true); }
        keyBuffer = "";
    }
});

function formatTime(s) { const m = Math.floor(s/60); const rs = s%60; return `${m}:${rs<10?'0':''}${rs}`; }
function updateTimerDisplay() {
    const tw = document.getElementById('timer-white'), tb = document.getElementById('timer-black');
    if (tw) { tw.textContent = formatTime(whiteTime); tw.classList.toggle('active', currentTurn==='white'); }
    if (tb) { tb.textContent = formatTime(blackTime); tb.classList.toggle('active', currentTurn==='black'); }
}
function startTimer() { window.chessIntervalInstance = setInterval(() => { if(isGameOver||isPaused) return; if(currentTurn==='white'){whiteTime--; if(whiteTime<=0)endGame("BLACK WINS");}else{blackTime--; if(blackTime<=0)endGame("WHITE WINS");} updateTimerDisplay(); }, 1000); }
function endGame(s) { isGameOver = true; if (window.chessIntervalInstance) clearInterval(window.chessIntervalInstance); showResultModal(s); render(s); }
function showStatusMessage(m) { const a = document.getElementById('notification-area'); if(a){a.textContent=m; setTimeout(()=>a.textContent='',3000);} }
function offerDraw() { socket.emit("offer-draw", { password: currentPassword }); showStatusMessage("Draw offered"); }
function resignGame() { const win = myColor === 'white' ? 'black' : 'white'; socket.emit("resign", { password: currentPassword, winner: win }); }
function showDrawOffer() { const a = document.getElementById('notification-area'); a.innerHTML = `<div class="draw-modal">Draw?<div class="modal-btns"><button class="accept-btn" onclick="respondDraw(true)">Yes</button><button class="decline-btn" onclick="respondDraw(false)">No</button></div></div>`; }
function respondDraw(acc) { socket.emit("draw-response", { password: currentPassword, accepted: acc }); document.getElementById('notification-area').innerHTML = ''; }
function showResultModal(t) {
    const o = document.createElement('div'); o.id = 'game-over-overlay';
    o.innerHTML = `<div class="result-card"><h2>Game Over</h2><p>${t}</p><div class="modal-btns-vertical"><button id="rematch-btn" onclick="requestRematch()">Rematch</button><button class="action-btn" onclick="closeModal()">View Board</button><button class="action-btn" onclick="location.reload()">New</button></div></div>`;
    document.body.appendChild(o);
}
function requestRematch() {
    const b = document.getElementById('rematch-btn');
    if (rematchRequested) { rematchRequested=false; b.innerText="Rematch"; b.classList.remove('cancel-state'); }
    else { rematchRequested=true; b.innerText="Cancel"; b.classList.add('cancel-state'); }
    socket.emit("rematch-request", { password: currentPassword });
}
function closeModal() { document.getElementById('game-over-overlay').style.display='none'; if(!document.getElementById('reopen-results-btn')){ const b=document.createElement('button'); b.id='reopen-results-btn'; b.className='action-btn'; b.style.marginTop='10px'; b.textContent='Show Result'; b.onclick=()=>{document.getElementById('game-over-overlay').style.display='flex';}; document.getElementById('side-panel').appendChild(b); } }

window.onload = showSetup;
