import os
from pathlib import Path

class Config:
    # Telegram Bot Token
    BOT_TOKEN = os.getenv("BOT_TOKEN", "7861502352:AAF09jfPpjU78dnwl4NiM95TadZAE6kjo1M")
    
    # Server Configuration
    PORT = int(os.getenv("PORT", 8443))
    HOST = os.getenv("HOST", "0.0.0.0")
    
    # Webhook Settings (if using)
    WEBHOOK_URL = os.getenv("WEBHOOK_URL", "https://yyyyy-cpnv.onrender.com")
    
    # Download Settings
    MAX_FILE_SIZE = 2000 * 1024 * 1024  # 2000MB
    
    # For Docker compatibility
    BASE_DIR = Path(__file__).parent
    TEMP_DIR = os.getenv("TEMP_DIR", str(BASE_DIR / "temp_downloads"))
    
    # Create temp directory if not exists
    if not os.path.exists(TEMP_DIR):
        os.makedirs(TEMP_DIR)
