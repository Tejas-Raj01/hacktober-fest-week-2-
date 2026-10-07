import WebSocket from 'ws';
import readline from 'readline';
import {
  GameState,
  ClientMessage,
  ServerMessage,
} from './types.js';
import {
  renderBanner,
  renderLobby,
  renderGame,
  renderFinished,
  clearScreen,
  colors,
} from './ui.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

let ws: WebSocket | null = null;
let gameState: GameState | null = null;
let myPlayerId: string = '';
let roomCode: string = '';
let joinUrl: string = '';
let logs: string[] = [];
let isPromptingProof = false;

// Auto-discover the active Rust server across common ports (3001, 3002, 3000, 3003)
async function connectToActiveServer(): Promise<WebSocket> {
  const ports = [3001, 3002, 3000, 3003, 3004];
  
  if (process.env.WS_URL) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(process.env.WS_URL!);
      socket.on('open', () => resolve(socket));
      socket.on('error', (err) => reject(err));
    });
  }

  for (const port of ports) {
    try {
      const socket = await new Promise<WebSocket>((resolve, reject) => {
        const url = `ws://localhost:${port}/ws`;
        const candidate = new WebSocket(url);
        const timer = setTimeout(() => {
          candidate.close();
          reject(new Error('Timeout'));
        }, 800);

        candidate.on('open', () => {
          clearTimeout(timer);
          resolve(candidate);
        });

        candidate.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      return socket;
    } catch (e) {
      // Try next port silently
    }
  }

  throw new Error(
    'Unable to connect to the Outdoor Quest game server.\nPlease make sure the Rust server is running (run "cargo run" inside server/ directory).'
  );
}

async function main() {
  clearScreen();
  renderBanner();

  console.log(`${colors.bright}Select Option:${colors.reset}`);
  console.log(`  1. 🎮 Start a New Game (Host)`);
  console.log(`  2. 🔗 Join an Existing Game`);
  console.log(`  3. ❌ Exit\n`);

  const choice = await prompt(`${colors.cyan}Enter choice (1-3): ${colors.reset}`);

  if (choice.trim() === '3') {
    console.log('Goodbye!');
    process.exit(0);
  }

  const nameInput = await prompt(`${colors.cyan}Enter your Player Name: ${colors.reset}`);
  const playerName = nameInput.trim() || 'Player';

  let targetRoomCode = '';
  if (choice.trim() !== '1') {
    const roomInput = await prompt(`${colors.cyan}Enter Room Code (e.g. QUEST-1234): ${colors.reset}`);
    let code = roomInput.trim();
    if (code.includes('/join/')) {
      code = code.split('/join/').pop() || code;
    }
    targetRoomCode = code;
    if (!targetRoomCode) {
      console.log(`${colors.yellow}Room code cannot be empty!${colors.reset}`);
      process.exit(1);
    }
  }

  console.log(`\n${colors.dim}Connecting to game server...${colors.reset}`);

  try {
    ws = await connectToActiveServer();
  } catch (err: any) {
    console.error(`\n${colors.yellow}❌ Connection Error: ${err.message}${colors.reset}\n`);
    process.exit(1);
  }

  if (choice.trim() === '1') {
    // Host game
    const msg: ClientMessage = {
      type: 'CreateGame',
      payload: { player_name: playerName },
    };
    ws.send(JSON.stringify(msg));
  } else {
    // Join game
    roomCode = targetRoomCode;
    const msg: ClientMessage = {
      type: 'JoinGame',
      payload: { room_code: targetRoomCode, player_name: playerName },
    };
    ws.send(JSON.stringify(msg));
  }

  ws.on('message', (data: WebSocket.RawData) => {
    try {
      const serverMsg: ServerMessage = JSON.parse(data.toString());
      handleServerMessage(serverMsg);
    } catch (e) {
      console.error('Failed to parse server message:', e);
    }
  });

  ws.on('error', (err) => {
    console.error(`\n${colors.yellow}WebSocket Error: ${err.message}${colors.reset}`);
    process.exit(1);
  });

  ws.on('close', () => {
    console.log(`\n${colors.yellow}Disconnected from game server.${colors.reset}`);
    process.exit(0);
  });

  // Setup stdin keyboard handler for actions
  setupInputHandler();
}

function handleServerMessage(msg: ServerMessage) {
  switch (msg.type) {
    case 'GameCreated':
      roomCode = msg.payload.room_code;
      joinUrl = msg.payload.join_url;
      myPlayerId = msg.payload.player_id;
      gameState = msg.payload.state;
      logs.push(`Game room created! Room Code: ${roomCode}`);
      refreshScreen();
      break;

    case 'GameJoined':
      roomCode = msg.payload.room_code;
      joinUrl = msg.payload.state.room_code;
      myPlayerId = msg.payload.player_id;
      gameState = msg.payload.state;
      logs.push(`Successfully joined room ${roomCode}`);
      refreshScreen();
      break;

    case 'StateUpdate':
      gameState = msg.payload.state;
      if (msg.payload.log_message) {
        logs.push(msg.payload.log_message);
      }
      refreshScreen();
      break;

    case 'Error':
      console.log(`\n${colors.yellow}⚠️ Server Error: ${msg.payload.message}${colors.reset}`);
      break;
  }
}

function refreshScreen() {
  if (!gameState || isPromptingProof) return;

  if (gameState.status === 'Lobby') {
    renderLobby(gameState, joinUrl, myPlayerId, logs);
  } else if (gameState.status === 'InProgress') {
    renderGame(gameState, myPlayerId, logs);
  } else if (gameState.status === 'Finished') {
    renderFinished(gameState, myPlayerId, logs);
  }
}

function setupInputHandler() {
  rl.on('line', async (line) => {
    if (isPromptingProof) return;

    const input = line.trim().toLowerCase();

    if (input === 'q') {
      console.log('Exiting game...');
      ws?.close();
      process.exit(0);
    }

    if (!gameState || !ws) return;

    if (gameState.status === 'Lobby') {
      if (input === 's') {
        const me = gameState.players.find((p) => p.id === myPlayerId);
        if (me?.is_host) {
          const msg: ClientMessage = {
            type: 'StartGame',
            payload: { room_code: roomCode, player_id: myPlayerId },
          };
          ws.send(JSON.stringify(msg));
        } else {
          console.log(`${colors.yellow}Only the host can start the game!${colors.reset}`);
        }
      }
    } else if (gameState.status === 'InProgress') {
      if (input === 'c') {
        isPromptingProof = true;
        const currentTask = gameState.tasks[gameState.current_task_index];
        console.log(`\n${colors.magenta}${colors.bright}📸 PHOTO PROOF REQUIRED FOR: ${currentTask.title}${colors.reset}`);
        console.log(`${colors.yellow}Example: ./grass_photo.jpg or 'Touching green grass in park'${colors.reset}`);

        const proofInput = await prompt(`${colors.cyan}Enter Photo Proof (file path or photo description): ${colors.reset}`);
        const finalProof = proofInput.trim() || '📷 Photo Proof Verified (Outdoor task completed)';

        isPromptingProof = false;
        const msg: ClientMessage = {
          type: 'CompleteTask',
          payload: {
            room_code: roomCode,
            player_id: myPlayerId,
            proof: finalProof,
          },
        };
        ws.send(JSON.stringify(msg));
      }
    }
  });
}

main().catch((err) => {
  console.error('Fatal client error:', err);
});
