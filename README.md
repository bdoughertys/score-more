# Score-More ReadMe

[score-more.games](https://scoremore.games)

## What is Score-More?
Score-More is a live scoreboard app that has each individual keep their score when pen & paper isn't an option, and keeps a group from needing a single dedicated score keeper.
Creating a room generates a 4 letter room code (no vowels) and sends you to that room. People can join using the room code on the home page.


## What did I use?
Runs on Node.js using express.\
Handles users with socket.io and stores player data with Redis.

---
##Updates
---

### 12 June 2024
Initial version that just has a live score board. The home page lets you create or join a room and has each player appear on the board with their total score. Players are ordered by the order in which they join.

---

### 4 July 2024
Updated Redis data types to lists for score history and sorted sets for totals.\
Users can now enter a name.\
Users can now sort scores by ascending or descending order.\
Users can now view the score history of any player in the room.

---

### 9 July 2024
Fixed issues when user has a space or special characters in their name.\
Room code field is now case insensitive.\
Entering an invalid room code now correctly shows an error page.

---

### 9 August 2024
No functionality changes. Added comments to everything so future me isn't mad and confused.

---

### 31 December 2024

Updated submissions to have an add and subtract button for compatibility reasons.\
Removed disconnect logic from server because of issues with phones sleeping being seen as a disconnect event.

---
