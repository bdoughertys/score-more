const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Redis = require('redis');
const redisClient = Redis.createClient({url: process.env.REDISCLOUD_URL, tls: {rejectUnauthorized: false}})
const cors = require('cors')
const bodyParser = require('body-parser');
const { render } = require('ejs');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {
    maxDisconnectionDuration: 1000*60,
    skipMiddlewares: true
  }
})

// redis initialization
redisClient.connect()
redisClient.on('connect', () => {
  console.log('Redis client connected');
})
redisClient.on('error', (err) => {
  console.log('Redis error:', err)
})

app.use (cors());
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.use(express.static('public'));

// available letters for room generation
const LETTERS = ["B", "C", "D", "F", "G", "H", "J", "K", "L", "M", "N", "P", "Q", "R", "S", "T", "V", "W", "X", "Y", "Z"];
// an array of the active room codes.
let activeRooms = [];

app.get('/', (req, res) => {
  res.render('index');
});

app.get('/error', (req, res) => {
  res.render('error');
});

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

app.get("/room/:room/:name", (req, res) => {
  res.render('room');
  });


io.on('connection', socket => {
  socket.on('join-room', (roomCode) => {
    socket.join(roomCode)
    redisClient.zRangeWithScores(roomCode, 0, -1).then((players) => {
      io.to(roomCode).emit('update-board', players)
    })
  })

  socket.on('update-score', (roomCode, playerName, score) => {
    redisClient.rPush(roomCode + playerName, score)
    redisClient.zIncrBy(roomCode, score, playerName)
    redisClient.zRangeWithScores(roomCode, 0, -1).then((players) => {
      io.to(roomCode).emit('update-board', players)
    })
    redisClient.expire(roomCode + playerName, 7200)
  })

  socket.on('get-history', (roomCode, playerName) => {
    redisClient.lRange(roomCode + playerName, 0, -1).then((history) => {
      socket.emit('send-history', history)
    })
  })

  socket.on('update-order', (roomCode) => {
    redisClient.zRangeWithScores(roomCode, 0, -1).then((players) => {
      io.to(roomCode).emit('update-board', players)
    })
  })

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

// generates a random 4 letter room code
function generateRoom() {
  let room = "";
  for (let i = 0; i < 4; i++) {
    room += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  }
  activeRooms.push(room);
  return room;
}

// starts the server on port 3000
const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
