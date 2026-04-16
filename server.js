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
import notificationRoutes from './routes/notifications.js';

// Models
import Message from './models/Message.js';
import Notification from './models/Notification.js';
import Teacher from './models/Teacher.js';
import Student from './models/Student.js';

dotenv.config();

const app = express();

// CORS — allow Vercel + localhost
app.use(cors({
  origin: [
    'https://tutionpao-app.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' })); // larger limit for base64 photos

// 1. Health Check
app.get('/', (req, res) => {
  res.status(200).send("TutionPao v2 API is Running! 🚀🚀");
});

// 2. Routes
app.use('/api/auth', authRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);

// 3. Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// 4. Port
const PORT = process.env.PORT || 8080;
const httpServer = createServer(app);
httpServer.listen(PORT, () => {
  console.log(`✅ TutionPao v2 Live on port ${PORT}`);
});

// 5. MongoDB
const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/tutionpao';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ DB Error:', err));

// 6. Socket.io for Realtime
const io = new Server(httpServer, {
  cors: {
    origin: [
      'https://tutionpao-app.vercel.app',
      'http://localhost:5173',
      'http://localhost:3000'
    ],
    methods: ['GET', 'POST']
  }
});

const getModel = (role) => role === 'teacher' ? Teacher : Student;

io.on('connection', (socket) => {
  console.log('User connected socket:', socket.id);

  // Join room using unique ID
  socket.on('join', (userId) => {
    socket.join(userId);
  });

  // Send connection request (ping)
  socket.on('send_ping', async (data) => {
    try {
      const newRequest = new Message({
        senderId: data.senderId,
        senderRole: data.senderRole,
        receiverId: data.receiverId,
        receiverRole: data.receiverRole,
        freeSlot: data.freeSlot,
        messages: [{ text: "Connection Request Sent! Slot: " + (data.freeSlot || 'Flexible'), sender: data.senderId }]
      });
      await newRequest.save();

      // Create notification for receiver
      const SenderModel = getModel(data.senderRole);
      const sender = await SenderModel.findById(data.senderId).select('name');
      
      const notification = new Notification({
        userId: data.receiverId,
        userRole: data.receiverRole,
        type: 'connection_request',
        title: 'New Connection Request',
        message: `${sender?.name || 'Someone'} wants to connect with you!`,
        fromUserId: data.senderId,
        fromUserRole: data.senderRole,
      });
      await notification.save();

      io.to(data.receiverId).emit('new_request', newRequest);
      io.to(data.receiverId).emit('new_notification', notification);
    } catch (e) { console.error(e); }
  });

  // Send chat message
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

  // Nearby search notification (fired when someone searches map)
  socket.on('nearby_search', async (data) => {
    // data: { searcherId, searcherRole, lat, lng, subject }
    try {
      const targetRole = data.searcherRole === 'teacher' ? 'student' : 'teacher';
      const TargetModel = getModel(targetRole);

      // Find nearby users who have alerts ON
      const nearbyUsers = await TargetModel.find({
        nearbyAlerts: true,
        location: {
          $near: {
            $geometry: { type: "Point", coordinates: [data.lng, data.lat] },
            $maxDistance: 5000
          }
        }
      }).select('_id');

      const SearcherModel = getModel(data.searcherRole);
      const searcher = await SearcherModel.findById(data.searcherId);
      const price = data.searcherRole === 'teacher' ? (searcher?.chargePerMonth || 'Negotiable') : (searcher?.budgetPerMonth || 'Negotiable');

      for (const nearbyUser of nearbyUsers) {
        const notification = new Notification({
          userId: nearbyUser._id,
          userRole: targetRole,
          type: 'nearby_search',
          title: '🔥 New Nearby Lead!',
          message: `${searcher?.name || 'Someone'} is looking for a ${targetRole} nearby!\nSubject: ${data.subject || 'Any'}\nBudget/Fee: ₹${price}\nDistance: Within 5km`,
          fromUserId: data.searcherId,
          fromUserRole: data.searcherRole,
        });

        await notification.save();
        io.to(nearbyUser._id.toString()).emit('new_notification', notification);
      }
    } catch (e) { console.error(e); }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});
