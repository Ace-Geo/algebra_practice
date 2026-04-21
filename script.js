const socket = io("https://algebra-but-better.onrender.com");
let myColor = null; 
let currentPassword = null;
let whiteName = "White", blackName = "Black"; 

// 1. MULTIPLAYER LISTENERS
socket.on("player-assignment", (data) => {
    myColor = data.color;
    let m = parseInt(data.settings.mins) || 10;
    whiteTime = m * 60; 
    blackTime = whiteTime;
    isInfinite = (m === 0);
    
    // Safety check: ensure names exist
    whiteName = data.settings.whiteName || "White";
    if (myColor === "black") {
        const inputName = document.getElementById('uName')?.value;
        blackName = inputName || "Black";
    } else {
        blackName = "Waiting for opponent...";
    }
    
    // Force a fresh start
    initGameState();
});

socket.on("opponent-joined", (data) => {
    blackName = data.blackName || "Black";
    render(); // Redraw with the new name
});

// 2. INITIALIZATION
function initGameState() {
    // Reset variables to standard starting positions
    boardState = [
        ['♜','♞','♝','♛','♚','♝','♞','♜'],
        ['♟','♟','♟','♟','♟','♟','♟','♟'],
        ['','','','','','','',''],
        ['','','','','','','',''],
        ['','','','','','','',''],
        ['','','','','','','',''],
        ['♙','♙','♙','♙','♙','♙','♙','♙'],
        ['♖','♘','♗','♕','♔','♗','♘','♖']
    ];
    currentTurn = 'white';
    hasMoved = {};
    moveHistory = [];
    isGameOver = false;
    selected = null;

    // IMPORTANT: Check if the HTML container exists before trying to draw
    if (document.getElementById('main-layout')) {
        startTimer();
        render(); 
    } else {
        console.error("Critical Error: 'main-layout' div not found in HTML.");
    }
}

// 3. THE FAIL-SAFE RENDER
function render(forcedStatus) {
    const layout = document.getElementById('main-layout');
    if (!layout) return; // Stop the crash if HTML isn't ready
    
    layout.replaceChildren(); // Clear screen
    
    const gameArea = document.createElement('div');
    gameArea.id = 'game-area';

    // Top Bar (Opponent)
    const oppName = (myColor === 'white') ? blackName : whiteName;
    const oppColor = (myColor === 'white') ? 'black' : 'white';
    gameArea.appendChild(createPlayerBar(oppName, oppColor));

    // The Board
    const boardWrap = document.createElement('div');
    boardWrap.id = 'board-container';
    const boardEl = document.createElement('div');
    boardEl.id = 'board';
    
    // Draw squares
    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            const sq = document.createElement('div');
            sq.className = `square ${(r+c)%2===0 ? 'white-sq' : 'black-sq'}`;
            const piece = boardState[r][c];
            if(piece) {
                const span = document.createElement('span');
                span.className = `piece ${isWhite(piece) ? 'w-piece' : 'b-piece'}`;
                span.textContent = piece;
                sq.appendChild(span);
            }
            // Add click logic here (reuse previous logic)
            sq.onclick = () => handleSquareClick(r, c);
            boardEl.appendChild(sq);
        }
    }
    boardWrap.appendChild(boardEl);
    gameArea.appendChild(boardWrap);

    // Bottom Bar (You)
    const myName = (myColor === 'white') ? whiteName : blackName;
    gameArea.appendChild(createPlayerBar(myName, myColor));

    layout.appendChild(gameArea);
    
    // Add Side Panel (History)
    renderSidePanel(layout, forcedStatus);
    updateTimerDisplay();
}

function createPlayerBar(name, id) {
    const div = document.createElement('div');
    div.className = 'player-bar';
    div.innerHTML = `
        <span class="player-name">${name} ${myColor === id ? '(YOU)' : ''}</span>
        <div id="timer-${id}" class="timer">--:--</div>
    `;
    return div;
}

// ... (Rest of the timer/move logic remains the same)
