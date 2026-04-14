import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
  senderRole: { type: String, enum: ['teacher', 'student'], required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, required: true },
  receiverRole: { type: String, enum: ['teacher', 'student'], required: true },
  status: { type: String, enum: ['pending', 'accepted', 'declined', 'completed'], default: 'pending' },
  freeSlot: { type: String },
  messages: [{
    text: String,
    sender: { type: mongoose.Schema.Types.ObjectId },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

export default mongoose.model('Message', messageSchema);
