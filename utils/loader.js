const fs = require('fs');
const path = require('path');

async function loadModules(bot) {
    const modulePath = path.join(__dirname, '..', 'modules');
    const files = fs.readdirSync(modulePath);

    for (const file of files) {
        const mod = require(path.join(modulePath, file));

        // If it's a slash command (has data and execute), add to bot.commands
        if (mod.data && typeof mod.execute === 'function') {
            bot.commands.set(mod.data.name, mod);
            console.log(`✅ Command ${mod.data.name} loaded.`);
        }

        // If it's a utility module with run(), run it
        if (typeof mod.run === 'function') {
            await mod.run(bot);
            console.log(mod.messages?.loaded || `✅ Module ${file} loaded.`);
        }
    }
}

module.exports = { loadModules };
