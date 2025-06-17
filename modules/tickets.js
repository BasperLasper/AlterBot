const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require('discord.js');
const discordTranscripts = require('discord-html-transcripts');

const CONFIG_DIR = path.join(__dirname, '..', 'modules_configs', 'Tickets');
const DATA_DIR = path.join(CONFIG_DIR, 'Data');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const COUNTER_FILE = path.join(DATA_DIR, 'ticket_counter.json');
const LOGS_ENABLED = process.argv.includes('--logs');
const log = (...args) => {
  if (LOGS_ENABLED) console.log('[TICKETS]', ...args);
};

if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({
    "categories": {
      "Pocket Edition": {
        "categoryId": null,
        "staffRoleIds": ["1234567890"],
        "questions": ["What's your issue?"]
      },
      "Java": {
        "categoryId": null,
        "staffRoleIds": ["1234567890"],
        "children": {
          "Hub": {
            "categoryId": null,
            "staffRoleIds": ["1234567890"],
            "questions": ["What's your issue?"]
          },
          "Factions": {
            "categoryId": null,
            "staffRoleIds": ["1234567890"],
            "questions": [
              "What's your username?",
              "What's the issue?"
            ]
          }
        }
      }
    },
    "waitingCategoryId": null,
    "responsedCategoryId": null,
    "transcripts": {
      "enabled": true,
      "channelId": null,
      "dmCreator": true,
      "dmCloser": true,
      "commandsEnabled": true,
      "uploadURL": null,
      "uploadURLPrefix": "https://yourdomain.com/transcripts/",
      "transcriptRoles": [],
      "closingRoles": [],
      "mentionRoles": []
    }
  }
  , null, 2));
}
if (!fs.existsSync(COUNTER_FILE)) fs.writeFileSync(COUNTER_FILE, JSON.stringify({ last: 0 }, null, 2));

const config = require(CONFIG_FILE);

function getNextTicketName() {
  const counter = JSON.parse(fs.readFileSync(COUNTER_FILE));
  counter.last += 1;
  fs.writeFileSync(COUNTER_FILE, JSON.stringify(counter, null, 2));
  return `ticket-${String(counter.last).padStart(4, '0')}`;
}

function findStaffRoleIds(categories, path = []) {
  if (!path.length) return [];
  let node = categories[path[0]];
  if (!node) return [];

  for (let i = 1; i < path.length; i++) {
    node = node.children?.[path[i]];
    if (!node) break;
  }

  for (let i = path.length; i >= 1; i--) {
    let checkNode = categories[path[0]];
    for (let j = 1; j < i; j++) {
      checkNode = checkNode?.children?.[path[j]];
    }
    if (Array.isArray(checkNode?.staffRoleIds)) return checkNode.staffRoleIds;
  }

  return [];
}

