require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');

// MongoDB connect
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  expiryDate: { type: Date, required: true },
  addedBy: { type: Number, required: true },
  addedAt: { type: Date, default: Date.now }
});

const PremiumUser = mongoose.model('PremiumUser', userSchema);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID; // optional logging

const PREMIUM_CHANNEL = {
  id: process.env.PREMIUM_CHANNEL_ID,
  inviteLink: process.env.PREMIUM_CHANNEL_INVITE_LINK
};

// Web server for Render
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('🤖 Bot is running.'));
app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// Start command
bot.start((ctx) => {
  return ctx.replyWithMarkdown(`
👋 *Welcome to Premium Access Bot!*

This bot is used to manage access to premium content.

*Features:*
- Add premium users with time limits
- Auto-remove expired users
- Admin-only commands

_Use /addpremium <user_id> <duration> to add user._
  `);
});

// /addpremium
bot.command('addpremium', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ You are not authorized.');

  const args = ctx.message.text.split(' ');
  if (args.length < 3) return ctx.reply('⚠️ Usage: /addpremium <user_id> <duration>');

  const userId = parseInt(args[1]);
  const duration = args[2].toLowerCase();
  if (isNaN(userId)) return ctx.reply('⚠️ Invalid user ID.');

  const match = duration.match(/^(\d+)(min|mins|hour|hours|day|week|month)$/);
  if (!match) return ctx.reply('⚠️ Use: 1min, 30mins, 2hour, 7day, 1month');

  const value = parseInt(match[1]);
  const unit = match[2];
  const now = new Date();
  let expiryDate;

  switch (unit) {
    case 'min':
    case 'mins': expiryDate = new Date(now.getTime() + value * 60 * 1000); break;
    case 'hour':
    case 'hours': expiryDate = new Date(now.getTime() + value * 60 * 60 * 1000); break;
    case 'day': expiryDate = new Date(now.getTime() + value * 24 * 60 * 60 * 1000); break;
    case 'week': expiryDate = new Date(now.getTime() + value * 7 * 24 * 60 * 60 * 1000); break;
    case 'month': const newDate = new Date(now); newDate.setMonth(newDate.getMonth() + value); expiryDate = newDate; break;
  }

  try {
    await PremiumUser.findOneAndUpdate(
      { userId },
      { userId, expiryDate, addedBy: ctx.from.id },
      { upsert: true, new: true }
    );

    const msg = `✅ User ${userId} added to premium until *${expiryDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}*.\n\n🔗 Invite link:\n${PREMIUM_CHANNEL.inviteLink}`;
    return ctx.replyWithMarkdown(msg);
  } catch (err) {
    console.error('Add premium error:', err);
    return ctx.reply('❌ Failed to add user.');
  }
});

// /listusers
bot.command('listusers', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ You are not authorized.');

  const users = await PremiumUser.find();
  if (!users.length) return ctx.reply('ℹ️ No premium users found.');

  let message = `👥 *Active Premium Users:*\n\n`;
  users.forEach((u, i) => {
    message += `${i + 1}. \`${u.userId}\` — expires on: *${u.expiryDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}*\n`;
  });

  return ctx.replyWithMarkdown(message);
});

// Expiry checker
setInterval(async () => {
  try {
    const now = new Date();
    const expiredUsers = await PremiumUser.find({ expiryDate: { $lte: now } });

    for (const user of expiredUsers) {
      try {
        console.log(`🧹 Removing expired user ${user.userId}`);

        // Remove from channel
        await bot.telegram.kickChatMember(PREMIUM_CHANNEL.id, user.userId);
        await bot.telegram.unbanChatMember(PREMIUM_CHANNEL.id, user.userId);

        const time = user.expiryDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        // Notify admin
        await bot.telegram.sendMessage(ADMIN_ID, `⏰ User ${user.userId} removed (expired at ${time})`);

        // Notify user
        await bot.telegram.sendMessage(user.userId, `❌ Your premium access has expired as of ${time}.`);

        // Log to channel if set
        if (LOG_CHANNEL_ID) {
          await bot.telegram.sendMessage(LOG_CHANNEL_ID, `🗑️ Removed expired premium user ${user.userId} (expired at ${time})`);
        }

        // Delete from DB
        await PremiumUser.deleteOne({ userId: user.userId });

      } catch (err) {
        console.error(`❌ Error removing ${user.userId}:`, err);
      }
    }
  } catch (err) {
    console.error('❌ Expiry check error:', err);
  }
}, 60 * 1000); // every minute

bot.catch((err) => {
  console.error('Bot error:', err);
});

bot.launch().then(() => {
  console.log('🚀 Bot started');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
