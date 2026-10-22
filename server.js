require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(express.json());

// Serve Static Files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Configuration
const BOT_TOKEN = process.env.BOT_TOKEN || '8871819505:AAHQyfyXvSFVoQpROkjFuueX7sgw_4Fgn58';
const ADMIN_CHAT_ID = String(process.env.ADMIN_CHAT_ID || '6741214107').trim();

console.log(`🤖 Telegram Bot Initializing... Admin Chat ID: ${ADMIN_CHAT_ID}`);

// Telegram Bot Options with Improved Polling Handling
const bot = new TelegramBot(BOT_TOKEN, { 
  polling: {
    autoStart: true,
    params: {
      timeout: 10
    }
  } 
});

// Handle Polling Errors (Conflict 409 fix)
bot.on('polling_error', (error) => {
  if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
    console.error('⚠️ Conflict Error (409): Bot token is currently running on another instance/PC!');
  } else {
    console.error(`⚠️ Telegram Polling Error [${error.code}]: ${error.message}`);
  }
});

// Storage Variables
const pendingUsers = new Map();     // chatId -> userData
const verifiedCodes = new Map();    // otpCode -> { email, verified, createdAt }
const pendingApprovals = new Map(); // pendingId -> { userChatId, email, method }

// 🌟 Persistent JSON File Storage
const APPROVED_FILE = path.join(__dirname, 'approved_users.json');
let approvedEmails = new Set();

// Read approved users from file
if (fs.existsSync(APPROVED_FILE)) {
  try {
    const rawData = fs.readFileSync(APPROVED_FILE, 'utf8');
    const parsedData = JSON.parse(rawData);
    approvedEmails = new Set(parsedData);
    console.log(`✅ Loaded ${approvedEmails.size} approved users from database.`);
  } catch (err) {
    console.error('❌ Error reading approved_users.json:', err.message);
  }
}

// Helper function: Email persistent storage keessatti save gochuu
function saveApprovedEmail(email) {
  approvedEmails.add(email.toLowerCase());
  try {
    fs.writeFileSync(APPROVED_FILE, JSON.stringify([...approvedEmails], null, 2));
    console.log(`💾 Saved paid student email: ${email}`);
  } catch (err) {
    console.error('❌ Failed to write to approved_users.json:', err.message);
  }
}

// Helper function: Storage guutummaatti update/qulqulleessuu
function saveAllApprovedEmails() {
  try {
    fs.writeFileSync(APPROVED_FILE, JSON.stringify([...approvedEmails], null, 2));
  } catch (err) {
    console.error('❌ Failed to update approved_users.json:', err.message);
  }
}

// ---------------- ADMIN MANAGEMENT COMMANDS ----------------

// 🗑️ 1. Email Tokko Baasuuf: /remove email@gmail.com
bot.onText(/\/remove (.+)/, (msg, match) => {
  const chatId = String(msg.chat.id).trim();

  if (chatId !== ADMIN_CHAT_ID) {
    return bot.sendMessage(chatId, "❌ You are not authorized to perform this action!");
  }

  const targetEmail = match[1].trim().toLowerCase();

  // 1. Email storage irraa haquu
  let removed = false;
  if (approvedEmails.has(targetEmail)) {
    approvedEmails.delete(targetEmail);
    removed = true;
  }

  // 2. OTP active ta'an keessaas haquu
  for (const [code, record] of verifiedCodes.entries()) {
    if (record.email === targetEmail) {
      verifiedCodes.delete(code);
    }
  }

  saveAllApprovedEmails();

  if (removed) {
    bot.sendMessage(chatId, `🗑️ **Success:** Email \`\${targetEmail}\` and active OTPs have been removed!`, { parse_mode: 'Markdown' });
  } else {
    bot.sendMessage(chatId, `⚠️ Email \`\${targetEmail}\` was not found in the approved list.`, { parse_mode: 'Markdown' });
  }
});

// 🧹 2. Namoota Galmaa'an Hunda fi OTP Active Hunda Haxaawuuf: /clearall
bot.onText(/\/clearall/, (msg) => {
  const chatId = String(msg.chat.id).trim();

  if (chatId !== ADMIN_CHAT_ID) {
    return bot.sendMessage(chatId, "❌ You are not authorized to perform this action!");
  }

  // Storage hunda guutummaatti qulqulleessuu
  approvedEmails.clear();
  verifiedCodes.clear();      // OTP active ta'an hunda ni dhabamsiisa
  pendingApprovals.clear();
  pendingUsers.clear();

  saveAllApprovedEmails(); // JSON file irratti [] save godha

  bot.sendMessage(chatId, "🧹 **All approved users, active OTPs, and pending sessions have been COMPLETELY CLEARED!**", { parse_mode: 'Markdown' });
});

