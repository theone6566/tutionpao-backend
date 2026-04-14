import mongoose from 'mongoose';

// Tracks every search so we can show "X people searched near you"
const searchLogSchema = new mongoose.Schema({
  searcherType: { type: String, enum: ['guest', 'teacher', 'student'], default: 'guest' },
  searcherId: { type: mongoose.Schema.Types.ObjectId }, // null for guests
  lookingFor: { type: String, enum: ['teacher', 'student'], required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] } // [lng, lat]
  },
  subject: { type: String },
  range: { type: Number, default: 25 }, // km
  resultsCount: { type: Number, default: 0 },
}, { timestamps: true });

searchLogSchema.index({ location: '2dsphere' });
searchLogSchema.index({ createdAt: -1 });

export default mongoose.model('SearchLog', searchLogSchema);
