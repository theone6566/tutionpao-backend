import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
  phone: { type: String, required: true, index: true },
  otp: { type: String, required: true },
  purpose: { type: String, enum: ['login', 'aadhaar'], default: 'login' },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL auto-delete
  attempts: { type: Number, default: 0 },
  verified: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('OTP', otpSchema);
