# AlterBot

AlterBot is an **open-source, modular Discord bot** built using [Discord.js](https://discord.js.org). Designed to be simple, flexible, and extendable with minimal effort — perfect for community servers, developer learning, or adding your own features quickly.

---

## 🔧 Features

- 🔌 Modular command system (/modules)
- 💬 Slash command support
- 🧠 Interactive and admin-only features (like bot status control)
- 📂 Auto-generated config on first run
- 🧪 Built-in intent tester and CLI command interface

---

## 🚀 Getting Started

### 1. Download the Repository

### 2. Install Dependencies

```bash
npm install
```
### 3. Configure the Bot

Run the bot once to generate `config.json`:

```bash
node bot.js
```


You'll see:

```json
{
  "token": "",
  "clientId": "",
  "guildId": ""
}
```


Edit the file and add your bot\'s credentials from the [Discord Developer Portal](https://discord.com/developers/applications).

```js
| Field      | Description                                       |
|------------|---------------------------------------------------|
| token    | Your bot token                                     |
| clientId | The Application (Client) ID                        |
| guildId  | (Optional) Test server ID for faster dev commands  |
```

---

## ✅ Running the Bot

```bash
node bot.js
```


The bot will load modules from the modules/ folder, register slash commands, and log in.

---

## 🧱 Creating a Module

Modules go in `/modules` and support both **slash commands** and **event-based code**.

### 🔹 Slash Command Module
```js
// modules/ping.js
const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!"),

  async execute(interaction) {
    await interaction.reply("🏓 Pong!");
  },
};```


### 🔹 Event or Init Module
```js
// modules/onReady.js
module.exports = {
  async init(bot) {
    bot.once("ready", () => {
      console.log(✅ Bot is ready as \${bot.user.tag});
    });
  },
};
```

---

## ⚙️ Example: Bot Status Command

```bash
/botstatus set type:Playing message:"Hello World" status:online
```


Or use scrolling statuses:

```bash
/botstatus scroll type:Watching messages:"Server 1,Server 2,Server 3" interval:10
```

To stop scrolling:

```bash
/botstatus stopscroll
```

---

## 🤝 Contributing

Pull requests are welcome! To contribute:

- Add new features as modules in /modules
- Use SlashCommandBuilder for commands
- Use .init() for background/event logic
- Follow the existing file structure and code style

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

Made with ❤️ by [Basper](https://github.com/BasperLasper)' > README.md
