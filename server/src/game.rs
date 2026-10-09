use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use rand::Rng;
use mongodb::{Client, Collection};
use futures_util::stream::TryStreamExt;
use std::env;

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
    pub lore: Option<String>,
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
    CompleteTask { room_code: String, player_id: String, proof: Option<String>, task_index: Option<usize> },
    SyncQueue { actions: Vec<ClientMessage> },
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
    pub collection: Collection<GameState>,
    pub server_url: String,
}

impl AppState {
    pub async fn new(server_url: String) -> Self {
        dotenv::dotenv().ok();
        let uri = env::var("MONGODB_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
        
        let client = Client::with_uri_str(&uri).await.expect("Failed to initialize MongoDB client");
        let db = client.database("outdoor_quest");
        let collection: Collection<GameState> = db.collection("rooms");

        let mut rooms_map = HashMap::new();
        
        // Load active rooms from DB
        let mut cursor = collection.find(mongodb::bson::doc! {}).await.expect("Failed to query DB");
        while let Some(state) = cursor.try_next().await.expect("Failed to get next state") {
            let (tx, _) = broadcast::channel(100);
            rooms_map.insert(state.room_code.clone(), Room {
                state,
                sender: tx,
            });
        }

        println!("Loaded {} rooms from MongoDB", rooms_map.len());

        Self {
            rooms: Arc::new(RwLock::new(rooms_map)),
            collection,
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
        
        // Save to MongoDB
        let _ = self.collection.insert_one(&state).await;

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

        // Update DB
        let filter = mongodb::bson::doc! { "room_code": &room.state.room_code };
        let update = mongodb::bson::doc! { "$set": mongodb::bson::to_document(&room.state).unwrap() };
        let _ = self.collection.update_one(filter, update).await;

        let log_msg = format!("👋 Player '{}' joined the game room!", player_name);
        let update_msg = ServerMessage::StateUpdate {
            state: room.state.clone(),
            log_message: log_msg,
        };
        let _ = room.sender.send(serde_json::to_string(&update_msg).unwrap());

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

        // Update DB
        let filter = mongodb::bson::doc! { "room_code": &room.state.room_code };
        let update = mongodb::bson::doc! { "$set": mongodb::bson::to_document(&room.state).unwrap() };
        let _ = self.collection.update_one(filter, update).await;

        let log_msg = "🚀 Game started! Task 1 is active. Go outside, touch grass/tree bark, and submit photo proof!".to_string();
        let update_msg = ServerMessage::StateUpdate {
            state: room.state.clone(),
            log_message: log_msg,
        };
        let _ = room.sender.send(serde_json::to_string(&update_msg).unwrap());

        Ok(room.state.clone())
    }

    pub async fn complete_task(
        &self,
        room_code: &str,
        player_id: &str,
        proof: Option<String>,
        task_index: Option<usize>,
    ) -> Result<GameState, String> {
        let mut rooms = self.rooms.write().await;
        let room = rooms
            .get_mut(room_code)
            .ok_or_else(|| "Room not found.".to_string())?;

        if room.state.status != GameStatus::InProgress {
            return Err("Game is not currently in progress.".to_string());
        }

        if let Some(idx) = task_index {
            if idx < room.state.current_task_index {
                // Task was already completed by someone else, ignore this retroactive sync
                return Ok(room.state.clone());
            }
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

        // HF API call for lore
        let mut final_lore = None;
        if room.state.status == GameStatus::InProgress {
             let prompt = format!("The player {} has just found a {} in the wild. Write a 2-sentence epic fantasy lore congratulating them.", player_name, task_title);
             let hf_token = std::env::var("HF_TOKEN").unwrap_or_default();
             
             if !hf_token.is_empty() {
                 let client = reqwest::Client::new();
                 let res = client.post("https://api-inference.huggingface.co/models/google/gemma-2-2b-it")
                     .header("Authorization", format!("Bearer {}", hf_token))
                     .json(&serde_json::json!({
                         "inputs": prompt,
                         "parameters": {
                             "max_new_tokens": 100,
                             "return_full_text": false
                         }
                     }))
                     .send()
                     .await;
                     
                 if let Ok(response) = res {
                     if let Ok(mut json_res) = response.json::<Vec<serde_json::Value>>().await {
                         if let Some(first) = json_res.pop() {
                             if let Some(text) = first.get("generated_text").and_then(|t| t.as_str()) {
                                 final_lore = Some(text.trim().to_string());
                             }
                         }
                     }
                 }
             }
             
             if final_lore.is_none() {
                 final_lore = Some(format!("The Lore Master is pleased! A mystical {} radiates power in the hands of {}.", task_title, player_name));
             }
        }

        let proof_text = proof.clone().unwrap_or_else(|| "📷 Verified Photo Proof".to_string());
        room.state.last_proof = Some(TaskProof {
            player_name: player_name.clone(),
            task_title: task_title.clone(),
            proof: proof_text.clone(),
            lore: final_lore,
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

        // Update DB
        let filter = mongodb::bson::doc! { "room_code": &room.state.room_code };
        let update = mongodb::bson::doc! { "$set": mongodb::bson::to_document(&room.state).unwrap() };
        let _ = self.collection.update_one(filter, update).await;

        let update_msg = ServerMessage::StateUpdate {
            state: room.state.clone(),
            log_message: log_msg,
        };
        let _ = room.sender.send(serde_json::to_string(&update_msg).unwrap());

        Ok(room.state.clone())
    }
}
