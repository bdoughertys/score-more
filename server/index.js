const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Redis = require('redis');
const redisClient = Redis.createClient({url: process.env.REDISCLOUD_URL, tls: {rejectUnauthorized: false}})
const cors = require('cors')
const bodyParser = require('body-parser');

//
const app = express();
const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {
    maxDisconnectionDuration: 1000*60,
    skipMiddlewares: true
  }
})

// redis initialization, with a confirmation or errors on startup
redisClient.connect()
redisClient.on('connect', () => {
  console.log('Redis client connected');
})
redisClient.on('error', (err) => {
  console.log('Redis error:', err)
})

// Cors and body parser let us handle the info coming from the client.
app.use (cors());
app.use(bodyParser.json());
// Using ejs initially because I thought I would have more embedded JS in the body
// but I think we have basically 0...not gonna change it unless i have to though
app.set('view engine', 'ejs');
// Uses the public directory to render the CSS for the pages
app.use(express.static('public'));

// available letters for room generation, no vowels to avoid "naughty" words
const LETTERS = ["B", "C", "D", "F", "G", "H", "J", "K", "L", "M", "N", "P", "Q", "R", "S", "T", "V", "W", "X", "Y", "Z"];
// An array of the active room codes that have been generated. Used to help validate room codes.
// This may be memory inefficient at scale, since arrays are "memory intensive". That is a cross
// that bridge if I ever come to it. #Doubt
let activeRooms = [];

// Express server endpoints. Root path here is for the homepage "index.ejs"
app.get('/', (req, res) => {
  res.render('index');
});

// Error page if the client messes up the room code. Pseudo 404 page.
app.get('/error', (req, res) => {
  res.render('error');
});

// Post endpoint that accepts the "index.ejs" form data. Takes the payer name and
// if given the room code. If a code is given it validates it is "active", if it is
// we add the player to the sorted set and instantiate them with a 0 score. If it isnt
// we direct them to the error page.
app.post('/add-player', (req, res) => {
  let playerName = req.body.playerName
  let roomCode = ""
  // checks for a room code and generates one if needed
  if (req.body.roomCode === '') {
    roomCode = generateRoom()
  } else {
    roomCode = req.body.roomCode.toUpperCase()
  }
  // checks for the room in active rooms, shows error page if room not available
  if (activeRooms.includes(roomCode)) {
    redisClient.zAdd(roomCode, [{score: 0, value: playerName}], (err, response) => {
      if (err) {
        console.log(err)
        return res.status(500).send("Server Error. Please try again.")
      }
      res.json
    })
  } else {
    // renders the error page if the room is not available
    app.render("error")
  }
  // sets expire time on rooms
  redisClient.expire(roomCode, 7200)
  res.json({ playerName, roomCode })
})
// url for the room with the player's name
app.get("/room/:room/:name", (req, res) => {
  res.render('room');
  });

// socket io events
io.on('connection', socket => {

  // When a client connects, they emit a join room event that puts them in
  // a room named by the roomcode. This emits an update board action to that room
  // so that they show up on everyones board. We get the sorted set of the room
  // from Redis in ascending order and return it to the room with the update-board event
  socket.on('join-room', (roomCode) => {
    socket.join(roomCode)
    redisClient.zRangeWithScores(roomCode, 0, -1).then((players) => {
      io.to(roomCode).emit('update-board', players)
    })
  })

  // When a client enters a score this they emit the update score action, this
  // sends the roomcode, who the player is and the integer value of the score
  // We do a 'right push' on their list of scores, increment their total
  // in the hash, and return the updated sorted set in ascending order to the room
  // everytime a score is updated their expire time is reset
  socket.on('update-score', (roomCode, playerName, score) => {
    redisClient.rPush(roomCode + playerName, score)
    redisClient.zIncrBy(roomCode, score, playerName)
    redisClient.zRangeWithScores(roomCode, 0, -1).then((players) => {
      io.to(roomCode).emit('update-board', players)
    })
    redisClient.expire(roomCode + playerName, 7200)
  })

  // At the end of a update board event on the client side, there is then a request
  // for the history of the currently selected player.
  socket.on('get-history', (roomCode, playerName) => {
    redisClient.lRange(roomCode + playerName, 0, -1).then((history) => {
      socket.emit('send-history', history)
    })
  })

  // When the client changes the value of the sort-by selection, respond with
  // the sorted set of the room.
  // TODO: Would it be better to update this to respond to only the socket that
  // made the request?
  socket.on('update-order', (roomCode) => {
    redisClient.zRangeWithScores(roomCode, 0, -1).then((players) => {
      io.to(roomCode).emit('update-board', players)
    })
  })

  // When a client begins disconnecting we use the handshake content to remove
  // that player from the sorted set, and delete the list of their scores.
  // Then an update board event is sent to change the rosters and history selections of
  // the clients in that room.
  // TODO: Some issues on mobile timing out and being seen as disconnecting when the phone
  // sleeps. Is there a better way to handle disconnects? Or should we just not handle them
  // and let them time out, and not update boards on a player leaving.
  socket.on('disconnecting', () => {
    socket.handshake.headers.playername || socket.handshake.headers.roomcode
    player = socket.handshake.headers.playername
    room = socket.handshake.headers.roomcode
    redisClient.zRem(room, player)
    redisClient.del(room + player)
    redisClient.zRangeWithScores(room, 0, -1).then((players) => {
      io.to(room).emit('update-board', players)
    })
  })
})

// generates a random 4 letter room code. LETTERS has vowels excluded to avoid
// the "naughty" room codes. I dont want to mess with the logic of blacklisting words
function generateRoom() {
  let room = "";
  for (let i = 0; i < 4; i++) {
    room += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  }
  activeRooms.push(room);
  return room;
}

// starts the server on the environment port or 3000 in development.
const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
