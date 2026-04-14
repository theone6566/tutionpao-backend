import express from 'express';
import Notification from '../models/Notification.js';

const router = express.Router();

// Get notifications for a user
router.get('/:role/:userId', async (req, res) => {
  try {
    const notifications = await Notification.find({
      userId: req.params.userId,
      userRole: req.params.role
    }).sort({ createdAt: -1 }).limit(50);

    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark notification as read
router.post('/read', async (req, res) => {
  const { notificationId } = req.body;
  try {
    await Notification.findByIdAndUpdate(notificationId, { isRead: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark all as read
router.post('/read-all', async (req, res) => {
  const { userId, role } = req.body;
  try {
    await Notification.updateMany(
      { userId, userRole: role, isRead: false },
      { isRead: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
