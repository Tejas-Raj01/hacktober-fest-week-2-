export interface Task {
  id: number;
  title: string;
  description: string;
  points: number;
}

export interface Player {
  id: string;
  name: string;
  score: number;
  is_host: boolean;
}

export interface TaskProof {
  player_name: string;
  task_title: string;
  proof: string;
}

export type GameStatus = 'Lobby' | 'InProgress' | 'Finished';

export interface GameState {
  room_code: string;
  status: GameStatus;
  current_task_index: number;
  tasks: Task[];
  players: Player[];
  winners: VecString;
  last_proof?: TaskProof | null;
}

export type VecString = string[];

export type ClientMessage =
  | { type: 'CreateGame'; payload: { player_name: string } }
  | { type: 'JoinGame'; payload: { room_code: string; player_name: string } }
  | { type: 'StartGame'; payload: { room_code: string; player_id: string } }
  | {
      type: 'CompleteTask';
      payload: { room_code: string; player_id: string; proof?: string };
    };

export type ServerMessage =
  | {
      type: 'GameCreated';
      payload: {
        room_code: string;
        join_url: string;
        player_id: string;
        state: GameState;
      };
    }
  | {
      type: 'GameJoined';
      payload: {
        room_code: string;
        player_id: string;
        state: GameState;
      };
    }
  | {
      type: 'StateUpdate';
      payload: {
        state: GameState;
        log_message: string;
      };
    }
  | {
      type: 'Error';
      payload: {
        message: string;
      };
    };
