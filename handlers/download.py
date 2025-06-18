import os
from urllib.parse import urlparse
from telegram import Update
from telegram.ext import ContextTypes, MessageHandler, filters
from config import Config
from utils.file_utils import cleanup_temp_file
from utils.network_utils import download_file

async def handle_download(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle direct download links"""
    url = update.message.text.strip()
    
    # Validate URL
    if not (url.startswith('http://') or url.startswith('https://')):
        await update.message.reply_text("❌ Please send a valid http/https direct download link.")
        return
    
    # Inform user that download is starting
    msg = await update.message.reply_text("⏳ Downloading your file... Please wait.")
    
    try:
        # Extract filename from URL
        parsed_url = urlparse(url)
        filename = os.path.basename(parsed_url.path) or "downloaded_file"
        temp_path = os.path.join(Config.TEMP_DIR, filename)
        
        # Download the file
        success, file_size = await download_file(url, temp_path, msg)
        
        if not success:
            return
        
        # Upload to Telegram
        await msg.edit_text("📤 Uploading to Telegram...")
        await update.message.reply_document(
            document=open(temp_path, 'rb'),
            filename=filename,
            caption=f"✅ Here's your file!\n\nOriginal URL: {url}"
        )
        await msg.delete()
        
    except Exception as e:
        await msg.edit_text("❌ An error occurred while processing your file. Please try again later.")
        raise e
    
    finally:
        cleanup_temp_file(temp_path)

def setup_download_handler(application):
    """Setup download handler"""
    application.add_handler(
        MessageHandler(filters.TEXT & (~filters.COMMAND), handle_download)
    )
