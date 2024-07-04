const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Redis = require('redis');
const redisClient = Redis.createClient({url: process.env.REDISCLOUD_URL, socket: {tls: true, rejectUnauthorized: false}})
const bodyParser = require('body-parser');

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
  let roomCode = req.body.roomCode
  if (roomCode === '') {
    roomCode = generateRoom()
  }
  if (activeRooms.includes(roomCode)) {
    redisClient.zAdd(roomCode, [{score: 0, value: playerName}], (err, response) => {
      if (err) {
        console.log(err)
        return res.status(500).send("Server Error. Please try again.")
      }
      res.json
    })
  }
  redisClient.expire(roomCode, 7200)
  res.json({ playerName, roomCode })
})

// renders the room if it exists, otherwise renders an error page
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
