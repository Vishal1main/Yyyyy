import aiohttp
import os
from config import Config
from telegram import Update
from typing import Tuple

async def download_file(url: str, save_path: str, status_message) -> Tuple[bool, int]:
    """Download file with progress updates"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status != 200:
                    await status_message.edit_text("❌ Failed to download the file. The server returned an error.")
                    return False, 0
                
                # Check file size
                file_size = int(response.headers.get('content-length', 0))
                if file_size > Config.MAX_FILE_SIZE:
                    await status_message.edit_text(
                        f"❌ File is too large. Max size is {Config.MAX_FILE_SIZE//(1024*1024)}MB."
                    )
                    return False, 0
                
                # Download with progress updates
                downloaded = 0
                async with aiofiles.open(save_path, 'wb') as f:
                    async for chunk in response.content.iter_chunked(1024*8):
                        await f.write(chunk)
                        downloaded += len(chunk)
                        # Update progress every 5%
                        if file_size > 0 and downloaded % (file_size//20) == 0:
                            progress = int((downloaded/file_size)*100)
                            await status_message.edit_text(
                                f"⏳ Downloading... {progress}% complete\n"
                                f"📁 Size: {downloaded//(1024*1024)}/{file_size//(1024*1024)}MB"
                            )
                
                return True, file_size
    except Exception as e:
        await status_message.edit_text("❌ Download failed. Please try again later.")
        raise e
