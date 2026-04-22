const socket = io("https://algebra-but-better.onrender.com");

let myColor, currentPassword, increment;
let whiteName, blackName, whiteTime, blackTime;
let boardState, currentTurn, selected, isGameOver, isInfinite;
let hasMoved = {}, enPassantTarget = null, moveHistory = [];

const isWhite = (c) => ['♖','♙','♘','♗','♕','♔'].includes(c);
const getTeam = (c) => c === '' ? null : (isWhite(c) ? 'white' : 'black');

// --- CHESS ENGINE LOGIC ---
function validateMoveMechanics(fR, fC, tR, tC, p, tar, b) {
    const dr = tR-fR, dc = tC-fC, adr = Math.abs(dr), adc = Math.abs(dc), team = getTeam(p);
    if (tar !== '' && getTeam(tar) === team) return false;
    const clear = (r1, c1, r2, c2) => {
        const sr = r2 === r1 ? 0 : (r2-r1)/Math.abs(r2-r1);
        const sc = c2 === c1 ? 0 : (c2-c1)/Math.abs(c2-c1);
        let cr = r1+sr, cc = c1+sc;
        while(cr !== r2 || cc !== c2) { if (b[cr][cc] !== '') return false; cr+=sr; cc+=sc; }
        return true;
    };
    if (p === '♙' || p === '♟') {
        const dir = team === 'white' ? -1 : 1;
        if (dc === 0 && tar === '') return dr === dir || (dr === 2*dir && fR === (team==='white'?6:1) && b[fR+dir][fC] === '');
        if (adc === 1 && dr === dir) return tar !== '' || (enPassantTarget && enPassantTarget.r === tR && enPassantTarget.c === tC);
        return false;
    }
    if (['♖','♜'].includes(p)) return (dr===0 || dc===0) && clear(fR,fC,tR,tC);
    if (['♘','♞'].includes(p)) return (adr===2 && adc===1) || (adr===1 && adc===2);
    if (['♗','♝'].includes(p)) return adr===adc && clear(fR,fC,tR,tC);
    if (['♕','♛'].includes(p)) return (adr===adc || dr===0 || dc===0) && clear(fR,fC,tR,tC);
    if (['♔','♚'].includes(p)) return adr <= 1 && adc <= 1;
    return false;
}

function isInCheck(team, board) {
    const kChar = team === 'white' ? '♔' : '♚';
    let kr, kc;
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(board[r][c]===kChar){kr=r;kc=c;}
    const opp = team==='white'?'black':'white';
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) 
        if(board[r][c]!=='' && getTeam(board[r][c])===opp && validateMoveMechanics(r,c,kr,kc,board[r][c],board[kr][kc],board)) return true;
    return false;
}

function moveIsLegal(fR, fC, tR, tC, p, team) {
    if (!validateMoveMechanics(fR, fC, tR, tC, p, boardState[tR][tC], boardState)) return false;
    const temp = boardState.map(r => [...r]);
    temp[tR][tC] = p; temp[fR][fC] = '';
    return !isInCheck(team, temp);
}

