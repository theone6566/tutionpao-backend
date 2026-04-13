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

// Main Mongo DB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tutionpao';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ DB Error:', err));

// Register API Routes
app.use('/api/auth', authRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/chat', chatRoutes);

// Socket.io for Realtime Ping/Chat
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

io.on('connection', (socket) => {
  console.log('User connected socket:', socket.id);

  // User joins their personal room id
  socket.on('join', (userId) => {
    socket.join(userId);
  });

  // Sending a ping / match request
  socket.on('send_ping', async (data) => {
    // data = { senderId, receiverId, freeSlot, text }
    const newRequest = new Message({
      senderId: data.senderId,
      receiverId: data.receiverId,
      freeSlot: data.freeSlot,
      messages: [{ text: "Connection Request Sent! Target Slot: " + data.freeSlot, sender: data.senderId }]
    });
    await newRequest.save();

    // Notify the receiver in realtime
    io.to(data.receiverId).emit('new_request', newRequest);
  });

  // Sending a chat message in an accepted thread
  socket.on('send_message', async (data) => {
    // data = { threadId, senderId, receiverId, text }
    const thread = await Message.findById(data.threadId);
    if (!thread || thread.status !== 'accepted') return;

    const newMsg = { text: data.text, sender: data.senderId };
    thread.messages.push(newMsg);
    await thread.save();

    io.to(data.receiverId).to(data.senderId).emit('receive_message', { threadId: data.threadId, message: newMsg });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

app.get('/', (req, res) => {
    res.send("TutionPao Real API is Running! 🚀🚀");
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
