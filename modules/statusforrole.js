const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  run: async (bot) => {
    const enableLogs = process.argv.includes('--logs');

    const log = (...args) => {
      if (enableLogs) console.log('[StatusForRole]', ...args);
    };

    const moduleFileName = path.basename(__filename, '.js');
    const configDir = path.resolve(__dirname, '../modules_configs', moduleFileName);
    const configFile = path.join(configDir, 'config.json');

    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    if (!fs.existsSync(configFile)) {
      const defaultConfig = {
        roles: {
          "721067132011413516": {
            statuses: ["gta v", "grand theft auto v"],
            autoRemove: true
          },
          "721067132003025018": {
            statuses: ["jeśli wrócisz nigdy więcej tak nie będzie"],
            autoRemove: false
          }
        }
      };
      fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2));
      log('✅ Created default config.json');
    }

    let config;
    try {
      config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    } catch (err) {
      console.error('[StatusForRole] ❌ Failed to load config.json:', err.message);
      return;
    }

    async function checkStatusRoles(member) {
      if (!member || !member.guild) {
        log(`⚠️ Invalid member or missing guild.`);
        return;
      }

      let presence;
      try {
        presence = member.presence ?? await member.guild.members.fetch(member.id).then(m => m.presence);
      } catch (err) {
        log(`❌ Failed to fetch presence for ${member.user?.tag || member.id}: ${err.message}`);
        return;
      }

      if (!presence) {
        log(`❌ No presence found for ${member.user.tag}`);
        return;
      }

      const customStatus = presence.activities?.find(a => a.type === 4); // CUSTOM_STATUS
      const statusText = (customStatus?.state || '').toLowerCase();

      if (!customStatus) {
        log(`ℹ️ ${member.user.tag} has no custom status.`);
      } else {
        log(`🔍 ${member.user.tag} status: "${statusText}"`);
      }

      for (const [roleId, { statuses, autoRemove }] of Object.entries(config.roles)) {
        let role;
        try {
          role = member.guild.roles.cache.get(roleId);
          if (!role) throw new Error('Role not found in cache');
        } catch (err) {
          log(`❌ Error resolving role ${roleId}: ${err.message}`);
          continue;
        }

        const hasRole = member.roles.cache.has(roleId);
        const matches = statuses.some(s => statusText.includes(s.toLowerCase()));

        try {
          if (matches && !hasRole) {
            log(`✅ Adding role "${role.name}" to ${member.user.tag}`);
            await member.roles.add(role);
          } else if (!matches && hasRole && autoRemove) {
            log(`🔁 Removing role "${role.name}" from ${member.user.tag}`);
            await member.roles.remove(role);
          } else {
            log(`ℹ️ No change for "${role.name}" — Match: ${matches}, Has Role: ${hasRole}, autoRemove: ${autoRemove}`);
          }
        } catch (err) {
          log(`❌ Failed to modify role "${role.name}" for ${member.user.tag}: ${err.message}`);
        }
      }
    }

    // presenceUpdate event
    bot.on('presenceUpdate', async (_, newPresence) => {
      try {
        if (!newPresence || !newPresence.member) {
          log(`⚠️ Skipped presenceUpdate due to missing member.`);
          return;
        }

        log(`📶 presenceUpdate triggered for ${newPresence.member.user.tag}`);
        await checkStatusRoles(newPresence.member);
      } catch (err) {
        log(`❌ Error in presenceUpdate handler: ${err.message}`);
      }
    });

    // guildMemberAdd event
    bot.on('guildMemberAdd', async (member) => {
      log(`👤 Member joined: ${member.user.tag}`);
      setTimeout(() => {
        checkStatusRoles(member).catch(err =>
          log(`❌ Error checking status on join for ${member.user.tag}: ${err.message}`)
        );
      }, 2000);
    });

    // Slash command to manually check yourself
    bot.commands.set('checkstatus', {
      data: new SlashCommandBuilder()
        .setName('checkstatus')
        .setDescription('Force re-check of your custom status for roles.'),
      async execute(interaction) {
        await checkStatusRoles(interaction.member);
        await interaction.reply({ content: '✅ Your status was checked.', ephemeral: true });
      }
    });
  },

  messages: {
    loaded: '✅ StatusForRole module loaded.',
    unloaded: '🛑 StatusForRole module unloaded.',
  },
};
