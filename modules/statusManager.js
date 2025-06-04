const { SlashCommandBuilder, PermissionFlagsBits, ActivityType } = require('discord.js');

let interval = null;
let scrolling = false;

const activityTypesMap = {
  Playing: ActivityType.Playing,
  Watching: ActivityType.Watching,
  Listening: ActivityType.Listening,
  Competing: ActivityType.Competing,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botstatus')
    .setDescription('Manage bot status and activity')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub
      .setName('set')
      .setDescription('Set the bot status')
      .addStringOption(opt =>
        opt.setName('type')
          .setDescription('Activity type')
          .setRequired(true)
          .addChoices(
            { name: 'Playing', value: 'Playing' },
            { name: 'Watching', value: 'Watching' },
            { name: 'Listening', value: 'Listening' },
            { name: 'Competing', value: 'Competing' }
          )
      )
      .addStringOption(opt =>
        opt.setName('message')
          .setDescription('Status message')
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('status')
          .setDescription('Online status')
          .setRequired(false)
          .addChoices(
            { name: 'Online', value: 'online' },
            { name: 'Idle', value: 'idle' },
            { name: 'Do Not Disturb', value: 'dnd' },
            { name: 'Invisible', value: 'invisible' }
          )
      )
    )
    .addSubcommand(sub => sub
      .setName('scroll')
      .setDescription('Start scrolling status messages')
      .addStringOption(opt =>
        opt.setName('type')
          .setDescription('Activity type')
          .setRequired(true)
          .addChoices(
            { name: 'Playing', value: 'Playing' },
            { name: 'Watching', value: 'Watching' },
            { name: 'Listening', value: 'Listening' },
            { name: 'Competing', value: 'Competing' }
          )
      )
      .addStringOption(opt =>
        opt.setName('messages')
          .setDescription('Comma-separated messages to scroll')
          .setRequired(true)
      )
      .addIntegerOption(opt =>
        opt.setName('interval')
          .setDescription('Interval between changes in seconds (min 5)')
          .setRequired(false)
      )
    )
    .addSubcommand(sub => sub
      .setName('stopscroll')
      .setDescription('Stop scrolling statuses')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const typeString = interaction.options.getString('type');
      const type = activityTypesMap[typeString];
      const message = interaction.options.getString('message');
      const status = interaction.options.getString('status') || 'online';

      await interaction.client.user.setPresence({
        activities: [{ name: message, type }],
        status: status,
      });

      scrolling = false;
      if (interval) clearInterval(interval);

      return interaction.reply({ content: `✅ Set status to **${typeString}** "${message}" with status **${status}**.`, ephemeral: true });

    } else if (sub === 'scroll') {
      const typeString = interaction.options.getString('type');
      const type = activityTypesMap[typeString];
      const messages = interaction.options.getString('messages').split(',').map(m => m.trim());
      const delay = Math.max(interaction.options.getInteger('interval') || 10, 5);

      if (interval) clearInterval(interval);

      let i = 0;
      scrolling = true;

      interval = setInterval(() => {
        const msg = messages[i % messages.length];
        interaction.client.user.setActivity(msg, { type });
        i++;
      }, delay * 1000);

      return interaction.reply({ content: `✅ Started scrolling status messages every ${delay}s.`, ephemeral: true });

    } else if (sub === 'stopscroll') {
      if (interval) clearInterval(interval);
      scrolling = false;
      return interaction.reply({ content: `🛑 Stopped scrolling statuses.`, ephemeral: true });
    }
  }
};
