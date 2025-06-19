const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ChannelType,
  ButtonStyle,
  StringSelectMenuBuilder,
  GuildCategory
} = require('discord.js');
const discordTranscripts = require('discord-html-transcripts');

const CONFIG_DIR = path.join(__dirname, '..', 'modules_configs', 'Tickets');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const DB_FILE = path.join(CONFIG_DIR, 'tickets.db');
const LOGS_ENABLED = process.argv.includes('--logs');
const log = (...args) => {
  if (LOGS_ENABLED) console.log('[TICKETS]', ...args);
};

// Initialize config.json if it doesn't exist
if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeFileSync(
    CONFIG_FILE,
    JSON.stringify(
      {
        categories: {
          'Pocket Edition': {
            categoryId: null,
            staffRoleIds: ['1234567890'],
            questions: ["What's your issue?"],
          },
          Java: {
            categoryId: null,
            staffRoleIds: ['1234567890'],
            children: {
              Hub: {
                categoryId: null,
                staffRoleIds: ['1234567890'],
                questions: ["What's your issue?"],
              },
              Factions: {
                categoryId: null,
                staffRoleIds: ['1234567890'],
                questions: ["What's your username?", "What's the issue?"],
              },
            },
          },
        },
        waitingCategoryId: null,
        responsedCategoryId: null,
        selectMenuTimeout: 600000, // 10 minutes in ms
        questionsTimeout: 1800000, // 30 minutes in ms
        transcripts: {
          enabled: true,
          channelId: null,
          dmCreator: true,
          dmCloser: true,
          commandsEnabled: true,
          uploadURL: null,
          uploadURLPrefix: 'https://yourdomain.com/transcripts/',
          transcriptRoles: [],
          closingRoles: [],
          mentionRoles: [],
        },
      },
      null,
      2
    )
  );
}

const config = require(CONFIG_FILE);

// Store active timeouts for select menus, questions, and autoclose
const selectMenuTimeouts = new Map();
const questionTimeouts = new Map();
const autocloseTimeouts = new Map();
let botInstance = null;

function initializeDatabase() {
  const db = new Database(DB_FILE);

  // Create tickets table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guildid TEXT NOT NULL,
      channelid TEXT NOT NULL UNIQUE,
      creator_id TEXT NOT NULL,
      date_created TEXT NOT NULL,
      date_closed TEXT,
      category_path TEXT NOT NULL,
      current_category TEXT NOT NULL,
      questions TEXT NOT NULL,
      answers TEXT NOT NULL,
      active_status TEXT NOT NULL CHECK (active_status IN ('open', 'closed')),
      assigned TEXT
    );
  `);

  // Create autoclose table
  db.exec(`
    CREATE TABLE IF NOT EXISTS autoclose (
      channelid TEXT PRIMARY KEY,
      close_at TEXT NOT NULL,
      reason TEXT NOT NULL
    );
  `);

  return db;
}

function getNextTicketName(db) {
  const lastTicket = db.prepare('SELECT id FROM tickets ORDER BY id DESC LIMIT 1').get();
  const nextId = lastTicket ? lastTicket.id + 1 : 1;
  return `ticket-${String(nextId).padStart(4, '0')}`;
}

function findStaffRoleIds(categories, path) {
  let node = categories;
  for (const key of path) {
    node = node[key]?.children || node[key];
    if (!node) return [];
  }
  while (node) {
    if (Array.isArray(node.staffRoleIds)) return node.staffRoleIds;
    node = Object.values(node.children || {})[0];
  }
  return [];
}

async function resolveMember(guild, input) {
  if (!guild || !input) return null;
  const id = input.match(/^<@!?(\d+)>$/)?.[1] || input.trim();
  try {
    return (
      (await guild.members.fetch(id)) ||
      guild.members.cache.find(
        (m) =>
          m.user.username.toLowerCase() === id.toLowerCase() ||
          m.displayName?.toLowerCase() === id.toLowerCase() ||
          `${m.user.username.toLowerCase()}#${m.user.discriminator}` === id.toLowerCase()
      ) ||
      (
        await guild.members.fetch({ query: id, limit: 10 })
      ).find(
        (m) =>
          m.user.username.toLowerCase() === id.toLowerCase() ||
          m.displayName?.toLowerCase() === id.toLowerCase() ||
          `${m.user.username.toLowerCase()}#${m.user.discriminator}` === id.toLowerCase()
      )
    );
  } catch {
    return null;
  }
}

