const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require('discord.js');
const path = require('path');
const fs = require('fs');

module.exports = {
    run: async bot => {
        const configPath = path.join(__dirname, '..', 'module_configs', 'roleMenu.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const { defaultType, roleLimit, emojis, messages } = config;

        bot.commands.set('createrolemenu', {
            data: new SlashCommandBuilder()
                .setName('createrolemenu')
                .setDescription('Create a role menu.')
                .addStringOption(opt =>
                    opt.setName('type')
                        .setDescription('Type of role selector')
                        .setRequired(false)
                        .addChoices(
                            { name: 'button', value: 'button' },
                            { name: 'select', value: 'select' },
                            { name: 'reaction', value: 'reaction' }
                        )
                ),
            async execute(interaction) {
                const type = interaction.options.getString('type') || defaultType;
                const roles = interaction.guild.roles.cache.filter(r => !r.managed && r.name !== '@everyone').first(roleLimit);

                if (!roles.length) {
                    return interaction.reply({ content: messages.noRoles, ephemeral: true });
                }

                if (type === 'button') {
                    const row = new ActionRowBuilder().addComponents(
                        roles.map(role =>
                            new ButtonBuilder()
                                .setCustomId(`role:${role.id}`)
                                .setLabel(role.name)
                                .setStyle(ButtonStyle.Primary)
                        )
                    );
                    await interaction.reply({ content: messages.title, components: [row] });
                } else if (type === 'select') {
                    const select = new StringSelectMenuBuilder()
                        .setCustomId('role_select')
                        .setPlaceholder('Select a role')
                        .addOptions(
                            roles.map(role => ({ label: role.name, value: role.id }))
                        );
                    const row = new ActionRowBuilder().addComponents(select);
                    await interaction.reply({ content: messages.title, components: [row] });
                } else if (type === 'reaction') {
                    const roleMap = {};
                    const msg = await interaction.reply({ content: messages.title, fetchReply: true });

                    for (let i = 0; i < roles.length && i < emojis.length; i++) {
                        await msg.react(emojis[i]);
                        roleMap[emojis[i]] = roles[i].id;
                    }

                    bot.roleMenuReactions.set(msg.id, roleMap);
                }
            }
        });

        bot.on('interactionCreate', async interaction => {
            if (interaction.isButton() && interaction.customId.startsWith('role:')) {
                const roleId = interaction.customId.split(':')[1];
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) return interaction.reply({ content: 'Role not found.', ephemeral: true });

                const hasRole = interaction.member.roles.cache.has(roleId);
                if (hasRole) {
                    await interaction.member.roles.remove(role);
                    return interaction.reply({ content: messages.roleRemoved.replace('{role}', role.name), ephemeral: true });
                } else {
                    await interaction.member.roles.add(role);
                    return interaction.reply({ content: messages.roleAdded.replace('{role}', role.name), ephemeral: true });
                }
            }

            if (interaction.isStringSelectMenu() && interaction.customId === 'role_select') {
                const roleId = interaction.values[0];
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) return interaction.reply({ content: 'Role not found.', ephemeral: true });

                const hasRole = interaction.member.roles.cache.has(roleId);
                if (hasRole) {
                    await interaction.member.roles.remove(role);
                    return interaction.reply({ content: messages.roleRemoved.replace('{role}', role.name), ephemeral: true });
                } else {
                    await interaction.member.roles.add(role);
                    return interaction.reply({ content: messages.roleAdded.replace('{role}', role.name), ephemeral: true });
                }
            }
        });

        bot.on('messageReactionAdd', async (reaction, user) => {
            if (user.bot || !reaction.message.guild) return;
            const roleMap = bot.roleMenuReactions?.get(reaction.message.id);
            if (!roleMap) return;

            const roleId = roleMap[reaction.emoji.name];
            if (roleId) {
                const member = await reaction.message.guild.members.fetch(user.id);
                await member.roles.add(roleId).catch(console.error);
            }
        });

        bot.on('messageReactionRemove', async (reaction, user) => {
            if (user.bot || !reaction.message.guild) return;
            const roleMap = bot.roleMenuReactions?.get(reaction.message.id);
            if (!roleMap) return;

            const roleId = roleMap[reaction.emoji.name];
            if (roleId) {
                const member = await reaction.message.guild.members.fetch(user.id);
                await member.roles.remove(roleId).catch(console.error);
            }
        });
    },

    messages: {
        loaded: '✅ Role Menu Module loaded.',
        unloaded: '🛑 Role Menu Module unloaded.'
    },

    configs: {
        config: {},
        lang: {}
    },

    settings: {
        development: false
    },

    dependencies: []
};
