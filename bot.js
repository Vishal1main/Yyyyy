const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const fse = require('fs-extra');
const config = require('./config');
const { downloadFileWithProgress } = require('./utils/downloader');

const bot = new Telegraf(config.BOT_TOKEN);
const userSessions = {};

// Create progress bar visual
function createProgressBar(percentage, length = 20) {
  const completed = Math.round(length * (percentage / 100));
  const remaining = length - completed;
  return `[${'█'.repeat(completed)}${'░'.repeat(remaining)}] ${percentage.toFixed(1)}%`;
}

// Format file size
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Validate URL
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// Get file info from URL
async function getFileInfo(url) {
  const response = await axios.head(url, { timeout: 5000 });
  return {
    size: parseInt(response.headers['content-length']) || 0,
    type: response.headers['content-type'] || 'unknown'
  };
}

// Start command
bot.start((ctx) => {
  ctx.replyWithMarkdown(`
🎉 *Welcome to URL Uploader Bot* 🎉

🔹 *Features:*
- Upload files from direct URLs
- Rename files before uploading
- Progress tracking
- Supports files up to 2GB

📌 *How to use:*
1. Send me a direct download URL
2. I'll show you the file details
3. Use /rename to change filename
4. Click Upload to start

⚡ *Example:*
\`https://example.com/file.mp4\`
  `);
});

// Handle URLs
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  
  if (isValidUrl(text) && !text.startsWith('/')) {
    try {
      // Get file info
      const filename = path.basename(new URL(text).pathname);
      const fileInfo = await getFileInfo(text);
      
      // Check file size
      if (fileInfo.size > config.MAX_FILE_SIZE * 1024 * 1024) {
        return ctx.reply(`❌ File too large (${formatFileSize(fileInfo.size)}). Max: ${config.MAX_FILE_SIZE}MB.`);
      }
      
      // Store in session
      userSessions[ctx.from.id] = {
        url: text,
        originalName: filename,
        size: fileInfo.size,
        type: fileInfo.type.split('/')[1] || 'file'
      };
      
      // Show file options
      const reply = await ctx.replyWithMarkdown(
        `📄 *File Detected*\n\n` +
        `🔹 *Name:* \`${filename}\`\n` +
        `🔹 *Size:* ${formatFileSize(fileInfo.size)}\n` +
        `🔹 *Type:* ${fileInfo.type}\n\n` +
        `Choose an action:`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Rename', 'rename_file'),
           Markup.button.callback('🚀 Upload Now', 'confirm_upload')]
        ])
      );
      
      userSessions[ctx.from.id].replyMessageId = reply.message_id;
    } catch (error) {
      ctx.reply(`❌ Error: ${error.message}\n\nPlease check the URL and try again.`);
    }
  }
});

// Rename button handler
bot.action('rename_file', (ctx) => {
  ctx.reply('Send /rename <new_filename> to change the name\nExample: /rename MyVideo.mp4');
});

// Rename command
bot.command('rename', (ctx) => {
  const newName = ctx.message.text.split(' ').slice(1).join(' ');
  const userId = ctx.from.id;
  
  if (!newName) return ctx.reply('Usage: /rename <new_filename>');
  if (!userSessions[userId]?.url) return ctx.reply('❌ No file to rename. Send URL first.');
  
  // Update filename in session
  userSessions[userId].newName = newName;
  
  // Update original message
  if (userSessions[userId].replyMessageId) {
    ctx.telegram.editMessageText(
      ctx.chat.id,
      userSessions[userId].replyMessageId,
      null,
      `📄 *File Ready*\n\n` +
      `🔹 *Name:* \`${newName}\`\n` +
      `🔹 *Size:* ${formatFileSize(userSessions[userId].size)}\n` +
      `🔹 *Type:* ${userSessions[userId].type}\n\n` +
      `Click below to upload:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [Markup.button.callback('🚀 Upload Now', 'confirm_upload')]
          ]
        }
      }
    ).catch(() => {});
  }
  
  ctx.reply(`✅ Filename updated to: ${newName}`);
});

// Upload handler
bot.action('confirm_upload', async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions[userId];
  
  if (!session?.url) {
    return ctx.editMessageText('❌ No file to upload. Send URL first.');
  }

  try {
    // Update message to show download starting
    await ctx.editMessageText({
      text: `⏳ Downloading file (${formatFileSize(session.size)})...\nThis may take a while for large files.`,
      reply_markup: { inline_keyboard: [] }
    });

    // Download with progress updates
    const { filePath } = await downloadFileWithProgress(
      session.url,
      config.TEMP_DIR,
      (progress) => {
        ctx.telegram.editMessageText(
          ctx.chat.id,
          ctx.callbackQuery.message.message_id,
          null,
          `📥 Downloading: ${createProgressBar(progress)}\n` +
          `File: ${session.newName || session.originalName}\n` +
          `Size: ${formatFileSize(session.size)}`
        ).catch(() => {});
      },
      config.DOWNLOAD_TIMEOUT
    );

    // Update message for upload
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      ctx.callbackQuery.message.message_id,
      null,
      `📤 Uploading to Telegram...\n` +
      `File: ${session.newName || session.originalName}`
    );

    // Upload to Telegram
    await ctx.replyWithDocument(
      { source: filePath, filename: session.newName || session.originalName },
      { 
        caption: `✅ Upload Complete!\n\n` +
                `📁 Name: ${session.newName || session.originalName}\n` +
                `📦 Size: ${formatFileSize(session.size)}\n` +
                `🔗 Source: ${session.url}`,
        timeout: config.UPLOAD_TIMEOUT
      }
    );

    // Cleanup
    fs.unlinkSync(filePath);
    delete userSessions[userId];
    await ctx.deleteMessage(ctx.callbackQuery.message.message_id).catch(() => {});
    
  } catch (error) {
    console.error('Upload Error:', error);
    ctx.reply(`❌ Upload Failed: ${error.message}\n\nPlease try again later.`);
    
    // Cleanup on error
    if (userSessions[userId]?.filePath) {
      fs.unlinkSync(userSessions[userId].filePath).catch(() => {});
    }
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error('Bot Error:', err);
  ctx.reply('❌ An error occurred. Please try again.');
});

module.exports = bot;
