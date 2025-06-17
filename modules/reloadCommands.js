const { REST, Routes, PermissionsBitField } = require('discord.js');
const config = require('../config.json');

module.exports = {
    run: async bot => {
        bot.on('messageCreate', async message => {
            if (!message.content.startsWith('-reloadcommands')) return;
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

            const commands = Array.from(
                new Map(
                    [...bot.commands.values()]
                        .filter(cmd => cmd?.data && typeof cmd.data.toJSON === 'function')
                        .map(cmd => [cmd.data.name, cmd.data.toJSON()])
                ).values()
            );

            const rest = new REST({ version: '10' }).setToken(config.token);

            try {
                await rest.put(
                    Routes.applicationGuildCommands(config.clientId, config.guildId),
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
