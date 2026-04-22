// 1. Change this URL to your actual Render URL
const SERVER_URL = "https://algebra-but-better.onrender.com";
const socket = io(SERVER_URL);

// --- CONNECTION MONITOR ---
socket.on("connect", () => console.log("Connected to server!"));
socket.on("connect_error", (err) => {
    console.error("Connection Error:", err);
    // This will tell you if the server is the problem
    alert("Server Connection Failed. Check if your Render app is awake.");
});

let myColor, currentPassword, increment;
let whiteName, blackName, whiteTime, blackTime;
let boardState, currentTurn, selected, isGameOver, isInfinite;
let hasMoved = {}, enPassantTarget = null, moveHistory = [];

const isWhite = (c) => ['♖','♙','♙','♘','♗','♕','♔'].includes(c);
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
        if(boardState[r][c] !== '' && getTeam(boardState[r][c]) === team) {
            for(let tr=0; tr<8; tr++) for(let tc=0; tc<8; tc++) 
                if(moveIsLegal(r,c,tr,tc,boardState[r][c],team)) return true;
        }
    }
    return false;
}

// --- SETUP UI ---
function showSetup() {
    const overlay = document.getElementById('setup-overlay');
    if (!overlay) return;
    let tab = 'create';

    const draw = () => {
        overlay.innerHTML = `
        <div class="setup-card">
            <div class="tab-btns">
                <button class="tab-btn ${tab==='create'?'active':''}" id="btn-tab-create">CREATE</button>
                <button class="tab-btn ${tab==='join'?'active':''}" id="btn-tab-join">JOIN</button>
            </div>
            <div class="input-group">
                <label>Room Password</label>
                <input id="roomPass" type="text" placeholder="e.g. 1234">
            </div>
            <div class="input-group">
                <label>Your Name</label>
                <input id="uName" value="Player">
            </div>
            ${tab==='create' ? `
                <div class="input-group">
                    <label>Mins | Secs | Inc</label>
                    <div class="time-row">
                        <input type="number" id="tM" value="10">
                        <input type="number" id="tS" value="0">
                        <input type="number" id="tI" value="0">
                    </div>
                </div>
                <div class="input-group">
                    <label>Play As</label>
                    <select id="pC">
                        <option value="white">White</option>
                        <option value="black">Black</option>
                        <option value="random">Random</option>
                    </select>
                </div>
            ` : ''}
            <button class="start-btn" id="final-go-button">START GAME</button>
        </div>`;

        // Manual event listeners to ensure they work
        document.getElementById('btn-tab-create').onclick = () => { tab='create'; draw(); };
        document.getElementById('btn-tab-join').onclick = () => { tab='join'; draw(); };
        
        document.getElementById('final-go-button').onclick = () => {
            const pass = document.getElementById('roomPass').value;
            const name = document.getElementById('uName').value;
            if(!pass) return alert("Enter a password!");

            currentPassword = pass;
            if (tab === 'create') {
                socket.emit("create-room", { 
                    password: pass, 
                    name, 
                    mins: document.getElementById('tM').value, 
                    secs: document.getElementById('tS').value, 
                    inc: document.getElementById('tI').value, 
                    preferredColor: document.getElementById('pC').value 
                });
                overlay.innerHTML = `<div class="setup-card"><h2>Waiting for opponent...</h2><p>Password: ${pass}</p></div>`;
            } else {
                socket.emit("join-attempt", { password: pass, name });
            }
        };
    };
    draw();
}

// --- GAME START ---
socket.on("game-start", (data) => {
    whiteName = data.whiteName; blackName = data.blackName;
    whiteTime = (parseInt(data.settings.mins) * 60) + parseInt(data.settings.secs);
    blackTime = whiteTime; increment = parseInt(data.settings.inc); 
    isInfinite = (whiteTime === 0);
    document.getElementById('setup-overlay').style.display = 'none';
    document.getElementById('main-layout').style.visibility = 'visible';
    initGameState();
});

socket.on("assign-color", (c) => { myColor = c; });
socket.on("confirm-settings", (d) => {
    if(confirm(`Join game by ${d.creatorName}?`)) {
        socket.emit("join-confirmed", { password: currentPassword, name: document.getElementById('uName').value });
    }
});

window.onload = showSetup;
