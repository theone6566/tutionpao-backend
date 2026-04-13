import express from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import User from '../models/User.js';

const router = express.Router();

let razorpay;
try {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'dummy_id',
    key_secret: process.env.RAZORPAY_SECRET || 'dummy_secret'
  });
} catch(e) {}

router.post('/create-order', async (req, res) => {
  const { amount, plan } = req.body;
  try {
    const options = {
      amount: amount * 100, // in paise
      currency: "INR",
      receipt: "receipt_" + Math.random().toString(36).substring(7),
    };
    const order = await razorpay.orders.create(options);
    res.json({
      ...order,
      key_id: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/verify-payment', async (req, res) => {
  const { userId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  
  const sign = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSign = crypto.createHmac("sha256", process.env.RAZORPAY_SECRET || 'dummy_secret')
                             .update(sign.toString())
                             .digest("hex");

  if (razorpay_signature === expectedSign) {
    // Payment verified successfully
    await User.findByIdAndUpdate(userId, { 
      isSubscribed: true, 
      subscriptionExpiresAt: new Date(Date.now() + 30*24*60*60*1000) // 1 month
    });
    return res.json({ success: true, message: "Payment verified" });
  } else {
    return res.status(400).json({ success: false, message: "Invalid signature" });
  }
});

export default router;
