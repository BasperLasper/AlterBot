bot.commands.set('createrolemenu', {
    data: new SlashCommandBuilder()
        .setName('createrolemenu')
        .setDescription('Create a customizable role menu')
        .addStringOption(opt =>
            opt.setName('type')
                .setDescription('Menu type')
                .setRequired(true)
                .addChoices(
                    { name: 'button', value: 'button' },
                    { name: 'select', value: 'select' },
                    { name: 'reaction', value: 'reaction' }
                )
        )
        .addRoleOption(opt =>
            opt.setName('role1').setDescription('Role 1').setRequired(true))
        .addRoleOption(opt =>
            opt.setName('role2').setDescription('Role 2').setRequired(false))
        .addRoleOption(opt =>
            opt.setName('role3').setDescription('Role 3').setRequired(false))
        .addRoleOption(opt =>
            opt.setName('role4').setDescription('Role 4').setRequired(false))
        .addRoleOption(opt =>
            opt.setName('role5').setDescription('Role 5').setRequired(false))
        .addStringOption(opt =>
            opt.setName('emojis')
                .setDescription('Comma-separated emojis (e.g., 😀,🔥)')
                .setRequired(false))
        .addStringOption(opt =>
            opt.setName('title')
                .setDescription('Title text for the role menu')
                .setRequired(false)),
    
    async execute(interaction) {
        const type = interaction.options.getString('type');
        const title = interaction.options.getString('title') || 'Select your roles:';
        const emojiList = interaction.options.getString('emojis')?.split(',').map(e => e.trim()) || [];

        const roles = [];
        for (let i = 1; i <= 5; i++) {
            const role = interaction.options.getRole(`role${i}`);
            if (role) roles.push(role);
        }

        if (!roles.length) {
            return interaction.reply({ content: '⚠️ You must specify at least one role.', ephemeral: true });
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
            const msg = await interaction.reply({ content: title, components: [row], fetchReply: true });
            await msg.pin();
        }

        else if (type === 'select') {
            const select = new StringSelectMenuBuilder()
                .setCustomId('role_select')
                .setPlaceholder('Select a role')
                .addOptions(
                    roles.map(role => ({ label: role.name, value: role.id }))
                );
            const row = new ActionRowBuilder().addComponents(select);
            const msg = await interaction.reply({ content: title, components: [row], fetchReply: true });
            await msg.pin();
        }

        else if (type === 'reaction') {
            if (emojiList.length < roles.length) {
                return interaction.reply({ content: `⚠️ Not enough emojis (${emojiList.length}) for the ${roles.length} roles.`, ephemeral: true });
            }

            const msg = await interaction.reply({ content: title, fetchReply: true });
            for (let i = 0; i < roles.length; i++) {
                await msg.react(emojiList[i]);
                if (!bot.roleMenuReactions.has(msg.id)) bot.roleMenuReactions.set(msg.id, {});
                bot.roleMenuReactions.get(msg.id)[emojiList[i]] = roles[i].id;
            }

            await msg.pin();
        }
    }
});
