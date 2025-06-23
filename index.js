require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');

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

// Enhanced User schema with proper indexing
const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  username: { type: String },
  firstName: { type: String },
  lastName: { type: String },
  expiryDate: { type: Date, required: true },
  addedBy: { type: Number, required: true },
  addedAt: { type: Date, default: Date.now },
  planName: { type: String, required: true, enum: ['Basic', 'Premium', 'VIP'], default: 'Premium' },
  paymentProof: { type: String },
  isActive: { type: Boolean, default: true }
});

// Add indexes for better performance
userSchema.index({ userId: 1 });
userSchema.index({ expiryDate: 1 });
userSchema.index({ isActive: 1 });

const PremiumUser = mongoose.model('PremiumUser', userSchema);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const PREMIUM_CHANNEL = {
  id: process.env.PREMIUM_CHANNEL_ID,
  inviteLink: process.env.PREMIUM_CHANNEL_INVITE_LINK
};

// ... [Keep your existing payment methods and start command code]

// Enhanced Myplan command with proper user-specific data
bot.command('myplan', async (ctx) => {
  try {
    const user = await PremiumUser.findOne({ 
      userId: ctx.from.id,
      isActive: true,
      expiryDate: { $gt: new Date() }
    });

    if (!user) {
      return ctx.replyWithHTML(`
<i>You don't have an active premium plan.</i>

🔹 Use /plan to see available plans
🔹 Contact admin if you've already paid
      `);
    }

    const remainingTime = user.expiryDate - new Date();
    const days = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    ctx.replyWithHTML(`
<b>📋 YOUR PLAN DETAILS</b>

👤 <b>User:</b> ${ctx.from.first_name} ${ctx.from.last_name || ''}
🆔 <b>ID:</b> <code>${user.userId}</code>
📝 <b>Plan:</b> ${user.planName}
📅 <b>Expiry:</b> ${user.expiryDate.toLocaleString()}
⏳ <b>Remaining:</b> ${days}d ${hours}h

<a href="${PREMIUM_CHANNEL.inviteLink}">🔗 Join Premium Channel</a>
    `);
  } catch (err) {
    console.error('Error in myplan command:', err);
    ctx.replyWithHTML('<b>❌ Error fetching your plan details. Please try again later.</b>');
  }
});

// Enhanced Add Premium Command
bot.command('addpremium', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.replyWithHTML('<b>⛔ Admin only command!</b>');
  }

  const args = ctx.message.text.split(' ').filter(arg => arg.trim() !== '');
  if (args.length < 3) {
    return ctx.replyWithHTML(`
<b>⚠️ Usage:</b> <code>/addpremium ID duration [plan]</code>
<b>Example:</b> <code>/addpremium 1234567 30day VIP</code>
<b>Plans:</b> Basic, Premium, VIP
    `);
  }

  const userId = parseInt(args[1]);
  if (isNaN(userId)) return ctx.replyWithHTML('<b>⚠️ Invalid user ID</b>');

  const timeInput = args[2].toLowerCase();
  const timeValue = parseInt(timeInput.match(/\d+/)?.[0]);
  const timeUnit = timeInput.match(/[a-z]+/)?.[0];
  const planName = args.slice(3).join(' ') || 'Premium';

  // Validate plan name
  if (!['Basic', 'Premium', 'VIP'].includes(planName)) {
    return ctx.replyWithHTML('<b>⚠️ Invalid plan name. Use: Basic, Premium, or VIP</b>');
  }

  if (!timeValue || !timeUnit) {
    return ctx.replyWithHTML('<b>⚠️ Invalid duration format (e.g., 30day, 1month, 3week)</b>');
  }

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
    // Get user info from Telegram
    let userInfo = {};
    try {
      const tgUser = await bot.telegram.getChat(userId);
      userInfo = {
        username: tgUser.username,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name
      };
    } catch (e) {
      console.log('Could not fetch user info from Telegram', e);
    }

    await PremiumUser.findOneAndUpdate(
      { userId },
      { 
        userId,
        ...userInfo,
        expiryDate,
        addedBy: ctx.from.id,
        planName,
        isActive: true
      },
      { upsert: true, new: true }
    );

    ctx.replyWithHTML(`
<b>✅ PREMIUM ACCESS ADDED</b>

👤 <b>User:</b> ${userInfo.firstName || 'Unknown'} ${userInfo.lastName || ''}
🆔 <b>ID:</b> <code>${userId}</code>
📝 <b>Plan:</b> ${planName}
⏳ <b>Expires:</b> ${expiryDate.toLocaleString()}
📅 <b>Added On:</b> ${now.toLocaleString()}
🔗 <a href="${PREMIUM_CHANNEL.inviteLink}">Invite Link</a>
    `);

    // Notify user
    try {
      await bot.telegram.sendMessage(userId, `
<b>🎉 YOUR PREMIUM ACCESS ACTIVATED!</b>

📝 <b>Plan:</b> ${planName}
⏳ <b>Expires:</b> ${expiryDate.toLocaleString()}

<a href="${PREMIUM_CHANNEL.inviteLink}">🔗 Join Premium Channel</a>

Thank you for subscribing!
      `, { parse_mode: 'HTML' });
    } catch (userNotifyError) {
      console.log(`Couldn't notify user ${userId}`);
    }
  } catch (err) {
    console.error('Error in addpremium command:', err);
    ctx.replyWithHTML('<b>❌ Error saving user data. Please check logs.</b>');
  }
});

// Automatic Plan Expiry Check
async function checkExpiredPlans() {
  try {
    const now = new Date();
    const expiredUsers = await PremiumUser.find({
      expiryDate: { $lte: now },
      isActive: true
    });

    if (expiredUsers.length > 0) {
      console.log(`Found ${expiredUsers.length} expired users`);

      for (const user of expiredUsers) {
        // Mark as inactive instead of deleting to keep records
        await PremiumUser.updateOne(
          { userId: user.userId },
          { $set: { isActive: false } }
        );

        // Notify admin
        await bot.telegram.sendMessage(
          ADMIN_ID,
          `⏰ Plan expired for user ${user.userId} (${user.planName})`,
          { parse_mode: 'HTML' }
        );

        // Notify user if possible
        try {
          await bot.telegram.sendMessage(
            user.userId,
            `⚠️ Your ${user.planName} plan has expired. Renew to continue access.`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {
          console.log(`Couldn't notify expired user ${user.userId}`);
        }
      }
    }
  } catch (err) {
    console.error('Error in checkExpiredPlans:', err);
  }
}

// Run expiry check every hour
setInterval(checkExpiredPlans, 3600000);
// Initial check when bot starts
checkExpiredPlans();

// ... [Keep your existing server setup and webhook/polling code]
