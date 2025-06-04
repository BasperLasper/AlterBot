const fs = require('fs');
const path = require('path');

async function loadModules(bot) {
  // Adjust modules path to your project structure
  const modulePath = path.join(__dirname, '..', 'modules');
  const files = fs.readdirSync(modulePath).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const mod = require(path.join(modulePath, file));

    // Slash commands (with data and execute)
    if (mod.data && typeof mod.execute === 'function') {
      bot.commands.set(mod.data.name, mod);
      console.log(`✅ Command ${mod.data.name} loaded.`);
    }

    // Utility modules with run() method
    if (typeof mod.run === 'function') {
      await mod.run(bot);
      console.log(mod.messages?.loaded || `✅ Module ${file} loaded.`);
    }
  }
}

module.exports = { loadModules };
