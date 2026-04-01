const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static('public'));
app.use(express.json());

// Файлы для хранения данных
const USERS_FILE = './users.json';
const MESSAGES_FILE = './messages.json';

// Инициализация файлов
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, JSON.stringify([]));

// Функции работы с данными
const getUsers = () => JSON.parse(fs.readFileSync(USERS_FILE));
const saveUsers = (users) => fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
const getMessages = () => JSON.parse(fs.readFileSync(MESSAGES_FILE));
const saveMessages = (messages) => fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));

// Регистрация
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const users = getUsers();
  
  if (users.find(u => u.username === username)) {
    return res.json({ success: false, error: 'Пользователь уже существует' });
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  users.push({ username, password: hashedPassword });
  saveUsers(users);
  
  res.json({ success: true });
});

// Вход
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const users = getUsers();
  const user = users.find(u => u.username === username);
  
  if (!user) {
    return res.json({ success: false, error: 'Пользователь не найден' });
  }
  
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.json({ success: false, error: 'Неверный пароль' });
  }
  
  res.json({ success: true, username });
});

// Получение сообщений
app.get('/messages', (req, res) => {
  res.json(getMessages());
});

// Socket.IO
io.on('connection', (socket) => {
  let currentUser = null;
  
  socket.on('auth', (username) => {
    currentUser = username;
    console.log(`${username} подключился`);
    
    const messages = getMessages();
    socket.emit('history', messages.slice(-100));
    
    socket.broadcast.emit('user_joined', { 
      username, 
      time: new Date().toLocaleTimeString() 
    });
  });
  
  socket.on('message', (data) => {
    if (!currentUser) return;
    
    const message = {
      id: Date.now(),
      username: currentUser,
      text: data.text,
      time: new Date().toLocaleTimeString(),
      date: new Date().toISOString()
    };
    
    const messages = getMessages();
    messages.push(message);
    saveMessages(messages.slice(-500));
    
    io.emit('message', message);
  });
  
  socket.on('disconnect', () => {
    if (currentUser) {
      console.log(`${currentUser} отключился`);
      io.emit('user_left', { 
        username: currentUser, 
        time: new Date().toLocaleTimeString() 
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
