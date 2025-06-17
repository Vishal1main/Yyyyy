import os
import logging
import asyncio
from flask import Flask, request
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, ContextTypes, filters, CallbackQueryHandler
from config import BOT_TOKEN, WEBHOOK_URL
import aiohttp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

user_settings = {}

# === Flask Setup ===
flask_app = Flask(__name__)

# === Telegram Bot Setup ===
app = Application.builder().token(BOT_TOKEN).build()

# === Webhook Endpoint ===
@flask_app.post("/webhook")
async def webhook():
    update = Update.de_json(request.get_json(force=True))
    await app.update_queue.put(update)
    return "ok"

# === Flask test endpoint ===
@flask_app.route("/")
def home():
    return "Bot is running."

# === Command: /start ===
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("👋 Send me a direct download link to begin.")

# === Command: /settings ===
async def settings(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("📎 Upload as Document", callback_data="mode_document"),
         InlineKeyboardButton("🎞 Upload as Video", callback_data="mode_video")],
        [InlineKeyboardButton("🖼 Set Thumbnail", callback_data="set_thumbnail")],
        [InlineKeyboardButton("🧩 Clear Thumbnail", callback_data="clear_thumbnail")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text("⚙️ Choose your settings:", reply_markup=reply_markup)

# === Callback handler ===
async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    user_id = query.from_user.id
    await query.answer()

    if query.data == "mode_document":
        user_settings[user_id] = user_settings.get(user_id, {})
        user_settings[user_id]["mode"] = "document"
        await query.edit_message_text("✅ Upload mode set to Document")
    elif query.data == "mode_video":
        user_settings[user_id] = user_settings.get(user_id, {})
        user_settings[user_id]["mode"] = "video"
        await query.edit_message_text("✅ Upload mode set to Video")
    elif query.data == "set_thumbnail":
        await query.edit_message_text("📤 Now send the thumbnail image.")
        context.user_data["awaiting_thumb"] = True
    elif query.data == "clear_thumbnail":
        user_settings[user_id] = user_settings.get(user_id, {})
        user_settings[user_id]["thumbnail"] = None
        await query.edit_message_text("🗑 Thumbnail cleared.")

# === Photo receiver for thumbnail ===
async def photo_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if context.user_data.get("awaiting_thumb"):
        photo = update.message.photo[-1]
        file = await context.bot.get_file(photo.file_id)
        thumb_path = f"thumb_{update.effective_user.id}.jpg"
        await file.download_to_drive(thumb_path)

        user_settings[update.effective_user.id] = user_settings.get(update.effective_user.id, {})
        user_settings[update.effective_user.id]["thumbnail"] = thumb_path
        await update.message.reply_text("✅ Thumbnail saved.")
        context.user_data["awaiting_thumb"] = False

# === Message handler for direct links ===
async def link_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    url = update.message.text.strip()
    if not url.startswith("http"):
        return await update.message.reply_text("⚠️ Invalid link!")

    user_id = update.effective_user.id
    settings = user_settings.get(user_id, {})
    mode = settings.get("mode", "document")
    thumb = settings.get("thumbnail")

    msg = await update.message.reply_text("📥 Downloading file...")

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp:
                if resp.status != 200:
                    return await msg.edit_text("❌ Failed to download file.")
                filename = url.split("/")[-1].split("?")[0] or "file"
                data = await resp.read()

        with open(filename, "wb") as f:
            f.write(data)

        send_kwargs = {
            "chat_id": update.effective_chat.id,
        }

        if mode == "document":
            send_kwargs["document"] = open(filename, "rb")
            if thumb:
                send_kwargs["thumb"] = open(thumb, "rb")
            await context.bot.send_document(**send_kwargs)
        else:
            send_kwargs["video"] = open(filename, "rb")
            if thumb:
                send_kwargs["thumb"] = open(thumb, "rb")
            await context.bot.send_video(**send_kwargs)

        await msg.delete()
        os.remove(filename)

    except Exception as e:
        logger.error(e)
        await msg.edit_text("❌ Error during upload.")

# === Handlers ===
app.add_handler(CommandHandler("start", start))
app.add_handler(CommandHandler("settings", settings))
app.add_handler(CallbackQueryHandler(callback_handler))
app.add_handler(MessageHandler(filters.PHOTO, photo_handler))
app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, link_handler))

# === Set Webhook and Run ===
async def set_webhook():
    await app.bot.set_webhook(WEBHOOK_URL)

if __name__ == "__main__":
    import asyncio
    asyncio.run(set_webhook())
    app.run_polling = lambda *a, **k: None  # Disable polling completely
    flask_app.run(host="0.0.0.0", port=10000)
