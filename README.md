# 🌲 Outdoor Quest — Rust & TypeScript Terminal Game

A real-time multiplayer outdoor quest game built with **Rust** (Backend WebSocket Server) and **TypeScript** (Interactive Terminal Client).

---

## 🎯 Game Features & Rules

1. **Simple Room Code Sharing**:
   - Host starts a game and gets a **Room Code** (e.g. `QUEST-4921`).
   - Friends join by simply entering the **Room Code** from their terminal. No need to type or know any server URLs!

2. **5 Fixed Outdoor Tasks**:
   - 🌲 **Task 1: Leaf & Bark Challenge** — Step outside! Touch a natural green leaf or tree bark and submit photo proof.
   - 🪨 **Task 2: Unique Stone Quest** — Look down! Touch a smooth or unique outdoor rock/stone and submit photo proof.
   - ☁️ **Task 3: Sky & Cloud Spotting** — Look up! Snap a photo of a cloud, bird, or flying plane in the open sky.
   - 🚶 **Task 4: 30-Step Color Hunt** — Walk 30 steps outdoors, touch a bright red or yellow item and submit photo proof.
   - 🏷️ **Task 5: Street Sign & Label Finder** — Find an outdoor street sign, house number, or park bench label and submit photo proof.

3. **Photo Proof Submission**:
   - Players submit photo proof (file path or photo description) upon task completion.
   - Everyone's terminal screen updates live with the latest photo proof card and score leaderboard!

4. **10 Points per Task & Live Winner**:
   - Every completed task awards **10 Points**.
   - After Task 5 is completed, the player with the highest score wins!

---

## 🚀 How to Run

### Step 1: Start the Rust Server

Open a terminal window and run:
```bash
cd server
cargo run
```

---

### Step 2: Launch the Game Client (Host)

Open a **second** terminal window:
```bash
cd client
npm start
```
1. Choose `1. Start a New Game (Host)`.
2. Enter your Player Name.
3. Share the generated **Room Code** (e.g. `QUEST-4921`) with your friends!

---

### Step 3: Friends Join the Game

In another terminal window:
```bash
cd client
npm start
```
1. Choose `2. Join an Existing Game`.
2. Enter Player Name.
3. Enter the **Room Code** (e.g. `QUEST-4921`).

---

## 🎮 In-Game Commands

- **Host**: Press `S` + `ENTER` to start the game when all friends join.
- **Any Player**: Press `C` + `ENTER` to complete active task & enter photo proof.
- **Quit**: Press `Q` + `ENTER` to exit.

# hacktober-fest-week-2-
