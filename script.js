const socket = io("https://algebra-but-better.onrender.com");
const boardElement = document.getElementById('main-layout');
const statusElement = document.getElementById('status');

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
    boardElement.innerHTML = '';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = document.createElement('div');
            sq.className = `square ${(r + c) % 2 === 0 ? 'white-sq' : 'black-sq'}`;
            if (selected && selected.r === r && selected.c === c) sq.classList.add('selected');
            sq.innerText = gameBoard[r][c];
            sq.onclick = () => handleClick(r, c);
            boardElement.appendChild(sq);
        }
    }
    statusElement.innerText = `${currentTurn.charAt(0).toUpperCase() + currentTurn.slice(1)}'s Turn`;
}

function handleClick(r, c) {
    if (selected) {
        const move = { from: selected, to: { r, c }, piece: gameBoard[selected.r][selected.c] };
        executeMove(move);
        socket.emit("send-move", { roomId: "global", move });
        selected = null;
    } else {
        if (gameBoard[r][c] !== '') selected = { r, c };
    }
    draw();
}

function executeMove(move) {
    gameBoard[move.to.r][move.to.c] = move.piece;
    gameBoard[move.from.r][move.from.c] = '';
    currentTurn = currentTurn === 'white' ? 'black' : 'white';
    draw();
}

socket.on("receive-move", (move) => executeMove(move));
socket.emit("join-room", "global");
draw();
