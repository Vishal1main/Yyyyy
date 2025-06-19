const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const fse = require('fs-extra');
const config = require('./config');
const { downloadFile } = require('./utils/downloader');
const { getFileExtension } = require('./utils/fileHandler');

const bot = new Telegraf(config.BOT_TOKEN);
const userSessions = {};

// Progress bar function
function createProgressBar(percentage, length = 20) {
  const completed = Math.round(length * (percentage / 100));
  const remaining = length - completed;
  return `[${'█'.repeat(completed)}${'░'.repeat(remaining)}] ${percentage.toFixed(1)}%`;
}

bot.start((ctx) => {
  ctx.replyWithMarkdown(`
🎉 *Welcome to URL Uploader Bot* 🎉

🔹 *Features:*
- Upload files from direct URLs
- Rename files before uploading
- Progress tracking
- Supports large files (up to 2GB)

📌 *How to use:*
1. Send me a direct download URL
2. I'll show you the file details
3. Use /rename to change the filename
4. Confirm to start upload
  `);
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  
  if (isValidUrl(text) && !text.startsWith('/')) {
    try {
      const filename = path.basename(new URL(text).pathname);
      const fileInfo = await getFileInfo(text);
      
      if (fileInfo.size > config.MAX_FILE_SIZE * 1024 * 1024) {
        return ctx.reply(`❌ File too large (${(fileInfo.size / (1024 * 1024)).toFixed(2)}MB). Max: ${config.MAX_FILE_SIZE}MB.`);
      }
      
      userSessions[ctx.from.id] = {
        url: text,
        originalName: filename,
        size: fileInfo.size,
        type: fileInfo.type,
        messageId: ctx.message.message_id
      };
      
      const reply = await ctx.replyWithMarkdown(
        `📄 *File Detected*\n\n` +
        `🔹 *Name:* \`${filename}\`\n` +
        `🔹 *Size:* ${formatFileSize(fileInfo.size)}\n` +
        `🔹 *Type:* ${fileInfo.type}\n\n` +
        `Do you want to upload?`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Rename', 'rename_file'),
           Markup.button.callback('✅ Upload Now', 'confirm_upload')]
        ])
      );
      
      userSessions[ctx.from.id].replyMessageId = reply.message_id;
    } catch (error) {
      ctx.reply(`❌ Error: ${error.message}`);
    }
  }
});

bot.action('confirm_upload', async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions[userId];
  
  if (!session?.url) {
    return ctx.editMessageText('❌ No file to upload. Send URL first.');
  }
  
  await ctx.editMessageText('⏳ Starting download...');
  
  try {
    const { filePath } = await downloadFileWithProgress(
      session.url,
      config.TEMP_DIR,
      (progress) => {
        ctx.telegram.editMessageText(
          ctx.chat.id,
          ctx.callbackQuery.message.message_id,
          null,
          `📥 Downloading: ${createProgressBar(progress)}\nFile: ${session.newName || session.originalName}`
        ).catch(() => {});
      }
    );
    
    const finalFilename = session.newName || session.originalName;
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      ctx.callbackQuery.message.message_id,
      null,
      `📤 Uploading: ${finalFilename}`
    );
    
    await ctx.replyWithDocument(
      { source: filePath, filename: finalFilename },
      { caption: `✅ Upload complete!\nURL: ${session.url}` }
    );
    
    fs.unlinkSync(filePath);
    delete userSessions[userId];
    await ctx.deleteMessage(ctx.callbackQuery.message.message_id).catch(() => {});
  } catch (error) {
    console.error('Upload error:', error);
    ctx.reply(`❌ Upload failed: ${error.message}`);
  }
});

bot.action('rename_file', (ctx) => {
  ctx.reply('Send /rename <newfilename> to change the filename');
});

bot.command('rename', (ctx) => {
  const newName = ctx.message.text.split(' ').slice(1).join(' ');
  const userId = ctx.from.id;
  
  if (!newName) return ctx.reply('Usage: /rename <newfilename>');
  if (!userSessions[userId]?.url) return ctx.reply('No file to rename. Send URL first.');
  
  userSessions[userId].newName = newName;
  
  if (userSessions[userId].replyMessageId) {
    ctx.telegram.editMessageText(
      ctx.chat.id,
      userSessions[userId].replyMessageId,
      null,
      `📄 *File Detected* (Renamed)\n\n` +
      `🔹 *Name:* \`${newName}\`\n` +
      `🔹 *Size:* ${formatFileSize(userSessions[userId].size)}\n` +
      `🔹 *Type:* ${userSessions[userId].type}\n\n` +
      `Ready to upload?`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Upload Now', callback_data: 'confirm_upload' }]
          ]
        }
      }
    ).catch(() => {});
  }
  
  ctx.reply(`✅ Filename changed to: ${newName}`);
});

// Helper functions
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function getFileInfo(url) {
  const response = await axios.head(url);
  return {
    size: parseInt(response.headers['content-length']) || 0,
    type: response.headers['content-type'] || 'unknown'
  };
}

async function downloadFileWithProgress(url, tempDir, progressCallback) {
  const filename = path.basename(new URL(url).pathname) || `file_${Date.now()}`;
  const filePath = path.join(tempDir, filename);
  const writer = fs.createWriteStream(filePath);
  
  const response = await axios({
    method: 'get',
    url: url,
    responseType: 'stream'
  });

  const totalLength = response.headers['content-length'];
  let downloadedLength = 0;
  
  response.data.on('data', (chunk) => {
    downloadedLength += chunk.length;
    if (totalLength && progressCallback) {
      progressCallback((downloadedLength / totalLength) * 100);
    }
  });

  response.data.pipe(writer);
  
  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  return { filePath, originalName: filename };
}

module.exports = bot;
