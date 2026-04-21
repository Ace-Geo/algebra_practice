(function() {
    // 1. CONNECT TO YOUR RENDER SERVER
    const socket = io("https://algebra-but-better.onrender.com");
    
    // Create a simple Room ID so you and your friend are in the same game
    // You can eventually make this a prompt or a URL parameter
    const roomId = "global-room-1"; 
    socket.emit("join-room", roomId);

    // --- EXISTING GAME VARIABLES ---
    let boardState, currentTurn, hasMoved, enPassantTarget, selected, isGameOver, isInfinite;
    let whiteName, blackName, whiteTime, blackTime, moveHistory, increment;

    // --- NEW MULTIPLAYER LOGIC ---
    
    // This listens for moves coming FROM your friend via the server
    socket.on("receive-move", (moveData) => {
        applyMove(moveData.from, moveData.to, false); // 'false' means don't emit back to server
    });

    // We wrap the move logic so we can call it locally OR from a socket event
    function applyMove(from, to, isLocalAction) {
        const p = boardState[from.r][from.c];
        
        // Basic Move Logic (simplified for brevity, use your full logic here)
        let isEP = (p==='♙'||p==='♟') && enPassantTarget?.r === to.r && enPassantTarget?.c === to.c;
        if(isEP) boardState[from.r][to.c] = '';
        
        boardState[to.r][to.c] = p;
        boardState[from.r][from.c] = '';
        
        // Switch turns
        currentTurn = currentTurn === 'white' ? 'black' : 'white';
        
        // Update UI
        render();

        // IF YOU moved the piece, tell the server so it can tell your friend
        if (isLocalAction) {
            socket.emit("send-move", {
                roomId: roomId,
                move: { from, to }
            });
        }
    }

    // --- UPDATED CLICK HANDLER ---
    // Inside your square.onclick, instead of just changing the board, call applyMove
    /* Example change inside your existing click logic:
       if(moveIsLegal(selected.r, selected.c, r, c, p, currentTurn)) {
           applyMove({r: selected.r, c: selected.c}, {r, c}, true);
           selected = null;
       }
    */

    // ... (The rest of your rendering, setup, and board logic goes here)
})();
