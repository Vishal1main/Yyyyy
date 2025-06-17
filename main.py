import os
import logging
from flask import Flask, request
from telegram import Update, InputFile, InlineKeyboardMarkup, InlineKeyboardButton
from telegram.ext import (
    Application, CommandHandler, MessageHandler, CallbackQueryHandler,
    ContextTypes, filters
)
from config import BOT_TOKEN, user_settings
from downloader import download_file

logging.basicConfig(level=logging.INFO)
THUMBNAIL_DIR = "thumbnails"
os.makedirs(THUMBNAIL_DIR, exist_ok=True)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    user_settings[user_id] = {"mode": "media", "thumb": None}
    await update.message.reply_text("Send a direct download link.\nUse /settings to customize upload.")

async def settings(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("📎 Document", callback_data="mode_document"),
         InlineKeyboardButton("🎬 Media", callback_data="mode_media")],
        [InlineKeyboardButton("📸 Set Thumbnail", callback_data="set_thumb"),
         InlineKeyboardButton("🗑 Remove Thumbnail", callback_data="remove_thumb")]
    ]
    await update.message.reply_text("Settings:", reply_markup=InlineKeyboardMarkup(keyboard))

async def handle_buttons(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    user_id = query.from_user.id
    await query.answer()
    if query.data.startswith("mode_"):
        user_settings[user_id]["mode"] = query.data.split("_")[1]
        await query.edit_message_text(f"✅ Upload mode set to: {user_settings[user_id]['mode'].capitalize()}")
    elif query.data == "set_thumb":
        user_settings[user_id]["awaiting_thumb"] = True
        await query.edit_message_text("📤 Send the image you want to use as thumbnail.")
    elif query.data == "remove_thumb":
        path = f"{THUMBNAIL_DIR}/{user_id}.jpg"
        if os.path.exists(path):
            os.remove(path)
        user_settings[user_id]["thumb"] = None
        await query.edit_message_text("🗑 Thumbnail removed.")

async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if user_settings.get(user_id, {}).get("awaiting_thumb"):
        photo = update.message.photo[-1]
        file = await photo.get_file()
        path = f"{THUMBNAIL_DIR}/{user_id}.jpg"
        await file.download_to_drive(path)
        user_settings[user_id]["thumb"] = path
        user_settings[user_id]["awaiting_thumb"] = False
        await update.message.reply_text("✅ Thumbnail saved!")

async def handle_link(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    url = update.message.text.strip()
    await update.message.reply_text("🔄 Downloading file...")
    filename = "downloaded_file"

    try:
        await download_file(url, filename)
        context.user_data["file_path"] = filename
        await update.message.reply_text("📝 Send new filename with extension (or /skip):")
        context.user_data["awaiting_rename"] = True
    except Exception as e:
        await update.message.reply_text(f"❌ Download error: {e}")

async def rename_file(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if context.user_data.get("awaiting_rename"):
        old = context.user_data["file_path"]
        new = update.message.text.strip()
        os.rename(old, new)
        context.user_data["file_path"] = new
        context.user_data["awaiting_rename"] = False
        await send_file(update, context, new)

async def skip_rename(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if context.user_data.get("awaiting_rename"):
        context.user_data["awaiting_rename"] = False
        await send_file(update, context, context.user_data["file_path"])

async def send_file(update: Update, context: ContextTypes.DEFAULT_TYPE, path: str):
    user_id = update.effective_user.id
    mode = user_settings[user_id].get("mode", "media")
    thumb = user_settings[user_id].get("thumb")

    try:
        with open(path, "rb") as f:
            input_file = InputFile(f)
            if mode == "document":
                await update.message.reply_document(document=input_file, thumb=thumb)
            elif path.endswith((".mp4", ".mkv")):
                await update.message.reply_video(video=input_file, thumb=thumb, supports_streaming=True)
            elif path.endswith((".mp3", ".wav")):
                await update.message.reply_audio(audio=input_file, thumb=thumb)
            elif path.endswith((".jpg", ".png", ".jpeg")):
                await update.message.reply_photo(photo=input_file)
            else:
                await update.message.reply_document(document=input_file)
    except Exception as e:
        await update.message.reply_text(f"❌ Upload error: {e}")
    finally:
        os.remove(path)

def main():
    import asyncio
    PORT = int(os.environ.get("PORT", 8443))
    WEBHOOK_URL = os.environ.get("WEBHOOK_URL")  # e.g. https://your-app.onrender.com

    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("settings", settings))
    app.add_handler(CommandHandler("skip", skip_rename))
    app.add_handler(CallbackQueryHandler(handle_buttons))
    app.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    app.add_handler(MessageHandler(filters.TEXT & filters.Regex(r"^https?://"), handle_link))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, rename_file))

    flask_app = Flask(__name__)

    @flask_app.post("/webhook")
    async def webhook():
        await app.update_queue.put(Update.de_json(request.get_json(force=True), app.bot))
        return "ok"

    async def run():
        await app.bot.set_webhook(f"{WEBHOOK_URL}/webhook")
        await app.initialize()
        await app.start()
        await flask_app.run(host="0.0.0.0", port=PORT)

    asyncio.run(run())

if __name__ == "__main__":
    main()
