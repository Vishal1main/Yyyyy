const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function downloadFile(url, tempDir) {
  const filename = path.basename(new URL(url).pathname) || `file_${Date.now()}`;
  const filePath = path.join(tempDir, filename);
  const writer = fs.createWriteStream(filePath);
  
  const response = await axios({
    method: 'get',
    url: url,
    responseType: 'stream'
  });

  response.data.pipe(writer);
  
  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  return { filePath, originalName: filename };
}

module.exports = { downloadFile };
