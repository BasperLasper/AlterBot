const fs = require('fs');
const path = require('path');
const YAML = require('yamljs');
const { PermissionsBitField } = require('discord.js');
const { buildEmbed, sendEmbeds } = require('../utils/embeds');

const MODULE_FOLDER = path.join(__dirname, '..', 'modules_configs', 'ClaimRole');
const CONFIG_PATH = path.join(MODULE_FOLDER, 'config.yml');
const EMBEDS_PATH = path.join(MODULE_FOLDER, 'embeds.yml');

function ensureFolder() {
  if (!fs.existsSync(MODULE_FOLDER)) {
    fs.mkdirSync(MODULE_FOLDER, { recursive: true });
  }
}

function loadOrCreateConfig() {
  ensureFolder();
  if (!fs.existsSync(CONFIG_PATH)) {
    const defaultConfig = {
      prefix: '!',
      claimRole: null,
      command: 'claimrole',
      setClaimRoleCommand: 'setclaimrole'
    };
    fs.writeFileSync(CONFIG_PATH, YAML.stringify(defaultConfig, 4));
    return defaultConfig;
  }
  return YAML.load(CONFIG_PATH);
}

function loadOrCreateEmbeds() {
  ensureFolder();
  if (!fs.existsSync(EMBEDS_PATH)) {
    const defaultEmbeds = {
      roleNotFound: [
        {
          title: "Role Not Found",
          description: "Sorry, the role `{roleName}` could not be found.",
          color: "#FF0000",
          timestamp: true
        }
      ],
      claimRoleAlready: [
        {
          title: "Role Already Claimed",
          description: "You already have the `{roleName}` role.",
          color: "#FFA500",
          timestamp: true
        }
      ],
      claimRoleSuccess: [
        {
          title: "Role Claimed",
          description: "You have been given the `{roleName}` role successfully!",
          color: "#00FF00",
          timestamp: true
        }
      ],
      claimRoleError: [
        {
          title: "Error",
          description: "There was an error claiming the role `{roleName}`. Please try again later.",
          color: "#FF0000",
          timestamp: true
        }
      ],
      adminPermissionError: [
        {
          title: "Permission Denied",
          description: "You need Administrator permissions to use this command.",
          color: "#FF0000",
          timestamp: true
        }
      ],
      setClaimRoleArgs: [
        {
          title: "Missing Arguments",
          description: "Please specify the role to set, e.g. `!setclaimrole RoleName`",
          color: "#FFFF00",
          timestamp: true
        }
      ],
      setClaimRoleError: [
        {
          title: "Role Not Found",
          description: "Could not find the role `{roleName}` to set.",
          color: "#FF0000",
          timestamp: true
        }
      ],
      setClaimRoleSuccess: [
        {
          title: "Claim Role Updated",
          description: "The claim role has been set to `{roleName}`.",
          color: "#00FF00",
          timestamp: true
        }
      ],
    };
    fs.writeFileSync(EMBEDS_PATH, YAML.stringify(defaultEmbeds, 4));
    return defaultEmbeds;
  }
  return YAML.load(EMBEDS_PATH);
}

let config = loadOrCreateConfig();
let messages = loadOrCreateEmbeds();

// Save config helper
function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, YAML.stringify(config, 4));
}

// Send embed by key helper
async function sendEmbedByKey(target, key, replacements = {}, reply = false) {
  if (!messages[key]) {
    console.error(`Embed key "${key}" not found in ${EMBEDS_PATH}`);
    return;
  }

  const embedsToSend = messages[key].map(embedData => buildEmbed(embedData, replacements));
  await sendEmbeds(target, embedsToSend, reply);
}

module.exports = {
  name: 'claimrole',
  description: 'Allows users to claim a specific role.',
  async execute(client) {
    client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      if (!message.guild) return;

      const prefix = config.prefix || '!';
      if (!message.content.startsWith(prefix)) return;

      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      if (command === config.command) {
        // Claim role command
        try {
          if (!config.claimRole) {
            return sendEmbedByKey(message, 'roleNotFound', { roleName: 'Not Set' }, true);
          }

          const role = message.guild.roles.cache.get(config.claimRole);
          if (!role) {
            return sendEmbedByKey(message, 'roleNotFound', { roleName: config.claimRole }, true);
          }

          if (message.member.roles.cache.has(role.id)) {
            return sendEmbedByKey(message, 'claimRoleAlready', { roleName: role.name }, true);
          }

          await message.member.roles.add(role);
          return sendEmbedByKey(message, 'claimRoleSuccess', { roleName: role.name }, true);

        } catch (error) {
          console.error(error);
          return sendEmbedByKey(message, 'claimRoleError', { roleName: config.claimRole }, true);
        }
      }

      if (command === config.setClaimRoleCommand) {
        // Set claim role command - admin only
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return sendEmbedByKey(message, 'adminPermissionError', {}, true);
        }

        if (args.length === 0) {
          return sendEmbedByKey(message, 'setClaimRoleArgs', {}, true);
        }

        const roleInput = args.join(' ');
        let role = null;

        // Try to get role by ID or name
        if (/^\d{17,19}$/.test(roleInput)) {
          role = message.guild.roles.cache.get(roleInput);
        } else {
          role = message.guild.roles.cache.find(r => r.name.toLowerCase() === roleInput.toLowerCase());
        }

        if (!role) {
          return sendEmbedByKey(message, 'setClaimRoleError', { roleName: roleInput }, true);
        }

        config.claimRole = role.id;
        saveConfig();

        return sendEmbedByKey(message, 'setClaimRoleSuccess', { roleName: role.name }, true);
      }
    });
  }
};
