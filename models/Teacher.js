import mongoose from 'mongoose';

const teacherSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  name: { type: String },
  photo: { type: String }, // base64 or URL
  aadhaar: { type: String }, // last 4 digits stored only
  isAadhaarVerified: { type: Boolean, default: false },
  qualifications: { type: String }, // e.g. "B.Ed, M.Sc Mathematics"
  subjects: [{ type: String }], // ["Maths", "Physics"]
  chargePerMonth: { type: Number }, // in INR
  hoursPerDay: { type: Number }, // how many hours willing to teach
  bio: { type: String },
  experience: { type: String }, // "5 years" etc
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] } // [lng, lat]
  },
  isSubscribed: { type: Boolean, default: false },
  subscriptionExpiresAt: { type: Date },
  subscriptionPlan: { type: String, enum: ['free', 'premium'], default: 'free' },
  savedProfiles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }], // "Add to List"
  nearbyAlerts: { type: Boolean, default: false }, // notification toggle
  darkMode: { type: Boolean, default: true },
}, { timestamps: true });

teacherSchema.index({ location: '2dsphere' });

export default mongoose.model('Teacher', teacherSchema);
