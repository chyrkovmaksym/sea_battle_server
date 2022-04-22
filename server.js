const bcrypt = require('bcrypt');
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: '*',
  },
});
joinedUsers = [];
connectedUsers = [];
io.on('connection', (socket) => {
  socket.on('join', ({ name, room }) => {
    const inRoom = joinedUsers.filter((v) => v.room === room).length;
    if (inRoom < 2) {
      joinedUsers.push({ id: socket.id, room });
      console.log('New user joined!');
      socket.emit('message', { text: 'Willikomen ' + name, inRoom });
      socket.broadcast
        .to(room)
        .emit('message', { text: name + ' joined!', inRoom, name });

      socket.on('send_initial_ships', (ceils) => {
        socket.broadcast.to(room).emit('recieve_initial_ships', ceils);
      });

      socket.on('send_ship_coordinates', (value) => {
        socket.broadcast.to(room).emit('recieve_ship_coordinates', value);
      });

      socket.join(room);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
    joinedUsers.forEach((v) => {
      if (v.id === socket.id) {
        socket.to(v.room).emit('opponent_disconnected', v);
      }
    });
    joinedUsers = joinedUsers.filter((v) => v.id !== socket.id);
  });
});

const knex = require('knex')({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: true,
  },
});

const jsonParser = express.json();

app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  );
  res.header(
    'Access-Control-Allow-Methods',
    'GET, PATCH, PUT, POST, DELETE, OPTIONS'
  );
  next();
});

app.get('/', (req, res) => {
  res.send("it's working!");
});

app.post('/register', jsonParser, function (request, response) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  if (!request.body) return response.sendStatus(400);
  const hash = bcrypt.hashSync(request.body.password, 10);
  knex('users')
    .insert({
      user_name: request.body.name,
      user_email: request.body.email,
      user_password: hash,
    })
    .then((data) => response.json({ status: 'success' }))
    .catch((err) => response.json({ status: 'wrong', error: err }));
});

app.post('/login', jsonParser, function (request, response) {
  if (!request.body) return response.sendStatus(400);
  knex
    .select('user_email', 'user_password')
    .from('users')
    .where('user_email', request.body.email)
    .then((data) => {
      if (data.length) {
        const isValid = bcrypt.compareSync(
          request.body.password,
          data[0].user_password
        );
        if (isValid) {
          return knex
            .select('*')
            .from('users')
            .where('user_email', request.body.email)
            .then((user) => {
              if (user.length) {
                response.json(user[0]);
              } else {
                response.json(false);
              }
            });
        }
      } else {
        response.json(false);
      }
    });
});

app.post('/users', jsonParser, function (request, response) {
  if (!request.body) return response.status(400);
  knex
    .select('*')
    .from('users')
    .whereNot('user_email', request.body.email)
    .then((data) => {
      if (data.length) {
        response.json(data);
      } else {
        response.json(false);
      }
    });
});

app.post('/friend_request', jsonParser, function (request, response) {
  if (!request.body) return response.status(400);
  knex('friends')
    .insert({
      from_email: request.body.from_email,
      to_email: request.body.to_email,
      status: request.body.status,
    })
    .then((data) => response.json({ status: 'success' }))
    .catch((err) => response.json({ status: 'wrong', error: err }));
});

app.post('/my_friends', jsonParser, function (request, response) {
  if (!request.body) return response.status(400);
  knex
    .select('*')
    .from('friends')
    .where('from_email', request.body.email)
    .orWhere('to_email', request.body.email)
    .then((data) => {
      if (data.length) {
        response.json(data);
      } else {
        response.json(false);
      }
    });
});

app.post('/update_status', jsonParser, function (request, response) {
  if (!request.body) return response.status(400);
  knex('friends')
    .where('from_email', request.body.from_email)
    .andWhere('to_email', request.body.to_email)
    .update({ status: request.body.status })
    .then((data) => {
      if (data.length) {
        response.json(data[0]);
      } else {
        response.json(false);
      }
    });
});

app.post('/invite_friend', jsonParser, function (request, response) {
  if (!request.body) return response.status(400);
  knex('invite')
    .where('recipient_email', request.body.email)
    .orWhere('recipient_email', request.body.sender)
    .orWhere('sender_email', request.body.email)
    .orWhere('sender_email', request.body.sender)
    .del()
    .then(() => {
      knex('invite')
        .insert({
          sender_email: request.body.sender,
          recipient_email: request.body.email,
          room: request.body.room,
        })
        .then((data) => response.json({ status: 'success' }))
        .catch((err) => response.json({ status: 'wrong', error: err }));
    });
});

app.post('/get_invited', jsonParser, function (request, response) {
  if (!request.body) return response.status(400);
  knex
    .select('*')
    .from('invite')
    .where('recipient_email', request.body.email)
    .andWhere('sender_email', request.body.sender)
    .then((data) => {
      if (data.length) {
        response.json(data[0]);
      } else {
        response.json(false);
      }
    });
});

app.post('/delete_invitation', jsonParser, function (request, response) {
  if (!request.body) return response.status(400);
  knex('invite')
    .where('room', request.body.room)
    .del()
    .then(() => console.log('deleted'));
});

server.listen(process.env.PORT || 3000, () => {
  console.log('listening on :' + process.env.PORT);
});
