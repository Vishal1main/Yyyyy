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

// Schema
const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  expiryDate: { type: Date, required: true },
  addedBy: { type: Number, required: true },
  addedAt: { type: Date, default: Date.now }
});

const PremiumUser = mongoose.model('PremiumUser', userSchema);

// Bot setup
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
- Automatic removal after expiry
- Admin-only commands

_You need admin privileges to use this bot._
  `);
});

// /addpremium command
bot.command('addpremium', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply('⛔ You are not authorized to use this command.');
  }

  const args = ctx.message.text.split(' ');
  if (args.length < 3) {
    return ctx.reply('⚠️ Usage: /addpremium <user_id> <duration>');
  }

  const userId = parseInt(args[1]);
  const duration = args[2].toLowerCase();
  if (isNaN(userId)) return ctx.reply('⚠️ Invalid user ID.');

  const match = duration.match(/^(\d+)(min|mins|hour|hours|day|week|month)$/);
  if (!match) {
    return ctx.reply('⚠️ Invalid duration. Use formats like: 1min, 30mins, 2hour, 7day, 1month');
  }

  const value = parseInt(match[1]);
  const unit = match[2];
  const now = new Date();
  let expiryDate;

  switch (unit) {
    case 'min':
    case 'mins':
      expiryDate = new Date(now.getTime() + value * 60 * 1000);
      break;
    case 'hour':
    case 'hours':
      expiryDate = new Date(now.getTime() + value * 60 * 60 * 1000);
      break;
    case 'day':
      expiryDate = new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
      break;
    case 'week':
      expiryDate = new Date(now.getTime() + value * 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      const newDate = new Date(now);
      newDate.setMonth(newDate.getMonth() + value);
      expiryDate = newDate;
      break;
  }

  try {
    await PremiumUser.findOneAndUpdate(
      { userId },
      { userId, expiryDate, addedBy: ctx.from.id },
      { upsert: true, new: true }
    );

    const message = `✅ User ${userId} has been added to premium until *${expiryDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}*.\n\n` +
                    `🔗 Share this invite link:\n${PREMIUM_CHANNEL.inviteLink}`;

    return ctx.replyWithMarkdown(message);
  } catch (err) {
    console.error('Error adding premium user:', err);
    return ctx.reply('❌ Failed to add premium user.');
  }
});

// /listusers command
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

// Remove expired users from channel
setInterval(async () => {
  try {
    const now = new Date();
    const expiredUsers = await PremiumUser.find({ expiryDate: { $lte: now } });

    for (const user of expiredUsers) {
      try {
        console.log(`🧹 Removing expired user ${user.userId}`);

        // Kick user from channel
        await bot.telegram.kickChatMember(PREMIUM_CHANNEL.id, user.userId);

        // Optional: Allow rejoining later (unban)
        await bot.telegram.unbanChatMember(PREMIUM_CHANNEL.id, user.userId);

        const time = user.expiryDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        // Notify admin
        await bot.telegram.sendMessage(
          ADMIN_ID,
          `⏰ User ${user.userId} has been removed from the premium channel (expired on ${time})`
        );

        // Notify user
        await bot.telegram.sendMessage(
          user.userId,
          `❌ Your premium access has expired as of ${time}.`
        );

        // Log to channel if set
        if (LOG_CHANNEL_ID) {
          await bot.telegram.sendMessage(
            LOG_CHANNEL_ID,
            `🗑️ Removed expired premium user ${user.userId} (expired at ${time})`
          );
        }

        // Remove from DB
        await PremiumUser.deleteOne({ userId: user.userId });
      } catch (err) {
        console.error(`❌ Error removing user ${user.userId}:`, err);
      }
    }
  } catch (err) {
    console.error('❌ Error checking for expired users:', err);
  }
}, 60 * 1000); // every 1 minute

// Error handling
bot.catch((err) => {
  console.error('Bot error:', err);
});

// Start bot
bot.launch().then(() => {
  console.log('🚀 Bot started');
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
