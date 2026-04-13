import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// Mock OTP Generation (Fixed OTP 1234 for demo)
router.post('/login', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone required" });
  
  const user = await User.findOne({ phone });
  res.json({ 
    message: "OTP Sent successfully", 
    phone, 
    isNewUser: !user,
    role: user ? user.role : null
  });
});

// Verify OTP & Complete Profile Setup
router.post('/verify', async (req, res) => {
  const { phone, otp, name, role, photo, qualifications, school } = req.body;
  
  if (otp !== '1234') return res.status(400).json({ error: "Invalid OTP" });
  
  try {
    let user = await User.findOne({ phone });
    if (!user) {
      user = new User({ phone, name, role, photo, qualifications, school });
      await user.save();
    } else {
      // Update info if completing profile
      if (name) user.name = name;
      if (role) user.role = role;
      if (photo) user.photo = photo;
      if (qualifications) user.qualifications = qualifications;
      if (school) user.school = school;
      await user.save();
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'secret123', { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Location
router.post('/location', async (req, res) => {
  const { userId, lat, lng } = req.body;
  try {
    await User.findByIdAndUpdate(userId, { 
      location: { type: 'Point', coordinates: [lng, lat] } 
    });
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// Search Nearby
router.get('/nearby', async (req, res) => {
  const { lng, lat, role, maxDistance = 5000 } = req.query; // 5km radius
  if (!lng || !lat) return res.status(400).json({ error: "Location required" });

  try {
    const users = await User.find({
      role: role,
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: parseInt(maxDistance)
        }
      }
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
