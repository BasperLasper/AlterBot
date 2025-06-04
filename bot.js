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
  process.exit(0); // Exit so user can edit config before running bot
}

const config = require(configPath);

const bot = new Client({
  intents: [
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
  const command = input.trim().toLowerCase();

  if (command === 'stop') {
    console.log('Stopping bot...');
    process.exit(0);
  }
});

(async () => {
  // Load all modules (like roleMenu.js)
  await loadModules(bot);

  // Prepare slash command data
  const commands = [...bot.commands.values()].map(cmd => cmd.data.toJSON());

  const rest = new REST({ version: '10' }).setToken(config.token);
  try {
    console.log('🔄 Registering slash commands...');

    // GLOBAL COMMANDS (slower to update)
    await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: commands }
    );

    // FOR FASTER TESTING (uncomment to register only in 1 server):
    // await rest.put(
    //     Routes.applicationGuildCommands(config.clientId, config.guildId),
    //     { body: commands }
    // );

    console.log('✅ Slash commands registered.');
  } catch (error) {
    console.error('❌ Error registering slash commands:', error);
  }

  try {
    await bot.login(config.token);
    console.log(`✅ Successfully logged in as ${bot.user.tag}`);
  } catch (loginError) {
    if (loginError.message.includes('An invalid token was provided')) {
      console.error('❌ Failed to login: The bot token is invalid. Please check your token in config.json');
    } else {
      console.error('❌ Failed to login:', loginError);
    }
    process.exit(1);
  }
  
})();

// Global command interaction handler
bot.on('interactionCreate', async interaction => {
  if (interaction.isCommand()) {
    const command = bot.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: '❌ There was an error executing this command.', ephemeral: true });
    }
  }
});
