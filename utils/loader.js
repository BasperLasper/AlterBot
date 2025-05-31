const fs = require('fs');
const path = require('path');

async function loadModules(bot) {
    const modulePath = path.join(__dirname, '..', 'modules');
    const files = fs.readdirSync(modulePath);

    for (const file of files) {
        const mod = require(path.join(modulePath, file));
        await mod.run(bot);
        console.log(mod.messages?.loaded || `Loaded ${file}`);
    }
}

module.exports = { loadModules };
