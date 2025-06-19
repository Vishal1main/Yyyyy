const express = require('express');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

const bot = new Telegraf('YOUR_BOT_TOKEN');

// Telegram Bot Handler
bot.command('download', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('🔗 Please provide a direct link.\nExample: `/download <url>`', { parse_mode: 'Markdown' });

    const url = args[1];
    const filename = uuidv4() + path.extname(url);
    const filepath = path.join(__dirname, filename);

    ctx.reply('⬇️ Downloading, please wait...');

    try {
        const response = await axios({
            method: 'GET',
            url,
            responseType: 'stream',
        });

        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);

        writer.on('finish', async () => {
            await ctx.reply('📤 Uploading to Telegram...');
            await ctx.replyWithDocument({ source: fs.createReadStream(filepath), filename });

            fs.unlink(filepath, (err) => {
                if (err) console.error('❌ Error deleting file:', err);
                else console.log(`✅ Deleted file: ${filename}`);
            });
        });

        writer.on('error', (err) => {
            console.error(err);
            ctx.reply('❌ Failed to write file.');
        });

    } catch (error) {
        console.error(error);
        ctx.reply('❌ Download failed. Invalid link or network error.');
    }
});

// Express server to keep alive or for webhooks (if needed)
app.get('/', (req, res) => {
    res.send('Telegram Downloader Bot Running ✅');
});

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});

// Launch Telegram bot
bot.launch();

// Graceful shutdown for Telegraf + Express
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
