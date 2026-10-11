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

  const [serverUrl, setServerUrl] = useState<string>(() => {
    return localStorage.getItem('oq_server_url') || 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'ws://localhost:8080/ws' 
        : 'wss://hacktober-fest-week-2-7n52.onrender.com/ws');
  });
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
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
        if (data.type === 'GameCreated' || data.type === 'GameJoined' || data.type === 'StateUpdate') {
          setGameState(data.payload.state);
          if (data.payload.player_id) {
            setPlayerId(data.payload.player_id);
          }
        }

        if (data.type === 'Error') {
          setLobbyError(`Server Error: ${data.payload.message}`);
        }

        if (data.type === 'StateUpdate' && data.payload.state?.last_proof?.lore) {
          setDisplayedLore(data.payload.state.last_proof.lore);
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message', e);
      }
    };

    setWs(socket);
    wsRef.current = socket;
  };

  useEffect(() => {
    VisionService.initialize();
    connectWs(serverUrl);

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
      task_index: gameState.current_task_index
    });
    
    // Optimistic UI update (simulate moving to next task if possible)
    if (gameState.current_task_index + 1 < gameState.tasks.length) {
       setGameState((prev: any) => ({
         ...prev,
         current_task_index: prev.current_task_index + 1
       }));
    } else {
       setGameState((prev: any) => ({
         ...prev,
         status: 'Finished'
       }));
    }
  };

  const leaveGame = () => {
    window.location.reload();
  };

  if (!gameState) {
    return (
      <div className="app-wrapper">
        <h1 className="app-title">🌲 Outdoor Quest</h1>
        <p className="app-subtitle">Multiplayer Outdoor Quest Game</p>

        {/* Connection status banner */}
        <div style={{
          background: '#1e1e2e',
          padding: '12px 16px',
          borderRadius: '10px',
          border: '1px solid #313244',
          marginBottom: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9em', color: '#a6adc8' }}>Server:</span>
            <span style={{
              fontWeight: 'bold',
              fontSize: '0.9em',
              color: connectionStatus === 'connected' ? '#a6e3a1' : connectionStatus === 'connecting' ? '#f9e2af' : '#f38ba8'
            }}>
              {connectionStatus === 'connected' && '🟢 Connected'}
              {connectionStatus === 'connecting' && '🟡 Connecting...'}
              {connectionStatus === 'disconnected' && '🔴 Disconnected'}
              {connectionStatus === 'error' && '❌ Connection Failed'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '4px' }}>
            <button
              onClick={() => switchServerUrl('ws://localhost:8080/ws')}
              style={{
                padding: '6px 12px',
                fontSize: '0.82em',
                background: serverUrl.includes('localhost') ? '#89b4fa' : '#313244',
                color: serverUrl.includes('localhost') ? '#11111b' : '#cdd6f4',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Local (8080)
            </button>
            <button
              onClick={() => switchServerUrl('wss://hacktober-fest-week-2-7n52.onrender.com/ws')}
              style={{
                padding: '6px 12px',
                fontSize: '0.82em',
                background: serverUrl.includes('onrender.com') ? '#89b4fa' : '#313244',
                color: serverUrl.includes('onrender.com') ? '#11111b' : '#cdd6f4',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Cloud (Render)
            </button>
            <button
              onClick={() => connectWs(serverUrl)}
              style={{
                padding: '6px 12px',
                fontSize: '0.82em',
                background: '#45475a',
                color: '#cdd6f4',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              🔄 Retry
            </button>
          </div>

          {connectionStatus === 'connecting' && (
            <p style={{ fontSize: '0.8em', color: '#f9e2af', margin: '4px 0 0' }}>
              ⏳ Connecting to backend... (If using Render free tier, spin-up may take 30–50s)
            </p>
          )}
          {connectionStatus === 'error' && (
            <p style={{ fontSize: '0.8em', color: '#f38ba8', margin: '4px 0 0' }}>
              Make sure your server is running (e.g. <code>cargo run</code> in server folder) or switch to Cloud above.
            </p>
          )}
        </div>

        {/* Error / Alert box */}
        {lobbyError && (
          <div style={{
            background: '#f38ba8',
            color: '#11111b',
            padding: '12px',
            borderRadius: '8px',
            fontWeight: 'bold',
            marginBottom: '20px'
          }}>
            {lobbyError}
          </div>
        )}

        {/* Player Name Input */}
        <div style={{
          background: '#1e1e2e',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #313244',
          marginBottom: '20px',
          textAlign: 'left'
        }}>
          <label style={{ display: 'block', color: '#a6adc8', fontSize: '0.9em', marginBottom: '8px', fontWeight: 'bold' }}>
            Your Name:
          </label>
          <input
            placeholder="Enter your Player Name..."
            value={playerName}
            onChange={e => {
              setPlayerName(e.target.value);
              if (lobbyError) setLobbyError(null);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') createGame();
            }}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '12px 14px',
              fontSize: '1em',
              background: '#313244',
              border: '1px solid #45475a',
              borderRadius: '8px',
              color: '#cdd6f4',
              outline: 'none'
            }}
          />
        </div>

        {/* Actions Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Create Game Card */}
          <div style={{
            background: '#1e1e2e',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid #313244'
          }}>
            <h3 style={{ color: '#89b4fa', margin: '0 0 10px 0' }}>👑 Host a New Game</h3>
            <p style={{ color: '#a6adc8', fontSize: '0.9em', margin: '0 0 16px 0' }}>
              Create a room and invite your friends with a code.
            </p>
            <button
              onClick={createGame}
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '1.05em',
                background: '#89b4fa',
                color: '#11111b',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background 0.2s',
                boxShadow: '0 4px 12px rgba(137, 180, 250, 0.3)'
              }}
            >
              🎮 Create Game
            </button>
          </div>

          {/* Join Game Card */}
          <div style={{
            background: '#1e1e2e',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid #313244'
          }}>
            <h3 style={{ color: '#a6e3a1', margin: '0 0 10px 0' }}>🚀 Join Existing Game</h3>
            <p style={{ color: '#a6adc8', fontSize: '0.9em', margin: '0 0 16px 0' }}>
              Enter the room code shared by the host.
            </p>
            <input
              placeholder="Room Code (e.g. QUEST-1234)"
              value={roomCode}
              onChange={e => {
                setRoomCode(e.target.value);
                if (lobbyError) setLobbyError(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') joinGame();
              }}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '12px 14px',
                fontSize: '1em',
                background: '#313244',
                border: '1px solid #45475a',
                borderRadius: '8px',
                color: '#cdd6f4',
                outline: 'none',
                marginBottom: '12px',
                textAlign: 'center',
                letterSpacing: '1px',
                fontWeight: 'bold'
              }}
            />
            <button
              onClick={joinGame}
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '1.05em',
                background: '#a6e3a1',
                color: '#11111b',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background 0.2s',
                boxShadow: '0 4px 12px rgba(166, 227, 161, 0.3)'
              }}
            >
              Join Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isHost = gameState.players?.find((p: any) => p.id === playerId)?.is_host;

  return (
    <div className="app-wrapper">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0' }}>
        <button 
          onClick={leaveGame}
          className="mobile-btn mobile-btn-red"
          style={{ width: 'auto', minHeight: '38px', padding: '8px 16px', fontSize: '0.9em' }}
        >
          Leave Game
        </button>
        <h3 style={{ color: '#cdd6f4', margin: 0 }}>Status: {gameState.status}</h3>
      </div>

      <div style={{ background: '#1e1e2e', padding: '20px', borderRadius: '12px', textAlign: 'center', margin: '20px 0', border: '1px solid #313244' }}>
        <h2 style={{ margin: '0 0 15px 0', color: '#a6adc8', fontSize: '1.2em' }}>Room Code</h2>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px' }}>
           <code style={{ fontSize: '2.5em', background: '#313244', padding: '10px 25px', borderRadius: '8px', color: '#a6e3a1', fontWeight: 'bold', letterSpacing: '2px' }}>
              {gameState.room_code}
           </code>
           <button 
             onClick={() => navigator.clipboard.writeText(gameState.room_code)}
             style={{ padding: '10px 15px', background: '#45475a', color: '#cdd6f4', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
           >
             Copy
           </button>
        </div>
      </div>
      
      {gameState.status === 'Lobby' && (
        <div style={{ textAlign: 'center', padding: '30px' }}>
          <h2 style={{ color: '#cdd6f4', marginBottom: '20px' }}>Waiting for players...</h2>
          {isHost ? (
            <button 
              onClick={startGame}
              style={{ padding: '15px 30px', fontSize: '1.2em', background: '#89b4fa', color: '#11111b', fontWeight: 'bold', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
            >
              Start Game
            </button>
          ) : (
            <p style={{ color: '#a6adc8', fontSize: '1.2em' }}>Waiting for the host to start the game...</p>
          )}
        </div>
      )}

      {gameState.status === 'InProgress' && gameState.tasks[gameState.current_task_index] && (
        <QuestView
          task={gameState.tasks[gameState.current_task_index]}
          onCompleteTask={handleCompleteTask}
        />
      )}

      {gameState.players && gameState.players.length > 0 && (
        <div style={{ background: '#1e1e2e', padding: '20px', borderRadius: '12px', marginTop: '30px', border: '1px solid #313244' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#a6adc8' }}>Scoreboard</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {gameState.players.map((p: any) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#313244', borderRadius: '6px' }}>
                <span style={{ color: '#cdd6f4', fontWeight: 'bold' }}>{p.name} {p.is_host && '👑'}</span>
                <span style={{ color: '#a6e3a1', fontWeight: 'bold' }}>{p.score} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <LoreModal lore={displayedLore} onClose={() => setDisplayedLore(null)} />
    </div>
  );
}

export default App;
