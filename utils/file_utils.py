import os
import logging

logger = logging.getLogger(__name__)

def cleanup_temp_file(file_path: str):
    """Clean up temporary files"""
    try:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Cleaned up temporary file: {file_path}")
    except Exception as e:
        logger.error(f"Error cleaning up file {file_path}: {e}")