module.exports = {
  data: new SlashCommandBuilder()
      .setName('new')
      .setDescription('Create a new support ticket.'),
  aliases: ['-new', 'transcript', '-transcript', 'close', '-close'],
  run: async (bot) => {
      bot.on('messageCreate', async (message) => {
        log("Ticket auto-move logic initialized.");
        if (
              message.author.bot ||
              !message.guild ||
              !message.channel.name?.startsWith('ticket-')
          ) return;
          log(`📥 Message received in ${message.channel?.name}`);
          const statePath = path.join(DATA_DIR, `${message.channel.id}.json`);
          if (!fs.existsSync(statePath)) return;

          const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
          const staffRoleIds = findStaffRoleIds(config.categories, state.path);
          const isStaff = message.member?.roles.cache.some(role => staffRoleIds.includes(role.id));
          const isCreator = message.author.id === state.creatorId;

          const currentCategoryId = message.channel.parentId;
          const assignedCategoryId = state.current?.categoryId;
          const waitingCategoryId = config.waitingCategoryId;
          const responsedCategoryId = config.responsedCategoryId;

          // Staff response → move to Responsed category
          if (isStaff && responsedCategoryId && currentCategoryId !== responsedCategoryId) {
              try {
                  await message.channel.setParent(responsedCategoryId);
                  log(`✅ Moved ticket ${message.channel.name} to Responsed category`);
                } catch (err) {
                  console.warn(`❌ Failed to move to Responsed: ${err.message}`);
              }
          }

          // Creator or non-staff response → move back to original or waiting
          if (!isStaff && (currentCategoryId !== assignedCategoryId && currentCategoryId !== waitingCategoryId)) {
              const targetCategoryId = assignedCategoryId ?? waitingCategoryId;
              if (targetCategoryId) {
                  try {
                      await message.channel.setParent(targetCategoryId);
                      log(`✅ Moved ticket ${message.channel.name} back to ${targetCategoryId}`);
                    } catch (err) {
                      console.warn(`❌ Failed to move back to original: ${err.message}`);
                  }
              }
          }
      })
  },
  async execute(interaction, bot) {
      const isSlash = interaction.isChatInputCommand?.();
      const cmd = isSlash ? interaction.commandName : interaction.content?.split(' ')[0]?.slice(1);

      if (config.transcripts?.commandsEnabled && ['transcript', '-transcript'].includes(cmd)) {
          return await handleTranscriptCommand(interaction);
      }

      if (['close', '-close'].includes(cmd)) {
          return await handleCloseCommand(interaction);
      }

      await interaction.deferReply({
          flags: 64
      });

      const channelName = getNextTicketName();
      const guild = interaction.guild;
      const member = interaction.member;

      const overwrites = [{
              id: guild.id,
              deny: [PermissionFlagsBits.ViewChannel]
          },
          {
              id: member.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
          }
      ];
      const staffRoleIds = config.categories?.["Minecraft Issues"]?.staffRoleIds ?? [];
      for (const roleId of staffRoleIds) {
          overwrites.push({
              id: roleId,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
          });
      }

      const channel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: config.waitingCategoryId ?? null,
          permissionOverwrites: overwrites
      });
      log(`🎟️ Ticket ${channelName} created by ${member.user.tag}`);
      await interaction.editReply(`🎟 Ticket created: ${channel}`);
      handleCategorySelection(bot, channel, member, config.categories);
  },

  async handle(interaction, bot) {
      if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;

      const [type, ticketId, creatorId] = interaction.customId.split(':');
      const statePath = path.join(DATA_DIR, `${interaction.channel.id}.json`);
      const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath)) : null;
      if (!state) return;

      const userId = interaction.user.id;
      const isCloser = userId === creatorId || interaction.member.roles.cache.some(r => config.transcripts?.closingRoles?.includes(r.id));

      if (interaction.isButton()) {
          if (type === 'close') {
              if (!isCloser) return interaction.reply({
                  content: '❌ You do not have permission to close this ticket.',
                  ephemeral: true
              });

              const confirm = new ButtonBuilder().setCustomId(`confirm:${ticketId}:${creatorId}`).setLabel('✅ Confirm Close').setStyle(ButtonStyle.Danger);
              const cancel = new ButtonBuilder().setCustomId(`cancel:${ticketId}:${creatorId}`).setLabel('❎ Cancel').setStyle(ButtonStyle.Secondary);
              const row = new ActionRowBuilder().addComponents(confirm, cancel);

              return await interaction.reply({
                  content: '⚠️ Are you sure you want to close this ticket?',
                  components: [row],
                  ephemeral: true
              });
          }

          if (type === 'confirm') {
              if (!isCloser) return;
              await interaction.deferUpdate();
              await handleClose(interaction.channel, creatorId, userId, interaction.member);
              return;
          }

          if (type === 'cancel') {
              if (!isCloser) return;
              await interaction.reply({
                  content: '✅ Ticket closure cancelled.',
                  ephemeral: true
              });
              return;
          }
      }

      // Select Menu Handler
      if (!interaction.values?.length) return;

      const selected = interaction.values[0];
      if (type === 'category') {
          const branch = state.current.children?.[selected];
          if (!branch) return;

          state.current = branch;
          state.path = [...(state.path || []), selected];
          fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

          const embed = buildSummaryEmbed(state.path, state.answers);
          const messages = await interaction.channel.messages.fetch({
              limit: 10
          });
          const botMsg = messages.filter(m => m.author.id === interaction.client.user.id && m.embeds.length).first();
          if (botMsg) await botMsg.edit({
              embeds: [embed]
          });

          await interaction.message.delete().catch(() => {});
          if (branch.children) {
              return await showSelectMenu(interaction.channel, `category:${interaction.channel.id}:${interaction.user.id}`, Object.keys(branch.children), 'Choose a sub-category:');
          }

          if (branch.questions) {
              state.questions = branch.questions;
              state.answers = [];
              fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
              return await askQuestions(interaction.channel, interaction.user, state);
          }
      }
  }
};

