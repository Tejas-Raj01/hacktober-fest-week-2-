import { useState, useEffect, useRef } from 'react';
import './App.css';
import { useOfflineQueue } from './hooks/useOfflineQueue';
import VisionService from './services/vision';
import { LoreModal } from './components/LoreModal';
import { QuestScanner } from './components/QuestScanner';
import { QUESTS } from './data/quests';

export type GameView = 'lobby' | 'scanner';

function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [displayedLore, setDisplayedLore] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Requirement: View state, starting strictly on the Lobby view by default
  const [currentView, setCurrentView] = useState<GameView>('lobby');

  const [questIndex, setQuestIndex] = useState(0);
  const [, setUserScore] = useState(0);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const [serverUrl, setServerUrl] = useState<string>(() => {
    return (
      localStorage.getItem('oq_server_url') ||
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'ws://localhost:8080/ws'
        : 'wss://hacktober-fest-week-2-7n52.onrender.com/ws')
    );
  });
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>(
    'connecting'
  );
  const [lobbyError, setLobbyError] = useState<string | null>(null);

  const [wsReady, setWsReady] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const { queueAction } = useOfflineQueue(ws, wsReady);

  const connectWs = (targetUrl: string) => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {}
    }
    setConnectionStatus('connecting');
    setWsReady(false);
    setLobbyError(null);

    let socket: WebSocket;
    try {
      socket = new WebSocket(targetUrl);
    } catch (err: any) {
      setConnectionStatus('error');
      setLobbyError(`Failed to connect to ${targetUrl}: ${err?.message || err}`);
      return;
    }

    socket.onopen = () => {
      setWsReady(true);
      setConnectionStatus('connected');
      setLobbyError(null);
    };

    socket.onclose = () => {
      setWsReady(false);
      setConnectionStatus('disconnected');
    };

    socket.onerror = () => {
      setWsReady(false);
      setConnectionStatus('error');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case 'GameCreated':
            setPlayerId(data.payload.player_id);
            setGameState(data.payload.state);
            break;
          case 'GameJoined':
            setPlayerId(data.payload.player_id);
            setGameState(data.payload.state);
            break;
          case 'StateUpdate':
            setGameState(data.payload.state);
            // Switch to scanner automatically when game transitions to InProgress
            if (data.payload.state.status === 'InProgress') {
              setCurrentView('scanner');
            }
            break;
          case 'LoreEvent':
            setDisplayedLore(data.payload.lore);
            break;
          case 'Error':
            setLobbyError(`Server Error: ${data.payload.message}`);
            break;
          default:
            break;
        }
      } catch (e) {
        console.error('Error parsing WebSocket message:', e);
      }
    };

    wsRef.current = socket;
    setWs(socket);
  };

  useEffect(() => {
    connectWs(serverUrl);
    VisionService.initialize();

    return () => {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {}
      }
    };
  }, [serverUrl]);

  const switchServerUrl = (newUrl: string) => {
    localStorage.setItem('oq_server_url', newUrl);
    setServerUrl(newUrl);
  };

  const createGame = () => {
    setLobbyError(null);
    const trimmedName = playerName.trim();
    if (!trimmedName) {
      setLobbyError('⚠️ Please enter your Player Name before creating a game.');
      return;
    }
    if (!wsReady || !ws || ws.readyState !== WebSocket.OPEN) {
      setLobbyError('⏳ Still connecting to server... Please wait a moment or verify your server is running.');
      connectWs(serverUrl);
      return;
    }
    ws.send(JSON.stringify({ type: 'CreateGame', payload: { player_name: trimmedName } }));
  };

  const joinGame = () => {
    setLobbyError(null);
    const trimmedName = playerName.trim();
    const trimmedRoom = roomCode.trim().toUpperCase();
    if (!trimmedName) {
      setLobbyError('⚠️ Please enter your Player Name before joining a game.');
      return;
    }
    if (!trimmedRoom) {
      setLobbyError('⚠️ Please enter a Room Code (e.g. QUEST-1234).');
      return;
    }
    if (!wsReady || !ws || ws.readyState !== WebSocket.OPEN) {
      setLobbyError('⏳ Still connecting to server... Please wait a moment or verify your server is running.');
      connectWs(serverUrl);
      return;
    }
    ws.send(JSON.stringify({ type: 'JoinGame', payload: { room_code: trimmedRoom, player_name: trimmedName } }));
  };

  const startGame = () => {
    if (!gameState?.room_code || !playerId) return;
    queueAction('StartGame', { room_code: gameState.room_code, player_id: playerId });
    setCurrentView('scanner');
  };

  const handleCompleteTask = (verifiedProof: string) => {
    if (!gameState) return;
    queueAction('CompleteTask', {
      room_code: gameState.room_code,
      player_id: playerId,
      proof: verifiedProof,
      task_index: gameState.current_task_index,
    });

    if (gameState.current_task_index + 1 < gameState.tasks.length) {
      setGameState((prev: any) => ({
        ...prev,
        current_task_index: prev.current_task_index + 1,
      }));
    } else {
      setGameState((prev: any) => ({
        ...prev,
        status: 'Finished',
      }));
    }
  };

  const copyRoomCode = () => {
    if (!gameState?.room_code) return;
    navigator.clipboard.writeText(gameState.room_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const leaveGame = () => {
    window.location.reload();
  };

  // ================= 1. ACTIVE CAMERA SCANNER VIEW =================
  if (currentView === 'scanner') {
    const isMultiplayerActive =
      gameState?.status === 'InProgress' && gameState.tasks?.[gameState.current_task_index || 0];

    const activeQuest = isMultiplayerActive
      ? {
          targetKeyword: gameState.tasks[gameState.current_task_index || 0].title?.toLowerCase().trim(),
          points: gameState.tasks[gameState.current_task_index || 0].points || 10,
        }
      : {
          targetKeyword: QUESTS[questIndex % QUESTS.length].targetKeyword,
          points: QUESTS[questIndex % QUESTS.length].points || 10,
        };

    return (
      <div className="min-h-screen w-full bg-[#65A369] text-black font-sans flex flex-col select-none">
        <QuestScanner
          targetKeyword={activeQuest.targetKeyword}
          points={activeQuest.points}
          onSuccess={(proofUrl) => {
            setUserScore((s) => s + activeQuest.points);
            if (isMultiplayerActive) {
              handleCompleteTask(proofUrl);
            }
          }}
          onBack={() => {
            if (isMultiplayerActive) return;
            setQuestIndex((idx) => (idx > 0 ? idx - 1 : QUESTS.length - 1));
          }}
          onNext={() => {
            if (isMultiplayerActive) return;
            setQuestIndex((idx) => (idx + 1) % QUESTS.length);
          }}
          onSettings={() => {
            setShowSettingsModal(true);
          }}
        />

        {/* In-Game Settings Modal */}
        {showSettingsModal && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="bg-[#65A369] border-4 border-black p-6 rounded-2xl shadow-[6px_6px_0px_rgba(0,0,0,1)] max-w-sm w-full flex flex-col gap-4 font-sans text-black">
              <div className="flex justify-between items-center border-b-4 border-black pb-2">
                <h3 className="text-xl font-black uppercase">Settings &amp; Menu</h3>
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="border-2 border-black bg-red-400 font-black px-2 py-0.5 text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="bg-white border-4 border-black p-3 shadow-brutal flex flex-col gap-1 rounded-xl">
                <span className="text-xs uppercase font-black text-gray-500">Active Quest Target</span>
                <span className="text-lg font-black uppercase text-green-700">
                  {QUESTS[questIndex % QUESTS.length].title} ({activeQuest.targetKeyword})
                </span>
                <span className="text-xs text-gray-700 font-bold">
                  {QUESTS[questIndex % QUESTS.length].description}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(false);
                  setCurrentView('lobby');
                }}
                className="w-full bg-[#A3E681] border-4 border-black font-black uppercase py-3 rounded-xl shadow-brutal active:translate-x-1 active:translate-y-1 active:shadow-none cursor-pointer"
              >
                🏕️ Return to Game Lobby
              </button>

              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="w-full bg-gray-200 border-4 border-black font-black uppercase py-3 rounded-xl shadow-brutal active:translate-x-1 active:translate-y-1 active:shadow-none cursor-pointer"
              >
                Resume Camera Scan
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ================= 2. MULTIPLAYER ROOM IN LOBBY / FINISHED =================
  if (gameState) {
    const isHost = gameState.players?.find((p: any) => p.id === playerId)?.is_host;
    const sortedPlayers = [...(gameState.players || [])].sort((a: any, b: any) => (b.score || 0) - (a.score || 0));

    return (
      <div className="min-h-screen w-full bg-[#65A369] text-black font-sans flex flex-col">
        <div className="max-w-xl mx-auto flex flex-col p-4 shadow-brutal border-r-4 border-l-4 border-black min-h-screen bg-[#A3E681]/30 backdrop-blur-sm w-full gap-4">
          {/* Top Bar */}
          <div className="flex justify-between items-center w-full">
            <button
              onClick={leaveGame}
              className="bg-red-400 text-black font-black border-4 border-black px-4 py-2 rounded-lg shadow-brutal active:translate-x-1 active:translate-y-1 active:shadow-none uppercase text-sm cursor-pointer"
            >
              🚪 Leave Room
            </button>

            <span className="bg-[#A3E681] border-4 border-black font-black rounded-full px-4 py-1.5 shadow-brutal text-sm uppercase">
              {gameState.status === 'Lobby' && '⏳ Waiting Lobby'}
              {gameState.status === 'Finished' && '🏆 Game Finished'}
            </span>
          </div>

          {/* Room Code Card */}
          <div className="bg-white border-4 border-black p-4 rounded-2xl shadow-brutal flex justify-between items-center">
            <div>
              <span className="text-xs uppercase font-black text-gray-500 block">Room Code</span>
              <span className="text-2xl font-black uppercase tracking-widest text-black">
                {gameState.room_code}
              </span>
            </div>
            <button
              onClick={copyRoomCode}
              className="bg-yellow-400 text-black font-black border-4 border-black px-4 py-2 rounded-xl shadow-brutal text-sm uppercase active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
            >
              {copiedCode ? '✅ Copied!' : '📋 Copy'}
            </button>
          </div>

          {/* Lobby Waiting Card */}
          {gameState.status === 'Lobby' && (
            <div className="bg-white border-4 border-black p-6 rounded-2xl shadow-brutal text-center flex flex-col items-center gap-4">
              <span className="text-5xl">🏕️</span>
              <h2 className="text-2xl font-black uppercase tracking-wider text-black">
                Expedition Basecamp
              </h2>
              <p className="text-gray-700 font-bold text-sm">
                Waiting for players to assemble before launching the scavenger hunt.
              </p>

              {isHost ? (
                <button
                  onClick={startGame}
                  className="w-full max-w-xs bg-[#60A5FA] text-white font-black border-4 border-black shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_rgba(0,0,0,1)] p-4 rounded-xl text-lg uppercase transition-all cursor-pointer"
                >
                  🚀 Start Game (Host)
                </button>
              ) : (
                <div className="bg-gray-200 border-2 border-black rounded-lg p-3 font-bold text-xs uppercase text-gray-700">
                  ⏳ Waiting for the room host to start...
                </div>
              )}
            </div>
          )}

          {/* Finished Card */}
          {gameState.status === 'Finished' && (
            <div className="bg-white border-4 border-black p-6 rounded-2xl shadow-brutal text-center flex flex-col items-center gap-4">
              <span className="text-5xl">🏆</span>
              <h2 className="text-2xl font-black uppercase tracking-wider text-black">
                Expedition Completed!
              </h2>
              <p className="text-gray-700 font-bold text-sm">
                All nature quests have been completed. Check out the final leaderboard!
              </p>
              <button
                onClick={leaveGame}
                className="w-full max-w-xs bg-[#86EFAC] text-black font-black border-4 border-black shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_rgba(0,0,0,1)] p-4 rounded-xl text-lg uppercase transition-all cursor-pointer"
              >
                🌲 Return to Basecamp
              </button>
            </div>
          )}

          {/* Leaderboard Players List */}
          <div className="bg-white border-4 border-black p-5 rounded-2xl shadow-brutal flex flex-col gap-3">
            <h3 className="font-black text-lg uppercase tracking-wider text-black flex items-center gap-2">
              <span>🏅</span> Adventurers ({sortedPlayers.length})
            </h3>
            <div className="flex flex-col gap-2">
              {sortedPlayers.map((p: any, idx: number) => {
                const isCurrent = p.id === playerId;
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
                return (
                  <div
                    key={p.id}
                    className={`flex justify-between items-center p-3 border-2 border-black rounded-xl ${
                      isCurrent ? 'bg-[#A3E681]/40 font-black' : 'bg-gray-100 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{medal}</span>
                      <span>
                        {p.name} {p.is_host && '👑'} {isCurrent && '(You)'}
                      </span>
                    </div>
                    <span className="font-black text-green-800">{p.score || 0} pts</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ================= 3. MAIN GAME LOBBY VIEW (DEFAULT) =================
  return (
    <div className="min-h-screen w-full bg-[#65A369] text-black font-sans flex flex-col select-none">
      {/* Centered Mobile/Tablet Widescreen Frame with Edge-to-Edge Green Sides */}
      <div className="max-w-xl mx-auto flex flex-col p-4 shadow-brutal border-r-4 border-l-4 border-black min-h-screen bg-[#A3E681]/30 backdrop-blur-sm w-full">
        {/* Top Bar: Solo Active Scanner CTA */}
        <div className="bg-[#A3E681] border-4 border-black p-4 rounded-xl shadow-brutal flex justify-between items-center mb-6">
          <div>
            <span className="font-black text-sm uppercase tracking-wide block text-black">
              📸 Solo Active Scanner
            </span>
            <span className="text-xs font-bold text-gray-800">
              Practice &amp; test edge AI without room code
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCurrentView('scanner')}
            className="bg-[#FBBF24] border-4 border-black font-black text-lg px-4 py-2 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all cursor-pointer text-black"
          >
            Open Scanner
          </button>
        </div>

        {/* Header with Cartoon Game Shadow */}
        <header className="text-center mb-6">
          <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-wider [text-shadow:_4px_4px_0px_#000] drop-shadow-lg mb-2">
            🌲 Outdoor Quest
          </h1>
          <p className="text-black font-bold text-sm md:text-base tracking-wide">
            Multiplayer AI Nature Scavenger Hunt • Offline-Ready PWA
          </p>
        </header>

        {/* Server Backend Connection Bar */}
        <div className="bg-white border-4 border-black p-4 rounded-2xl shadow-brutal flex flex-col gap-3 mb-6">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <span className="font-black text-sm uppercase tracking-wide text-black">
              Server Backend:
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`w-3.5 h-3.5 rounded-full border-2 border-black ${
                  connectionStatus === 'connected'
                    ? 'bg-green-500 animate-pulse shadow-[0_0_8px_#22c55e]'
                    : connectionStatus === 'connecting'
                    ? 'bg-yellow-400 animate-ping'
                    : 'bg-red-500'
                }`}
              />
              <span className="font-black text-xs uppercase tracking-wider text-black">
                {connectionStatus === 'connected' && '🟢 Connected'}
                {connectionStatus === 'connecting' && '🟡 Connecting...'}
                {connectionStatus === 'disconnected' && '🔴 Disconnected'}
                {connectionStatus === 'error' && '❌ Connection Failed'}
              </span>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => switchServerUrl('ws://localhost:8080/ws')}
              className={`px-3 py-2 rounded-lg text-sm transition-all cursor-pointer ${
                serverUrl.includes('localhost')
                  ? 'bg-[#60A5FA] border-4 border-black font-black text-white shadow-brutal'
                  : 'bg-gray-300 border-4 border-black rounded-lg text-black font-bold shadow-brutal hover:bg-gray-200'
              }`}
            >
              Local (8080)
            </button>
            <button
              type="button"
              onClick={() => switchServerUrl('wss://hacktober-fest-week-2-7n52.onrender.com/ws')}
              className={`px-3 py-2 rounded-lg text-sm transition-all cursor-pointer ${
                serverUrl.includes('onrender.com')
                  ? 'bg-[#60A5FA] border-4 border-black font-black text-white shadow-brutal'
                  : 'bg-gray-300 border-4 border-black rounded-lg text-black font-bold shadow-brutal hover:bg-gray-200'
              }`}
            >
              Cloud (Render)
            </button>
            <button
              type="button"
              onClick={() => connectWs(serverUrl)}
              className="px-3 py-2 rounded-lg text-sm bg-gray-300 border-4 border-black rounded-lg text-black font-bold shadow-brutal hover:bg-gray-200 transition-all cursor-pointer"
            >
              🔄 Reconnect
            </button>
          </div>

          {connectionStatus === 'connecting' && (
            <p className="text-xs font-bold text-amber-800">
              ⏳ Connecting to server... (Render cloud spin-up takes ~30s on cold start)
            </p>
          )}
        </div>

        {/* Lobby Error Alert */}
        {lobbyError && (
          <div className="bg-red-200 border-4 border-red-800 text-red-950 p-4 rounded-xl font-black text-sm mb-6 shadow-brutal">
            {lobbyError}
          </div>
        )}

        {/* Player Name Input Card */}
        <div className="mb-6">
          <label className="block text-black font-black text-sm uppercase tracking-wider mb-2">
            👤 Adventurer Name:
          </label>
          <input
            className="border-4 border-black rounded-xl bg-white p-4 font-bold text-lg focus:outline-none focus:ring-4 focus:ring-yellow-400 placeholder-gray-500 shadow-brutal text-black w-full"
            placeholder="Enter your adventurer name..."
            value={playerName}
            onChange={(e) => {
              setPlayerName(e.target.value);
              if (lobbyError) setLobbyError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createGame();
            }}
          />
        </div>

        {/* Game Mode Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Host Card */}
          <div className="bg-white border-4 border-black p-6 rounded-2xl shadow-brutal flex flex-col justify-between">
            <div>
              <h3 className="text-2xl font-black uppercase text-black flex items-center gap-2 mb-2">
                <span>👑</span> Host a New Game
              </h3>
              <p className="text-gray-700 font-bold text-sm mb-4 leading-snug">
                Generate a unique room code, gather fellow players, and launch an outdoor expedition.
              </p>
            </div>
            <button
              type="button"
              onClick={createGame}
              className="bg-[#60A5FA] text-white font-black border-4 border-black shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_rgba(0,0,0,1)] p-4 rounded-xl text-lg uppercase transition-all cursor-pointer w-full text-center"
            >
              🎮 Create Game Room
            </button>
          </div>

          {/* Join Card */}
          <div className="bg-white border-4 border-black p-6 rounded-2xl shadow-brutal flex flex-col justify-between">
            <div>
              <h3 className="text-2xl font-black uppercase text-black flex items-center gap-2 mb-2">
                <span>🚀</span> Join Existing Room
              </h3>
              <p className="text-gray-700 font-bold text-sm mb-4 leading-snug">
                Have a room code from the host? Enter it below to jump directly into the lobby.
              </p>
            </div>
            <div className="flex flex-col gap-2 mt-auto">
              <input
                className="border-4 border-black rounded-xl bg-white p-4 font-black text-lg text-center tracking-widest focus:outline-none focus:ring-4 focus:ring-yellow-400 placeholder-gray-500 shadow-brutal text-black w-full"
                placeholder="ROOM CODE (QUEST-1234)"
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value.toUpperCase());
                  if (lobbyError) setLobbyError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') joinGame();
                }}
              />
              <button
                type="button"
                onClick={joinGame}
                className="bg-[#86EFAC] text-black font-black border-4 border-black shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_rgba(0,0,0,1)] p-4 rounded-xl text-lg uppercase transition-all cursor-pointer w-full text-center"
              >
                ⚡ Join Room
              </button>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <footer className="mt-auto text-center py-4 border-t-2 border-black/20 text-xs font-black uppercase tracking-wider text-black/70">
          Touch Grass Edition • Offline Transformers.js Vision
        </footer>
      </div>

      {/* Lore Modal Component */}
      <LoreModal lore={displayedLore} onClose={() => setDisplayedLore(null)} />
    </div>
  );
}

export default App;
