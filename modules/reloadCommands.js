const { REST, Routes } = require('discord.js');
const config = require('../config.json');

module.exports = {
    run: async bot => {
        bot.on('messageCreate', async message => {
            if (!message.content.startsWith('-reloadcommands')) return;
            if (!message.member.permissions.has('Administrator')) return; // optional security check

            const commands = [...bot.commands.values()].map(cmd => cmd.data.toJSON());
            const rest = new REST({ version: '10' }).setToken(config.token);

            try {
                await rest.put(
                    Routes.applicationGuildCommands(config.clientId, config.guildId), // for testing
                    // Routes.applicationCommands(config.clientId), // use this for global
                    { body: commands }
                );

                await message.reply('✅ Slash commands reloaded.');
                console.log('🔁 Slash commands updated via -reloadcommands');
            } catch (error) {
                console.error('❌ Failed to reload slash commands:', error);
                await message.reply('❌ Failed to reload slash commands. See console.');
            }
        });
    },

    messages: {
        loaded: '✅ ReloadCommands module loaded.'
    }
};
