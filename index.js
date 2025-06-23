require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const fs = require('fs');
const path = require('path');

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/premiumBot', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// User schema
const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  expiryDate: { type: Date, required: true },
  addedBy: { type: Number, required: true },
  addedAt: { type: Date, default: Date.now },
  planName: { type: String, default: 'Premium' },
  paymentProof: { type: String } // Store payment proof if needed
});
const PremiumUser = mongoose.model('PremiumUser', userSchema);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const PREMIUM_CHANNEL = {
  id: process.env.PREMIUM_CHANNEL_ID,
  inviteLink: process.env.PREMIUM_CHANNEL_INVITE_LINK
};

// Payment configuration
const PAYMENT_METHODS = {
  upi: {
    id: process.env.UPI_ID || 'yourupi@example',
    name: process.env.UPI_NAME || 'Your Name'
  },
  bank: {
    ac_number: process.env.BANK_AC || '1234567890',
    name: process.env.BANK_NAME || 'Your Name',
    ifsc: process.env.BANK_IFSC || 'ABCD0123456',
    branch: process.env.BANK_BRANCH || 'Your Bank Branch'
  },
  qr_code: process.env.QR_CODE_URL || 'https://example.com/yourqr.png'
};

// Start message
bot.start((ctx) => {
  const welcomeMessage = `
<b>👋 Welcome to Premium Access Bot!</b>

<i>Get access to exclusive content with our premium plans</i>

<b>User Commands:</b>
/plan - View payment methods and plans
/myplan - Check your current plan status

<b>Admin Commands:</b>
/addpremium - Add premium access to user
/listusers - Get all users list
  `;
  
  return ctx.replyWithHTML(welcomeMessage, Markup.keyboard([
    ['/plan', '/myplan']
  ]).resize());
});

// Plan command with payment methods
bot.command('plan', (ctx) => {
  const paymentMessage = `
<b>💳 Payment Methods & Plans</b>

<b>UPI Payment:</b>
🔹 <code>${PAYMENT_METHODS.upi.id}</code>
🔹 Name: ${PAYMENT_METHODS.upi.name}

<b>Bank Transfer:</b>
🏦 <b>Account Number:</b> <code>${PAYMENT_METHODS.bank.ac_number}</code>
👤 <b>Account Name:</b> ${PAYMENT_METHODS.bank.name}
📌 <b>IFSC:</b> <code>${PAYMENT_METHODS.bank.ifsc}</code>
🏢 <b>Branch:</b> ${PAYMENT_METHODS.bank.branch}

<b>Available Plans:</b>
1️⃣ <b>Basic</b> - ₹99/week
2️⃣ <b>Premium</b> - ₹299/month
3️⃣ <b>VIP</b> - ₹999/3 months

<i>After payment, send screenshot to admin for activation</i>
  `;

  ctx.replyWithHTML(paymentMessage, Markup.inlineKeyboard([
    Markup.button.url('📲 Payment QR Code', PAYMENT_METHODS.qr_code),
    Markup.button.callback('🔄 Refresh', 'refresh_payment')
  ]));
});

// Payment refresh handler
bot.action('refresh_payment', (ctx) => {
  ctx.editMessageText(`
<b>🔄 Updated Payment Methods</b>

<b>UPI ID:</b> <code>${PAYMENT_METHODS.upi.id}</code>
<b>Account Name:</b> ${PAYMENT_METHODS.upi.name}

<i>Scan QR code or use UPI ID above</i>
  `, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [Markup.button.url('📸 View QR Code', PAYMENT_METHODS.qr_code)],
        [Markup.button.callback('⬅️ Back', 'back_to_plans')]
      ]
    }
  });
});

bot.action('back_to_plans', (ctx) => {
  ctx.deleteMessage();
  ctx.replyWithHTML(`
<b>💎 Available Plans</b>

1. <b>Basic</b> - ₹99/week
   - Basic content access
   
2. <b>Premium</b> - ₹299/month
   - Full content access
   - Priority support
   
3. <b>VIP</b> - ₹999/3 months
   - VIP benefits
   - Personal assistant

Use /plan to see payment methods
  `);
});

// Myplan command
bot.command('myplan', async (ctx) => {
  try {
    const user = await PremiumUser.findOne({ userId: ctx.from.id });
    if (!user) return ctx.replyWithHTML('<i>You don\'t have an active plan. Use /plan to subscribe</i>');

    const remainingTime = user.expiryDate - new Date();
    const days = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    ctx.replyWithHTML(`
<b>📋 Your Plan Details</b>

🆔 <b>User ID:</b> <code>${user.userId}</code>
📝 <b>Plan:</b> ${user.planName}
📅 <b>Expiry:</b> ${user.expiryDate.toLocaleString()}
⏳ <b>Remaining:</b> ${days}d ${hours}h

<a href="${PREMIUM_CHANNEL.inviteLink}">🔗 Join Premium Channel</a>
    `);
  } catch (err) {
    console.error(err);
    ctx.replyWithHTML('<b>❌ Error fetching your plan details</b>');
  }
});

