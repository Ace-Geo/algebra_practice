const socket = io("https://algebra-but-better.onrender.com");

let myColor = null;
let currentPassword = null;
let tempName = "";
let whiteName = "White";
let blackName = "Black";
let spectatorName = "";
let spectatorId = null;
let isSpectator = false;
let boardPerspective = 'white';
let lobbySpectateEnabled = false;
let activeGames = [];
let spectatorRoster = [];
let setupView = "menu";

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
let isOpponentAdmin = false;
let keyBuffer = "";
let isPaused = false;
let playerAdmins = { white: false, black: false };

// --- SOCKET LISTENERS ---

@@ -745,50 +746,51 @@ function render(forcedStatus) {
                    render();
                }
            };
            boardEl.appendChild(sq);
        }
    }
    boardCont.appendChild(boardEl); gameArea.appendChild(boardCont);
    
    gameArea.appendChild(createPlayerBar(bottomColor === 'white' ? whiteName : blackName, bottomColor));
    
    layout.appendChild(gameArea);
    
    const sidePanel = document.createElement('div');
    sidePanel.id = 'side-panel';
    let statusDisplay = forcedStatus || (isGameOver ? "GAME OVER" : `${currentTurn.toUpperCase()}'S TURN ${check ? '(CHECK!)' : ''}`);
    sidePanel.innerHTML = `
        <div id="status-box"><div id="status-text">${statusDisplay}</div></div>
        <div id="notification-area"></div>
        <div class="btn-row">
            ${isSpectator
                ? `<button class="action-btn" onclick="flipBoard()">Flip Board</button>
                   <button class="action-btn" onclick="returnToLobby()">Return to Lobby</button>`
                : `<button class="action-btn" onclick="offerDraw()" ${isGameOver ? 'disabled' : ''}>Offer Draw</button>
                   <button class="action-btn" onclick="resignGame()" ${isGameOver ? 'disabled' : ''}>Resign</button>`}
        </div>
        <button class="action-btn" style="width:100%;" onclick="showRulesPopup()">Game Rules</button>
        <div id="history-container"></div>
    `;
    const hist = sidePanel.querySelector('#history-container');
    moveHistory.forEach((m, i) => {
        const row = document.createElement('div'); row.className = 'history-row';
        row.innerHTML = `<div class="move-num">${i + 1}.</div><div>${m.w}</div><div>${m.b}</div>`;
        hist.appendChild(row);
    });
    layout.appendChild(sidePanel);
    
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const wT = document.getElementById('timer-white'); const bT = document.getElementById('timer-black');
    if (wT) { wT.textContent = formatTime(whiteTime); wT.className = `timer ${currentTurn === 'white' && !isGameOver ? 'active' : ''}`; }
    if (bT) { bT.textContent = formatTime(blackTime); bT.className = `timer ${currentTurn === 'black' && !isGameOver ? 'active' : ''}`; }
}

