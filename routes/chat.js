import express from 'express';
import Message from '../models/Message.js';
import User from '../models/User.js';

const router = express.Router();

// Get all threads for a user
router.get('/threads/:userId', async (req, res) => {
  try {
    const threads = await Message.find({
      $or: [{ senderId: req.params.userId }, { receiverId: req.params.userId }]
    }).populate('senderId receiverId', 'name role photo');
    
    res.json(threads);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// Update status (e.g. Accept request)
router.post('/status', async (req, res) => {
  const { threadId, status, freeSlot } = req.body;
  try {
    const update = { status };
    if (freeSlot) update.freeSlot = freeSlot;

    const thread = await Message.findByIdAndUpdate(threadId, update, { new: true });
    res.json(thread);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
