const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Partials, REST, Routes } = require('discord.js');
const { loadModules } = require('./utils/loader');
const readline = require('readline');

const configPath = path.resolve(__dirname, 'config.json');

if (!fs.existsSync(configPath)) {
  const defaultConfig = { token: '', clientId: '', guildId: '' };
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

  // Avoid duplicate command registration
  const registered = new Set();
  const commands = [];

  for (const cmd of bot.commands.values()) {
    if (cmd.data && !registered.has(cmd.data.name)) {
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

// Handle select menu and other forwarded interactions
bot.on('interactionCreate', async interaction => {
  if (interaction.isStringSelectMenu()) {
    for (const cmd of bot.commands.values()) {
      if (typeof cmd.handle === 'function') {
        try {
          await cmd.handle(interaction, bot);
        } catch (error) {
          console.error('Error handling interaction:', error);
          if (!interaction.replied && !interaction.deferred) {
            //await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
          }
        }
      }
    }
  }
});

// Support dash-based commands like -new
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
