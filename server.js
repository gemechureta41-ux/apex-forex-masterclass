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

// Telegram Bot Configuration
const BOT_TOKEN = process.env.BOT_TOKEN || '8736595383:AAF33rpE_kS9ikG7n_AF2lLyv9zAVs7Bkrg';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '6741214107';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// In-memory verification storage
const pendingUsers = new Map();
const verifiedCodes = new Map();

console.log(`🚀 Apex Forex Bot Server Running... Admin Chat ID: ${ADMIN_CHAT_ID}`);

// ---------------- TELEGRAM BOT FLOW (ENGLISH) ----------------

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    `👋 **Welcome to Apex Forex Academy Verification Bot!**\n\nTo unlock access to the VIP Masterclass (Price Action + SMC), payment verification and your email address are required.\n\nPlease send your Email address:`,
    { parse_mode: 'Markdown' }
  );
  pendingUsers.set(chatId, { step: 'AWAITING_EMAIL' });
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text === '/start') return;

  const userState = pendingUsers.get(chatId);

  if (userState && userState.step === 'AWAITING_EMAIL') {
    if (!text.includes('@')) {
      return bot.sendMessage(chatId, '❌ Please enter a valid Email address!');
    }

    userState.email = text.trim();
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

bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const userState = pendingUsers.get(chatId) || {};

  if (data === 'PAY_TELEBIRR') {
    userState.method = 'Telebirr';
    userState.step = 'AWAITING_RECEIPT';
    bot.sendMessage(
      chatId,
      `📲 **Telebirr Payment Details:**\n• Account Number: **0917091612**\n• Account Name: **Gemechu**\n• Course Fee: **10,000 ETB**\n\nAfter completing your payment, please send the **Transaction ID** and **Receipt Screenshot** here!`,
      { parse_mode: 'Markdown' }
    );
  } else if (data === 'PAY_MPESA') {
    userState.method = 'M-Pesa';
    userState.step = 'AWAITING_RECEIPT';
    bot.sendMessage(
      chatId,
      `💸 **M-Pesa Payment Details:**\n• Account Number: **0717120607**\n• Account Name: **Gemechu**\n• Course Fee: **10,000 ETB**\n\nAfter completing your payment, please send the **Transaction ID** and **Receipt Screenshot** here!`,
      { parse_mode: 'Markdown' }
    );
  }
});

bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const userState = pendingUsers.get(chatId);

  if (userState && userState.step === 'AWAITING_RECEIPT') {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verifiedCodes.set(code, { email: userState.email, verified: false });

    if (ADMIN_CHAT_ID) {
      bot.sendPhoto(ADMIN_CHAT_ID, msg.photo[msg.photo.length - 1].file_id, {
        caption: `🚨 **NEW PAYMENT SUBMITTED!**\n\n• **Student Email:** ${userState.email}\n• **Method:** ${userState.method}\n• **Generated OTP Code:** \`\${code}\`\n• **User Telegram ID:** ${chatId}`,
        parse_mode: 'Markdown'
      });
    }

    bot.sendMessage(
      chatId,
      `⏳ **Payment Received — Status: Pending Review**\n\nWe have received your payment receipt screenshot. Please wait patiently while the Admin reviews and approves your transaction.\n\n🔑 **Your Verification OTP Code:** \`\${code}\`\n\nOnce approved, you can enter this code on the website to unlock full VIP Access.`,
      { parse_mode: 'Markdown' }
    );
  }
});

// ---------------- REST API FOR WEBSITE VERIFICATION ----------------

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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
