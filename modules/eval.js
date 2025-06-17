const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
  } = require('discord.js');
  const util = require('util');
  
  module.exports = {
    data: new SlashCommandBuilder()
      .setName('eval')
      .setDescription('Evaluate JS code.')
      .addStringOption(option =>
        option.setName('code')
          .setDescription('The JavaScript code to evaluate')
          .setRequired(true)
      ),
  
    aliases: ['eval', '-eval'], // this allows dash command fallback
  
    async execute(interaction, bot) {
      const isSlash = !!interaction.commandName;
      const member = interaction.member;
      const code = isSlash
        ? interaction.options.getString('code')
        : interaction.content.split(' ').slice(1).join(' ');
  
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply
          ? interaction.reply({ content: '❌ You do not have permission.', ephemeral: true })
          : interaction.channel.send('❌ You do not have permission.');
      }
  
      if (!code) {
        return interaction.reply
          ? interaction.reply({ content: '❗ Provide code to evaluate.', ephemeral: true })
          : interaction.channel.send('❗ Provide code to evaluate.');
      }
  
      try {
        let evaled = await eval(code);
        if (typeof evaled !== 'string') evaled = util.inspect(evaled, { depth: 1 });
  
        const embed = new EmbedBuilder()
          .setTitle('🧪 Eval Result')
          .addFields(
            { name: 'Input', value: `\`\`\`js\n${code}\n\`\`\`` },
            { name: 'Output', value: `\`\`\`js\n${evaled}\n\`\`\`` }
          )
          .setColor(0x2ECC71)
          .setTimestamp();
  
        return interaction.reply
          ? interaction.reply({ embeds: [embed], ephemeral: true })
          : interaction.channel.send({ embeds: [embed] });
  
      } catch (err) {
        const errorMsg = `❌ Error: \`${err.message || err}\``;
        return interaction.reply
          ? interaction.reply({ content: errorMsg, ephemeral: true })
          : interaction.channel.send(errorMsg);
      }
    }
  };
  