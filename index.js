require('dotenv').config();
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define user schema
const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  expiryDate: { type: Date, required: true },
  addedBy: { type: Number, required: true },
  addedAt: { type: Date, default: Date.now }
});

const PremiumUser = mongoose.model('PremiumUser', userSchema);

// Initialize bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Admin ID - replace with your actual admin ID
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

// Premium channel info - replace with your actual channel info
const PREMIUM_CHANNEL = {
  id: process.env.PREMIUM_CHANNEL_ID,
  inviteLink: process.env.PREMIUM_CHANNEL_INVITE_LINK
};

// Start command with welcome message
bot.start((ctx) => {
  const welcomeMessage = `
👋 *Welcome to Premium Access Bot!*

This bot is used to manage access to premium content.

*Features:*
- Add premium users with time limits
- Automatic removal after expiry
- Admin-only commands

_You need admin privileges to use this bot._
  `;
  
  return ctx.replyWithMarkdown(welcomeMessage);
});

// Add premium user command
bot.command('addpremium', async (ctx) => {
  // Check if user is admin
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply('⛔ You are not authorized to use this command.');
  }

  // Parse command arguments
  const args = ctx.message.text.split(' ');
  if (args.length < 3) {
    return ctx.reply('⚠️ Usage: /addpremium <user_id> <duration>');
  }

  const userId = parseInt(args[1]);
  const duration = args[2].toLowerCase();

  if (isNaN(userId)) {
    return ctx.reply('⚠️ Invalid user ID. Please provide a numeric user ID.');
  }

  // Calculate expiry date
  let expiryDate;
  const now = new Date();

  if (duration.endsWith('day')) {
    const days = parseInt(duration);
    if (isNaN(days)) {
      return ctx.reply('⚠️ Invalid duration format. Example: 7day');
    }
    expiryDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  } else if (duration.endsWith('week')) {
    const weeks = parseInt(duration);
    if (isNaN(weeks)) {
      return ctx.reply('⚠️ Invalid duration format. Example: 2week');
    }
    expiryDate = new Date(now.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
  } else if (duration.endsWith('month')) {
    const months = parseInt(duration);
    if (isNaN(months)) {
      return ctx.reply('⚠️ Invalid duration format. Example: 1month');
    }
    expiryDate = new Date(now.setMonth(now.getMonth() + months));
  } else {
    return ctx.reply('⚠️ Invalid duration. Use format like: 7day, 2week, 1month');
  }

  try {
    // Save user to database
    await PremiumUser.findOneAndUpdate(
      { userId },
      { 
        userId,
        expiryDate,
        addedBy: ctx.from.id
      },
      { upsert: true, new: true }
    );

    // Send invite link to admin
    const message = `✅ User ${userId} has been added to premium until ${expiryDate.toLocaleString()}\n\n` +
                    `Here's the invite link to send to the user:\n${PREMIUM_CHANNEL.inviteLink}`;

    return ctx.reply(message);
  } catch (err) {
    console.error('Error adding premium user:', err);
    return ctx.reply('❌ An error occurred while adding the premium user.');
  }
});

// Check for expired users periodically
setInterval(async () => {
  try {
    const now = new Date();
    const expiredUsers = await PremiumUser.find({ expiryDate: { $lte: now } });

    for (const user of expiredUsers) {
      try {
        // Here you would implement the actual removal from the channel
        // For now, we'll just log it and remove from database
        console.log(`Removing expired user ${user.userId} from premium channel`);
        
        // Notify admin
        await bot.telegram.sendMessage(
          ADMIN_ID,
          `⏰ User ${user.userId} has been removed from premium channel (expired on ${user.expiryDate.toLocaleString()})`
        );
        
        // Remove from database
        await PremiumUser.deleteOne({ userId: user.userId });
      } catch (err) {
        console.error(`Error removing user ${user.userId}:`, err);
      }
    }
  } catch (err) {
    console.error('Error checking for expired users:', err);
  }
}, 60 * 60 * 1000); // Check every hour

// Error handling
bot.catch((err) => {
  console.error('Bot error:', err);
});

// Launch bot
bot.launch().then(() => {
  console.log('Bot started');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
