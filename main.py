from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, MessageHandler, CallbackQueryHandler,
    ContextTypes, filters
)
from config import BOT_TOKEN
from utils import download_file
import os

user_links = {}

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Send me a direct download link")

async def handle_link(update: Update, context: ContextTypes.DEFAULT_TYPE):
    url = update.message.text.strip()
    if not url.startswith("http"):
        return
    user_links[update.effective_chat.id] = url
    buttons = [
        [InlineKeyboardButton("Default Name", callback_data="default")],
        [InlineKeyboardButton("Rename", callback_data="rename")]
    ]
    await update.message.reply_text("Choose how to upload:", reply_markup=InlineKeyboardMarkup(buttons))

async def handle_buttons(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    chat_id = query.message.chat_id
    url = user_links.get(chat_id)

    if query.data == "default":
        filename = download_file(url)
        await context.bot.send_document(chat_id=chat_id, document=open(filename, "rb"))
        os.remove(filename)
    elif query.data == "rename":
        await query.message.reply_text("Send new file name (without extension)")
        context.user_data['rename'] = True

async def rename_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if context.user_data.get('rename'):
        new_name = update.message.text.strip()
        chat_id = update.effective_chat.id
        url = user_links.get(chat_id)
        filename = download_file(url, filename=new_name)
        await context.bot.send_document(chat_id=chat_id, document=open(filename, "rb"))
        os.remove(filename)
        context.user_data['rename'] = False

def main():
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_link))
    app.add_handler(CallbackQueryHandler(handle_buttons))
    app.add_handler(MessageHandler(filters.TEXT & filters.ALL, rename_handler))
    app.run_webhook(
        listen="0.0.0.0",
        port=8443,
        webhook_url=f"{WEBHOOK_URL}"
    )

if __name__ == "__main__":
    main()
