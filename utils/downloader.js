const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../config');

async function downloadFileWithProgress(url, tempDir, progressCallback) {
  const filename = path.basename(new URL(url).pathname) || `file_${Date.now()}`;
  const filePath = path.join(tempDir, filename);
  
  const response = await axios({
    method: 'get',
    url: url,
    responseType: 'stream',
    timeout: config.DOWNLOAD_TIMEOUT,
    maxContentLength: config.MAX_FILE_SIZE * 1024 * 1024,
    maxRedirects: 5,
    maxBodyLength: Infinity,
    responseEncoding: 'binary'
  });

  const writer = fs.createWriteStream(filePath);
  const totalLength = response.headers['content-length'];
  let downloadedLength = 0;
  let lastProgress = 0;

  response.data.on('data', (chunk) => {
    downloadedLength += chunk.length;
    const progress = Math.floor((downloadedLength / totalLength) * 100);
    if (progress > lastProgress + 5 || progress === 100) {
      lastProgress = progress;
      progressCallback(progress);
    }
  });

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
    response.data.pipe(writer);
  });

  return { filePath, originalName: filename };
}

module.exports = { downloadFileWithProgress };
