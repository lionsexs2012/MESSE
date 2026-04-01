const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static('public'));
app.use(express.json());

// ========== ПАПКА ДЛЯ ДАННЫХ ==========
const DATA_DIR = './data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// ========== ФАЙЛЫ ДАННЫХ ==========
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PRIVATE_FILE = path.join(DATA_DIR, 'private.json');

// ========== ИНИЦИАЛИЗАЦИЯ ФАЙЛОВ ==========
const initFile = (file, defaultData) => {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
  }
};

initFile(USERS_FILE, []);
initFile(PRIVATE_FILE, {});

// ========== ФУНКЦИИ РАБОТЫ С ДАННЫМИ ==========
const getUsers = () => JSON.parse(fs.readFileSync(USERS_FILE));
const saveUsers = (users) => fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
const getPrivateMessages = () => JSON.parse(fs.readFileSync(PRIVATE_FILE));
const savePrivateMessages = (data) => fs.writeFileSync(PRIVATE_FILE, JSON.stringify(data, null, 2));

// ========== ГЕНЕРАТОР TELEGRAM-STYLE ID ==========
const generateUserId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// ========== API ==========

// Регистрация
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const users = getUsers();
  
  if (users.find(u => u.username === username)) {
    return res.json({ success: false, error: 'Пользователь уже существует' });
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = generateUserId();
  
  users.push({ 
    username, 
    password: hashedPassword,
    userId,
    createdAt: new Date().toISOString()
  });
  saveUsers(users);
  
  res.json({ success: true, userId });
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
  
  res.json({ success: true, username, userId: user.userId });
});

// Получить всех пользователей
app.get('/users', (req, res) => {
  const users = getUsers().map(u => ({
    username: u.username,
    userId: u.userId
  }));
  res.json(users);
});

// Получить текущего пользователя
app.post('/user', (req, res) => {
  const { username } = req.body;
  const users = getUsers();
  const user = users.find(u => u.username === username);
  if (user) {
    res.json({ success: true, username: user.username, userId: user.userId });
  } else {
    res.json({ success: false });
  }
});

// Обновить настройки
app.post('/update-settings', (req, res) => {
  const { username, settings } = req.body;
  const users = getUsers();
  const userIndex = users.findIndex(u => u.username === username);
  
  if (userIndex !== -1) {
    users[userIndex].settings = settings;
    saveUsers(users);
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// Получить личные сообщения
app.post('/private-messages', (req, res) => {
  const { userId1, userId2 } = req.body;
  const key = [userId1, userId2].sort().join('_');
  const privateMsgs = getPrivateMessages();
  res.json(privateMsgs[key] || []);
});

// ========== SOCKET.IO ==========
io.on('connection', (socket) => {
  let currentUser = null;
  let currentUserId = null;

  socket.on('auth', (data) => {
    currentUser = data.username;
    currentUserId = data.userId;
    console.log(`${currentUser} (${currentUserId}) подключился`);
    socket.join(currentUserId);
    io.emit('users_update', getUsers().map(u => ({ 
      username: u.username, 
      userId: u.userId 
    })));
  });

  // Отправка зашифрованного личного сообщения
  socket.on('private_message', (data) => {
    if (!currentUser || !currentUserId) return;
    
    const { toUserId, encryptedMessage, iv } = data;
    
    // Сохраняем зашифрованное сообщение
    const key = [currentUserId, toUserId].sort().join('_');
    const privateMsgs = getPrivateMessages();
    if (!privateMsgs[key]) privateMsgs[key] = [];
    
    const message = {
      id: Date.now(),
      fromUserId: currentUserId,
      fromUsername: currentUser,
      toUserId: toUserId,
      encryptedMessage: encryptedMessage,
      iv: iv,
      time: new Date().toLocaleTimeString(),
      date: new Date().toISOString()
    };
    
    privateMsgs[key].push(message);
    savePrivateMessages(privateMsgs);
    
    // Отправляем получателю
    io.to(toUserId).emit('private_message', message);
    socket.emit('private_message', message);
  });

  socket.on('disconnect', () => {
    if (currentUser) {
      console.log(`${currentUser} отключился`);
      io.emit('users_update', getUsers().map(u => ({ 
        username: u.username, 
        userId: u.userId 
      })));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`http://localhost:${PORT}`);
});
