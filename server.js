const express = require('express');
const config = require('./config');
const bot = require('./bot');

const app = express();

// Health check endpoint
app.get('/', (req, res) => {
  res.send('URL Uploader Bot is running');
});

// Start server
app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
});

// Start bot (using polling)
bot.launch().then(() => {
  console.log('Bot is running in polling mode');
}).catch(err => {
  console.error('Bot failed to start:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