// ---------------- TELEGRAM BOT FLOW ----------------

// /start Command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`📩 Received /start from Chat ID: ${chatId}`);

  bot.sendMessage(
    chatId,
    `👋 **Welcome to Apex Forex Academy Verification Bot!**\n\nTo unlock access to the VIP Masterclass (Price Action + SMC), payment verification and your email address are required.\n\nPlease send your Email address:`,
    { parse_mode: 'Markdown' }
  );
  pendingUsers.set(chatId, { step: 'AWAITING_EMAIL' });
});

// Handle Text Messages (Email Input)
bot.on('message', (msg) => {
  if (msg.photo || !msg.text || msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim().toLowerCase(); // Normalize email input
  const userState = pendingUsers.get(chatId);

  if (userState && userState.step === 'AWAITING_EMAIL') {
    if (!text.includes('@')) {
      return bot.sendMessage(chatId, '❌ Please enter a valid Email address!');
    }

    userState.email = text;

    // 🔍 SAKKATTA'IINSA: Yoo email kun kaffaltii duraan raawwateera ta'e OTP haaraa ergaaf
    if (approvedEmails.has(text)) {
      const newGeneratedCode = String(Math.floor(100000 + Math.random() * 900000));
      
      verifiedCodes.set(newGeneratedCode, { 
        email: text, 
        verified: false,
        createdAt: Date.now()
      });

      return bot.sendMessage(
        chatId,
        `✅ **Payment Verified!**\n\nSystem check confirmed that email (*${text}*) has already completed payment.\n\n🔑 **Your NEW Verification OTP Code:** \`\${newGeneratedCode}\`\n\nEnter this code and your email on the website to access your masterclass!`,
        { parse_mode: 'Markdown' }
      );
    }

    // ❌ Yoo kaffaltii hin raawwanne ta'e kaffaltii gaafata
    userState.step = 'AWAITING_PAYMENT_METHOD';

    const opts = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📱 Telebirr', callback_data: 'PAY_TELEBIRR' }],
          [{ text: '💸 M-Pesa', callback_data: 'PAY_MPESA' }]
        ]
      }
    };

    bot.sendMessage(chatId, `✅ Email: *${userState.email}* registered.\n\n⚠️ No previous payment record found for this email. Please select payment method to complete enrollment:`, { parse_mode: 'Markdown', ...opts });
  }
});

// Payment Method Callbacks & Admin Action Buttons
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  // 1. Student Payment Method Selection
  if (data === 'PAY_TELEBIRR' || data === 'PAY_MPESA') {
    const userState = pendingUsers.get(chatId) || { email: 'Not Provided' };
    userState.method = data === 'PAY_TELEBIRR' ? 'Telebirr' : 'M-Pesa';
    userState.step = 'AWAITING_RECEIPT';
    pendingUsers.set(chatId, userState);

    const accountDetails = data === 'PAY_TELEBIRR'
      ? `📲 **Telebirr Payment Details:**\n• Account Number: **0917091612**\n• Account Name: **Gemechu**\n• Course Fee: **10,000 ETB**`
      : `💸 **M-Pesa Payment Details:**\n• Account Number: **0717120607**\n• Account Name: **Gemechu**\n• Course Fee: **10,000 ETB**`;

    return bot.sendMessage(
      chatId,
      `${accountDetails}\n\nAfter completing your payment, please send the **Receipt Screenshot** here!`,
      { parse_mode: 'Markdown' }
    );
  }

  // 2. Admin Actions (Approve / Reject)
  if (data.startsWith('APPROVE_') || data.startsWith('REJECT_')) {
    const pendingId = data.replace('APPROVE_', '').replace('REJECT_', '');
    const pendingData = pendingApprovals.get(pendingId);

    if (!pendingData) {
      return bot.answerCallbackQuery(query.id, { text: '⚠️ Request expired or already processed!' });
    }

    if (data.startsWith('APPROVE_')) {
      const generatedCode = String(Math.floor(100000 + Math.random() * 900000));
      const studentEmail = pendingData.email.toLowerCase();

      // Email persistent storage (approved_users.json) irratti save gochuu
      saveApprovedEmail(studentEmail);
      
      // OTP Storage
      verifiedCodes.set(generatedCode, { 
        email: studentEmail, 
        verified: false,
        createdAt: Date.now()
      });

      const studentMessage = `🎉 *Payment Approved by Admin!*\n\nYour payment has been successfully verified.\n\n🔑 *Your Verification OTP Code:* \`\${generatedCode}\`\n\nEnter this code along with your registered email (*${pendingData.email}*) on the website to instantly unlock VIP Masterclass Access!`;

      bot.sendMessage(
        pendingData.userChatId,
        studentMessage,
        { parse_mode: 'Markdown' }
      );

      bot.editMessageCaption(
        `✅ **APPROVED PAYMENT**\n\n• **Student Email:** ${pendingData.email}\n• **Method:** ${pendingData.method}\n• **Generated OTP:** \`\${generatedCode}\`\n• **User ID:** ${pendingData.userChatId}`,
        { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' }
      );

      bot.answerCallbackQuery(query.id, { text: 'Payment Approved and OTP sent to student!' });
    } else {
      bot.sendMessage(
        pendingData.userChatId,
        `❌ **Payment Verification Failed**\n\nYour payment receipt could not be verified by the Admin. Please double check your payment or contact support.`,
        { parse_mode: 'Markdown' }
      );

      bot.editMessageCaption(
        `❌ **REJECTED PAYMENT**\n\n• **Student Email:** ${pendingData.email}\n• **Method:** ${pendingData.method}\n• **User ID:** ${pendingData.userChatId}`,
        { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' }
      );

      bot.answerCallbackQuery(query.id, { text: 'Payment Rejected.' });
    }

    pendingApprovals.delete(pendingId);
  }
});

