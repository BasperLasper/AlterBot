const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const { loadModules } = require('./utils/loader');
const config = require('./config.json');

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

(async () => {
    await loadModules(bot);
    await bot.login(config.token);
})();
