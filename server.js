import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

// Routes
import authRoutes from './routes/auth.js';
import paymentRoutes from './routes/payment.js';
import chatRoutes from './routes/chat.js';
import Message from './models/Message.js';

dotenv.config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// 1. Health Check
app.get('/', (req, res) => {
    res.status(200).send("TutionPao Real API is Running! 🚀🚀");
});

// 2. Routes
app.use('/api/auth', authRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/chat', chatRoutes);

// 3. Optimized Port for Railway (Default 8080)
const PORT = process.env.PORT || 8080;
const httpServer = createServer(app);
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ TutionPao Live on port ${PORT}`);
});

// 4. Persistence (Async)
const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/tutionpao';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ DB Error:', err));

// 5. Socket.io for Realtime Ping/Chat
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

io.on('connection', (socket) => {
  console.log('User connected socket:', socket.id);

  socket.on('join', (userId) => {
    socket.join(userId);
  });

  socket.on('send_ping', async (data) => {
    try {
      const newRequest = new Message({
        senderId: data.senderId,
        receiverId: data.receiverId,
        freeSlot: data.freeSlot,
        messages: [{ text: "Connection Request Sent! Target Slot: " + data.freeSlot, sender: data.senderId }]
      });
      await newRequest.save();
      io.to(data.receiverId).emit('new_request', newRequest);
    } catch (e) { console.error(e); }
  });

  socket.on('send_message', async (data) => {
    try {
      const thread = await Message.findById(data.threadId);
      if (!thread || thread.status !== 'accepted') return;

      const newMsg = { text: data.text, sender: data.senderId };
      thread.messages.push(newMsg);
      await thread.save();

      io.to(data.receiverId).to(data.senderId).emit('receive_message', { threadId: data.threadId, message: newMsg });
    } catch (e) { console.error(e); }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});
