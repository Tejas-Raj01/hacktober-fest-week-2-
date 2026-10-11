import { useState, useEffect, useRef } from 'react';
import './App.css';
import { useOfflineQueue } from './hooks/useOfflineQueue';
import VisionService from './services/vision';
import { LoreModal } from './components/LoreModal';
import { QuestView } from './components/QuestView';

function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [displayedLore, setDisplayedLore] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

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
    queueAction('StartGame', { room_code: gameState.room_code, player_id: playerId });
  };

  const handleCompleteTask = (verifiedProof: string) => {
    queueAction('CompleteTask', {
      room_code: gameState.room_code,
      player_id: playerId,
      proof: verifiedProof,
      task_index: gameState.current_task_index,
    });

    // Optimistic UI update
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

  // ================= LOBBY VIEW (WHEN NO GAME IS ACTIVE) =================
  if (!gameState) {
    return (
      <div className="app-wrapper">
        <header className="app-header">
          <h1 className="app-title">🌲 Outdoor Quest</h1>
          <p className="app-subtitle">Multiplayer AI Nature Scavenger Hunt • Offline-Ready PWA</p>
        </header>

        {/* Server Connection Banner */}
        <div className="connection-bar">
          <div className="connection-bar-header">
            <span style={{ color: 'var(--text-sub)' }}>Server Backend:</span>
            <span
              style={{
                fontWeight: 'bold',
                color:
                  connectionStatus === 'connected'
                    ? 'var(--accent-green)'
                    : connectionStatus === 'connecting'
                    ? 'var(--accent-yellow)'
                    : 'var(--accent-red)',
              }}
            >
              {connectionStatus === 'connected' && '🟢 Connected'}
              {connectionStatus === 'connecting' && '🟡 Connecting...'}
              {connectionStatus === 'disconnected' && '🔴 Disconnected'}
              {connectionStatus === 'error' && '❌ Connection Failed'}
            </span>
          </div>

          <div className="server-btn-group">
            <button
              onClick={() => switchServerUrl('ws://localhost:8080/ws')}
              style={{
                background: serverUrl.includes('localhost') ? 'var(--accent-blue)' : 'var(--bg-surface)',
                color: serverUrl.includes('localhost') ? '#11111b' : 'var(--text-main)',
              }}
            >
              Local (8080)
            </button>
            <button
              onClick={() => switchServerUrl('wss://hacktober-fest-week-2-7n52.onrender.com/ws')}
              style={{
                background: serverUrl.includes('onrender.com') ? 'var(--accent-blue)' : 'var(--bg-surface)',
                color: serverUrl.includes('onrender.com') ? '#11111b' : 'var(--text-main)',
              }}
            >
              Cloud (Render)
            </button>
            <button
              onClick={() => connectWs(serverUrl)}
              style={{
                background: 'var(--bg-surface)',
                color: 'var(--text-main)',
              }}
            >
              🔄 Reconnect
            </button>
          </div>

          {connectionStatus === 'connecting' && (
            <p style={{ fontSize: '0.8rem', color: 'var(--accent-yellow)', margin: '2px 0 0' }}>
              ⏳ Connecting to server... (Render cloud spin-up takes ~30s on cold start)
            </p>
          )}
        </div>

        {/* Lobby Error Alert */}
        {lobbyError && (
          <div
            style={{
              background: 'rgba(243, 139, 168, 0.15)',
              border: '1px solid var(--accent-red)',
              color: 'var(--accent-red)',
              padding: '14px',
              borderRadius: '10px',
              fontWeight: 'bold',
            }}
          >
            {lobbyError}
          </div>
        )}

        {/* Player Name Input Card */}
        <div className="mobile-card">
          <label style={{ display: 'block', color: 'var(--text-sub)', fontSize: '0.92rem', marginBottom: '8px', fontWeight: 'bold' }}>
            👤 Player Name:
          </label>
          <input
            className="mobile-input"
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

        {/* Responsive Lobby Cards (Side-by-side on Laptop, Stacked on Mobile) */}
        <div className="lobby-grid">
          {/* Create Room Card */}
          <div className="mobile-card">
            <h3 className="mobile-card-title">
              <span>👑</span> Host a New Game
            </h3>
            <p className="mobile-card-desc">
              Generate a unique room code, gather fellow players, and launch an outdoor expedition.
            </p>
            <button onClick={createGame} className="mobile-btn mobile-btn-blue">
              🎮 Create Game Room
            </button>
          </div>

          {/* Join Room Card */}
          <div className="mobile-card">
            <h3 className="mobile-card-title">
              <span>🚀</span> Join Existing Room
            </h3>
            <p className="mobile-card-desc">
              Have a room code from the host? Enter it below to jump directly into the lobby.
            </p>
            <input
              className="mobile-input"
              placeholder="Room Code (e.g. QUEST-1234)"
              value={roomCode}
              onChange={(e) => {
                setRoomCode(e.target.value);
                if (lobbyError) setLobbyError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') joinGame();
              }}
              style={{ textAlign: 'center', letterSpacing: '2px', fontWeight: 'bold' }}
            />
            <button onClick={joinGame} className="mobile-btn mobile-btn-green">
              ⚡ Join Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ================= IN-GAME VIEW (LOBBY / IN-PROGRESS / FINISHED) =================
  const isHost = gameState.players?.find((p: any) => p.id === playerId)?.is_host;
  const sortedPlayers = [...(gameState.players || [])].sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
  const currentTaskIndex = gameState.current_task_index || 0;
  const totalTasks = gameState.tasks?.length || 1;
  const progressPercent = Math.min(100, Math.round(((currentTaskIndex) / totalTasks) * 100));

  return (
    <div className="app-wrapper">
      {/* Top Navigation Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={leaveGame}
          className="mobile-btn mobile-btn-red"
          style={{ width: 'auto', minHeight: '38px', padding: '6px 16px', fontSize: '0.88rem' }}
        >
          🚪 Leave
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '0.82rem',
              fontWeight: 'bold',
              background:
                gameState.status === 'InProgress'
                  ? 'rgba(34, 197, 94, 0.2)'
                  : gameState.status === 'Lobby'
                  ? 'rgba(137, 180, 250, 0.2)'
                  : 'rgba(249, 226, 175, 0.2)',
              color:
                gameState.status === 'InProgress'
                  ? 'var(--accent-green)'
                  : gameState.status === 'Lobby'
                  ? 'var(--accent-blue)'
                  : 'var(--accent-yellow)',
              border: '1px solid currentColor',
            }}
          >
            {gameState.status === 'Lobby' && '⏳ Waiting Lobby'}
            {gameState.status === 'InProgress' && '🌲 Quest Active'}
            {gameState.status === 'Finished' && '🏆 Game Finished'}
          </span>
        </div>
      </div>

      {/* Main Responsive Grid (2 Columns on Laptop / 1 Column on Phone) */}
      <div className="game-grid">
        {/* LEFT COLUMN: ACTIVE QUEST / LOBBY / FINISH CARD */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* LOBBY STATE */}
          {gameState.status === 'Lobby' && (
            <div className="mobile-card" style={{ textAlign: 'center', padding: '36px 20px' }}>
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🏕️</div>
              <h2 style={{ color: 'var(--text-main)', margin: '0 0 10px 0' }}>Expedition Basecamp</h2>
              <p style={{ color: 'var(--text-sub)', fontSize: '1rem', margin: '0 0 24px 0' }}>
                Waiting for participants to join the lobby before launching the hunt.
              </p>

              {isHost ? (
                <button
                  onClick={startGame}
                  className="mobile-btn mobile-btn-blue"
                  style={{ maxWidth: '280px', margin: '0 auto', fontSize: '1.1rem' }}
                >
                  🚀 Start Game (Host)
                </button>
              ) : (
                <div
                  style={{
                    padding: '12px 20px',
                    background: 'var(--bg-surface)',
                    borderRadius: '10px',
                    color: 'var(--text-sub)',
                    display: 'inline-block',
                  }}
                >
                  ⏳ Waiting for the room host to start the game...
                </div>
              )}
            </div>
          )}

          {/* IN-PROGRESS QUEST */}
          {gameState.status === 'InProgress' && gameState.tasks?.[currentTaskIndex] && (
            <>
              {/* Quest Progress Tracker */}
              <div
                style={{
                  background: 'var(--bg-mantle)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '12px 16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-sub)' }}>
                    Quest <strong>{currentTaskIndex + 1}</strong> of <strong>{totalTasks}</strong>
                  </span>
                  <span style={{ color: 'var(--accent-green)', fontWeight: 'bold' }}>{progressPercent}% Complete</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: 'var(--bg-surface)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${progressPercent}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #38bdf8, #22c55e)',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>

              {/* State-Gated Quest View with Live Camera Viewfinder */}
              <QuestView
                task={gameState.tasks[currentTaskIndex]}
                onCompleteTask={handleCompleteTask}
              />
            </>
          )}

          {/* FINISHED STATE */}
          {gameState.status === 'Finished' && (
            <div className="mobile-card" style={{ textAlign: 'center', padding: '36px 20px' }}>
              <div style={{ fontSize: '3.5rem', marginBottom: '12px' }}>🏆</div>
              <h2 style={{ color: 'var(--accent-yellow)', margin: '0 0 10px 0' }}>Expedition Completed!</h2>
              <p style={{ color: 'var(--text-sub)', fontSize: '1rem', margin: '0 0 24px 0' }}>
                All nature quests have been completed. Check out the final leaderboard scores!
              </p>
              <button
                onClick={leaveGame}
                className="mobile-btn mobile-btn-green"
                style={{ maxWidth: '280px', margin: '0 auto' }}
              >
                🌲 Return to Basecamp
              </button>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: ROOM CODE & LEADERBOARD SCOREBOARD */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Room Code Card with One-Click Copy */}
          <div className="room-code-display">
            <span style={{ fontSize: '0.85rem', color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Room Code
            </span>
            <span className="room-code-pill">{gameState.room_code}</span>
            <button
              onClick={copyRoomCode}
              className="mobile-btn mobile-btn-subtle"
              style={{ minHeight: '36px', fontSize: '0.85rem', width: 'auto', padding: '6px 18px' }}
            >
              {copiedCode ? '✅ Copied!' : '📋 Copy Code'}
            </button>
          </div>

          {/* Scoreboard Card */}
          <div className="scoreboard-card">
            <h3 style={{ margin: '0 0 14px 0', color: 'var(--text-main)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🏅</span> Leaderboard
            </h3>

            <div className="scoreboard-list">
              {sortedPlayers.map((p: any, idx: number) => {
                const isCurrentPlayer = p.id === playerId;
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;

                return (
                  <div
                    key={p.id}
                    className={`scoreboard-row ${isCurrentPlayer ? 'is-current' : ''}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="rank-badge">{medal}</span>
                      <span style={{ fontWeight: isCurrentPlayer ? 'bold' : 'normal', color: 'var(--text-main)' }}>
                        {p.name} {p.is_host && '👑'} {isCurrentPlayer && <small style={{ color: 'var(--accent-green)' }}>(You)</small>}
                      </span>
                    </div>
                    <span style={{ color: 'var(--accent-green)', fontWeight: 'bold' }}>
                      {p.score || 0} pts
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Lore Modal Component */}
      <LoreModal lore={displayedLore} onClose={() => setDisplayedLore(null)} />
    </div>
  );
}

export default App;
