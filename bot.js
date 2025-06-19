const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const fse = require('fs-extra');
const config = require('./config');
const { downloadFile } = require('./utils/downloader');
const { getFileExtension } = require('./utils/fileHandler');

const bot = new Telegraf(config.BOT_TOKEN);

// User sessions to store file info
const userSessions = {};

// Ensure temp directory exists
fse.ensureDirSync(config.TEMP_DIR);

// Progress bar function
function createProgressBar(percentage, length = 20) {
  const completed = Math.round(length * (percentage / 100));
  const remaining = length - completed;
  return `[${'█'.repeat(completed)}${'░'.repeat(remaining)}] ${percentage.toFixed(1)}%`;
}

// Start command with better formatting
bot.start((ctx) => {
  const welcomeMessage = `
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

⚡ *Example URLs:*
\`https://example.com/file.mp4\`
\`https://example.com/document.pdf\`

⚠️ *Note:* Only direct download links are supported
  `;

  ctx.replyWithMarkdown(welcomeMessage, Markup.keyboard([
    ['/help']
  ]).resize());
});

// Help command
bot.command('help', (ctx) => {
  ctx.replyWithMarkdown(`
🆘 *Help Guide*

📤 *To upload a file:*
1. Send a direct download URL
2. The bot will detect it and show details
3. Use the /rename command if needed
4. Confirm to start upload

🔄 *Rename a file:*
/rename <new_filename>

📏 *File Limits:*
- Max size: ${config.MAX_FILE_SIZE}MB
- Must be direct download link

🔗 *Example:*
\`https://example.com/video.mp4\`
  `);
});

// Handle URLs sent by user
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  
  if (isValidUrl(text) && !text.startsWith('/')) {
    try {
      // Get file info
      const filename = path.basename(new URL(text).pathname);
      const fileInfo = await getFileInfo(text);
      
      if (fileInfo.size > config.MAX_FILE_SIZE * 1024 * 1024) {
        return ctx.reply(`❌ File is too large (${(fileInfo.size / (1024 * 1024)).toFixed(2)}MB). Max allowed: ${config.MAX_FILE_SIZE}MB.`);
      }
      
      // Store in user session
      userSessions[ctx.from.id] = {
        url: text,
        originalName: filename,
        size: fileInfo.size,
        type: fileInfo.type
      };
      
      // Send file details with rename option
      ctx.replyWithMarkdown(
        `📄 *File Detected*\n\n` +
        `🔹 *Name:* \`${filename}\`\n` +
        `🔹 *Size:* ${formatFileSize(fileInfo.size)}\n` +
        `🔹 *Type:* ${fileInfo.type}\n\n` +
        `Do you want to upload this file?`,
        Markup.inlineKeyboard([
          Markup.button.callback('🔄 Rename', 'rename_file'),
          Markup.button.callback('✅ Upload Now', 'confirm_upload')
        ])
      );
    } catch (error) {
      ctx.reply(`❌ Error: ${error.message}\n\nPlease make sure this is a valid direct download link.`);
    }
  }
});

// Rename command
bot.command('rename', (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const newName = args.join(' ');
  
  if (!newName) {
    return ctx.reply('Please provide a new filename. Example:\n/rename myfile.mp4');
  }
  
  if (!userSessions[ctx.from.id]) {
    return ctx.reply('No file pending for upload. Please send a URL first.');
  }
  
  userSessions[ctx.from.id].newName = newName;
  ctx.reply(`✅ Filename changed to: ${newName}\n\nUse /upload to start the transfer.`);
});

// Handle button callbacks
bot.action('rename_file', (ctx) => {
  ctx.reply('Please send the new filename using the /rename command. Example:\n/rename myvideo.mp4');
});

bot.action('confirm_upload', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const session = userSessions[userId];
    
    if (!session) {
      return ctx.editMessageText('❌ No file to upload. Please send a URL first.');
    }
    
    await ctx.editMessageText('⏳ Starting download... Please wait.');
    
    // Download the file with progress
    const { filePath, originalName } = await downloadFileWithProgress(
      session.url,
      config.TEMP_DIR,
      (progress) => {
        const progressText = `📥 Downloading: ${createProgressBar(progress)}\n\n` +
          `File: ${session.newName || originalName}\n` +
          `Size: ${formatFileSize(session.size)}`;
        
        // Edit message with progress
        ctx.telegram.editMessageText(
          ctx.chat.id,
          ctx.callbackQuery.message.message_id,
          null,
          progressText
        ).catch(() => {}); // Ignore message edit errors
      }
    );
    
    // Determine final filename
    const finalFilename = session.newName || originalName;
    
    // Upload the file
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      ctx.callbackQuery.message.message_id,
      null,
      `📤 Uploading to Telegram: ${finalFilename}`
    );
    
    await ctx.replyWithDocument(
      { source: filePath, filename: finalFilename },
      { caption: `✅ Upload complete!\n\nOriginal URL: ${session.url}` }
    );
    
    // Clean up
    fs.unlinkSync(filePath);
    delete userSessions[userId];
  } catch (error) {
    console.error('Upload error:', error);
    ctx.reply(`❌ Upload failed: ${error.message}`);
  }
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
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function getFileInfo(url) {
  const response = await axios.head(url);
  return {
    size: parseInt(response.headers['content-length']) || 0,
    type: response.headers['content-type'] || 'unknown'
  };
}

async function downloadFileWithProgress(url, tempDir, progressCallback) {
  const parsedUrl = new URL(url);
  let filename = path.basename(parsedUrl.pathname);
  
  if (!filename || filename === parsedUrl.hostname || !path.extname(filename)) {
    const contentType = await getContentType(url);
    const ext = contentType.split('/').pop();
    filename = `file_${Date.now()}.${ext}`;
  }

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
      const progress = (downloadedLength / totalLength) * 100;
      progressCallback(progress);
    }
  });

  response.data.pipe(writer);
  
  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  return { filePath, originalName: filename };
}

async function getContentType(url) {
  try {
    const response = await axios.head(url);
    return response.headers['content-type'] || 'application/octet-stream';
  } catch (error) {
    return 'application/octet-stream';
  }
}

module.exports = bot;
