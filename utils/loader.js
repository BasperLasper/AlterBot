const fs = require('fs');
const path = require('path');

async function loadModules(bot) {
  const modulePath = path.join(__dirname, '..', 'modules');
  const files = fs.readdirSync(modulePath).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const mod = require(path.join(modulePath, file));

    // Slash commands
    if (mod.data && typeof mod.execute === 'function') {
      bot.commands.set(mod.data.name, mod);

      // Aliases (used only for message commands, not slash registration)
      if (Array.isArray(mod.aliases)) {
        for (const alias of mod.aliases) {
          bot.commands.set(alias, mod);
        }
      }

      console.log(`✅ Command ${mod.data.name} loaded.`);
    }

    // Modules with run()
    if (typeof mod.run === 'function') {
      await mod.run(bot);
      console.log(mod.messages?.loaded || `✅ Module ${file} loaded.`);
    }
  }
}

module.exports = { loadModules };