// Screenshot Received (Forward to Admin)
bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const userState = pendingUsers.get(chatId) || { email: 'Not Provided', method: 'Unknown' };

  const photoFileId = msg.photo[msg.photo.length - 1].file_id;
  const pendingId = `${chatId}_${Date.now()}`;

  pendingApprovals.set(pendingId, {
    userChatId: chatId,
    email: userState.email || 'N/A',
    method: userState.method || 'Unknown'
  });

  if (ADMIN_CHAT_ID) {
    const adminKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `APPROVE_${pendingId}` },
            { text: '❌ Reject', callback_data: `REJECT_${pendingId}` }
          ]
        ]
      }
    };

    bot.sendPhoto(ADMIN_CHAT_ID, photoFileId, {
      caption: `🚨 **NEW PAYMENT SUBMITTED FOR REVIEW!**\n\n• **Student Email:** ${userState.email}\n• **Payment Method:** ${userState.method}\n• **Telegram User ID:** ${chatId}`,
      parse_mode: 'Markdown',
      ...adminKeyboard
    }).then(() => {
      console.log(`✅ Screenshot successfully sent to Admin (${ADMIN_CHAT_ID})`);
    }).catch((err) => {
      console.error(`❌ Failed to send photo to Admin:`, err.message);
    });
  } else {
    console.error('❌ ADMIN_CHAT_ID is missing!');
  }

  bot.sendMessage(
    chatId,
    `⏳ **Payment Received — Status: Pending Review**\n\nWe have received your payment receipt screenshot. Please wait while the Admin reviews and approves your transaction.\n\nYou will receive your **Verification OTP Code** here immediately once approved!`,
    { parse_mode: 'Markdown' }
  );
});

// REST API for Website Verification (STRICT EMAIL + EXPIRATION CHECK)
app.post('/api/verify-code', (req, res) => {
  const { code, email } = req.body;

  if (!code || !email) {
    return res.status(400).json({ 
      success: false, 
      message: 'Both Email and Verification Code are required!' 
    });
  }

  const cleanCode = code.trim();
  const cleanEmail = email.trim().toLowerCase();

  const record = verifiedCodes.get(cleanCode);

  if (!record) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid Verification Code!' 
    });
  }

  // 1. Check Expiration (Daqiiqaa 15)
  const OTP_EXPIRATION_TIME = 15 * 60 * 1000;
  if (Date.now() - record.createdAt > OTP_EXPIRATION_TIME) {
    verifiedCodes.delete(cleanCode);
    return res.status(400).json({
      success: false,
      message: 'This OTP code has expired! Please send your registered email to the Telegram bot again to receive a new code.'
    });
  }

  // 2. Check Email Match
  if (record.email !== cleanEmail) {
    return res.status(403).json({ 
      success: false, 
      message: 'This OTP code is not valid for the provided email address!' 
    });
  }

  record.verified = true;

  return res.json({ 
    success: true, 
    message: 'Verification successful! Masterclass unlocked.' 
  });
});

// Single Page Application Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
