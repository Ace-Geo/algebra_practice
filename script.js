const socket = io("https://algebra-but-better.onrender.com");

let myColor, currentPassword, increment;
let whiteName, blackName, whiteTime, blackTime;
let boardState, currentTurn, selected, isGameOver, isInfinite;
let hasMoved = {}, enPassantTarget = null;

const isWhite = (c) => ['♖','♙','♘','♗','♕','♔'].includes(c);
const getTeam = (c) => c === '' ? null : (isWhite(c) ? 'white' : 'black');

// --- CHESS ENGINE ---
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

function hasLegalMoves(team) {
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) {
        const p = boardState[r][c];
        if(p !== '' && getTeam(p) === team) {
            for(let tr=0; tr<8; tr++) for(let tc=0; tc<8; tc++) 
                if(moveIsLegal(r,c,tr,tc,p,team)) return true;
        }
    }
    return false;
}

// --- RENDER ---
function render(statusOverride) {
    const layout = document.getElementById('main-layout');
    if (!layout) return;
    layout.style.visibility = 'visible';
    layout.replaceChildren();

    const gameArea = document.createElement('div');
    const createBar = (name, id) => {
        const div = document.createElement('div'); div.className = 'player-bar';
        div.innerHTML = `<span>${name || 'Player'}</span><div id="timer-${id}" class="timer">10:00</div>`;
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
            
            if (selected?.r===r && selected?.c===c) sq.classList.add('selected');
            if ((piece==='♔'||piece==='♚') && getTeam(piece)===currentTurn && isInCheck(currentTurn, boardState)) sq.classList.add('in-check');

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
    side.innerHTML = `<div id="status-box">${statusOverride || currentTurn.toUpperCase() + "'S TURN"}</div>`;
    layout.appendChild(side);
}

function handleActualMove(from, to, isLocal) {
    const p = boardState[from.r][from.c];
    boardState[to.r][to.c] = p;
    boardState[from.r][from.c] = '';
    
    if (isLocal) {
        socket.emit("send-move", { password: currentPassword, move: {from, to} });
    }
    
    currentTurn = currentTurn === 'white' ? 'black' : 'white';
    selected = null;

    let status = null;
    if (isInCheck(currentTurn, boardState)) {
        if (!hasLegalMoves(currentTurn)) { isGameOver = true; status = "CHECKMATE!"; }
    } else if (!hasLegalMoves(currentTurn)) { isGameOver = true; status = "STALEMATE"; }

    render(status);
}

// --- SOCKETS ---
socket.on("game-start", (data) => {
    whiteName = data.whiteName; 
    blackName = data.blackName;
    document.getElementById('setup-overlay').style.display = 'none';
    
    boardState = [['♜','♞','♝','♛','♚','♝','♞','♜'],['♟','♟','♟','♟','♟','♟','♟','♟'],['','','','','','','',''],['','','','','','','',''],['','','','','','','',''],['','','','','','','',''],['♙','♙','♙','♙','♙','♙','♙','♙'],['♖','♘','♗','♕','♔','♗','♘','♖']];
    currentTurn = 'white';
    isGameOver = false;
    render();
});

socket.on("assign-color", (c) => { myColor = c; render(); });
socket.on("receive-move", (d) => handleActualMove(d.move.from, d.move.to, false));

// --- SETUP ---
function showSetup() {
    const overlay = document.getElementById('setup-overlay');
    overlay.innerHTML = `
        <div class="setup-card">
            <h2>Chess Practice</h2>
            <input id="roomPass" type="text" placeholder="Room Password" style="width:100%; padding:10px; margin-bottom:10px; background:#1a1a1a; color:white; border:1px solid #444;">
            <input id="uName" value="Player" style="width:100%; padding:10px; margin-bottom:10px; background:#1a1a1a; color:white; border:1px solid #444;">
            <button id="createBtn" style="width:100%; padding:12px; background:#779556; color:white; border:none; font-weight:bold; cursor:pointer; margin-bottom:10px;">CREATE ROOM</button>
            <button id="joinBtn" style="width:100%; padding:12px; background:#3c3a37; color:white; border:none; font-weight:bold; cursor:pointer;">JOIN ROOM</button>
        </div>`;

    document.getElementById('createBtn').onclick = () => {
        currentPassword = document.getElementById('roomPass').value;
        if(!currentPassword) return alert("Password required");
        socket.emit("create-room", { password: currentPassword, name: document.getElementById('uName').value });
        overlay.innerHTML = "<h2>Waiting for opponent...</h2>";
    };

    document.getElementById('joinBtn').onclick = () => {
        currentPassword = document.getElementById('roomPass').value;
        socket.emit("join-attempt", { password: currentPassword, name: document.getElementById('uName').value });
    };
}

socket.on("confirm-settings", () => {
    socket.emit("join-confirmed", { password: currentPassword, name: document.getElementById('uName').value });
});

window.onload = showSetup;