function parseDuration(durationStr) {
  const match = durationStr.match(/^(\d+)([smhdw])$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = {
    s: 1000, // seconds
    m: 60 * 1000, // minutes
    h: 60 * 60 * 1000, // hours
    d: 24 * 60 * 60 * 1000, // days
    w: 7 * 24 * 60 * 60 * 1000, // weeks
  };
  return value * multipliers[unit];
}

function scheduleAutoclose(channel, closeAt, reason, db) {
  if (!botInstance) {
    console.warn(`Cannot schedule autoclose for channel ${channel.id}: botInstance is not defined`);
    return;
  }

  const msUntilClose = new Date(closeAt).getTime() - Date.now();
  if (msUntilClose <= 0) {
    handleClose(channel, null, botInstance.user.id, null, db, null, `Autoclose: ${reason}`);
    return;
  }

  const timeout = setTimeout(async () => {
    const autocloseRecord = db.prepare('SELECT * FROM autoclose WHERE channelid = ?').get(channel.id);
    if (!autocloseRecord) return; // Autoclose was canceled
    try {
      const ticket = db.prepare('SELECT * FROM tickets WHERE channelid = ?').get(channel.id);
      if (ticket && ticket.active_status === 'open') {
        await handleClose(channel, ticket.creator_id, botInstance.user.id, null, db, null, `Autoclose: ${reason}`);
      }
      db.prepare('DELETE FROM autoclose WHERE channelid = ?').run(channel.id);
    } catch (err) {
      console.warn(`Failed to autoclose channel ${channel.id}: ${err.message}`);
    }
    autocloseTimeouts.delete(channel.id);
  }, msUntilClose);

  autocloseTimeouts.set(channel.id, timeout);
  log(`Scheduled autoclose for channel ${channel.id} at ${closeAt}`);
}

async function initializeAutocloseTasks(db) {
  const autocloseTasks = db.prepare('SELECT * FROM autoclose').all();
  for (const task of autocloseTasks) {
    try {
      const channel = await botInstance.channels.fetch(task.channelid);
      scheduleAutoclose(channel, task.close_at, task.reason, db);
      log(`Loaded autoclose task for channel ${task.channelid} at ${task.close_at}`);
    } catch (err) {
      console.warn(`Failed to load autoclose task for channel ${task.channelid}: ${err.message}`);
    }
  }
}

function cleanup() {
  // Clear all timeouts to prevent stale callbacks
  for (const [channelId, timeout] of selectMenuTimeouts) {
    clearTimeout(timeout);
    selectMenuTimeouts.delete(channelId);
  }
  for (const [channelId, timeout] of questionTimeouts) {
    clearTimeout(timeout);
    questionTimeouts.delete(channelId);
  }
  for (const [channelId, timeout] of autocloseTimeouts) {
    clearTimeout(timeout);
    autocloseTimeouts.delete(channelId);
  }
  botInstance = null;
  log('Cleaned up ticket system timeouts');
}

module.exports = {
  commands: [
    new SlashCommandBuilder()
      .setName('new')
      .setDescription('Create a new support ticket.'),
    new SlashCommandBuilder()
      .setName('add')
      .setDescription('Add a user to the current ticket.')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('User to add').setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('remove')
      .setDescription('Remove a user from the current ticket.')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('User to remove').setRequired(true)
      ),
  ],
  aliases: ['-new', 'transcript', '-transcript', 'close', '-close', 'createticketmenu', 'autoclose', '-autoclose'],
  run: async (bot) => {
    botInstance = bot;
    const db = initializeDatabase();
    log('Ticket auto-move logic initialized.');

    // Initialize autoclose tasks after bot is ready
    bot.on('ready', async () => {
      log('Bot is ready, initializing autoclose tasks.');
      await initializeAutocloseTasks(db);
    });

    // Register cleanup on bot shutdown
    process.on('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });

    bot.on('messageCreate', async (message) => {
      if (
        message.author.bot ||
        !message.guild ||
        !message.channel.name?.startsWith('ticket-')
      )
        return;

      log(`📥 Message received in ${message.channel?.name}`);
      const state = db.prepare('SELECT * FROM tickets WHERE channelid = ?').get(message.channel.id);
      if (!state) return;

      state.category_path = JSON.parse(state.category_path);
      state.current_category = JSON.parse(state.current_category);
      state.questions = JSON.parse(state.questions);
      state.answers = JSON.parse(state.answers);

      const staffRoleIds = findStaffRoleIds(config.categories, state.category_path);
      const isStaff = message.member?.roles.cache.some((role) => staffRoleIds.includes(role.id));
      const isCreator = message.author.id === state.creator_id;

      // Check if message is from creator or added member to cancel autoclose
      const overwrites = message.channel.permissionOverwrites.cache;
      const isAddedMember = overwrites.some(
        (ow) => ow.id === message.author.id && ow.allow.has(PermissionFlagsBits.ViewChannel)
      );
      if ((isCreator || isAddedMember) && !isStaff) {
        const autocloseRecord = db
          .prepare('SELECT * FROM autoclose WHERE channelid = ?')
          .get(message.channel.id);
        if (autocloseRecord) {
          db.prepare('DELETE FROM autoclose WHERE channelid = ?').run(message.channel.id);
          if (autocloseTimeouts.has(message.channel.id)) {
            clearTimeout(autocloseTimeouts.get(message.channel.id));
            autocloseTimeouts.delete(message.channel.id);
          }
          await message.channel.send(
            `✅ Autoclose canceled due to activity from <@${message.author.id}>.`
          );
          log(`Autoclose canceled for channel ${message.channel.id} due to user activity`);
        }
      }

      const currentCategoryId = message.channel.parentId;
      const assignedCategoryId = state.current_category?.categoryId;
      const waitingCategoryId = config.waitingCategoryId;
      const responsedCategoryId = config.responsedCategoryId;
      async function checkAssigned(assigned) {
        const findUser = await resolveMember(message.guild, assigned)
        if (findUser) {
          let findAssignedCategory
            findAssignedCategory = message.guild.channels.cache.find(
            (ch) => ch.type === 4 && ch.name.toLowerCase() === findUser.user.username.toLowerCase()
          );
          if (!findAssignedCategory) {
            findAssignedCategory = message.guild.channels.create({
              name: findUser.user.username.toLowerCase(),
              type: 4, // Category type
              reason: `Created category for ${findUser.user.username.toLowerCase()}`,
              permissionOverwrites: [
                {
                  id: message.guild.id, // This is @everyone
                  deny: ['ViewChannel'],
                },
              ],
            });
          }
          return findAssignedCategory.id
        } else return log('user not found')
      }
      async function checkCategoryPermissions(categoryId) {
        const category = await message.guild.channels.fetch(categoryId);
        const everyoneOverwrite = category.permissionOverwrites.cache.get(message.guild.id);
        return everyoneOverwrite
          ? everyoneOverwrite.allow.has(PermissionFlagsBits.ViewChannel)
          : false;
      }

      if (isStaff && responsedCategoryId && currentCategoryId !== responsedCategoryId) {
        try {
          const canSeeResponsed = await checkCategoryPermissions(responsedCategoryId);
          if (canSeeResponsed) {
            await message.channel.permissionOverwrites.edit(message.guild.id, {
              ViewChannel: false,
            });
            log(`🔒 Denied @everyone permission to view the channel before moving.`);
          }

          const channelPermissions = message.channel.permissionOverwrites.cache;
          await message.channel.setParent(responsedCategoryId, { lockPermissions: false });
          log(`✅ Moved ticket ${message.channel.name} to Responsed category`);

          for (const [id, overwrite] of channelPermissions.entries()) {
            try {
              await message.channel.permissionOverwrites.edit(id, overwrite);
            } catch (err) {
              console.warn(`❌ Failed to reapply permission for ${id}: ${err.message}`);
            }
          }
        } catch (err) {
          console.warn(`❌ Failed to move to Responsed: ${err.message}`);
        }
      }
      const ticketAssigned = await checkAssigned(state.assigned)
      if (
        !isStaff &&
        currentCategoryId !== assignedCategoryId &&
        currentCategoryId !== waitingCategoryId &&
        currentCategoryId !== ticketAssigned
      ) {
        let targetCategoryId
        targetCategoryId = assignedCategoryId ?? waitingCategoryId;
        if (targetCategoryId) {
          if (state.assigned) targetCategoryId = ticketAssigned
          try {
            const canSeeTargetCategory = await checkCategoryPermissions(targetCategoryId);
            if (canSeeTargetCategory) {
              await message.channel.permissionOverwrites.edit(message.guild.id, {
                ViewChannel: false,
              });
              log(`🔒 Denied @everyone permission to view the channel before moving.`);
            }

            const channelPermissions = message.channel.permissionOverwrites.cache;
            await message.channel.setParent(targetCategoryId, { lockPermissions: false });
            log(`✅ Moved ticket ${message.channel.name} back to ${targetCategoryId}`);

            for (const [id, overwrite] of channelPermissions.entries()) {
              try {
                await message.channel.permissionOverwrites.edit(id, overwrite);
              } catch (err) {
                console.warn(`❌ Failed to reapply permission for ${id}: ${err.message}`);
              }
            }
          } catch (err) {
            console.warn(`❌ Failed to move back to original: ${err.message}`);
          }
        }
      }
    });

    // Handle channel deletion (e.g., by admin)
    bot.on('channelDelete', async (channel) => {
      if (!channel.name?.startsWith('ticket-')) return;
      log(`🗑️ Ticket channel ${channel.name} deleted`);

      const state = db.prepare('SELECT * FROM tickets WHERE channelid = ?').get(channel.id);
      if (!state) return;

      if (state.active_status === 'open') {
        db.prepare(`
          UPDATE tickets SET
            date_closed = ?,
            active_status = 'closed'
          WHERE channelid = ?
        `).run(new Date().toISOString(), channel.id);
        db.prepare('DELETE FROM autoclose WHERE channelid = ?').run(channel.id);
        if (autocloseTimeouts.has(channel.id)) {
          clearTimeout(autocloseTimeouts.get(channel.id));
          autocloseTimeouts.delete(channel.id);
        }
        log(`✅ Updated ticket ${channel.id} to closed in database`);
      }
    });

    log('Create Ticket Menu loading');
    bot.on('interactionCreate', async (interaction) => {
      if (!interaction.isButton()) return;
      if (interaction.customId !== 'create_ticket') return;

      log('Create Ticket Menu action started');
      const member = interaction.member;
      const guild = interaction.guild;

      const channelName = getNextTicketName(db);
      const overwrites = [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: member.id,
          allow: [PermissionFlagsBits.ViewChannel],
          deny: [PermissionFlagsBits.SendMessages],
        },
      ];

      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: config.waitingCategoryId ?? null,
        permissionOverwrites: overwrites,
      });

      log(`🎫 Ticket ${channelName} created by ${member.user.tag}`);
      const state = {
        current_category: { children: config.categories },
        category_path: [],
        questions: [],
        answers: [],
        creator_id: member.id,
      };

      db.prepare(`
        INSERT INTO tickets (
          guildid, channelid, creator_id, date_created, category_path, current_category, questions, answers, active_status, assigned
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        guild.id,
        channel.id,
        member.id,
        new Date().toISOString(),
        JSON.stringify(state.category_path),
        JSON.stringify(state.current_category),
        JSON.stringify(state.questions),
        JSON.stringify(state.answers),
        'open',
        null
      );

      await interaction.reply({
        content: `✅ Your ticket has been created: <#${channel.id}>`,
        ephemeral: true,
      });

      await handleCategorySelection(bot, channel, member, config.categories, db);
    });
  },

  async execute(interaction, bot) {
    const db = initializeDatabase();
    const isSlash = interaction.isChatInputCommand?.();
    const cmd = isSlash
      ? interaction.commandName
      : interaction.content?.split(' ')[0]?.slice(1)?.toLowerCase();

    if (cmd === 'createticketmenu' || cmd === '-createticketmenu') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: '❌ You do not have permission to use this command.',
          ephemeral: true,
        });
      }

      const supportButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('create_ticket')
          .setLabel('🎫 Create Support Ticket')
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.channel.send({
        content:
          '📩 **Need help?**\nIf you require assistance, please click the button below to open a support ticket. Our support team will respond as soon as possible.',
        components: [supportButton],
      });

      return interaction.reply({
        content: '✅ Ticket menu created.',
        ephemeral: true,
      });
    }

    if (cmd === 'add' || cmd === '-add') {
      const args = interaction.content?.split(' ').slice(1);
      let userToAdd;
      if (!args) userToAdd = await interaction?.options?.getUser('user');
      else userToAdd = await resolveMember(interaction.guild, args.join(' '));

      if (!userToAdd) {
        return interaction.reply({
          content: '❌ Please specify a user to add to the ticket.',
          ephemeral: true,
        });
      }

      const channel = interaction.channel;
      if (!channel.name?.startsWith('ticket-')) {
        return interaction.reply({
          content: '❌ This is not a ticket channel.',
          ephemeral: true,
        });
      }

      await channel.permissionOverwrites.edit(userToAdd.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });

      return interaction.reply({
        content: `✅ <@${userToAdd.id}> has been added to the ticket.`,
      });
    }

    if (cmd === 'remove' || cmd === '-remove') {
      const args = interaction.content?.split(' ').slice(1);
      let userToRemove;
      if (!args) userToRemove = await interaction?.options?.getUser('user');
      else userToRemove = await resolveMember(interaction.guild, args.join(' '));

      if (!userToRemove) {
        return interaction.reply({
          content: '❌ Could not find that user.',
          ephemeral: true,
        });
      }

      const channel = interaction.channel;
      if (!channel.name?.startsWith('ticket-')) {
        return interaction.reply({
          content: '❌ This is not a ticket channel.',
          ephemeral: true,
        });
      }

      const state = db.prepare('SELECT * FROM tickets WHERE channelid = ?').get(channel.id);
      if (!state) {
        return interaction.reply({
          content: '❌ Could not read ticket state.',
          ephemeral: true,
        });
      }

      state.category_path = JSON.parse(state.category_path);
      const isStaff = userToRemove?.roles?.cache?.some((r) =>
        config.transcripts?.mentionRoles?.includes(r.id)
      );
      const isCloser =
        interaction.user.id === state.creator_id ||
        interaction.member.roles.cache.some((r) =>
          config.transcripts?.closingRoles?.includes(r.id)
        );

      if (!isCloser) {
        return interaction.reply({
          content: '❌ Only the ticket creator or staff can remove members.',
          ephemeral: true,
        });
      }

      if (isStaff) {
        return interaction.reply({
          content: '❌ You cannot remove a staff member from a ticket.',
          ephemeral: true,
        });
      }

      await channel.permissionOverwrites.delete(userToRemove.id).catch(() => {});
      return interaction.reply({
        content: `✅ <@${userToRemove.id}> has been removed from the ticket.`,
      });
    }

    if (cmd === 'autoclose' || cmd === '-autoclose') {
      const channel = interaction.channel;
      if (!channel.name?.startsWith('ticket-')) {
        return interaction.reply({
          content: '❌ This is not a ticket channel.',
          ephemeral: true,
        });
      }

      const state = db.prepare('SELECT * FROM tickets WHERE channelid = ?').get(channel.id);
      if (!state) {
        return interaction.reply({
          content: '❌ Could not read ticket state.',
          ephemeral: true,
        });
      }

      const isStaff = interaction.member.roles.cache.some((r) =>
        config.transcripts?.closingRoles?.includes(r.id)
      );
      if (!isStaff) {
        return interaction.reply({
          content: '❌ Only staff can use the autoclose command.',
          ephemeral: true,
        });
      }

      const args = interaction.content?.split(' ').slice(1);
      if (args[0]?.toLowerCase() === 'cancel') {
        const autocloseRecord = db
          .prepare('SELECT * FROM autoclose WHERE channelid = ?')
          .get(channel.id);
        if (!autocloseRecord) {
          return interaction.reply({
            content: '❌ No autoclose scheduled for this ticket.',
            ephemeral: true,
          });
        }

        db.prepare('DELETE FROM autoclose WHERE channelid = ?').run(channel.id);
        if (autocloseTimeouts.has(channel.id)) {
          clearTimeout(autocloseTimeouts.get(channel.id));
          autocloseTimeouts.delete(channel.id);
        }
        return interaction.reply({
          content: '✅ Autoclose canceled for this ticket.',
        });
      }

      if (args.length < 2) {
        return interaction.reply({
          content: '❌ Usage: `-autoclose <duration> <reason>` or `-autoclose cancel`',
          ephemeral: true,
        });
      }

      const durationMs = parseDuration(args[0]);
      if (!durationMs) {
        return interaction.reply({
          content: '❌ Invalid duration format. Use e.g., `7d`, `2h`, `30m` (s/m/h/d/w).',
          ephemeral: true,
        });
      }

      const reason = args.slice(1).join(' ');
      const closeAt = new Date(Date.now() + durationMs).toISOString();

      db.prepare(`
        INSERT OR REPLACE INTO autoclose (channelid, close_at, reason)
        VALUES (?, ?, ?)
      `).run(channel.id, closeAt, reason);

      await channel.send({
        content: `<@${state.creator_id}> ⚠️ This ticket is scheduled to autoclose in ${args[0]} due to: ${reason}`,
      });

      scheduleAutoclose(channel, closeAt, reason, db);

      return;
    }

    if (config.transcripts?.commandsEnabled && ['transcript', '-transcript'].includes(cmd)) {
      return await handleTranscriptCommand(interaction);
    }

    if (['close', '-close'].includes(cmd)) {
      return await handleCloseCommand(interaction, db);
    }

    await interaction.deferReply({ flags: 64 });

    const channelName = getNextTicketName(db);
    const guild = interaction.guild;
    const member = interaction.member;

    const overwrites = [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: member.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
    ];

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: config.waitingCategoryId ?? null,
      permissionOverwrites: overwrites,
    });
    log(`🎫 Ticket ${channelName} created by ${member.user.tag}`);

    const state = {
      current_category: { children: config.categories },
      category_path: [],
      questions: [],
      answers: [],
      creator_id: member.id,
    };

    db.prepare(`
      INSERT INTO tickets (
        guildid, channelid, creator_id, date_created, category_path, current_category, questions, answers, active_status, assigned
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      guild.id,
      channel.id,
      member.id,
      new Date().toISOString(),
      JSON.stringify(state.category_path),
      JSON.stringify(state.current_category),
      JSON.stringify(state.questions),
      JSON.stringify(state.answers),
      'open',
      null
    );

    await interaction.editReply(`🎫 Ticket created: ${channel}`);
    await handleCategorySelection(bot, channel, member, config.categories, db);
  },

  async handle(interaction, bot) {
    const db = initializeDatabase();
    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;

    if (!interaction.customId || !interaction.customId.includes(':')) return;
    const [type, ticketId, creatorId] = interaction.customId.split(':');

    // Early exit if channel is null (e.g., after deletion)
    if (!interaction.channel) {
      try {
        await interaction.reply({
          content: '❌ This ticket channel no longer exists.',
          ephemeral: true,
        });
      } catch (err) {
        log(`Failed to respond to stale interaction: ${err.message}`);
      }
      return;
    }

    const state = db.prepare('SELECT * FROM tickets WHERE channelid = ?').get(interaction.channel.id);
    if (!state) {
      try {
        await interaction.reply({
          content: '❌ No ticket data found for this channel.',
          ephemeral: true,
        });
      } catch (err) {
        log(`Failed to respond to interaction with no state: ${err.message}`);
      }
      return;
    }

    state.category_path = JSON.parse(state.category_path);
    state.current_category = JSON.parse(state.current_category);
    state.questions = JSON.parse(state.questions);
    state.answers = JSON.parse(state.answers);

    const userId = interaction.user.id;
    const isCloser =
      userId === creatorId ||
      interaction.member.roles.cache.some((r) => config.transcripts?.closingRoles?.includes(r.id));

    if (interaction.isButton()) {
      if (type === 'close') {
        if (!isCloser)
          return interaction.reply({
            content: '❌ You do not have permission to close this ticket.',
            ephemeral: true,
          });

        const confirm = new ButtonBuilder()
          .setCustomId(`confirm:${ticketId}:${creatorId}`)
          .setLabel('✅ Confirm Close')
          .setStyle(ButtonStyle.Danger);
        const cancel = new ButtonBuilder()
          .setCustomId(`cancel:${ticketId}:${creatorId}`)
          .setLabel('❎ Cancel')
          .setStyle(ButtonStyle.Secondary);
        const row = new ActionRowBuilder().addComponents(confirm, cancel);

        await interaction.reply({
          content: '⚠️ Are you sure you want to close this ticket?',
          components: [row],
          ephemeral: true,
        }).catch(async () => {
          await interaction.editReply({
            content: '⚠️ Are you sure you want to close this ticket?',
            components: [row],
          });
        });

        return;
      }

      if (type === 'confirm') {
        if (!isCloser) return;

        try {
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('confirm-disabled')
              .setLabel('✅ Confirm Close')
              .setStyle(ButtonStyle.Danger)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('cancel-disabled')
              .setLabel('❎ Cancel')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );

          await interaction.update({
            content: '⏳ Generating transcript and closing the ticket...',
            components: [disabledRow],
          });
        } catch (err) {
          console.warn('Failed to update confirm message:', err.message);
        }

        await handleClose(interaction.channel, creatorId, userId, interaction.member, db, interaction);
        return;
      }

      if (type === 'cancel') {
        if (!isCloser) return;

        try {
          await interaction.update({
            content: '✅ Ticket closure cancelled.',
            components: [],
          });
        } catch (err) {
          console.error('❌ Interaction Error (cancel button):', err);
        }

        return;
      }
    }

    if (!interaction.values?.length) return;

    const selected = interaction.values[0];
    if (type === 'category') {
      // Clear any existing select menu timeout for this channel
      if (selectMenuTimeouts.has(interaction.channel.id)) {
        clearTimeout(selectMenuTimeouts.get(interaction.channel.id));
        selectMenuTimeouts.delete(interaction.channel.id);
      }

      const branch = state.current_category.children?.[selected];
      if (!branch)
        return interaction.channel.permissionOverwrites.edit(interaction.user, {
          ViewChannel: true,
          SendMessages: true,
        });

      state.current_category = branch;
      state.category_path = [...(state.category_path || []), selected];

      db.prepare(`
        UPDATE tickets SET
          category_path = ?,
          current_category = ?,
          questions = ?,
          answers = ?
        WHERE channelid = ?
      `).run(
        JSON.stringify(state.category_path),
        JSON.stringify(state.current_category),
        JSON.stringify(state.questions),
        JSON.stringify(state.answers),
        interaction.channel.id
      );

      const embed = buildSummaryEmbed(state.category_path, state.answers);
      const messages = await interaction.channel.messages.fetch({ limit: 10 });
      const botMsg = messages
        .filter((m) => m.author.id === interaction.client.user.id && m.embeds.length)
        .first();
      if (botMsg) await botMsg.edit({ embeds: [embed] });

      await interaction.message.delete().catch(() => {});
      if (branch.children) {
        return await showSelectMenu(
          interaction.channel,
          `category:${interaction.channel.id}:${interaction.user.id}`,
          Object.keys(branch.children),
          'Choose a sub-category:'
        );
      }

      if (branch.questions) {
        state.questions = branch.questions;
        state.answers = [];
        db.prepare(`
          UPDATE tickets SET
            questions = ?,
            answers = ?
          WHERE channelid = ?
        `).run(
          JSON.stringify(state.questions),
          JSON.stringify(state.answers),
          interaction.channel.id
        );
        return await askQuestions(interaction.channel, interaction.user, state, db, bot);
      }
    }
  },
};

async function handleClose(channel, creatorId, closerId, closerMember, db, interaction, reason = 'Manual closure') {
  const state = db.prepare('SELECT * FROM tickets WHERE channelid = ?').get(channel.id);
  if (!state) return;

  state.category_path = JSON.parse(state.category_path);
  state.current_category = JSON.parse(state.current_category);
  state.questions = JSON.parse(state.questions);
  state.answers = JSON.parse(state.answers);

  // Clear any timeouts
  if (selectMenuTimeouts.has(channel.id)) {
    clearTimeout(selectMenuTimeouts.get(channel.id));
    selectMenuTimeouts.delete(channel.id);
  }
  if (questionTimeouts.has(channel.id)) {
    clearTimeout(questionTimeouts.get(channel.id));
    questionTimeouts.delete(channel.id);
  }
  if (autocloseTimeouts.has(channel.id)) {
    clearTimeout(autocloseTimeouts.get(channel.id));
    autocloseTimeouts.delete(channel.id);
  }

  try {
    if (state.current_category.categoryId) await channel.setParent(state.current_category.categoryId);
  } catch {}

  const staffRoleIds = findStaffRoleIds(config.categories, state.category_path);
  for (const roleId of staffRoleIds) {
    try {
      await channel.permissionOverwrites.edit(roleId, { ViewChannel: true, SendMessages: true });
    } catch {}
  }

  if (config.transcripts?.enabled) {
    const { transcript, transcriptUrl } = await handleTranscriptGeneration(null, channel);
    log(`📄 Transcript ${transcript.name} created for ${channel.name}`);

    const nowUnix = Math.floor(Date.now() / 1000);
    const closerMention = closerId ? `<@${closerId}>` : 'Bot';
    const closerRole = closerMember?.roles.cache.find((r) =>
      config.transcripts?.mentionRoles?.includes(r.id)
    );
    const roleLine = closerRole ? ` (${closerRole.name})` : '';

    const transcriptChannel = config.transcripts?.channelId
      ? await channel.guild?.channels.fetch(config.transcripts.channelId).catch(() => null)
      : null;

    if (transcriptChannel?.isTextBased()) {
      const messageContent = [
        `🗃️ **Ticket Closed**: <#${channel.id}>`,
        `👤 Creator: <@${state.creator_id}>`,
        `🔒 Closed by: ${closerMention}${roleLine}`,
        `🕒 <t:${nowUnix}:F>`,
        `📝 Reason: ${reason}`,
        transcriptUrl ? `📄 Transcript: ${transcriptUrl}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      await transcriptChannel.send({
        content: messageContent,
        files: transcriptUrl ? [] : [transcript],
      });
    }

    if (config.transcripts.dmCreator && closerId !== state.creator_id) {
      const creator = await channel.guild.members.fetch(state.creator_id).catch(() => null);
      if (creator?.send) {
        if (transcriptUrl) {
          await creator
            .send({
              content: `📁 Transcript for your ticket in ${channel.guild.name}: ${transcriptUrl}\nReason: ${reason}`,
            })
            .catch(() => {});
        } else {
          await creator
            .send({
              content: `📁 Transcript for your ticket in ${channel.guild.name}\nReason: ${reason}`,
              files: [transcript],
            })
            .catch(() => {});
        }
      }
    }

    if (config.transcripts.dmCloser && closerId && closerId !== botInstance?.user?.id) {
      const closer = await channel.guild.members.fetch(closerId).catch(() => null);
      if (closer?.send) {
        if (transcriptUrl) {
          await closer
            .send({
              content: `📁 Transcript for closed ticket in ${channel.guild.name}: ${transcriptUrl}\nReason: ${reason}`,
            })
            .catch(() => {});
        } else {
          await closer
            .send({
              content: `📁 Transcript for closed ticket in ${channel.guild.name}\n${reason}`,
              files: [transcript],
            })
            .catch(() => {});
        }
      }
    }
  }

  db.prepare(`
    UPDATE tickets SET
      date_closed = ?,
      active_status = 'closed'
    WHERE channelid = ?
  `).run(new Date().toISOString(), channel.id);
  db.prepare('DELETE FROM autoclose WHERE channelid = ?').run(channel.id);
  try {
    await channel.delete();
    log(`🗑️ Ticket channel ${channel.name} deleted`);
  } catch (e) {
    log('Ticket channel could not be deleted due to error')
  }
  // Defer channel deletion to ensure interaction response is sent
  try {
    if (interaction) {
      await interaction.followUp({
        content: `✅ Ticket closed successfully. Reason: ${reason}`,
        ephemeral: true,
      });
    } else {
      await channel.send(`✅ Ticket closed. Reason: ${reason}`);
    }
  } catch (err) {
    console.warn(`Failed to send follow-up: ${err.message}`);
  }
}

async function handleCloseCommand(interaction, db) {
  const channel = interaction.channel;
  if (!channel?.name?.startsWith('ticket-')) {
    return await interaction.reply({
      content: '❌ This is not a ticket channel.',
      ephemeral: true,
    });
  }

  const state = db.prepare('SELECT * FROM tickets WHERE channelid = ?').get(channel.id);
  if (!state) return;

  const isCloser =
    interaction.user.id === state.creator_id ||
    interaction.member.roles.cache.some((r) => config.transcripts?.closingRoles?.includes(r.id));

  if (!isCloser) {
    return await interaction.reply({
      content: '❌ You do not have permission to close this ticket.',
      ephemeral: true,
    });
  }

  return await handleClose(channel, state.creator_id, interaction.user.id, interaction.member, db, interaction);
}

async function handleTranscriptGeneration(interaction, target) {
  const transcript = await discordTranscripts.createTranscript(target, {
    limit: -1,
    returnType: 'attachment',
    fileName: `${target.name}.html`,
    poweredBy: false,
  });

  let transcriptUrl = null;

  if (config.transcripts?.uploadURL) {
    try {
      const form = new FormData();
      form.append('file', transcript.attachment, transcript.name);
      form.append('channel_id', target.id);

      const res = await axios.post(config.transcripts.uploadURL, form, {
        headers: form.getHeaders(),
      });

      if (res.data?.url) {
        transcriptUrl = `${config.transcripts.publicURLPrefix.replace(/\/$/, '')}/${res.data.url.replace(
          /^\//,
          ''
        )}`;
      }
    } catch (err) {
      console.warn('Transcript upload failed:', err.message);
    }
  }

  return { transcript, transcriptUrl };
}

async function handleTranscriptCommand(interaction) {
  if (
    !interaction.member.roles.cache.some((r) => config.transcripts?.transcriptRoles?.includes(r.id))
  ) {
    return interaction.reply({
      content: '❌ You do not have permission to generate transcripts.',
      ephemeral: true,
    });
  }

  const target =
    interaction.options?.getChannel('channel') ||
    (await interaction.mentions?.channels?.first()) ||
    interaction.channel;
  if (!target?.name?.startsWith('ticket-')) {
    return await interaction.reply({
      content: '❌ This is not a valid ticket channel.',
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const { transcript, transcriptUrl } = await handleTranscriptGeneration(interaction, target);

  if (transcriptUrl) {
    await interaction.editReply({
      content: `📎 Transcript uploaded: ${transcriptUrl}`,
    });
    return log(`🌐 Transcript uploaded: ${transcriptUrl}`);
  } else {
    await interaction.editReply({
      content: `📎 Transcript generated:`,
      files: [transcript],
    });
    return log(`⚠️ Transcript upload failed to: ${transcriptUrl}`);
  }
}

async function handleCategorySelection(bot, channel, member, tree, db) {
  await channel.send({ embeds: [buildSummaryEmbed([])] });
  await showSelectMenu(
    channel,
    `category:${channel.id}:${member.id}`,
    Object.keys(tree),
    'Choose a category:'
  );
}

async function showSelectMenu(channel, customId, options, placeholder) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(options.map((opt) => ({ label: opt, value: opt })));

  const row = new ActionRowBuilder().addComponents(menu);
  const message = await channel.send({ content: placeholder, components: [row] });

  // Set autoclose timeout for select menu
  const timeout = setTimeout(async () => {
    const state = db.prepare('SELECT * FROM tickets WHERE channelid = ?').get(channel.id);
    if (state && state.active_status === 'open') {
      await handleClose(
        channel,
        state.creator_id,
        botInstance?.user?.id || null,
        null,
        db,
        null,
        'Inactivity: No category selected within time limit'
      );
    }
    selectMenuTimeouts.delete(channel.id);
  }, config.selectMenuTimeout || 600000);

  selectMenuTimeouts.set(channel.id, timeout);
  return message;
}

function buildSummaryEmbed(pathArray, answers = []) {
  const embed = new EmbedBuilder().setTitle('📝 Ticket Summary').setColor(0x222222).setTimestamp();

  const description = pathArray.map((p, i) => `${'➤'.repeat(i + 1)} ${p}`).join('\n');
  if (description.length > 0) {
    embed.setDescription(description);
  }
  for (const a of answers) {
    embed.addFields({ name: a.question, value: a.answer });
  }

  return embed;
}

async function askQuestions(channel, user, state, db, bot) {
  const messages = await channel.messages.fetch({ limit: 10 });
  const embedMsg = messages.find(
    (m) => m.author.id === botInstance?.user?.id && m.embeds.length > 0
  );
  // generate staff roles nice and early

  // Set autoclose timeout for questions
  const timeout = setTimeout(async () => {
    const currentState = db.prepare('SELECT * FROM tickets WHERE channelid = ?').get(channel.id);
    if (!currentState) return;
    currentState.answers = JSON.parse(currentState.answers);
    if (currentState.active_status === 'open' && currentState.answers.length < state.questions.length) {
      await handleClose(
        channel,
        state.creator_id,
        botInstance?.user?.id || null,
        null,
        db,
        null,
        'Inactivity: Not all questions answered within time limit'
      );
    }
    questionTimeouts.delete(channel.id);
  }, config.questionsTimeout || 1800000);

  questionTimeouts.set(channel.id, timeout);

  for (const question of state.questions) {
    const qMsg = await channel.send(`<@${user.id}> ❓ ${question}`);
    const collected = await channel
      .awaitMessages({ filter: (m) => m.author.id === user.id, max: 1, time: 120000 })
      .catch(() => null);
    if (!collected) {
      await channel.send('⏱️ Ticket timed out.');
      return;
    }

    const answer = collected.first();
    state.answers.push({ question, answer: answer.content });
    await qMsg.delete();
    await answer.delete();
    db.prepare(`
      UPDATE tickets SET
        questions = ?,
        answers = ?
      WHERE channelid = ?
    `).run(JSON.stringify(state.questions), JSON.stringify(state.answers), channel.id);
    if (embedMsg)
      await embedMsg.edit({ embeds: [buildSummaryEmbed(state.category_path, state.answers)] });
  }

  // Clear question timeout if all questions are answered
  if (questionTimeouts.has(channel.id)) {
    clearTimeout(questionTimeouts.get(channel.id));
    questionTimeouts.delete(channel.id);
  }

  await finalizeTicket(channel, user, state, db);
}

async function finalizeTicket(channel, user, state, db) {
  const staffRoleIds = findStaffRoleIds(config.categories, state.category_path);

  for (const roleId of staffRoleIds) {
    try {
      await channel.permissionOverwrites.edit(roleId, {
        ViewChannel: true,
        SendMessages: true,
      });
    } catch (err) {
      console.warn(`Failed to edit overwrite permission for role ${roleId}: ${err.message}`);
    }
  }
  const finalCategoryId = state.current_category.categoryId;
  if (finalCategoryId) {
    await channel.setParent(finalCategoryId).catch((err) => {
      console.warn(`Failed to set parent: ${err.message}`);
    });
  } else {
    log(`❌ No categoryId found for path: ${state.category_path?.join(' > ')}`);
  }

  const closeButton = new ButtonBuilder()
    .setCustomId(`close:${channel.id}:${user.id}`)
    .setLabel('Close Ticket')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(closeButton);

  await channel.send({
    content: staffRoleIds.map((id) => `<@&${id}>`).join(' ') + ' ✅ Ticket completed.',
    components: [row],
  });

  

  try {
    const PRIVATE_THREAD = ChannelType?.PrivateThread || 12;
    const staffThread = await channel.threads.create({
      name: 'Staff Notes',
      autoArchiveDuration: 60,
      type: PRIVATE_THREAD,
      reason: 'Staff discussion for ticket',
      invitable: true,
    });

    for (const roleId of staffRoleIds) {
      const role = await channel.guild.roles.fetch(roleId);
      if (!role) continue;

      const staffMembers = role.members;
      for (const member of staffMembers.values()) {
        try {
          await staffThread.members.add(member.id);
        } catch (err) {
          console.warn(`Could not add ${member.user.tag} to staff thread: ${err.message}`);
        }
      }
    }

    await staffThread.send('📝 This is the staff-only discussion thread for this ticket.');
  } catch (err) {
    console.error('Failed to create staff notes thread:', err.message);
  }
}