function formatTime(seconds) {
    if (isInfinite) return "∞";
    const s = Math.max(0, seconds); const m = Math.floor(s / 60); const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

@@ -816,99 +818,112 @@ function initGameState() {
    boardPerspective = isSpectator ? 'white' : myColor;
    if (gameSettings) {
        whiteTime = (parseInt(gameSettings.mins) * 60) + parseInt(gameSettings.secs);
        blackTime = whiteTime; increment = parseInt(gameSettings.inc) || 0;
        isInfinite = (whiteTime === 0);
    }
    if (window.chessIntervalInstance) clearInterval(window.chessIntervalInstance);
    if (!isInfinite) startTimer();
    render();
}

function showSetup() {
    const overlay = document.createElement('div'); overlay.id = 'setup-overlay';
    overlay.innerHTML = `
        <div class="setup-card">
            <div id="setup-card-content"></div>
        </div>
    `;
    document.body.appendChild(overlay);
    renderSetupCard();
}

function renderSetupCard() {
    const content = document.getElementById('setup-card-content');
    if (!content) return;
    if (setupView === "menu") {
        content.innerHTML = `
            <h1 style="color:#779556; margin-top:0;">Algebra Practice</h1>
            <p style="color:#bababa; margin-bottom:20px;">Choose an option</p>
            <button class="start-btn" onclick="setSetupView('create')">Create New Game</button>
            <button class="start-btn" style="margin-top:10px;" onclick="setSetupView('join')">Join Game</button>
            <button class="action-btn" style="margin-top:10px; width:100%; padding:12px; font-size:14px;" onclick="showRulesPopup()">Game Rules</button>
            ${lobbySpectateEnabled ? '<button class="action-btn" style="margin-top:10px; width:100%; padding:12px; font-size:14px;" onclick="openSpectateMenu()">Spectate Games</button>' : ''}
        `;
        return;
    }

    if (setupView === "create") {
        content.innerHTML = `
            <h2 style="color:#779556; margin-top:0;">Create New Game</h2>
            <div class="input-group"><label>Room Password</label><input id="roomPass" placeholder="Secret Code"></div>
            <div class="input-group"><label>Your Name</label><input id="uName" value="Player 1"></div>
            <div class="input-group"><label>Time Control</label><div style="display:flex; gap:5px;"><input type="number" id="tMin" value="10"><input type="number" id="tSec" value="0"><input type="number" id="tInc" value="0"></div></div>
            <div class="input-group"><label>Play As</label><select id="colorPref"><option value="random">Random</option><option value="white">White</option><option value="black">Black</option></select></div>
            <button class="start-btn" onclick="createRoom()">CREATE</button>
            <button class="action-btn" style="margin-top:10px; width:100%;" onclick="setSetupView('menu')">Return to Menu</button>
        `;
        return;
    }

    if (setupView === "join") {
        content.innerHTML = `
            <h2 style="color:#779556; margin-top:0;">Join Game</h2>
            <div class="input-group"><label>Room Password</label><input id="joinPass" placeholder="Enter Password"></div>
            <div class="input-group"><label>Your Name</label><input id="joinName" value="Player 2"></div>
            <button class="start-btn" onclick="joinRoom()">FIND ROOM</button>
            <button class="action-btn" style="margin-top:10px; width:100%;" onclick="setSetupView('menu')">Return to Menu</button>
        `;
    }
}

function setSetupView(view) {
    setupView = view;
    renderSetupCard();
}

function createRoom() {
    currentPassword = document.getElementById('roomPass').value; tempName = document.getElementById('uName').value;
    if (!currentPassword) return alert("Enter password.");
    socket.emit("create-room", { password: currentPassword, name: tempName, mins: document.getElementById('tMin').value, secs: document.getElementById('tSec').value, inc: document.getElementById('tInc').value, colorPref: document.getElementById('colorPref').value });
}

function joinRoom() {
    currentPassword = document.getElementById('joinPass').value; tempName = document.getElementById('joinName').value;
    if (!currentPassword) return alert("Enter password.");
    socket.emit("join-attempt", { password: currentPassword });
}

function confirmJoin() { socket.emit("confirm-join", { password: currentPassword, name: tempName }); }

function openSpectateMenu() {
    const content = document.getElementById('setup-card-content');
    if (!content) return;
    content.innerHTML = `
        <h2 style="color: #779556">Active Games</h2>
        <div id="spectate-games-list" style="max-height: 320px; overflow-y: auto; text-align: left;"></div>
        <button class="action-btn" style="margin-top: 10px; width: 100%;" onclick="setSetupView('menu')">Back</button>
    `;
    socket.emit("list-active-games");
}

function renderSpectateList() {
    const list = document.getElementById('spectate-games-list');
    if (!list) return;
    if (!activeGames.length) {
        list.innerHTML = `<div style="background:#1a1a1a; padding:12px; border-radius:6px;">No active games right now.</div>`;
        return;
    }

    list.innerHTML = activeGames.map((game) => `
        <div style="background:#1a1a1a; padding:12px; border-radius:6px; margin-bottom:10px;">
            <div><b>White:</b> ${game.whiteName}</div>
            <div><b>Black:</b> ${game.blackName}</div>
            <div><b>Time:</b> ${game.settings.mins}m ${game.settings.secs}s + ${game.settings.inc}s</div>
            <button class="start-btn" style="margin-top:10px;" onclick="spectateRoom('${game.password}')">Spectate</button>
        </div>
    `).join('');
}

function spectateRoom(password) {
    const chosen = prompt("Enter your spectator username:", "Spectator");
    if (!chosen || !chosen.trim()) return;
@@ -927,50 +942,83 @@ function resignGame() {
function offerDraw() { if (!isGameOver) { socket.emit("offer-draw", { password: currentPassword }); showStatusMessage("Draw offer sent..."); } }

function flipBoard() {
    if (!isSpectator) return;
    boardPerspective = boardPerspective === 'white' ? 'black' : 'white';
    render();
}

function returnToLobby() {
    location.reload();
}

function showDrawOffer() {
    const area = document.getElementById('notification-area');
    area.innerHTML = `<div class="draw-modal">Opponent offers draw<div class="modal-btns"><button class="accept-btn" onclick="respondToDraw(true)">Accept</button><button class="decline-btn" onclick="respondToDraw(false)">Decline</button></div></div>`;
}

function respondToDraw(accepted) { socket.emit("draw-response", { password: currentPassword, accepted: accepted }); document.getElementById('notification-area').innerHTML = ''; }

function showStatusMessage(msg) {
    const area = document.getElementById('notification-area');
    area.innerHTML = `<div style="background:#4b4845; padding:10px; border-radius:4px; font-size:12px; text-align:center;">${msg}</div>`;
    setTimeout(() => { area.innerHTML = ''; }, 3000);
}

function showRulesPopup() {
    if (document.getElementById('rules-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'rules-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0, 0, 0, 0.85)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '2500';

    overlay.innerHTML = `
        <div class="result-card" style="max-width:420px; width:90%; text-align:left;">
            <h2 style="text-align:center;">Game Rules</h2>
            <ul style="padding-left:18px; line-height:1.5; color:#ddd; font-size:14px;">
                <li>Standard chess movement rules apply to all pieces.</li>
                <li>Win by checkmate, resignation, or opponent running out of time.</li>
                <li>Draws can happen by agreement or stalemate.</li>
                <li>Each move may add increment seconds if set in game settings.</li>
                <li>Use chat for communication; admins can run slash commands.</li>
            </ul>
            <button class="action-btn" style="width:100%; margin-top:10px;" onclick="closeRulesPopup()">Close</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function closeRulesPopup() {
    const overlay = document.getElementById('rules-overlay');
    if (overlay) overlay.remove();
}

function showResultModal(text) {
    const overlay = document.createElement('div'); overlay.id = 'game-over-overlay';
    const spectatorButtons = `
        <div class="modal-btns-vertical">
            <button class="action-btn" onclick="closeModal()">View Board</button>
            <button class="action-btn" style="background:#444" onclick="returnToLobby()">Return to Lobby</button>
        </div>
    `;
    const playerButtons = `
        <div class="modal-btns-vertical">
            <button id="rematch-btn" onclick="requestRematch()">Request Rematch</button>
            <button class="action-btn" onclick="closeModal()">View Board</button>
            <button class="action-btn" style="background:#444" onclick="location.reload()">New Game</button>
        </div>
    `;
    overlay.innerHTML = `
        <div class="result-card">
            <h2>Game Over</h2><p>${text}</p>
            ${isSpectator ? spectatorButtons : playerButtons}
        </div>
    `;
    document.body.appendChild(overlay);
}

function requestRematch() {
