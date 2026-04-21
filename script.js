// REPLACE THIS with your actual Render URL
const socket = io("https://your-chess-game.onrender.com");

const boardElement = document.getElementById('main-layout');
const statusElement = document.getElementById('status');

// Initial Board State
let gameBoard = [
    ['♜','♞','♝','♛','♚','♝','♞','♜'],
    ['♟','♟','♟','♟','♟','♟','♟','♟'],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['♙','♙','♙','♙','♙','♙','♙','♙'],
    ['♖','♘','♗','♕','♔','♗','♘','♖']
];

let selected = null;
let currentTurn = 'white';

function draw() {
    // This clears the 'thin black box' and refills it
    boardElement.innerHTML = ''; 
    
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = document.createElement('div');
            
            // Setting the size manually here ensures the box isn't thin
            sq.style.width = "60px";
            sq.style.height = "60px";
            sq.style.display = "flex";
            sq.style.justifyContent = "center";
            sq.style.alignItems = "center";
            sq.style.fontSize = "40px";
            sq.style.cursor = "pointer";

            // Alternating colors
            sq.style.backgroundColor = (r + c) % 2 === 0 ? '#eeeed2' : '#769656';
            
            if (selected && selected.r === r && selected.c === c) {
                sq.style.backgroundColor = "#f7f769"; // Yellow if selected
            }

            sq.innerText = gameBoard[r][c];
            sq.onclick = () => handleClick(r, c);
            boardElement.appendChild(sq);
        }
    }
    statusElement.innerText = `${currentTurn.charAt(0).toUpperCase() + currentTurn.slice(1)}'s Turn`;
}

function handleClick(r, c) {
    const piece = gameBoard[r][c];
    
    if (selected) {
        // Move piece
        const move = { 
            from: selected, 
            to: { r, c }, 
            piece: gameBoard[selected.r][selected.c] 
        };
        
        executeMove(move);
        socket.emit("send-move", { roomId: "global", move });
        selected = null;
    } else {
        // Select piece (only if it's not an empty square)
        if (piece !== '') {
            selected = { r, c };
        }
    }
    draw();
}

function executeMove(move) {
    gameBoard[move.to.r][move.to.c] = move.piece;
    gameBoard[move.from.r][move.from.c] = '';
    currentTurn = currentTurn === 'white' ? 'black' : 'white';
    draw();
}

// Socket listeners
socket.on("receive-move", (move) => executeMove(move));
socket.emit("join-room", "global");

// This line actually starts the drawing process!
draw();
