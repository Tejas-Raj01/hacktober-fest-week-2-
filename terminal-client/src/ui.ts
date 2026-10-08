import { GameState } from './types.js';

// ANSI escape codes for terminal formatting
export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgMagenta: '\x1b[45m',
};

export function clearScreen(): void {
  process.stdout.write('\x1Bc');
}

export function renderBanner(): void {
  console.log(`${colors.cyan}${colors.bright}`);
  console.log(`========================================================================`);
  console.log(`  🌲 🪨 ☁️   O U T D O O R   Q U E S T   (5-Task Challenge)  🚶 🏷️`);
  console.log(`========================================================================${colors.reset}\n`);
}

export function renderLobby(
  state: GameState,
  joinUrl: string,
  myPlayerId: string,
  logs: string[]
): void {
  clearScreen();
  renderBanner();

  console.log(`${colors.yellow}${colors.bright}📢 GAME LOBBY${colors.reset}`);
  console.log(`${colors.bright}🔑 ROOM CODE TO SHARE WITH FRIENDS:${colors.reset}`);
  console.log(`   👉 ${colors.green}${colors.bright}${state.room_code}${colors.reset}\n`);

  console.log(`${colors.bright}👥 CONNECTED PLAYERS (${state.players.length}):${colors.reset}`);
  state.players.forEach((p, index) => {
    const isMe = p.id === myPlayerId ? ` ${colors.cyan}(You)${colors.reset}` : '';
    const hostTag = p.is_host ? ` ${colors.yellow}[HOST]${colors.reset}` : '';
    console.log(`   ${index + 1}. ${p.name}${hostTag}${isMe}`);
  });

  const me = state.players.find((p) => p.id === myPlayerId);

  console.log('\n------------------------------------------------------------------------');
  if (me?.is_host) {
    console.log(`${colors.green}${colors.bright}👉 Press [S] + ENTER to START THE GAME for everyone!${colors.reset}`);
  } else {
    console.log(`${colors.yellow}⏳ Waiting for the Host to start the game...${colors.reset}`);
  }
  console.log(`👉 Press [Q] + ENTER to Quit`);
  console.log('------------------------------------------------------------------------\n');

  renderLogs(logs);
}

export function renderGame(
  state: GameState,
  myPlayerId: string,
  logs: string[]
): void {
  clearScreen();
  renderBanner();

  const currentTask = state.tasks[state.current_task_index];
  const taskNumber = state.current_task_index + 1;
  const totalTasks = state.tasks.length;

  console.log(
    `${colors.bgBlue}${colors.white}${colors.bright}  TASK ${taskNumber} OF ${totalTasks}: ${currentTask.title}  ${colors.reset}\n`
  );
  console.log(`${colors.bright}📋 OBJECTIVE:${colors.reset}`);
  console.log(`   ${colors.yellow}${currentTask.description}${colors.reset}`);
  console.log(`   💰 Reward: ${colors.green}+${currentTask.points} Points${colors.reset}\n`);

  // Render Last Photo Proof if available
  if (state.last_proof) {
    console.log(`${colors.bgMagenta}${colors.white}${colors.bright}  📸 LATEST PHOTO PROOF SUBMITTED  ${colors.reset}`);
    console.log(`   👤 Player: ${colors.cyan}${state.last_proof.player_name}${colors.reset}`);
    console.log(`   🎯 Task:   ${state.last_proof.task_title}`);
    console.log(`   🖼️  Proof:  ${colors.yellow}${state.last_proof.proof}${colors.reset}\n`);
  }

  // Render Leaderboard
  console.log(`${colors.bright}📊 LIVE LEADERBOARD:${colors.reset}`);
  const sortedPlayers = [...state.players].sort((a, b) => b.score - a.score);
  sortedPlayers.forEach((p, idx) => {
    const isMe = p.id === myPlayerId ? ` ${colors.cyan}(You)${colors.reset}` : '';
    const trophy = idx === 0 && p.score > 0 ? '🏆 ' : '   ';
    console.log(`   ${trophy}${idx + 1}. ${p.name.padEnd(15)} : ${colors.green}${colors.bright}${p.score} pts${colors.reset}${isMe}`);
  });

  console.log('\n------------------------------------------------------------------------');
  console.log(`${colors.green}${colors.bright}👉 Press [C] + ENTER to COMPLETE task & submit photo proof! (+10 pts)${colors.reset}`);
  console.log(`👉 Press [Q] + ENTER to Quit`);
  console.log('------------------------------------------------------------------------\n');

  renderLogs(logs);
}

export function renderFinished(
  state: GameState,
  myPlayerId: string,
  logs: string[]
): void {
  clearScreen();
  renderBanner();

  console.log(`${colors.bgYellow}${colors.white}${colors.bright}  🏁 GAME OVER - FINAL RESULTS 🏁  ${colors.reset}\n`);

  const winnersStr = state.winners.join(', ');
  console.log(`🏆 WINNER(S): ${colors.yellow}${colors.bright}${winnersStr}${colors.reset}\n`);

  console.log(`${colors.bright}🥇 FINAL LEADERBOARD:${colors.reset}`);
  const sortedPlayers = [...state.players].sort((a, b) => b.score - a.score);
  sortedPlayers.forEach((p, idx) => {
    const isMe = p.id === myPlayerId ? ` ${colors.cyan}(You)${colors.reset}` : '';
    const medal = idx === 0 ? '🥇 ' : idx === 1 ? '🥈 ' : idx === 2 ? '🥉 ' : '   ';
    console.log(`   ${medal}${idx + 1}. ${p.name.padEnd(15)} : ${colors.green}${colors.bright}${p.score} pts${colors.reset}${isMe}`);
  });

  console.log('\n------------------------------------------------------------------------');
  console.log(`Thanks for playing Outdoor Quest!`);
  console.log(`👉 Press [Q] + ENTER to Exit`);
  console.log('------------------------------------------------------------------------\n');

  renderLogs(logs);
}

export function renderLogs(logs: string[]): void {
  if (logs.length === 0) return;
  console.log(`${colors.dim}📜 Recent Activity:${colors.reset}`);
  logs.slice(-4).forEach((log) => console.log(`   ${colors.dim}${log}${colors.reset}`));
}
