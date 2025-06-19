const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function downloadFile(url, tempDir) {
  const parsedUrl = new URL(url);
  let filename = path.basename(parsedUrl.pathname);
  
  if (!filename || filename === parsedUrl.hostname || !path.extname(filename)) {
    const contentType = await getContentType(url);
    const ext = contentType.split('/').pop();
    filename = `file_${Date.now()}.${ext}`;
  }

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

async function getContentType(url) {
  try {
    const response = await axios.head(url);
    return response.headers['content-type'] || 'application/octet-stream';
  } catch (error) {
    return 'application/octet-stream';
  }
}

module.exports = { downloadFile };
