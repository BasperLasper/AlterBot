const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Partials, REST, Routes } = require('discord.js');
const { loadModules } = require('./utils/loader');
const readline = require('readline');

const configPath = path.resolve(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
  const defaultConfig = { token: '', clientId: '', };
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  console.log('config.json not found. Created default config.json. Please fill it in and restart the bot.');
  console.log('Process exiting...');
  process.exit(0);
}

const config = require(configPath);

const bot = new Client({
  intents: [
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

bot.commands = new Collection();
bot.modules = new Collection();
bot.roleMenuReactions = new Map();

// Store cleanup functions for each module
const moduleCleanups = new Map();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.on('line', input => {
  if (input.trim().toLowerCase() === 'stop') {
    console.log('Stopping bot...');
    for (const cleanup of moduleCleanups.values()) {
      try {
        cleanup();
      } catch (err) {
        console.error(`Error in cleanup: ${err.message}`);
      }
    }
    process.exit(0);
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT: Cleaning up...');
  for (const cleanup of moduleCleanups.values()) {
    try {
      cleanup();
    } catch (err) {
      console.error(`Error in cleanup: ${err.message}`);
    }
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM: Cleaning up...');
  for (const cleanup of moduleCleanups.values()) {
    try {
      cleanup();
    } catch (err) {
      console.error(`Error in cleanup: ${err.message}`);
    }
  }
  process.exit(0);
});

(async () => {
  await loadModules(bot, moduleCleanups);

  const registered = new Set();
  const commands = [];
  for (const cmd of bot.commands.values()) {
    if (cmd.data && typeof cmd.data.toJSON === 'function' && !registered.has(cmd.data.name)) {
      commands.push(cmd.data.toJSON());
      registered.add(cmd.data.name);
    }
  }

  const rest = new REST({ version: '10' }).setToken(config.token);
  try {
    console.log('🔄 Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: commands }
    );
    console.log('✅ Slash commands registered.');
  } catch (error) {
    console.error('❌ Error registering slash commands:', error);
    process.exit(1);
  }

  try {
    await bot.login(config.token);
    console.log(`✅ Logged in as ${bot.user.tag}`);
  } catch (loginError) {
    console.error('❌ Login failed:', loginError);
    process.exit(1);
  }
})();

// Unified interaction handler
bot.on('interactionCreate', async interaction => {
  try {
    if (interaction.isCommand()) {
      const command = bot.commands.get(interaction.commandName);
      if (command && typeof command.execute === 'function') {
        await command.execute(interaction, bot);
      }
    } else if (interaction.isStringSelectMenu() || interaction.isButton()) {
      for (const cmd of bot.commands.values()) {
        if (typeof cmd.handle === 'function') {
          await cmd.handle(interaction, bot);
        }
      }
    }
  } catch (err) {
    console.error('❌ Interaction Error:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
    }
  }
});

// Legacy message-based dash commands
bot.on('messageCreate', async message => {
  if (message.author.bot || !message.content.startsWith('-')) return;
  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  const command = bot.commands.get(commandName);
  if (command && typeof command.execute === 'function') {
    try {
      await command.execute({
        user: message.author,
        guild: message.guild,
        channel: message.channel,
        reply: msg => message.reply(msg),
        deferReply: () => Promise.resolve(),
        editReply: msg => message.channel.send(msg),
        member: message.member,
        content: message.content
      }, bot);
    } catch (error) {
      console.error(error);
      message.reply('❌ Error executing command.');
    }
  }
});