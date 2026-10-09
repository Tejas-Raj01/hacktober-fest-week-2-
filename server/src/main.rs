mod game;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use game::{AppState, ClientMessage, ServerMessage};
use serde_json::json;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};

#[tokio::main]
async fn main() {
    let initial_port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);
    let host = "0.0.0.0";

    let mut listener = None;
    let mut actual_port = initial_port;

    for p in initial_port..=initial_port + 20 {
        let addr_str = format!("{}:{}", host, p);
        if let Ok(addr) = addr_str.parse::<SocketAddr>() {
            if let Ok(l) = tokio::net::TcpListener::bind(addr).await {
                listener = Some(l);
                actual_port = p;
                break;
            }
        }
    }

    let listener = listener.expect("Could not find an available port to bind");

    let server_url = std::env::var("CLIENT_URL").unwrap_or_else(|_| "https://hacktober-fest-week-2.onrender.com".to_string());
    let app_state = AppState::new(server_url).await;

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/", get(index_handler))
        .route("/ws", get(ws_handler))
        .layer(cors)
        .with_state(app_state);

    let addr = listener.local_addr().unwrap();

    println!("==================================================");
    println!("  🎮 Outdoor Quest Game Server (Rust)");
    println!("  Running on: http://{}", addr);
    println!("  WebSocket endpoint: ws://localhost:{}/ws", actual_port);
    println!("==================================================");

    axum::serve(listener, app).await.unwrap();
}

async fn index_handler() -> impl IntoResponse {
    Json(json!({
        "game": "Outdoor Quest - 5-Task Challenge",
        "status": "online",
        "version": "1.0.0",
        "tasks_count": 5,
        "score_per_task": 10
    }))
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx_subscription: Option<tokio::sync::broadcast::Receiver<String>> = None;

    // Loop for receiving messages from WebSocket client
    loop {
        tokio::select! {
            // Message received from client
            Some(msg) = receiver.next() => {
                match msg {
                    Ok(Message::Text(text)) => {
                        let client_msg: Result<ClientMessage, _> = serde_json::from_str(&text);
                        match client_msg {
                            Ok(ClientMessage::CreateGame { player_name }) => {
                                let (room_code, join_url, player_id, game_state) = state.create_room(player_name).await;

                                // Subscribe host to room broadcast
                                {
                                    let rooms = state.rooms.read().await;
                                    if let Some(room) = rooms.get(&room_code) {
                                        rx_subscription = Some(room.sender.subscribe());
                                    }
                                }

                                let response = ServerMessage::GameCreated {
                                    room_code,
                                    join_url,
                                    player_id,
                                    state: game_state,
                                };
                                let _ = sender.send(Message::Text(serde_json::to_string(&response).unwrap())).await;
                            }
                            Ok(ClientMessage::JoinGame { room_code, player_name }) => {
                                match state.join_room(&room_code, player_name).await {
                                    Ok((player_id, game_state, broadcast_tx)) => {
                                        rx_subscription = Some(broadcast_tx.subscribe());

                                        let response = ServerMessage::GameJoined {
                                            room_code,
                                            player_id,
                                            state: game_state,
                                        };
                                        let _ = sender.send(Message::Text(serde_json::to_string(&response).unwrap())).await;
                                    }
                                    Err(err_msg) => {
                                        let response = ServerMessage::Error { message: err_msg };
                                        let _ = sender.send(Message::Text(serde_json::to_string(&response).unwrap())).await;
                                    }
                                }
                            }
                            Ok(ClientMessage::StartGame { room_code, player_id }) => {
                                if let Err(err_msg) = state.start_game(&room_code, &player_id).await {
                                    let response = ServerMessage::Error { message: err_msg };
                                    let _ = sender.send(Message::Text(serde_json::to_string(&response).unwrap())).await;
                                }
                            }
                            Ok(ClientMessage::CompleteTask { room_code, player_id, proof, task_index }) => {
                                if let Err(err_msg) = state.complete_task(&room_code, &player_id, proof, task_index).await {
                                    let response = ServerMessage::Error { message: err_msg };
                                    let _ = sender.send(Message::Text(serde_json::to_string(&response).unwrap())).await;
                                }
                            }
                            Ok(ClientMessage::SyncQueue { actions }) => {
                                for action in actions {
                                    if let ClientMessage::CompleteTask { room_code, player_id, proof, task_index } = action {
                                        let _ = state.complete_task(&room_code, &player_id, proof, task_index).await;
                                    }
                                }
                            }
                            Err(e) => {
                                let response = ServerMessage::Error {
                                    message: format!("Invalid message format: {}", e),
                                };
                                let _ = sender.send(Message::Text(serde_json::to_string(&response).unwrap())).await;
                            }
                        }
                    }
                    Ok(Message::Close(_)) | Err(_) => {
                        break;
                    }
                    _ => {}
                }
            }

            // Real-time broadcast from room channel to this WebSocket client
            res = async {
                if let Some(ref mut rx) = rx_subscription {
                    rx.recv().await
                } else {
                    futures_util::future::pending().await
                }
            } => {
                match res {
                    Ok(broadcast_text) => {
                        if sender.send(Message::Text(broadcast_text)).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => {}
                }
            }
        }
    }
}
