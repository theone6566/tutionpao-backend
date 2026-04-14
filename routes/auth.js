import express from 'express';
import jwt from 'jsonwebtoken';
import Teacher from '../models/Teacher.js';
import Student from '../models/Student.js';
import SearchLog from '../models/SearchLog.js';
import { createAndSendOTP, verifyOTP, sendAadhaarOTP, verifyAadhaarOTP } from '../services/sms.js';

const router = express.Router();

const getModel = (role) => role === 'teacher' ? Teacher : Student;

// ═══════════════════════════════════════════════════════════════
// PUBLIC ROUTES (no login required)
// ═══════════════════════════════════════════════════════════════

// ─── PUBLIC BROWSE (limited details) ────────────────────────
router.get('/public/browse', async (req, res) => {
  const { role, lat, lng, maxDistance = 25000, subject, page = 1, limit = 50 } = req.query;

  if (!role || !['teacher', 'student'].includes(role)) {
    return res.status(400).json({ error: "Role must be 'teacher' or 'student'" });
  }

  try {
    const Model = getModel(role);
    let query = {};

    if (lat && lng) {
      query.location = {
        $near: {
          $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: parseInt(maxDistance)
        }
      };
    }

    if (subject) {
      const subjectRegex = new RegExp(subject, 'i');
      if (role === 'teacher') {
        query.subjects = { $elemMatch: { $regex: subjectRegex } };
      } else {
        query.subjectsNeeded = { $elemMatch: { $regex: subjectRegex } };
      }
    }

    const selectFields = role === 'teacher'
      ? 'name photo subjects chargePerMonth location isSubscribed'
      : 'name photo subjectsNeeded budgetPerMonth grade location isSubscribed';

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const users = await Model.find(query).select(selectFields).skip(skip).limit(parseInt(limit));
    const total = await Model.countDocuments(query);

    res.json({ users, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── LOG SEARCH (record every search to database) ───────────
router.post('/public/log-search', async (req, res) => {
  const { lookingFor, lat, lng, subject, range, searcherId, searcherType } = req.body;

  if (!lookingFor || !lat || !lng) {
    return res.status(400).json({ error: "lookingFor, lat, lng required" });
  }

  try {
    const log = new SearchLog({
      searcherType: searcherType || 'guest',
      searcherId: searcherId || undefined,
      lookingFor,
      location: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
      subject: subject || '',
      range: range || 25,
    });
    await log.save();

    // Count how many results exist in that area
    const Model = getModel(lookingFor);
    let resultsCount = 0;
    try {
      resultsCount = await Model.countDocuments({
        location: {
          $near: {
            $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
            $maxDistance: (range || 25) * 1000
          }
        }
      });
    } catch(e) {}

    log.resultsCount = resultsCount;
    await log.save();

    res.json({ success: true, logId: log._id, resultsCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET SEARCH ACTIVITY NEAR A LOCATION ────────────────────
// Shows "X people searched for teachers near you recently"
router.get('/public/search-activity', async (req, res) => {
  const { lat, lng, maxDistance = 10000, lookingFor } = req.query;

  try {
    const query = {};

    if (lat && lng) {
      query.location = {
        $near: {
          $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: parseInt(maxDistance)
        }
      };
    }

    if (lookingFor) query.lookingFor = lookingFor;

    // Last 7 days
    query.createdAt = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };

    const count = await SearchLog.countDocuments(query);
    const recent = await SearchLog.find(query).sort({ createdAt: -1 }).limit(5).select('lookingFor subject createdAt range');

    res.json({ searchesNearby: count, recentSearches: recent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUBLIC PROFILE (limited) ───────────────────────────────
router.get('/public/profile/:role/:userId', async (req, res) => {
  try {
    const Model = getModel(req.params.role);
    const selectFields = req.params.role === 'teacher'
      ? 'name photo subjects chargePerMonth hoursPerDay bio location isSubscribed createdAt'
      : 'name photo subjectsNeeded budgetPerMonth grade school bio location isSubscribed createdAt';
    const user = await Model.findById(req.params.userId).select(selectFields);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUBLIC STATS ────────────────────────────────────────────
router.get('/public/stats', async (req, res) => {
  try {
    const teacherCount = await Teacher.countDocuments();
    const studentCount = await Student.countDocuments();
    const totalSearches = await SearchLog.countDocuments();
    res.json({ totalTeachers: teacherCount, totalStudents: studentCount, totalUsers: teacherCount + studentCount, totalSearches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// AUTH ROUTES (with DUAL ROLE support)
// ═══════════════════════════════════════════════════════════════

// ─── SEND OTP ───────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { phone, role } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone required" });
  if (!role || !['teacher', 'student'].includes(role)) {
    return res.status(400).json({ error: "Role must be 'teacher' or 'student'" });
  }

  const Model = getModel(role);
  const existingUser = await Model.findOne({ phone });

  // Check OTHER role too (dual role support)
  const OtherModel = role === 'teacher' ? Student : Teacher;
  const otherRoleUser = await OtherModel.findOne({ phone });

  try {
    const result = await createAndSendOTP(phone, 'login');

    res.json({
      message: result.mock ? `OTP sent (check server logs)` : "OTP sent to your mobile",
      phone, role,
      isNewUser: !existingUser,
      // Now we tell the frontend about the other role (for dual role)
      hasOtherRole: !!otherRoleUser,
      otherRole: otherRoleUser ? (role === 'teacher' ? 'student' : 'teacher') : null,
      otherRoleSubscribed: otherRoleUser?.isSubscribed || false,
      mock: result.mock || false
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to send OTP: " + err.message });
  }
});

// ─── VERIFY OTP & LOGIN/REGISTER ────────────────────────────
// Now allows same phone to register as BOTH teacher and student
router.post('/verify', async (req, res) => {
  const { phone, otp, name, role, photo } = req.body;
  if (!role) return res.status(400).json({ error: "Role required" });

  const otpResult = await verifyOTP(phone, otp, 'login');
  if (!otpResult.success) {
    return res.status(400).json({ error: otpResult.error });
  }

  try {
    const Model = getModel(role);
    let user = await Model.findOne({ phone });

    if (!user) {
      // New user in this role — create
      // (same phone can exist in both Teacher AND Student collections)
      user = new Model({ phone, name, photo });
      await user.save();
    } else {
      if (name && name !== 'New User') user.name = name;
      if (photo) user.photo = photo;
      await user.save();
    }

    // Check if they have the other role too
    const OtherModel = role === 'teacher' ? Student : Teacher;
    const otherRoleUser = await OtherModel.findOne({ phone });

    const token = jwt.sign(
      { id: user._id, role, phone },
      process.env.JWT_SECRET || 'secret123',
      { expiresIn: '30d' }
    );

    res.json({
      token, user, role,
      hasOtherRole: !!otherRoleUser,
      otherRole: otherRoleUser ? (role === 'teacher' ? 'student' : 'teacher') : null,
      otherRoleUser: otherRoleUser ? { _id: otherRoleUser._id, name: otherRoleUser.name, isSubscribed: otherRoleUser.isSubscribed } : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SWITCH ROLE (for dual role users) ──────────────────────
// Quick switch to other role without re-OTP
router.post('/switch-role', async (req, res) => {
  const { phone, targetRole } = req.body;
  if (!phone || !targetRole) return res.status(400).json({ error: "phone and targetRole required" });

  try {
    const Model = getModel(targetRole);
    const user = await Model.findOne({ phone });

    if (!user) {
      return res.status(404).json({ error: `You're not registered as a ${targetRole}. Register first.`, needsRegister: true });
    }

    const token = jwt.sign(
      { id: user._id, role: targetRole, phone },
      process.env.JWT_SECRET || 'secret123',
      { expiresIn: '30d' }
    );

    // Check other role
    const OtherModel = targetRole === 'teacher' ? Student : Teacher;
    const otherRoleUser = await OtherModel.findOne({ phone });

    res.json({
      token, user, role: targetRole,
      hasOtherRole: !!otherRoleUser,
      otherRole: otherRoleUser ? (targetRole === 'teacher' ? 'student' : 'teacher') : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── REGISTER OTHER ROLE (add second role) ──────────────────
router.post('/register-other-role', async (req, res) => {
  const { phone, newRole, name, photo } = req.body;
  if (!phone || !newRole) return res.status(400).json({ error: "phone and newRole required" });

  try {
    const Model = getModel(newRole);
    let user = await Model.findOne({ phone });

    if (user) {
      return res.status(400).json({ error: `Already registered as ${newRole}` });
    }

    // Create in the new role
    user = new Model({ phone, name, photo });
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: newRole, phone },
      process.env.JWT_SECRET || 'secret123',
      { expiresIn: '30d' }
    );

    res.json({ token, user, role: newRole, message: `Now registered as ${newRole} too!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// AADHAAR VERIFICATION
// ═══════════════════════════════════════════════════════════════

router.post('/aadhaar/send-otp', async (req, res) => {
  const { aadhaarNumber, userId, role } = req.body;
  if (!aadhaarNumber || aadhaarNumber.length !== 12) {
    return res.status(400).json({ error: "Enter valid 12-digit Aadhaar number" });
  }
  try {
    const result = await sendAadhaarOTP(aadhaarNumber);
    if (result.success) {
      res.json({
        success: true, reference_id: result.reference_id,
        message: result.mock ? `Aadhaar OTP: ${result.mockOtp} (check server logs)` : 'OTP sent to Aadhaar-linked mobile',
        mock: result.mock || false
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/aadhaar/verify-otp', async (req, res) => {
  const { referenceId, otp, aadhaarNumber, userId, role } = req.body;
  try {
    const result = await verifyAadhaarOTP(referenceId, otp, aadhaarNumber);
    if (result.success) {
      const Model = getModel(role);
      await Model.findByIdAndUpdate(userId, { aadhaar: aadhaarNumber.slice(-4), isAadhaarVerified: true });
      res.json({ success: true, message: 'Aadhaar verified', aadhaarData: result.data });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// PROFILE ROUTES
// ═══════════════════════════════════════════════════════════════

router.post('/complete-profile', async (req, res) => {
  const { userId, role } = req.body;
  try {
    const Model = getModel(role);
    let user = await Model.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/profile', async (req, res) => {
  const { userId, role, ...updates } = req.body;
  if (!userId || !role) return res.status(400).json({ error: "userId and role required" });
  try {
    const Model = getModel(role);
    const allowed = role === 'teacher'
      ? ['name', 'photo', 'qualifications', 'subjects', 'chargePerMonth', 'hoursPerDay', 'bio', 'experience', 'nearbyAlerts', 'darkMode']
      : ['name', 'photo', 'grade', 'school', 'subjectsNeeded', 'budgetPerMonth', 'bio', 'nearbyAlerts', 'darkMode'];
    const safeUpdates = {};
    for (const key of allowed) { if (updates[key] !== undefined) safeUpdates[key] = updates[key]; }
    const user = await Model.findByIdAndUpdate(userId, safeUpdates, { new: true });
    res.json({ success: true, user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/me/:role/:userId', async (req, res) => {
  try {
    const Model = getModel(req.params.role);
    const user = await Model.findById(req.params.userId).select('-aadhaar');
    if (!user) return res.status(404).json({ error: "User not found" });

    // Also check if they have the other role
    const OtherModel = req.params.role === 'teacher' ? Student : Teacher;
    const otherRoleUser = await OtherModel.findOne({ phone: user.phone });

    const userData = user.toObject();
    userData.hasOtherRole = !!otherRoleUser;
    userData.otherRole = otherRoleUser ? (req.params.role === 'teacher' ? 'student' : 'teacher') : null;
    userData.otherRoleSubscribed = otherRoleUser?.isSubscribed || false;

    res.json(userData);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/location', async (req, res) => {
  const { userId, role, lat, lng } = req.body;
  try {
    const Model = getModel(role);
    await Model.findByIdAndUpdate(userId, { location: { type: 'Point', coordinates: [lng, lat] } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/nearby', async (req, res) => {
  const { lng, lat, role, maxDistance = 5000 } = req.query;
  if (!lng || !lat || !role) return res.status(400).json({ error: "lng, lat, and role required" });
  try {
    const Model = getModel(role);
    const users = await Model.find({
      location: { $near: { $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] }, $maxDistance: parseInt(maxDistance) } }
    }).select('-aadhaar -__v');
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// SAVED PROFILES (Add to List / Cart)
// ═══════════════════════════════════════════════════════════════

router.post('/save-profile', async (req, res) => {
  const { userId, role, targetId } = req.body;
  try {
    const Model = getModel(role);
    const user = await Model.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.savedProfiles.includes(targetId)) { user.savedProfiles.push(targetId); await user.save(); }
    res.json({ success: true, savedProfiles: user.savedProfiles });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/unsave-profile', async (req, res) => {
  const { userId, role, targetId } = req.body;
  try {
    const Model = getModel(role);
    const user = await Model.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    user.savedProfiles = user.savedProfiles.filter(id => id.toString() !== targetId);
    await user.save();
    res.json({ success: true, savedProfiles: user.savedProfiles });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/saved/:role/:userId', async (req, res) => {
  try {
    const Model = getModel(req.params.role);
    const TargetModel = req.params.role === 'teacher' ? Student : Teacher;
    const user = await Model.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const savedUsers = await TargetModel.find({ _id: { $in: user.savedProfiles } }).select('-aadhaar -__v');
    res.json(savedUsers);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
