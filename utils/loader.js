const fs = require('fs');
const path = require('path');

async function loadModules(bot, moduleCleanups) {
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

      // Multi-command support
      if (Array.isArray(mod.commands)) {
        for (const cmd of mod.commands) {
          if (!cmd?.name || typeof mod.execute !== 'function') continue;

          bot.commands.set(cmd.name, {
            ...mod,
            data: cmd
          });

          console.log(`✅ Slash command loaded: ${cmd.name}`);
        }
      }

      // Single slash command support
      else if (mod.data && typeof mod.execute === 'function') {
        bot.commands.set(mod.data.name, mod);
        console.log(`✅ Slash command loaded: ${mod.data.name}`);
      }

      // Aliases (only once, not per subcommand)
      if (Array.isArray(mod.aliases)) {
        for (const alias of mod.aliases) {
          if (bot.commands.has(alias)) {
            console.warn(`⚠️ Alias conflict: '${alias}' skipped.`);
            continue;
          }
          bot.commands.set(alias, mod);
          console.log(`✅ Alias loaded: ${alias}`);
        }
      }

      // Module logic (e.g., listeners)
      if (typeof mod.run === 'function') {
        await mod.run(bot);
        console.log(`🛠️ Module logic run: ${file}`);
      }

      // Store cleanup function if provided
      if (typeof mod.cleanup === 'function') {
        moduleCleanups.set(file, mod.cleanup);
        console.log(`✅ Cleanup function loaded for module: ${file}`);
      }

    } catch (err) {
      console.error(`❌ Failed to load module ${file}: ${err.message}`);
    }
  }
}

module.exports = { loadModules };