// --- CORE RENDERING ---
function render(statusOverride) {
    const layout = document.getElementById('main-layout');
    if (!layout) return;
    
    // Ensure game is visible
    layout.style.visibility = 'visible';
    layout.replaceChildren();

    const gameArea = document.createElement('div');
    const createBar = (name, id) => {
        const div = document.createElement('div'); div.className = 'player-bar';
        div.innerHTML = `<span>${name || 'Opponent'}</span><div id="timer-${id}" class="timer"></div>`;
        return div;
    };

    gameArea.appendChild(createBar(myColor==='white'?blackName:whiteName, myColor==='white'?'black':'white'));
    
    const boardEl = document.createElement('div'); boardEl.id = 'board';
    const range = myColor === 'black' ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];
    
    for(let r of range) {
        for(let c of range) {
            const sq = document.createElement('div');
            const piece = boardState[r][c];
            sq.className = `square ${(r+c)%2===0 ? 'white-sq' : 'black-sq'}`;
            
            if(piece) {
                const sp = document.createElement('span'); 
                sp.className = `piece ${isWhite(piece)?'w-piece':'b-piece'}`;
                sp.textContent = piece; 
                sq.appendChild(sp);
            }

            sq.onclick = () => {
                if (currentTurn !== myColor || isGameOver) return;
                if (selected && moveIsLegal(selected.r, selected.c, r, c, boardState[selected.r][selected.c], currentTurn)) {
                    handleActualMove(selected, {r,c}, true);
                } else {
                    selected = getTeam(piece) === currentTurn ? {r,c} : null;
                    render();
                }
            };
            boardEl.appendChild(sq);
        }
    }
    
    gameArea.appendChild(boardEl);
    gameArea.appendChild(createBar(myColor==='white'?whiteName:blackName, myColor==='white'?'white':'black'));
    layout.appendChild(gameArea);

    const side = document.createElement('div'); side.id = 'side-panel';
    side.innerHTML = `<div id="status-box">${statusOverride || currentTurn.toUpperCase() + "'S TURN"}</div><div id="history-container"></div>`;
    layout.appendChild(side);
    updateTimerDisplay();
}

function handleActualMove(from, to, isLocal) {
    const p = boardState[from.r][from.c];
    boardState[to.r][to.c] = p;
    boardState[from.r][from.c] = '';
    
    if (isLocal) {
        socket.emit("send-move", { password: currentPassword, move: {from, to}, whiteTime, blackTime });
    }
    currentTurn = currentTurn === 'white' ? 'black' : 'white';
    selected = null;
    render();
}

// --- SOCKET EVENTS ---
socket.on("game-start", (data) => {
    console.log("Game Starting...");
    whiteName = data.whiteName; 
    blackName = data.blackName;
    whiteTime = (parseInt(data.settings.mins) * 60);
    blackTime = whiteTime;
    isInfinite = (whiteTime === 0);
    
    document.getElementById('setup-overlay').style.display = 'none';
    
    // Reset Board
    boardState = [['♜','♞','♝','♛','♚','♝','♞','♜'],['♟','♟','♟','♟','♟','♟','♟','♟'],['','','','','','','',''],['','','','','','','',''],['','','','','','','',''],['','','','','','','',''],['♙','♙','♙','♙','♙','♙','♙','♙'],['♖','♘','♗','♕','♔','♗','♘','♖']];
    currentTurn = 'white';
    isGameOver = false;
    
    render();
});

socket.on("assign-color", (c) => { 
    myColor = c; 
    console.log("Assigned color:", myColor);
});

socket.on("receive-move", (d) => {
    handleActualMove(d.move.from, d.move.to, false);
});

// --- SETUP UI ---
function showSetup() {
    const overlay = document.getElementById('setup-overlay');
    overlay.innerHTML = `
        <div class="setup-card">
            <h2>Chess Room</h2>
            <input id="roomPass" type="text" placeholder="Password">
            <input id="uName" value="Player">
            <button class="start-btn" id="createBtn">CREATE</button>
            <button class="start-btn" id="joinBtn" style="background:#3c3a37">JOIN</button>
        </div>`;

    document.getElementById('createBtn').onclick = () => {
        currentPassword = document.getElementById('roomPass').value;
        socket.emit("create-room", { password: currentPassword, name: document.getElementById('uName').value, mins: 10, secs: 0, inc: 0, preferredColor: 'white' });
        overlay.innerHTML = "<h2>Waiting for opponent...</h2>";
    };

    document.getElementById('joinBtn').onclick = () => {
        currentPassword = document.getElementById('roomPass').value;
        socket.emit("join-attempt", { password: currentPassword, name: document.getElementById('uName').value });
    };
}

socket.on("confirm-settings", (d) => {
    socket.emit("join-confirmed", { password: currentPassword, name: document.getElementById('uName').value });
});

function updateTimerDisplay() {
    const wT = document.getElementById('timer-white'), bT = document.getElementById('timer-black');
    if (wT) wT.textContent = isInfinite ? "∞" : "10:00";
    if (bT) bT.textContent = isInfinite ? "∞" : "10:00";
}

window.onload = showSetup;
