from telegram import Update
from telegram.ext import ContextTypes, CommandHandler

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler for the /start command"""
    user = update.effective_user
    welcome_text = (
        f"👋 Hello {user.mention_html()}!\n\n"
        "🤖 I'm a Direct Download Bot. Just send me a direct download link "
        "and I'll download and upload the file to Telegram for you.\n\n"
        "📌 Supported links: http/https direct file links\n"
        "⚡ Max file size: 2000MB\n\n"
        "Send /help for more information."
    )
    await update.message.reply_html(welcome_text)

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler for the /help command"""
    help_text = (
        "🆘 <b>Help Guide</b>\n\n"
        "📤 <b>How to use:</b>\n"
        "1. Send me a direct download link (http/https)\n"
        "2. I'll download the file\n"
        "3. I'll upload it back to Telegram\n\n"
        "⚠️ <b>Limitations:</b>\n"
        "- File size limit: 2000MB\n"
        "- Must be a direct download link\n"
        "- Some servers may block bot downloads\n\n"
        "🛠 <b>Commands:</b>\n"
        "/start - Start the bot\n"
        "/help - Show this help message"
    )
    await update.message.reply_html(help_text)

def setup_command_handlers(application):
    """Setup command handlers"""
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("help", help_command))
