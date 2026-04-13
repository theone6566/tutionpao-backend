import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  name: { type: String },
  role: { type: String, enum: ['student', 'tutor'] },
  photo: { type: String },
  qualifications: { type: String },
  school: { type: String },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] } // [lng, lat]
  },
  isSubscribed: { type: Boolean, default: false },
  subscriptionExpiresAt: { type: Date }
}, { timestamps: true });

userSchema.index({ location: '2dsphere' });

export default mongoose.model('User', userSchema);
