const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
} = require('discord.js');

module.exports = {
  run: async (bot) => {
    bot.commands.set('createrolemenu', {
      data: new SlashCommandBuilder()
        .setName('createrolemenu')
        .setDescription('Interactive setup for a role menu'),

      async execute(interaction) {
        await interaction.reply({ content: 'How many roles would you like to add? (1–10)', ephemeral: true });

        const filter = m => m.author.id === interaction.user.id;
        const msgCollector = interaction.channel.createMessageCollector({ filter, time: 60000 });

        const collectedRoles = [];
        let expectedCount = 0;
        let step = 'waiting_for_count';

        msgCollector.on('collect', async msg => {
          if (step === 'waiting_for_count') {
            const count = parseInt(msg.content);
            if (isNaN(count) || count < 1 || count > 10) {
              return msg.reply('❌ Please enter a number between 1 and 10.');
            }

            expectedCount = count;
            step = 'collecting_roles';
            msg.reply('Great! Now send each role + emoji like this: `@Role 🔥`');
            return;
          }

          if (step === 'collecting_roles') {
            const match = msg.content.match(/<@&(\d+)> ?(.+)/);
            if (!match) {
              return msg.reply('⚠️ Please mention the role followed by a space and an emoji. Example: `@Tank 🛡️`');
            }

            const role = msg.mentions.roles.first();
            const emoji = match[2];

            if (!role || !emoji) {
              return msg.reply('❌ Invalid input. Try again.');
            }

            collectedRoles.push({ role, emoji });
            if (collectedRoles.length < expectedCount) {
              return msg.reply(`✅ Got ${collectedRoles.length}. Keep going...`);
            }

            step = 'waiting_for_type';
            bot.tempRoleMenuData = { type: '', roles: collectedRoles };
            return msg.reply('🎛 What type of menu? Type `button`, `select`, or `reaction`.');
          }

          if (step === 'waiting_for_type') {
            const type = msg.content.toLowerCase();
            if (!['button', 'select', 'reaction'].includes(type)) {
              return msg.reply('❌ Type must be `button`, `select`, or `reaction`.');
            }

            step = 'waiting_for_title';
            bot.tempRoleMenuData.type = type;
            return msg.reply('📝 Finally, send the title for the role menu message.');
          }

          if (step === 'waiting_for_title') {
            const { roles, type } = bot.tempRoleMenuData;
            const title = msg.content;

            // Delete user and bot setup messages
            const messages = await interaction.channel.messages.fetch({ limit: 100 });
            const toDelete = messages.filter(m =>
              m.author.id === interaction.user.id || m.author.id === bot.user.id
            );
            await interaction.channel.bulkDelete(toDelete, true).catch(() => {});

            if (type === 'button') {
              const row = new ActionRowBuilder().addComponents(
                roles.map(r =>
                  new ButtonBuilder()
                    .setCustomId(`role:${r.role.id}`)
                    .setLabel(r.role.name)
                    .setStyle(ButtonStyle.Primary)
                )
              );
              const sent = await interaction.channel.send({ content: title, components: [row] });
              await sent.pin();
              msgCollector.stop();
              return;
            }

            if (type === 'select') {
              const select = new StringSelectMenuBuilder()
                .setCustomId('role_select')
                .setPlaceholder('Select a role')
                .setMinValues(0)
                .setMaxValues(roles.length)
                .addOptions(
                  roles.map(r => ({
                    label: r.role.name,
                    value: r.role.id,
                  }))
                );
              const row = new ActionRowBuilder().addComponents(select);
              const sent = await interaction.channel.send({ content: title, components: [row] });
              await sent.pin();
              msgCollector.stop();
              return;
            }

            if (type === 'reaction') {
              const sent = await interaction.channel.send({ content: title });
              const roleMap = {};
              for (const r of roles) {
                await sent.react(r.emoji);
                roleMap[r.emoji] = r.role.id;
              }
              bot.roleMenuReactions.set(sent.id, roleMap);
              await sent.pin();
              msgCollector.stop();
              return;
            }
          }
        });

        msgCollector.on('end', collected => {
          if (step !== 'waiting_for_title') {
            interaction.followUp({ content: '⏱ Setup timed out. Please try again.', ephemeral: true });
          }
        });
      },
    });

    // Button handler
    bot.on('interactionCreate', async interaction => {
      if (interaction.isButton() && interaction.customId.startsWith('role:')) {
        const roleId = interaction.customId.split(':')[1];
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) return interaction.reply({ content: 'Role not found.', ephemeral: true });

        const hasRole = interaction.member.roles.cache.has(roleId);
        if (hasRole) {
          await interaction.member.roles.remove(role).catch(() => {});
          return interaction.reply({ content: `${interaction.user}, you have had **${role.name}** removed.`, ephemeral: true });
        } else {
          await interaction.member.roles.add(role).catch(() => {});
          return interaction.reply({ content: `${interaction.user}, you have been given **${role.name}**.`, ephemeral: true });
        }
      }

      if (interaction.isStringSelectMenu() && interaction.customId === 'role_select') {
        const currentRoles = new Set(interaction.member.roles.cache.keys());
        const selectedRoles = new Set(interaction.values);

        const rolesToAdd = interaction.values.filter(id => !currentRoles.has(id));
        const rolesToRemove = [...currentRoles].filter(id =>
          interaction.component.options.some(o => o.value === id) && !selectedRoles.has(id)
        );

        for (const roleId of rolesToAdd) {
          const role = interaction.guild.roles.cache.get(roleId);
          if (role) await interaction.member.roles.add(role).catch(() => {});
        }

        for (const roleId of rolesToRemove) {
          const role = interaction.guild.roles.cache.get(roleId);
          if (role) await interaction.member.roles.remove(role).catch(() => {});
        }

        let msg = '';
        if (rolesToAdd.length)
          msg += rolesToAdd.map(id => `✅ ${interaction.user}, you have been given **${interaction.guild.roles.cache.get(id).name}**.`).join('\n') + '\n';
        if (rolesToRemove.length)
          msg += rolesToRemove.map(id => `❌ ${interaction.user}, you have had **${interaction.guild.roles.cache.get(id).name}** removed.`).join('\n');

        return interaction.reply({ content: msg || 'No changes.', ephemeral: true });
      }
    });

    // Reaction add
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

    // Reaction remove
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
    loaded: '✅ Interactive Role Menu Module loaded.',
    unloaded: '🛑 Unloaded.',
  },
};
