use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use rand::Rng;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Task {
    pub id: u32,
    pub title: String,
    pub description: String,
    pub points: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Player {
    pub id: String,
    pub name: String,
    pub score: u32,
    pub is_host: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskProof {
    pub player_name: String,
    pub task_title: String,
    pub proof: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum GameStatus {
    Lobby,
    InProgress,
    Finished,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameState {
    pub room_code: String,
    pub status: GameStatus,
    pub current_task_index: usize,
    pub tasks: Vec<Task>,
    pub players: Vec<Player>,
    pub winners: Vec<String>,
    pub last_proof: Option<TaskProof>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum ClientMessage {
    CreateGame { player_name: String },
    JoinGame { room_code: String, player_name: String },
    StartGame { room_code: String, player_id: String },
    CompleteTask { room_code: String, player_id: String, proof: Option<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum ServerMessage {
    GameCreated {
        room_code: String,
        join_url: String,
        player_id: String,
        state: GameState,
    },
    GameJoined {
        room_code: String,
        player_id: String,
        state: GameState,
    },
    StateUpdate {
        state: GameState,
        log_message: String,
    },
    Error {
        message: String,
    },
}

pub struct Room {
    pub state: GameState,
    pub sender: broadcast::Sender<String>,
}

#[derive(Clone)]
pub struct AppState {
    pub rooms: Arc<RwLock<HashMap<String, Room>>>,
    pub server_url: String,
}

impl AppState {
    pub fn new(server_url: String) -> Self {
        Self {
            rooms: Arc::new(RwLock::new(HashMap::new())),
            server_url,
        }
    }

    pub fn get_fixed_tasks() -> Vec<Task> {
        vec![
            Task {
                id: 1,
                title: "🌲 Leaf & Bark Challenge".to_string(),
                description: "Step outside! Touch a natural green leaf or tree bark and submit photo proof.".to_string(),
                points: 10,
            },
            Task {
                id: 2,
                title: "🪨 Unique Stone Quest".to_string(),
                description: "Look down! Touch a smooth or unique outdoor rock/stone and submit photo proof.".to_string(),
                points: 10,
            },
            Task {
                id: 3,
                title: "☁️ Sky & Cloud Spotting".to_string(),
                description: "Look up! Snap a photo of a cloud, bird, or flying plane in the open sky.".to_string(),
                points: 10,
            },
            Task {
                id: 4,
                title: "🚶 30-Step Color Hunt".to_string(),
                description: "Walk 30 steps outdoors, touch a bright red or yellow item and submit photo proof.".to_string(),
                points: 10,
            },
            Task {
                id: 5,
                title: "🏷️ Street Sign & Label Finder".to_string(),
                description: "Find an outdoor street sign, house number, or park bench and submit photo proof.".to_string(),
                points: 10,
            },
        ]
    }

    pub fn generate_room_code() -> String {
        let mut rng = rand::thread_rng();
        let code: u32 = rng.gen_range(1000..9999);
        format!("QUEST-{}", code)
    }

    pub async fn create_room(&self, player_name: String) -> (String, String, String, GameState) {
        let mut rooms = self.rooms.write().await;
        let room_code = Self::generate_room_code();
        let player_id = format!("p-{}", rand::thread_rng().gen_range(10000..99999));
        let join_url = format!("{}/join/{}", self.server_url, room_code);

        let initial_player = Player {
            id: player_id.clone(),
            name: player_name,
            score: 0,
            is_host: true,
        };

        let state = GameState {
            room_code: room_code.clone(),
            status: GameStatus::Lobby,
            current_task_index: 0,
            tasks: Self::get_fixed_tasks(),
            players: vec![initial_player],
            winners: vec![],
            last_proof: None,
        };

        let (tx, _) = broadcast::channel(100);

        rooms.insert(
            room_code.clone(),
            Room {
                state: state.clone(),
                sender: tx,
            },
        );

        (room_code, join_url, player_id, state)
    }

    pub async fn join_room(
        &self,
        room_code: &str,
        player_name: String,
    ) -> Result<(String, GameState, broadcast::Sender<String>), String> {
        let mut rooms = self.rooms.write().await;
        let room = rooms
            .get_mut(room_code)
            .ok_or_else(|| "Room not found. Check your Room Code or URL.".to_string())?;

        let player_id = format!("p-{}", rand::thread_rng().gen_range(10000..99999));
        let new_player = Player {
            id: player_id.clone(),
            name: player_name.clone(),
            score: 0,
            is_host: false,
        };

        room.state.players.push(new_player);

        let log_msg = format!("👋 Player '{}' joined the game room!", player_name);
        let update = ServerMessage::StateUpdate {
            state: room.state.clone(),
            log_message: log_msg,
        };
        let _ = room.sender.send(serde_json::to_string(&update).unwrap());

        Ok((player_id, room.state.clone(), room.sender.clone()))
    }

    pub async fn start_game(
        &self,
        room_code: &str,
        player_id: &str,
    ) -> Result<GameState, String> {
        let mut rooms = self.rooms.write().await;
        let room = rooms
            .get_mut(room_code)
            .ok_or_else(|| "Room not found.".to_string())?;

        let player = room
            .state
            .players
            .iter()
            .find(|p| p.id == player_id)
            .ok_or_else(|| "Player not in room.".to_string())?;

        if !player.is_host {
            return Err("Only the host can start the game.".to_string());
        }

        room.state.status = GameStatus::InProgress;
        room.state.current_task_index = 0;

        let log_msg = "🚀 Game started! Task 1 is active. Go outside, touch grass/tree bark, and submit photo proof!".to_string();
        let update = ServerMessage::StateUpdate {
            state: room.state.clone(),
            log_message: log_msg,
        };
        let _ = room.sender.send(serde_json::to_string(&update).unwrap());

        Ok(room.state.clone())
    }

    pub async fn complete_task(
        &self,
        room_code: &str,
        player_id: &str,
        proof: Option<String>,
    ) -> Result<GameState, String> {
        let mut rooms = self.rooms.write().await;
        let room = rooms
            .get_mut(room_code)
            .ok_or_else(|| "Room not found.".to_string())?;

        if room.state.status != GameStatus::InProgress {
            return Err("Game is not currently in progress.".to_string());
        }

        let player_index = room
            .state
            .players
            .iter()
            .position(|p| p.id == player_id)
            .ok_or_else(|| "Player not found in room.".to_string())?;

        let current_task_num = room.state.current_task_index + 1;
        let task_title = room.state.tasks[room.state.current_task_index].title.clone();
        let task_points = room.state.tasks[room.state.current_task_index].points;

        // Award score to the player who completed the task
        room.state.players[player_index].score += task_points;
        let player_name = room.state.players[player_index].name.clone();

        let proof_text = proof.clone().unwrap_or_else(|| "📷 Verified Photo Proof".to_string());
        room.state.last_proof = Some(TaskProof {
            player_name: player_name.clone(),
            task_title: task_title.clone(),
            proof: proof_text.clone(),
        });

        let log_msg: String;

        // Advance ALL players to the next task
        if room.state.current_task_index + 1 < room.state.tasks.len() {
            room.state.current_task_index += 1;
            let next_task_num = room.state.current_task_index + 1;
            log_msg = format!(
                "📸 {} submitted Photo Proof: '{}'! Task {} complete (+{} pts)! Everyone moves to Task {}!",
                player_name, proof_text, current_task_num, task_points, next_task_num
            );
        } else {
            // Game Finished! Calculate max points winner
            room.state.status = GameStatus::Finished;

            let max_score = room.state.players.iter().map(|p| p.score).max().unwrap_or(0);
            let winners: Vec<String> = room
                .state
                .players
                .iter()
                .filter(|p| p.score == max_score)
                .map(|p| p.name.clone())
                .collect();

            room.state.winners = winners.clone();

            log_msg = format!(
                "🏁 Final Task completed by {} (Proof: '{}')! Game Over! Winner(s): {} with {} points!",
                player_name,
                proof_text,
                winners.join(", "),
                max_score
            );
        }

        let update = ServerMessage::StateUpdate {
            state: room.state.clone(),
            log_message: log_msg,
        };
        let _ = room.sender.send(serde_json::to_string(&update).unwrap());

        Ok(room.state.clone())
    }
}
