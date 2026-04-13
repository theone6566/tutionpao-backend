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

// 1. Health Check (Must be fast)
app.get('/', (req, res) => {
    res.status(200).send("TutionPao Real API is Running! 🚀🚀");
});

// 2. Routes
app.use('/api/auth', authRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/chat', chatRoutes);

// 3. Main Mongo DB Connection (Async)
const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/tutionpao';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ DB Error:', err));

// 4. Start Listening (Simplified for Railway)
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
    console.log(`✅ TutionPao Live on port ${PORT}`);
});

// 5. Socket.io (Optional but integrated)
const io = new Server(server, { cors: { origin: '*' } });
io.on('connection', (socket) => {
    socket.on('join', (userId) => socket.join(userId));
    socket.on('disconnect', () => {});
});
