# Use official Python image
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create temp directory
RUN mkdir -p temp_downloads

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV BOT_TOKEN=7861502352:AAF09jfPpjU78dnwl4NiM95TadZAE6kjo1M
ENV PORT=8443
ENV HOST=0.0.0.0

# Expose the port
EXPOSE $PORT

# Run the application
CMD ["python", "bot.py"]