async function handleClose(channel, creatorId, closerId, closerMember) {
  const statePath = path.join(DATA_DIR, `${channel.id}.json`);
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath)) : null;
  if (!state) return;

  try {
    if (state.current.categoryId) await channel.setParent(state.current.categoryId);
  } catch {}

  const staffRoleIds = findStaffRoleIds(config.categories, state.path);
  for (const roleId of staffRoleIds) {
    try {
      await channel.permissionOverwrites.edit(roleId, { ViewChannel: true, SendMessages: true });
    } catch {}
  }

  if (config.transcripts?.enabled) {
    const transcript = await discordTranscripts.createTranscript(channel, {
      limit: -1,
      returnType: 'attachment',
      fileName: `${channel.name}.html`,
      poweredBy: false,
      preamble: {
        content: `📋 Transcript from **${channel.guild.name}**`,
        embeds: [
          {
            title: `Server: ${channel.guild.name}`,
            thumbnail: {
              url: channel.guild.iconURL({ extension: 'png', size: 256 })
            },
            description: `Transcript for ticket **${channel.name}**`,
            color: 0x5865f2,
            timestamp: new Date().toISOString()
          }
        ]
      }
    });
    log(`📄 Transcript ${transcript.name} created for ${channel.name}`);

    const nowUnix = Math.floor(Date.now() / 1000);
    const closerMention = `<@${closerId}>`;
    const closerRole = closerMember.roles.cache.find(r => config.transcripts?.mentionRoles?.includes(r.id));
    const roleLine = closerRole ? ` (${closerRole.name})` : '';

    const transcriptChannel = config.transcripts.channelId ? await channel.guild.channels.fetch(config.transcripts.channelId).catch(() => null) : null;
    let transcriptUrl = null;

    if (config.transcripts.uploadURL) {
      try {
        const form = new FormData();
        form.append('file', transcript.attachment, transcript.name);
        form.append('channel_id', channel.id);

        const res = await axios.post(config.transcripts.uploadURL, form, { headers: form.getHeaders() });
        if (res.data?.filename && config.transcripts.uploadURLPrefix) {
          const safePrefix = config.transcripts.uploadURLPrefix.replace(/\/$/, ''); // removes trailing slash if present
          transcriptUrl = `${safePrefix}/${res.data.filename}`;
        }
        
              } catch (e) {
        console.warn('Transcript upload failed. Falling back to Discord upload.');
      }
    }

    if (transcriptChannel?.isTextBased()) {
      const messageContent = [
        `🗃️ **Ticket Closed**: <#${channel.id}>`,
        `👤 Creator: <@${creatorId}>`,
        `🔒 Closed by: ${closerMention}${roleLine}`,
        `🕒 <t:${nowUnix}:F>`,
        transcriptUrl ? `📄 Transcript: ${transcriptUrl}` : null
      ].filter(Boolean).join('\n');

      await transcriptChannel.send({
        content: messageContent,
        files: transcriptUrl ? [] : [transcript]
      });
    }

    if (config.transcripts.dmCreator && closerId !== creatorId) {
      const creator = await channel.guild.members.fetch(creatorId).catch(() => null);
      if (creator?.send) {
        const message = transcriptUrl ? transcriptUrl : { files: [transcript] };
        await creator.send({ content: `📁 Transcript for your ticket in ${channel.guild.name}`, ...message }).catch(() => {});
      }
    }

    if (config.transcripts.dmCloser) {
      const closer = await channel.guild.members.fetch(closerId).catch(() => null);
      if (closer?.send) {
        const message = transcriptUrl ? transcriptUrl : { files: [transcript] };
        await closer.send({ content: `📁 Transcript for closed ticket in ${channel.guild.name}`, ...message }).catch(() => {});
      }
    }
  }

  await channel.delete().catch(() => {});
}

async function handleCloseCommand(interaction) {
  const channel = interaction.channel;
  if (!channel.name?.startsWith('ticket-')) {
    return await interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
  }

  const statePath = path.join(DATA_DIR, `${channel.id}.json`);
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath)) : null;
  if (!state) return;

  const isCloser = interaction.user.id === state.creatorId ||
    interaction.member.roles.cache.some(r => config.transcripts?.closingRoles?.includes(r.id));

  if (!isCloser) {
    return await interaction.reply({ content: '❌ You do not have permission to close this ticket.', ephemeral: true });
  }

  return await handleClose(channel, state.creatorId, interaction.user.id, interaction.member);
}

