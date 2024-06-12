const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Redis = require('redis');
const redisClient = Redis.createClient();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  }
})

redisClient.connect()

redisClient.on('connect', () => {
  console.log('Redis client connected');
})

// available letters for room generation
const LETTERS = ["B", "C", "D", "F", "G", "H", "J", "K", "L", "M", "N", "P", "Q", "R", "S", "T", "V", "W", "X", "Y", "Z"];

// an array of the active room codes.
let activeRooms = [];

app.set('view engine', 'ejs');
app.use(express.static('public'));


app.get('/', (req, res) => {
  res.render('index');
});

// creates a new room and redirects the user to the room
app.get('/create-room', generateRoom, (req, res) => {
  res.redirect(`/room/${req.params.room}`);
});

// renders the room if it exists, otherwise renders an error page
app.get("/room/:room", (req, res) => {
  if (activeRooms.includes(req.params.room)) {
    res.render('room', {room: req.params.room});
  } else {
    res.render("error");
  }
});


io.on('connection', socket => {
    // joins the socket to the room when it connects
  socket.on('join', (room) => {
    socket.join(room)
    let player = setPlayer(room)
    player.then((player) => {
      socket.emit('player-set', player)
    })
    socket.to(room).emit('change')

  })

  // sends an array of all the players in the room
  socket.on('get-players', (room) => {
    getPlayers(room).then((players) => {
      socket.emit('get-players', players)
    })
  })

  // sends the received message to the room
  socket.on('score', (room, player, score) => {
    redisClient.hIncrBy(room + 'scores', player, score)
    io.to(room).emit('change')
  })

  // removes the room from the activeRooms array when the last player leaves
  socket.on('disconnect', () => {
    let rooms = io.sockets.adapter.rooms
    activeRooms.forEach(room => {
      if (!rooms.has(room)) {
        redisClient.del(room)
        redisClient.del(room + 'scores')
        activeRooms.splice(activeRooms.indexOf(room), 1);
      } else {
        io.to(room).emit('change')
      }
    })
  })
})

// generates a random 4 letter room code
  function generateRoom(req, res, next) {
    let room = "";
    for (let i = 0; i < 4; i++) {
      room += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    }
    redisClient.hSet(room, "players", 0)
    activeRooms.push(room);
    req.params.room = room;
    next();
  }

  async function setPlayer(room) {
    redisClient.hIncrBy(room, "players", 1)
    let playerCount = await redisClient.hGet(room, "players")
    redisClient.hSet(room + 'scores', `Player-${playerCount}`, 0)
    let player = `Player-${playerCount}`
    return player
  }

  async function getPlayers(room) {
    let playerScores = await redisClient.hGetAll(room + 'scores')
    return playerScores
  }

  // function changeScores(room, player, score) {
  //   let key = room + 'scores'
  //   let field = player
  //   let value = parseInt(score)
  //   redisClient.hIncrBy(key, field, value)
  //   return
  // }

  // starts the server on port 3000
  server.listen(3000, () => {
    console.log('Server is running on port 3000');
  });
