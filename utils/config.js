const fs = require('fs');
const path = require('path');
const YAML = require('yamljs');

class ConfigManager {
  constructor(filePath, defaultConfig = {}) {
    this.filePath = filePath;

    // Ensure file and folder exist
    if (!fs.existsSync(filePath)) {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, YAML.stringify(defaultConfig, 4));
    }
  }

  get() {
    return YAML.load(this.filePath);
  }

  set(newConfig) {
    fs.writeFileSync(this.filePath, YAML.stringify(newConfig, 4));
  }

  update(updaterFn) {
    const current = this.get();
    const updated = updaterFn(current);
    this.set(updated);
  }
}

function initConfig(filePath, defaultConfig = {}) {
  return new ConfigManager(filePath, defaultConfig);
}

module.exports = { initConfig };
