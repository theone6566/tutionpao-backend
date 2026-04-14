import express from 'express';
import Message from '../models/Message.js';
import Teacher from '../models/Teacher.js';
import Student from '../models/Student.js';

const router = express.Router();

const getModel = (role) => role === 'teacher' ? Teacher : Student;

// Get all threads for a user
router.get('/threads/:role/:userId', async (req, res) => {
  try {
    const { role, userId } = req.params;
    const threads = await Message.find({
      $or: [
        { senderId: userId, senderRole: role },
        { receiverId: userId, receiverRole: role }
      ]
    }).sort({ updatedAt: -1 });

    // Manually populate sender/receiver info from correct collection
    const populated = await Promise.all(threads.map(async (thread) => {
      const t = thread.toObject();

      const SenderModel = getModel(t.senderRole);
      const ReceiverModel = getModel(t.receiverRole);

      const [sender, receiver] = await Promise.all([
        SenderModel.findById(t.senderId).select('name photo role'),
        ReceiverModel.findById(t.receiverId).select('name photo role'),
      ]);

      t.senderInfo = sender;
      t.receiverInfo = receiver;
      return t;
    }));

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update status (Accept/Decline request)
router.post('/status', async (req, res) => {
  const { threadId, status, freeSlot } = req.body;
  try {
    const update = { status };
    if (freeSlot) update.freeSlot = freeSlot;

    const thread = await Message.findByIdAndUpdate(threadId, update, { new: true });
    res.json(thread);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
