const fs = require('fs');
const path = require('path');

async function loadModules(bot) {
  const modulePath = path.join(__dirname, '..', 'modules');
  console.log(`📁 Loading modules from: ${modulePath}`);

  if (!fs.existsSync(modulePath)) {
    console.warn(`⚠️ Module path does not exist: ${modulePath}`);
    return;
  }

  const files = fs.readdirSync(modulePath).filter(f => f.endsWith('.js'));
  console.log(`🔍 Found ${files.length} module(s): ${files.join(', ')}`);

  for (const file of files) {
    try {
      const fullPath = path.join(modulePath, file);
      console.log(`📦 Importing module: ${file}`);
      const mod = require(fullPath);

      // Slash or message-based command
      if (mod.data && typeof mod.execute === 'function') {
        bot.commands.set(mod.data.name, mod);
        if (Array.isArray(mod.aliases)) {
          for (const alias of mod.aliases) {
            if (bot.commands.has(alias)) {
              console.warn(`⚠️ Alias conflict: '${alias}' skipped.`);
              continue;
            }
            bot.commands.set(alias, mod);
          }
        }
        console.log(`✅ Command loaded: ${mod.data.name}`);
      }

      // Module logic (like messageCreate listener)
      if (typeof mod.run === 'function') {
        await mod.run(bot);
        console.log(`🛠️  Module logic run: ${file}`);
      }
    } catch (err) {
      console.error(`❌ Failed to load module ${file}:`, err);
    }
  }
}

module.exports = { loadModules };
