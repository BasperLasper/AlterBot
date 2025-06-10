const fs = require('fs');
const path = require('path');
const YAML = require('yamljs');

function initConfig(filePath, defaultConfig = {}) {
  if (!fs.existsSync(filePath)) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(filePath, YAML.stringify(defaultConfig, 4));
  }
  return YAML.load(filePath);
}

module.exports = { initConfig };
