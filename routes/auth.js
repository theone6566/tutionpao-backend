import express from 'express';
import jwt from 'jsonwebtoken';
import Teacher from '../models/Teacher.js';
import Student from '../models/Student.js';

const router = express.Router();

// Helper: get model by role
const getModel = (role) => role === 'teacher' ? Teacher : Student;

// ─── LOGIN (send OTP) ──────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { phone, role } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone required" });
  if (!role || !['teacher', 'student'].includes(role)) {
    return res.status(400).json({ error: "Role must be 'teacher' or 'student'" });
  }

  const Model = getModel(role);
  const user = await Model.findOne({ phone });

  res.json({
    message: "OTP Sent successfully",
    phone,
    role,
    isNewUser: !user,
  });
});

// ─── VERIFY OTP & REGISTER/LOGIN ───────────────────────────────
router.post('/verify', async (req, res) => {
  const { phone, otp, name, role, photo } = req.body;

  if (otp !== '1234') return res.status(400).json({ error: "Invalid OTP" });
  if (!role) return res.status(400).json({ error: "Role required" });

  try {
    const Model = getModel(role);
    let user = await Model.findOne({ phone });

    if (!user) {
      // Create new user
      user = new Model({ phone, name, role, photo });
      await user.save();
    } else {
      // Update if new info provided
      if (name) user.name = name;
      if (photo) user.photo = photo;
      await user.save();
    }

    const token = jwt.sign(
      { id: user._id, role },
      process.env.JWT_SECRET || 'secret123',
      { expiresIn: '30d' }
    );

    res.json({ token, user, role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── COMPLETE SUBSCRIPTION PROFILE ─────────────────────────────
// Called AFTER payment, to collect detailed info
router.post('/complete-profile', async (req, res) => {
  const { userId, role, aadhaar, aadhaarOtp } = req.body;

  // Aadhaar OTP verification stub (demo: accept 1234)
  if (aadhaarOtp !== '1234') {
    return res.status(400).json({ error: "Invalid Aadhaar OTP" });
  }

  try {
    const Model = getModel(role);
    let user = await Model.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Store last 4 digits of Aadhaar
    user.aadhaar = aadhaar ? aadhaar.slice(-4) : '';
    user.isAadhaarVerified = true;

    if (role === 'teacher') {
      const { qualifications, subjects, chargePerMonth, hoursPerDay, bio, experience } = req.body;
      if (qualifications) user.qualifications = qualifications;
      if (subjects) user.subjects = subjects;
      if (chargePerMonth) user.chargePerMonth = chargePerMonth;
      if (hoursPerDay) user.hoursPerDay = hoursPerDay;
      if (bio) user.bio = bio;
      if (experience) user.experience = experience;
    } else {
      const { grade, school, subjectsNeeded, budgetPerMonth, bio } = req.body;
      if (grade) user.grade = grade;
      if (school) user.school = school;
      if (subjectsNeeded) user.subjectsNeeded = subjectsNeeded;
      if (budgetPerMonth) user.budgetPerMonth = budgetPerMonth;
      if (bio) user.bio = bio;
    }

    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE PROFILE ─────────────────────────────────────────────
router.put('/profile', async (req, res) => {
  const { userId, role, ...updates } = req.body;
  if (!userId || !role) return res.status(400).json({ error: "userId and role required" });

  try {
    const Model = getModel(role);
    // Only allow safe fields to be updated
    const allowed = role === 'teacher'
      ? ['name', 'photo', 'qualifications', 'subjects', 'chargePerMonth', 'hoursPerDay', 'bio', 'experience', 'nearbyAlerts', 'darkMode']
      : ['name', 'photo', 'grade', 'school', 'subjectsNeeded', 'budgetPerMonth', 'bio', 'nearbyAlerts', 'darkMode'];

    const safeUpdates = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) safeUpdates[key] = updates[key];
    }

    const user = await Model.findByIdAndUpdate(userId, safeUpdates, { new: true });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET PROFILE ────────────────────────────────────────────────
router.get('/me/:role/:userId', async (req, res) => {
  try {
    const Model = getModel(req.params.role);
    const user = await Model.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE LOCATION ────────────────────────────────────────────
router.post('/location', async (req, res) => {
  const { userId, role, lat, lng } = req.body;
  try {
    const Model = getModel(role);
    await Model.findByIdAndUpdate(userId, {
      location: { type: 'Point', coordinates: [lng, lat] }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SEARCH NEARBY ──────────────────────────────────────────────
router.get('/nearby', async (req, res) => {
  const { lng, lat, role, maxDistance = 5000 } = req.query; // 5km radius
  if (!lng || !lat || !role) return res.status(400).json({ error: "lng, lat, and role required" });

  try {
    const Model = getModel(role); // search the TARGET role's collection
    const users = await Model.find({
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: parseInt(maxDistance)
        }
      }
    }).select('-aadhaar -__v'); // Don't expose aadhaar

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADD TO LIST (save a profile) ─────────────────────────────
router.post('/save-profile', async (req, res) => {
  const { userId, role, targetId } = req.body;
  try {
    const Model = getModel(role);
    const user = await Model.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.savedProfiles.includes(targetId)) {
      user.savedProfiles.push(targetId);
      await user.save();
    }

    res.json({ success: true, savedProfiles: user.savedProfiles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── REMOVE FROM LIST ────────────────────────────────────────
router.post('/unsave-profile', async (req, res) => {
  const { userId, role, targetId } = req.body;
  try {
    const Model = getModel(role);
    const user = await Model.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.savedProfiles = user.savedProfiles.filter(id => id.toString() !== targetId);
    await user.save();

    res.json({ success: true, savedProfiles: user.savedProfiles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET SAVED PROFILES (My List) ────────────────────────────
router.get('/saved/:role/:userId', async (req, res) => {
  try {
    const Model = getModel(req.params.role);
    const TargetModel = req.params.role === 'teacher' ? Student : Teacher;

    const user = await Model.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const savedUsers = await TargetModel.find({
      _id: { $in: user.savedProfiles }
    }).select('-aadhaar -__v');

    res.json(savedUsers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
