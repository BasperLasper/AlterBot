const { PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { loadConfig, saveConfig } = require('../utils/config.js');
const { sendEmbed } = require('../utils/embeds.js');

const configPath = path.join(__dirname, '../modules_configs/claimrole.js');
const defaultConfig = {
  prefix: '!',
  command: 'claim',
  claimRole: 'Member', // name or ID
};

let config = loadConfig(configPath, defaultConfig);

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guild || !message.content.startsWith(config.prefix)) return;

    const command = message.content.slice(config.prefix.length).trim().toLowerCase();

    if (command === config.command) {
      let role = getRoleFromInput(message.guild, config.claimRole);
      if (!role) return sendEmbed(message, 'roleNotFound', { roleName: config.claimRole }, true);
      if (message.member.roles.cache.has(role.id))
        return sendEmbed(message, 'claimRoleAlready', { roleName: role.name }, true);

      try {
        await message.member.roles.add(role);
        sendEmbed(message, 'claimRoleSuccess', { roleName: role.name }, true);
      } catch (err) {
        console.error(err);
        sendEmbed(message, 'claimRoleError', { roleName: 'error' }, true);
      }
    }

    if (command.startsWith('setclaimrole')) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return sendEmbed(message, 'adminPermissionError', {}, true);
      }

      const args = message.content.split(' ').slice(1);
      if (args.length === 0) return sendEmbed(message, 'setClaimRoleArgs', {}, true);

      const input = args.join(' ');
      const role = getRoleFromInput(message.guild, input);
      if (!role) return sendEmbed(message, 'setClaimRoleError', { roleName: input }, true);

      config.claimRole = role.id;
      saveConfig(configPath, config);
      sendEmbed(message, 'setClaimRoleSuccess', { roleName: role.name }, true);
    }
  },
};

function getRoleFromInput(guild, input) {
  if (/^\d{18}$/.test(input)) return guild.roles.cache.get(input);
  return guild.roles.cache.find(r => r.name.toLowerCase() === input.toLowerCase());
}
