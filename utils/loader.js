const fs = require('fs');
const path = require('path');

async function loadModules(bot) {
  const modulePath = path.join(__dirname, '..', 'modules');
  const files = fs.readdirSync(modulePath).filter(f => f.endsWith('.js'));

  for (const file of files) {
    try {
      const mod = require(path.join(modulePath, file));

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
        console.log(`✅ Command ${mod.data.name} loaded.`);
      }

      // Optional module logic
      if (typeof mod.run === 'function') {
        await mod.run(bot);
        console.log(mod.messages?.loaded || `✅ Module ${file} loaded.`);
      }
    } catch (err) {
      console.error(`❌ Failed to load module ${file}:`, err);
    }
  }
}

module.exports = { loadModules };
