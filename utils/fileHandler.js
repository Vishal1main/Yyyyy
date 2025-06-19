const path = require('path');

function getFileExtension(filename) {
  return path.extname(filename).slice(1);
}

module.exports = { getFileExtension };
