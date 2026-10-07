import WebSocket from 'ws';

const WS_URL = 'ws://localhost:3001/ws';

async function testIntegration() {
  console.log('🧪 Starting Integration Test for Rust + TypeScript Outdoor Quest Game...\n');

  const ws1 = new WebSocket(WS_URL);
  let roomCode = '';
  let hostPlayerId = '';
  let friendPlayerId = '';

  ws1.on('open', () => {
    console.log('✅ Host (Alice) connected to Rust server.');
    ws1.send(
      JSON.stringify({
        type: 'CreateGame',
        payload: { player_name: 'Alice (Host)' },
      })
    );
  });

  ws1.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('📩 Host received:', msg.type);

    if (msg.type === 'GameCreated') {
      roomCode = msg.payload.room_code;
      hostPlayerId = msg.payload.player_id;
      console.log(`🎉 Room Created! Code: ${roomCode}, Join URL: ${msg.payload.join_url}`);

      // Now connect Friend (Bob)
      connectFriend(roomCode);
    } else if (msg.type === 'StateUpdate') {
      console.log(`📢 Host Log: "${msg.payload.log_message}"`);
      if (msg.payload.state.last_proof) {
        console.log(`   📸 Latest Proof: [${msg.payload.state.last_proof.player_name}] ${msg.payload.state.last_proof.proof}`);
      }
      console.log(`   Task: ${msg.payload.state.current_task_index + 1}/5 | Status: ${msg.payload.state.status}`);
      console.log(
        `   Scores:`,
        msg.payload.state.players.map((p: any) => `${p.name}: ${p.score}pts`).join(', ')
      );

      // If game in lobby and 2 players joined, start game
      if (
        msg.payload.state.status === 'Lobby' &&
        msg.payload.state.players.length === 2
      ) {
        console.log('\n🚀 Host starting game...');
        ws1.send(
          JSON.stringify({
            type: 'StartGame',
            payload: { room_code: roomCode, player_id: hostPlayerId },
          })
        );
      }

      // Automatically simulate completing tasks with photo proofs
      if (msg.payload.state.status === 'InProgress') {
        const taskIdx = msg.payload.state.current_task_index;
        if (taskIdx === 0) {
          console.log('\n⚡ Alice completing Task 1 with Photo Proof...');
          ws1.send(
            JSON.stringify({
              type: 'CompleteTask',
              payload: {
                room_code: roomCode,
                player_id: hostPlayerId,
                proof: '📷 Photo: Touching green oak leaf at park (./leaf_photo.jpg)',
              },
            })
          );
        } else if (taskIdx === 2) {
          console.log('\n⚡ Alice completing Task 3 with Photo Proof...');
          ws1.send(
            JSON.stringify({
              type: 'CompleteTask',
              payload: {
                room_code: roomCode,
                player_id: hostPlayerId,
                proof: '📷 Photo: Clear sky with white clouds (./sky_photo.png)',
              },
            })
          );
        } else if (taskIdx === 3) {
          console.log('\n⚡ Alice completing Task 4 with Photo Proof...');
          ws1.send(
            JSON.stringify({
              type: 'CompleteTask',
              payload: {
                room_code: roomCode,
                player_id: hostPlayerId,
                proof: '📷 Photo: Red flower after 30 steps (./red_flower.jpg)',
              },
            })
          );
        }
      }

      if (msg.payload.state.status === 'Finished') {
        console.log('\n🏆 TEST COMPLETED SUCCESSFULLY! Winner:', msg.payload.state.winners);
        process.exit(0);
      }
    }
  });

  function connectFriend(code: string) {
    const ws2 = new WebSocket(WS_URL);

    ws2.on('open', () => {
      console.log('✅ Friend (Bob) connected to Rust server.');
      ws2.send(
        JSON.stringify({
          type: 'JoinGame',
          payload: { room_code: code, player_name: 'Bob (Friend)' },
        })
      );
    });

    ws2.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'GameJoined') {
        friendPlayerId = msg.payload.player_id;
        console.log('🤝 Bob joined room successfully!');
      } else if (msg.type === 'StateUpdate') {
        if (msg.payload.state.status === 'InProgress') {
          const taskIdx = msg.payload.state.current_task_index;
          if (taskIdx === 1) {
            console.log('\n⚡ Bob completing Task 2 with Photo Proof...');
            ws2.send(
              JSON.stringify({
                type: 'CompleteTask',
                payload: {
                  room_code: code,
                  player_id: friendPlayerId,
                  proof: '📷 Photo: Smooth river rock stone (./stone.jpg)',
                },
              })
            );
          } else if (taskIdx === 4) {
            console.log('\n⚡ Bob completing Task 5 with Photo Proof...');
            ws2.send(
              JSON.stringify({
                type: 'CompleteTask',
                payload: {
                  room_code: code,
                  player_id: friendPlayerId,
                  proof: '📷 Photo: Park bench street label (./bench.jpg)',
                },
              })
            );
          }
        }
      }
    });
  }
}

testIntegration().catch(console.error);
