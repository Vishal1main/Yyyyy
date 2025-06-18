import logging
from telegram.ext import Application
from config import Config
from handlers.commands import setup_command_handlers
from handlers.download import setup_download_handler

# Enable logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

def setup_handlers(application):
    """Setup all handlers"""
    setup_command_handlers(application)
    setup_download_handler(application)

def main():
    """Start the bot"""
    # Create the Application
    application = Application.builder().token(Config.BOT_TOKEN).build()
    
    # Setup handlers
    setup_handlers(application)
    
    # Start the bot
    if Config.WEBHOOK_URL:
        logger.info("Starting webhook...")
        application.run_webhook(
            listen=Config.HOST,
            port=Config.PORT,
            url_path=Config.BOT_TOKEN,
            webhook_url=f"{Config.WEBHOOK_URL}/{Config.BOT_TOKEN}"
        )
    else:
        logger.info("Starting polling...")
        application.run_polling()

if __name__ == "__main__":
    main()