// Listusers command (admin only)
bot.command('listusers', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.replyWithHTML('<b>⛔ Admin only command!</b>');

  try {
    const users = await PremiumUser.find().sort({ expiryDate: 1 });
    if (users.length === 0) return ctx.replyWithHTML('<i>No premium users found</i>');

    // Create CSV file
    let csvData = 'User ID,Plan,Expiry Date,Added By\n';
    users.forEach(user => {
      csvData += `${user.userId},${user.planName},${user.expiryDate.toISOString()},${user.addedBy}\n`;
    });

    const fileName = `users_${Date.now()}.csv`;
    fs.writeFileSync(fileName, csvData);

    await ctx.replyWithDocument({ 
      source: fileName,
      filename: 'premium_users.csv'
    });
    fs.unlinkSync(fileName);
  } catch (err) {
    console.error(err);
    ctx.replyWithHTML('<b>❌ Error generating user list</b>');
  }
});

// Add premium command
bot.command('addpremium', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.replyWithHTML('<b>⛔ Admin only command!</b>');

  const args = ctx.message.text.split(' ').filter(arg => arg.trim() !== '');
  if (args.length < 3) return ctx.replyWithHTML(`
<b>⚠️ Usage:</b> <code>/addpremium ID duration [plan]</code>
<b>Example:</b> <code>/addpremium 1234567 30day VIP</code>
  `);

  const userId = parseInt(args[1]);
  if (isNaN(userId)) return ctx.replyWithHTML('<b>⚠️ Invalid user ID</b>');

  const timeInput = args[2].toLowerCase();
  const timeValue = parseInt(timeInput.match(/\d+/)?.[0]);
  const timeUnit = timeInput.match(/[a-z]+/)?.[0];
  const planName = args.slice(3).join(' ') || 'Premium';

  if (!timeValue || !timeUnit) return ctx.replyWithHTML('<b>⚠️ Invalid duration format</b>');

  const now = new Date();
  let expiryDate;

  switch(timeUnit) {
    case 'min': expiryDate = new Date(now.getTime() + timeValue * 60000); break;
    case 'hour': expiryDate = new Date(now.getTime() + timeValue * 3600000); break;
    case 'day': expiryDate = new Date(now.getTime() + timeValue * 86400000); break;
    case 'week': expiryDate = new Date(now.getTime() + timeValue * 604800000); break;
    case 'month': expiryDate = new Date(now.setMonth(now.getMonth() + timeValue)); break;
    default: return ctx.replyWithHTML('<b>⚠️ Invalid time unit (min/hour/day/week/month)</b>');
  }

  try {
    await PremiumUser.findOneAndUpdate(
      { userId },
      { userId, expiryDate, addedBy: ctx.from.id, planName },
      { upsert: true }
    );

    ctx.replyWithHTML(`
<b>✅ Premium Access Added</b>

👤 <b>User ID:</b> <code>${userId}</code>
📝 <b>Plan:</b> ${planName}
⏳ <b>Expires:</b> ${expiryDate.toLocaleString()}
🔗 <a href="${PREMIUM_CHANNEL.inviteLink}">Invite Link</a>
    `);

    // Notify user if possible
    try {
      await bot.telegram.sendMessage(userId, `
<b>🎉 Your Premium Access Activated!</b>

📝 <b>Plan:</b> ${planName}
⏳ <b>Expires:</b> ${expiryDate.toLocaleString()}

<a href="${PREMIUM_CHANNEL.inviteLink}">🔗 Join Premium Channel</a>
      `, { parse_mode: 'HTML' });
    } catch (userNotifyError) {
      console.log(`Couldn't notify user ${userId}`);
    }
  } catch (err) {
    console.error(err);
    ctx.replyWithHTML('<b>❌ Error saving user data</b>');
  }
});

// Expired user check
setInterval(async () => {
  try {
    const expiredUsers = await PremiumUser.find({ expiryDate: { $lte: new Date() } });
    for (const user of expiredUsers) {
      try {
        await PremiumUser.deleteOne({ userId: user.userId });
        await bot.telegram.sendMessage(
          ADMIN_ID,
          `⏰ Removed expired user ${user.userId} (${user.planName})`,
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        console.error(`Error removing user ${user.userId}:`, err);
      }
    }
  } catch (err) {
    console.error('Error checking expired users:', err);
  }
}, 60000); // Check every minute

// Webhook setup (if enabled)
if (process.env.WEBHOOK_MODE === 'true') {
  const app = express();
  const port = process.env.PORT || 3000;
  
  app.use(express.json());
  app.use(bot.webhookCallback(`/bot${process.env.TELEGRAM_BOT_TOKEN}`));
  
  app.listen(port, () => {
    console.log(`Webhook server running on port ${port}`);
    bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}/bot${process.env.TELEGRAM_BOT_TOKEN}`);
  });
} else {
  bot.launch().then(() => console.log('Bot running in polling mode'));
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