async function handleTranscriptCommand(interaction) {
  if (!interaction.member.roles.cache.some(r => config.transcripts?.transcriptRoles?.includes(r.id))) return interaction.reply({ content: '❌ You do not have permission to generate transcripts.', ephemeral: true })
  
  const target = interaction.options?.getChannel?.('channel') || interaction.mentions?.channels?.first() || interaction.channel;
  if (!target?.name?.startsWith('ticket-')) {
    return await interaction.reply({ content: '❌ This is not a valid ticket channel.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const transcript = await discordTranscripts.createTranscript(target, {
    limit: -1,
    returnType: 'attachment',
    fileName: `${target.name}.html`,
    poweredBy: false
  });

  // Try upload
  let transcriptUrl = null;
  if (config.transcripts?.uploadURL) {
    try {
      const form = new FormData();
      form.append('file', transcript.attachment, transcript.name);
      form.append('channel_id', target.id);

      const res = await axios.post(config.transcripts.uploadURL, form, {
        headers: form.getHeaders()
      });
      if (res.data?.url) {
        transcriptUrl = `${config.transcripts.publicURLPrefix.replace(/\/$/, '')}/${res.data.url.replace(/^\//, '')}`;
      }
          } catch (err) {
      console.warn('Transcript upload failed in -transcript command:', err.message);
    }
  }

  // Send result
  if (transcriptUrl) {
     await interaction.editReply({
      content: `📎 Transcript uploaded: ${transcriptUrl}`
    });
    return   log(`🌐 Transcript uploaded to: ${transcriptUrl}`);

  } else {
    await interaction.editReply({
      content: `📎 Transcript generated:`,
      files: [transcript]
    });
    return   log(`🌐 Transcript upload failed to: ${transcriptUrl}`);
  }
}


async function handleCategorySelection(bot, channel, member, tree) {
  const state = {
    current: { children: tree },
    path: [],
    questions: [],
    answers: [],
    creatorId: member.id
  };

  const statePath = path.join(DATA_DIR, `${channel.id}.json`);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

  await channel.send({ embeds: [buildSummaryEmbed([])] });
  await showSelectMenu(channel, `category:${channel.id}:${member.id}`, Object.keys(tree), 'Choose a category:');
}

async function showSelectMenu(channel, customId, options, placeholder) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(options.map(opt => ({ label: opt, value: opt })));

  const row = new ActionRowBuilder().addComponents(menu);
  await channel.send({ content: placeholder, components: [row] });
}

function buildSummaryEmbed(pathArray, answers = []) {
  const embed = new EmbedBuilder()
    .setTitle('📝 Ticket Summary')
    .setColor(0x00AE86)
    .setTimestamp();

  const description = pathArray.map((p, i) => `${'➤'.repeat(i + 1)} ${p}`).join('\n');
  if (description.length > 0) embed.setDescription(description);
  for (const a of answers) embed.addFields({ name: a.question, value: a.answer });

  return embed;
}

async function askQuestions(channel, user, state) {
  const statePath = path.join(DATA_DIR, `${channel.id}.json`);
  const messages = await channel.messages.fetch({ limit: 10 });
  const embedMsg = messages.find(m => m.author.id === channel.client.user.id && m.embeds.length);

  for (const question of state.questions) {
    const qMsg = await channel.send(`<@${user.id}> ❓ ${question}`);
    const collected = await channel.awaitMessages({ filter: m => m.author.id === user.id, max: 1, time: 120000 }).catch(() => null);
    if (!collected) {
      await channel.send('⏱️ Ticket timed out.');
      return;
    }

    const answer = collected.first();
    state.answers.push({ question, answer: answer.content });
    await qMsg.delete();
    await answer.delete();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    if (embedMsg) await embedMsg.edit({ embeds: [buildSummaryEmbed(state.path, state.answers)] });
  }

  await finalizeTicket(channel, user, state);
}

async function finalizeTicket(channel, user, state) {
  try {
    const finalCategoryId = state.current.categoryId;
    if (finalCategoryId) await channel.setParent(finalCategoryId);
  } catch {}

  const staffRoleIds = findStaffRoleIds(config.categories, state.path);
  for (const roleId of staffRoleIds) {
    try {
      await channel.permissionOverwrites.edit(roleId, { ViewChannel: true, SendMessages: true });
    } catch {}
  }

  const closeButton = new ButtonBuilder()
    .setCustomId(`close:${channel.id}:${user.id}`)
    .setLabel('Close Ticket')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(closeButton);
  await channel.send({ content: staffRoleIds.map(id => `<@&${id}>`).join(' ') + ' ✅ Ticket completed.', components: [row] });
}
