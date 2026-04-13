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
app.use(cors());
app.use(express.json());

// 1. Health Check (Immediate Response)
app.get('/', (req, res) => {
    res.status(200).send("TutionPao Real API is Running! 🚀🚀");
});

// 2. Routes
app.use('/api/auth', authRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/chat', chatRoutes);

// 3. Start Listening IMMEDIATELY (To pass Railway Health Check)
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
    console.log(`✅ TutionPao Live on port ${PORT}`);
});

// 4. Connect to Database (Asynchronous)
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
