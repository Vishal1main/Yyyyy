from flask import Flask, request
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, MessageHandler, CallbackQueryHandler,
    ContextTypes, filters
)
from utils import download_file
from config import BOT_TOKEN, WEBHOOK_PATH
import os, asyncio

app = Flask(__name__)
bot_app = Application.builder().token(BOT_TOKEN).build()
user_links = {}

# Telegram handlers
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Send a direct download link.")

async def handle_link(update: Update, context: ContextTypes.DEFAULT_TYPE):
    url = update.message.text.strip()
    if not url.startswith("http"):
        return
    user_links[update.effective_chat.id] = url
    buttons = [
        [InlineKeyboardButton("Default Name", callback_data="default")],
        [InlineKeyboardButton("Rename", callback_data="rename")]
    ]
    await update.message.reply_text("Choose upload type:", reply_markup=InlineKeyboardMarkup(buttons))

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    chat_id = query.message.chat_id
    url = user_links.get(chat_id)

    if query.data == "default":
        filename = download_file(url)
        await context.bot.send_document(chat_id=chat_id, document=open(filename, "rb"))
        os.remove(filename)
    elif query.data == "rename":
        context.user_data['rename'] = True
        await query.message.reply_text("Send new file name (with extension)")

async def rename_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if context.user_data.get('rename'):
        name = update.message.text.strip()
        url = user_links.get(update.effective_chat.id)
        filename = download_file(url, name)
        await context.bot.send_document(chat_id=update.effective_chat.id, document=open(filename, "rb"))
        os.remove(filename)
        context.user_data['rename'] = False

# Register handlers
bot_app.add_handler(CommandHandler("start", start))
bot_app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_link))
bot_app.add_handler(CallbackQueryHandler(button_handler))
bot_app.add_handler(MessageHandler(filters.TEXT & filters.ALL, rename_handler))

@app.route("/")
def home():
    return "Bot is running!"

@app.route(WEBHOOK_PATH, methods=["POST"])
async def webhook():
    update = Update.de_json(request.get_json(force=True), bot_app.bot)
    await bot_app.process_update(update)
    return "ok"

if __name__ == "__main__":
    bot_app.bot.set_webhook(url=f"https://yyyyy-cpnv.onrender.com{WEBHOOK_PATH}")
    app.run(host="0.0.0.0", port=10000)
