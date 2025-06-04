const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Partials, REST, Routes } = require('discord.js');
const { loadModules } = require('./utils/loader');
const readline = require('readline');

const configPath = path.resolve(__dirname, 'config.json');

// Auto-create config.json if missing
if (!fs.existsSync(configPath)) {
  const defaultConfig = {
    token: '',
    clientId: '',
    guildId: ''
  };
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  console.log('config.json not found. Created default config.json. Please fill it in and restart the bot.');
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
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

bot.commands = new Collection();
bot.modules = new Collection();
bot.roleMenuReactions = new Map();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.on('line', (input) => {
  if (input.trim().toLowerCase() === 'stop') {
    console.log('Stopping bot...');
    process.exit(0);
  }
});

(async () => {
  await loadModules(bot);

  // Prepare commands for registration
  const commands = [...bot.commands.values()].map(cmd => cmd.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(config.token);

  try {
    console.log('🔄 Registering slash commands...');
    // Register globally (slow update) or use Routes.applicationGuildCommands(config.clientId, config.guildId) for guild-only
    await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: commands }
    );
    console.log('✅ Slash commands registered.');
  } catch (error) {
    if (error.code === 20012) {
      console.error('❌ Unauthorized: Check your clientId and bot token in config.json.');
    } else {
      console.error('❌ Error registering slash commands:', error);
    }
    process.exit(1);
  }

  try {
    await bot.login(config.token);
    console.log(`✅ Logged in as ${bot.user.tag}`);
  } catch (loginError) {
    if (loginError.message.includes('An invalid token was provided')) {
      console.error('❌ Invalid token. Check your config.json.');
    } else {
      console.error('❌ Login failed:', loginError);
    }
    process.exit(1);
  }
})();

// Handle slash commands
bot.on('interactionCreate', async interaction => {
  if (interaction.isCommand()) {
    const command = bot.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction, bot);
    } catch (error) {
      console.error(error);
      if (!interaction.replied) {
        await interaction.reply({ content: '❌ Error executing command.', ephemeral: true });
      }
    }
  }
});

// Handle select menu and other interactions forwarded to modules
bot.on('interactionCreate', async interaction => {
  if (interaction.isStringSelectMenu()) {
    // Loop through all commands/modules with a handle() function
    for (const cmd of bot.commands.values()) {
      if (typeof cmd.handle === 'function') {
        try {
          await cmd.handle(interaction, bot);
        } catch (error) {
          console.error('Error handling interaction:', error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
          }
        }
      }
    }
  }
});
