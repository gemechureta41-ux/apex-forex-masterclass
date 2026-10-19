require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
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

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Handle Polling Errors
bot.on('polling_error', (error) => {
  console.error(`⚠️ Telegram Polling Error [${error.code}]: ${error.message}`);
});

// Storage
const pendingUsers = new Map();  // chatId -> userData
const verifiedCodes = new Map(); // otpCode -> { email, verified }
const pendingApprovals = new Map(); // pendingId -> { userChatId, email, method }

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
  const text = msg.text.trim();
  const userState = pendingUsers.get(chatId);

  if (userState && userState.step === 'AWAITING_EMAIL') {
    if (!text.includes('@')) {
      return bot.sendMessage(chatId, '❌ Please enter a valid Email address!');
    }

    userState.email = text;
    userState.step = 'AWAITING_PAYMENT_METHOD';

    const opts = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📱 Telebirr', callback_data: 'PAY_TELEBIRR' }],
          [{ text: '💸 M-Pesa', callback_data: 'PAY_MPESA' }]
        ]
      }
    };

    bot.sendMessage(chatId, `✅ Email: *${userState.email}* registered successfully.\n\nPlease select your payment method:`, { parse_mode: 'Markdown', ...opts });
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
      // Generate 6-Digit Verification OTP Code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      verifiedCodes.set(code, { email: pendingData.email, verified: false });

      // Notify Student with Verification Code
      bot.sendMessage(
        pendingData.userChatId,
        `🎉 **Payment Approved by Admin!**\n\nYour payment has been successfully verified.\n\n🔑 **Your Verification OTP Code:** \`\${code}\`\n\nEnter this code on the website to instantly unlock VIP Masterclass Access!`,
        { parse_mode: 'Markdown' }
      );

      // Edit Admin Message
      bot.editMessageCaption(
        `✅ **APPROVED PAYMENT**\n\n• **Student Email:** ${pendingData.email}\n• **Method:** ${pendingData.method}\n• **Generated OTP:** \`\${code}\`\n• **User ID:** ${pendingData.userChatId}`,
        { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' }
      );

      bot.answerCallbackQuery(query.id, { text: 'Payment Approved and OTP sent to student!' });
    } else {
      // Reject Payment
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

  // Direct Forward to Admin Chat ID
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

  // Response to Student
  bot.sendMessage(
    chatId,
    `⏳ **Payment Received — Status: Pending Review**\n\nWe have received your payment receipt screenshot. Please wait while the Admin reviews and approves your transaction.\n\nYou will receive your **Verification OTP Code** here immediately once approved!`,
    { parse_mode: 'Markdown' }
  );
});

// REST API for Website Verification
app.post('/api/verify-code', (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ success: false, message: 'Code is required!' });
  }

  const record = verifiedCodes.get(code.trim());

  if (record) {
    record.verified = true;
    return res.json({ success: true, message: 'Verification successful!' });
  } else {
    return res.status(400).json({ success: false, message: 'Invalid Verification Code!' });
  }
});

// Single Page Application Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
