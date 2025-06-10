// 📁 modules/tickets.js
const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

const CONFIG_DIR = path.join(__dirname, '..', 'modules_configs', 'Tickets');
const DATA_DIR = path.join(CONFIG_DIR, 'Data');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Create config directories/files
if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({
    categories: {
      "Minecraft Issues": {
        categoryId: null,
        children: {
          "Server Related": {
            categoryId: null,
            children: {
              "Hub": { categoryId: null, questions: ["What issue are you experiencing in Hub?"] },
              "Prison": { categoryId: null, questions: ["What issue are you experiencing in Prison?"] },
              "Skyblock": { categoryId: null, questions: ["What issue are you experiencing in Skyblock?"] }
            }
          },
          "Client Related": {
            categoryId: null,
            questions: ["What client are you using?", "What mods are installed?"]
          }
        }
      }
    },
    waitingCategoryId: null
  }, null, 2));
  console.log("📝 Created default Tickets config.");
}

const config = require(CONFIG_FILE);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('new')
    .setDescription('Create a new support ticket.'),
  aliases: ['-new'],

  async execute(interaction, bot) {
    await interaction.deferReply({ flags: 64 });

    const ticketNumber = Date.now();
    const channelName = `ticket-${ticketNumber}`;
    const guild = interaction.guild;
    const member = interaction.member;

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: config.waitingCategoryId ?? null,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
      ]
    });

    await interaction.editReply(`🎟 Ticket created: ${channel}`);
    handleCategorySelection(bot, channel, member, config.categories);
  },

  async handle(interaction, bot) {
    if (!interaction.isStringSelectMenu()) return;

    const [type, ticketId] = interaction.customId.split(':');
    if (!interaction.channel || !interaction.guild) return;

    const statePath = path.join(DATA_DIR, `${interaction.channel.id}.json`);
    let state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath)) : null;

    const selected = interaction.values[0];
    let selectedData = state.current[selected] ?? state.current.children?.[selected];

    if (selectedData) {
      if (selectedData.children) {
        state.current = selectedData;
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
        return showSelectMenu(interaction.channel, 'category', Object.keys(selectedData.children), 'Choose a sub-category:');
      }

      if (selectedData.questions) {
        state.current = selectedData;
        state.questions = selectedData.questions;
        state.answers = [];
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
        return askQuestions(interaction.channel, interaction.user, state);
      }
    }
    await interaction.reply({ content: '❌ Invalid selection. Please try again.', ephemeral: true });
  }
};

async function handleCategorySelection(bot, channel, member, tree) {
  const state = {
    current: tree,
    questions: [],
    answers: []
  };

  fs.writeFileSync(path.join(DATA_DIR, `${channel.id}.json`), JSON.stringify(state, null, 2));
  await showSelectMenu(channel, 'category', Object.keys(tree), 'Choose a category:');
}

async function showSelectMenu(channel, id, options, placeholder) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${id}:${channel.id}`)
    .setPlaceholder(placeholder)
    .addOptions(options.map(opt => ({ label: opt, value: opt })));

  const row = new ActionRowBuilder().addComponents(menu);
  await channel.send({ content: placeholder, components: [row] });
}

async function askQuestions(channel, user, state) {
  const statePath = path.join(DATA_DIR, `${channel.id}.json`);

  for (const question of state.questions) {
    const qMsg = await channel.send(`<@${user.id}> ❓ ${question}`);
    const collected = await channel.awaitMessages({
      filter: m => m.author.id === user.id,
      max: 1,
      time: 120000,
      errors: ['time']
    }).catch(() => null);

    if (!collected) {
      await channel.send('⏱️ Ticket timed out.');
      return;
    }

    const answer = collected.first();
    state.answers.push({ question, answer: answer.content });
    await qMsg.delete();
    await answer.delete();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  }

  await finalizeTicket(channel, user, state);
}

async function finalizeTicket(channel, user, state) {
  const embedChunks = [];
  let current = new EmbedBuilder()
    .setTitle('📝 Ticket Summary')
    .setColor(0x3498db)
    .setTimestamp();

  let fieldCount = 0;
  for (const qa of state.answers) {
    current.addFields({ name: qa.question, value: qa.answer });
    fieldCount++;
    if (fieldCount >= 5) {
      embedChunks.push(current);
      current = new EmbedBuilder().setColor(0x3498db);
      fieldCount = 0;
    }
  }
  if (fieldCount > 0) embedChunks.push(current);

  for (const embed of embedChunks) {
    await channel.send({ embeds: [embed] });
  }

  try {
    const finalCategoryId = state.current.categoryId;
    if (finalCategoryId) await channel.setParent(finalCategoryId);
  } catch (e) {
    console.warn('Category move skipped or failed:', e.message);
  }
}
