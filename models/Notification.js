import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userRole: { type: String, enum: ['teacher', 'student'], required: true },
  type: { 
    type: String, 
    enum: ['nearby_search', 'connection_request', 'request_accepted', 'request_declined', 'new_message'],
    required: true 
  },
  title: { type: String, required: true },
  message: { type: String },
  fromUserId: { type: mongoose.Schema.Types.ObjectId },
  fromUserRole: { type: String, enum: ['teacher', 'student'] },
  isRead: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('Notification', notificationSchema);
