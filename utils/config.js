const fs = require('fs');
const path = require('path');

function loadConfig(filePath, defaultData) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    saveConfig(filePath, defaultData);
    return defaultData;
  }
  delete require.cache[require.resolve(filePath)];
  return require(filePath);
}

function saveConfig(filePath, data) {
  fs.writeFileSync(filePath, `module.exports = ${JSON.stringify(data, null, 2)};\n`);
}

module.exports = { loadConfig, saveConfig };
