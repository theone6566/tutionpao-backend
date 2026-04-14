import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  name: { type: String },
  photo: { type: String }, // base64 or URL
  aadhaar: { type: String }, // last 4 digits stored only
  isAadhaarVerified: { type: Boolean, default: false },
  grade: { type: String }, // "Class 10th", "Class 12th"
  school: { type: String }, // "DPS RK Puram"
  subjectsNeeded: [{ type: String }], // ["Maths", "English"]
  budgetPerMonth: { type: Number }, // max budget in INR
  bio: { type: String },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] } // [lng, lat]
  },
  isSubscribed: { type: Boolean, default: false },
  subscriptionExpiresAt: { type: Date },
  subscriptionPlan: { type: String, enum: ['free', 'premium'], default: 'free' },
  savedProfiles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' }], // "Add to List"
  nearbyAlerts: { type: Boolean, default: false }, // notification toggle
  darkMode: { type: Boolean, default: true },
}, { timestamps: true });

studentSchema.index({ location: '2dsphere' });

export default mongoose.model('Student', studentSchema);
