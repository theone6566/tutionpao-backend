import OTP from '../models/OTP.js';

// ─── GENERATE OTP ────────────────────────────────────────────
const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
};

// ─── SEND OTP VIA FAST2SMS ──────────────────────────────────
export const sendSMS = async (phone, otp) => {
  const apiKey = process.env.FAST2SMS_API_KEY;

  if (!apiKey) {
    console.log(`⚠️ FAST2SMS_API_KEY not set. OTP for ${phone}: ${otp}`);
    return { success: true, mock: true };
  }

  try {
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&variables_values=${otp}&route=otp&numbers=${phone}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'cache-control': 'no-cache' }
    });

    const data = await response.json();
    console.log(`📲 SMS sent to ${phone}:`, data);
    return { success: data.return === true, data };
  } catch (err) {
    console.error('SMS Error:', err);
    return { success: false, error: err.message };
  }
};

// ─── CREATE & SEND OTP ──────────────────────────────────────
export const createAndSendOTP = async (phone, purpose = 'login') => {
  // Remove any existing OTP for this phone+purpose
  await OTP.deleteMany({ phone, purpose });

  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await OTP.create({ phone, otp, purpose, expiresAt });

  // Send via SMS
  const result = await sendSMS(phone, otp);

  return { success: true, message: 'OTP sent', mock: result.mock || false };
};

// ─── VERIFY OTP ──────────────────────────────────────────────
export const verifyOTP = async (phone, userOtp, purpose = 'login') => {
  const record = await OTP.findOne({
    phone,
    purpose,
    verified: false,
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: -1 });

  if (!record) {
    return { success: false, error: 'OTP expired or not found. Request a new one.' };
  }

  if (record.attempts >= 5) {
    return { success: false, error: 'Too many attempts. Request a new OTP.' };
  }

  record.attempts += 1;

  if (record.otp !== userOtp) {
    await record.save();
    return { success: false, error: `Invalid OTP. ${5 - record.attempts} attempts left.` };
  }

  record.verified = true;
  await record.save();

  return { success: true };
};

// ─── AADHAAR OTP (via Surepass API) ─────────────────────────
export const sendAadhaarOTP = async (aadhaarNumber) => {
  const apiKey = process.env.SUREPASS_API_KEY;
  const baseUrl = process.env.SUREPASS_BASE_URL || 'https://sandbox.surepass.io';

  if (!apiKey) {
    // Mock mode: generate a local OTP and store it
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Store with aadhaar number as phone substitute
    await OTP.deleteMany({ phone: aadhaarNumber, purpose: 'aadhaar' });
    await OTP.create({ phone: aadhaarNumber, otp, purpose: 'aadhaar', expiresAt });

    console.log(`⚠️ SUREPASS_API_KEY not set. Aadhaar OTP for ${aadhaarNumber}: ${otp}`);
    return { success: true, mock: true, reference_id: 'mock_ref_' + Date.now(), mockOtp: otp };
  }

  try {
    const response = await fetch(`${baseUrl}/api/v1/aadhaar-v2/generate-otp`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id_number: aadhaarNumber })
    });

    const data = await response.json();

    if (data.success || data.status_code === 200) {
      return {
        success: true,
        reference_id: data.data?.client_id || data.data?.reference_id,
        message: 'Aadhaar OTP sent to linked mobile'
      };
    } else {
      return { success: false, error: data.message || 'Failed to send Aadhaar OTP' };
    }
  } catch (err) {
    console.error('Aadhaar OTP Error:', err);
    return { success: false, error: err.message };
  }
};

// ─── VERIFY AADHAAR OTP (via Surepass API) ──────────────────
export const verifyAadhaarOTP = async (referenceId, otp, aadhaarNumber) => {
  const apiKey = process.env.SUREPASS_API_KEY;
  const baseUrl = process.env.SUREPASS_BASE_URL || 'https://sandbox.surepass.io';

  if (!apiKey) {
    // Mock mode: verify from local DB
    const result = await verifyOTP(aadhaarNumber, otp, 'aadhaar');
    if (result.success) {
      return {
        success: true,
        data: {
          full_name: 'Verified User',
          aadhaar_number: 'XXXX-XXXX-' + (aadhaarNumber || '').slice(-4),
          address: { state: 'Madhya Pradesh' }
        }
      };
    }
    return result;
  }

  try {
    const response = await fetch(`${baseUrl}/api/v1/aadhaar-v2/submit-otp`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: referenceId,
        otp: otp
      })
    });

    const data = await response.json();

    if (data.success || data.status_code === 200) {
      return {
        success: true,
        data: data.data // Contains name, DOB, address, photo etc.
      };
    } else {
      return { success: false, error: data.message || 'Aadhaar verification failed' };
    }
  } catch (err) {
    console.error('Aadhaar Verify Error:', err);
    return { success: false, error: err.message };
  }
};
