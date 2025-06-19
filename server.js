const express = require('express');
const config = require('./config');
const bot = require('./bot');

const app = express();
app.get('/', (req, res) => res.send('Bot is running'));

const server = app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
  
  bot.launch({
    timeout: 120000 // 120 seconds timeout
  }).then(() => {
    console.log('Bot started successfully');
  }).catch(err => {
    console.error('Bot failed to start:', err);
    process.exit(1);
  });
});

['SIGINT', 'SIGTERM'].forEach(signal => {
  process.once(signal, () => {
    console.log(`Received ${signal}, shutting down...`);
    bot.stop(signal);
    server.close();
  });
});
