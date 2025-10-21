// modules/logging.js
const path = require('path');
const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, ChannelType, WebhookClient } = require('discord.js');
const { initConfig } = require('../utils/config');
const Database = require('better-sqlite3');

// ---------- Paths
const CONFIG_PATH   = path.join(__dirname, '..', 'modules_configs', 'Logging', 'config.yml');
const MESSAGES_PATH = path.join(__dirname, '..', 'modules_configs', 'Logging', 'messages.yml');
const DB_PATH       = path.join(__dirname, '..', 'modules_configs', 'Logging', 'logs.db');

// ---------- Config (auto-generated on first load)
const loggingConfig = initConfig(CONFIG_PATH, {
  destinations: {
    default: '#logs',
    perEvent: {
      messageCreate: '#logs',
      messageDelete: '#logs',
      bulkMessageDelete: '#logs',
      messageEdit: '#logs',
      messageReactionAdd: '#logs',
      messageReactionRemove: '#logs',
      messageReactionRemoveAll: '#logs',
      messageReactionRemoveEmoji: '#logs',

      guildMemberAdd: '#logs',
      guildMemberRemove: '#logs',
      guildMemberUpdate: '#logs',

      voiceJoin: '#voice-logs',
      voiceLeave: '#voice-logs',
      voiceMove: '#voice-logs',
      voiceUpdate: '#voice-logs',

      channelCreate: '#logs',
      channelDelete: '#logs',
      channelUpdate: '#logs',
      threadCreate: '#logs',
      threadDelete: '#logs',
      threadUpdate: '#logs',

      roleCreate: '#logs',
      roleDelete: '#logs',
      roleUpdate: '#logs',

      emojiCreate: '#logs',
      emojiDelete: '#logs',
      emojiUpdate: '#logs',

      stickerCreate: '#logs',
      stickerDelete: '#logs',
      stickerUpdate: '#logs',

      inviteCreate: '#logs',
      inviteDelete: '#logs',

      guildUpdate: '#logs',
      webhooksUpdate: '#logs',
      presenceUpdate: false,
      stageInstanceCreate: '#logs',
      stageInstanceDelete: '#logs',
      stageInstanceUpdate: '#logs',

      scheduledEventCreate: '#logs',
      scheduledEventDelete: '#logs',
      scheduledEventUpdate: '#logs',
      scheduledEventUserAdd: '#logs',
      scheduledEventUserRemove: '#logs'
    }
  },
  webhooks: {
    enabled: false,
    name: 'AlterBot Logs',
    avatar: null,
    impersonateUser: true   // <— NEW: if true, webhooks use actor's name/avatar
  },
  events: {
    messageCreate: true,
    messageDelete: true,
    bulkMessageDelete: true,
    messageEdit: true,
    messageReactionAdd: true,
    messageReactionRemove: true,
    messageReactionRemoveAll: true,
    messageReactionRemoveEmoji: true,

    guildMemberAdd: true,
    guildMemberRemove: true,
    guildMemberUpdate: true,

    voiceStateUpdate: true,

    channelCreate: true,
    channelDelete: true,
    channelUpdate: true,
    threadCreate: true,
    threadDelete: true,
    threadUpdate: true,

    roleCreate: true,
    roleDelete: true,
    roleUpdate: true,

    emojiCreate: true,
    emojiDelete: true,
    emojiUpdate: true,

    stickerCreate: true,
    stickerDelete: true,
    stickerUpdate: true,

    inviteCreate: true,
    inviteDelete: true,

    guildUpdate: true,
    webhooksUpdate: true,
    presenceUpdate: false,
    stageInstanceCreate: true,
    stageInstanceDelete: true,
    stageInstanceUpdate: true,

    scheduledEventCreate: true,
    scheduledEventDelete: true,
    scheduledEventUpdate: true,
    scheduledEventUserAdd: true,
    scheduledEventUserRemove: true
  }
});

// ---------- Messages (auto-generated on first load)
// You can freely translate/modify titles/descriptions in messages.yml.
// Placeholders like {user}, {channel}, {before}, {after}, {count}, {from}, {to}, {emoji}, {jump}, {content}
const messagesConfig = initConfig(MESSAGES_PATH, {
  meta: {
    color: '#2f3136',   // default embed color
    footer: 'Logging'
  },
  templates: {
    messageCreate:      { title: '💬 New Message',          desc: '**Author:** {user}\n**Channel:** {channel}\n{jump}\n\n{content}' },
    messageEdit:        { title: '✏️ Message Edited',        desc: '**Author:** {user}\n**Channel:** {channel}\n{jump}\n\n**Before:**\n{before}\n\n**After:**\n{after}' },
    messageDelete:      { title: '🗑️ Message Deleted',       desc: '**Author:** {user}\n**Channel:** {channel}\n\n{content}' },
    bulkMessageDelete:  { title: '🧹 Bulk Delete',           desc: '**Channel:** {channel}\n**Count:** {count}' },
    messageReactionAdd: { title: '➕ Reaction Added',         desc: '**User:** {user}\n**Emoji:** {emoji}\n**Channel:** {channel}\n{jump}' },
    messageReactionRemove: { title: '➖ Reaction Removed',    desc: '**User:** {user}\n**Emoji:** {emoji}\n**Channel:** {channel}\n{jump}' },
    messageReactionRemoveAll: { title: '🧹 Reactions Cleared', desc: '**Channel:** {channel}\n{jump}' },
    messageReactionRemoveEmoji: { title: '🚯 Emoji Removed', desc: '**Emoji:** {emoji}\n**Channel:** {channel}\n{jump}' },

    guildMemberAdd:     { title: '➡️ Member Joined',         desc: '{user} ({usertag})' },
    guildMemberRemove:  { title: '⬅️ Member Left',           desc: '{user} ({usertag})' },
    guildMemberUpdate:  { title: '👤 Member Updated',         desc: '{user}\n{changes}' },

    voiceJoin:          { title: '🔊 Voice Join',             desc: '**User:** {user}\n**Channel:** {to}' },
    voiceLeave:         { title: '🔇 Voice Leave',            desc: '**User:** {user}\n**Channel:** {from}' },
    voiceMove:          { title: '🔁 Voice Move',             desc: '**User:** {user}\n**From:** {from}\n**To:** {to}' },
    voiceUpdate:        { title: '🎛️ Voice Update',           desc: '**User:** {user}\n**Channel:** {channel}' },

    channelCreate:      { title: '🆕 Channel Created',        desc: '**Name:** {channel}\n**Type:** {type}' },
    channelDelete:      { title: '🗑️ Channel Deleted',        desc: '**Name:** #{name}\n**Type:** {type}' },
    channelUpdate:      { title: '🔧 Channel Updated',        desc: '{channel}\n{changes}' },

    threadCreate:       { title: '🧵 Thread Created',         desc: '**Thread:** {thread}\n**Parent:** {parent}' },
    threadDelete:       { title: '🧵❌ Thread Deleted',        desc: '**Thread:** #{name}\n**Parent:** {parent}' },
    threadUpdate:       { title: '🧵✏️ Thread Updated',        desc: '{thread}\n{changes}' },

    roleCreate:         { title: '🎖️ Role Created',           desc: '{role} (`{name}`)' },
    roleDelete:         { title: '🎖️❌ Role Deleted',          desc: '`{name}`' },
    roleUpdate:         { title: '🎖️✏️ Role Updated',          desc: '{role}\n{changes}' },

    emojiCreate:        { title: '😃 Emoji Created',           desc: '{emoji}' },
    emojiDelete:        { title: '😢 Emoji Deleted',           desc: '`{name}`' },
    emojiUpdate:        { title: '😶‍🌫️ Emoji Updated',         desc: '`{old}` → `{name}`' },

    stickerCreate:      { title: '🏷️ Sticker Created',         desc: '`{name}`' },
    stickerDelete:      { title: '🏷️❌ Sticker Deleted',        desc: '`{name}`' },
    stickerUpdate:      { title: '🏷️✏️ Sticker Updated',        desc: '`{old}` → `{name}`' },

    inviteCreate:       { title: '🔗 Invite Created',          desc: '**Code:** `{code}`\n**Channel:** {channel}\n**Max Uses:** {max}' },
    inviteDelete:       { title: '🔗❌ Invite Deleted',         desc: '**Code:** `{code}`' },

    guildUpdate:        { title: '🏛️ Guild Updated',           desc: '{changes}' },
    webhooksUpdate:     { title: '🪝 Webhooks Updated',         desc: '{channel}' },
    presenceUpdate:     { title: '🟢 Presence Update',         desc: '{user} → {status}' },

    stageInstanceCreate:{ title: '🎤 Stage Created',            desc: '**Topic:** {topic}' },
    stageInstanceDelete:{ title: '🎤❌ Stage Deleted',           desc: '**Topic:** {topic}' },
    stageInstanceUpdate:{ title: '🎤✏️ Stage Updated',           desc: '**Topic:** `{old}` → `{topic}`' },

    scheduledEventCreate: { title: '🗓️ Event Created',         desc: '**Name:** {name}' },
    scheduledEventDelete: { title: '🗓️❌ Event Deleted',        desc: '**Name:** {name}' },
    scheduledEventUpdate: { title: '🗓️✏️ Event Updated',        desc: '**Name:** `{old}` → `{name}`' },
    scheduledEventUserAdd:    { title: '🗓️➕ RSVP Added',       desc: '{user} joined **{name}**' },
    scheduledEventUserRemove: { title: '🗓️➖ RSVP Removed',     desc: '{user} left **{name}**' },

    test:               { title: '🧪 Logging Test',             desc: 'Hello from {user}!' }
  }
});

// ---------- Tiny helpers
const db = new Database(DB_PATH);
db.prepare(`
  CREATE TABLE IF NOT EXISTS message_logs (
    guild_id TEXT NOT NULL,
    source_message_id TEXT PRIMARY KEY,
    log_channel_id TEXT NOT NULL,
    log_message_id TEXT NOT NULL
  )
`).run();

const upsertMap = db.prepare(`
  INSERT INTO message_logs (guild_id, source_message_id, log_channel_id, log_message_id)
  VALUES (@guild_id, @source_message_id, @log_channel_id, @log_message_id)
  ON CONFLICT(source_message_id) DO UPDATE SET
    log_channel_id=excluded.log_channel_id,
    log_message_id=excluded.log_message_id
`);
const getMap    = db.prepare(`SELECT * FROM message_logs WHERE source_message_id = ?`);
const deleteMap = db.prepare(`DELETE FROM message_logs WHERE source_message_id = ?`);

const colorFromHex = (hex) => {
  try { return parseInt(String(hex).replace('#',''), 16); } catch { return 0x2f3136; }
};
const repl = (text, map) => {
  if (!text || typeof text !== 'string') return text;
  return Object.entries(map || {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, v ?? ''), text);
};
const evOn = (k) => !!loggingConfig.get().events?.[k];

// Resolve channel by ID or #name/name
function resolveDest(guild, eventKey) {
  const cfg = loggingConfig.get();
  let dest = cfg.destinations?.perEvent?.[eventKey];
  if (dest === false || dest === null) return null;
  if (!dest || dest === true) dest = cfg.destinations?.default;
  if (!dest) return null;
  const by = String(dest).replace(/^#/, '');
  return guild.channels.cache.get(by) || guild.channels.cache.find(c => c.name === by) || null;
}

async function getWebhook(channel, cfg) {
  if (!cfg.webhooks?.enabled) return null;
  try {
    const hooks = await channel.fetchWebhooks();
    const name = cfg.webhooks.name || 'AlterBot Logs';
    const existing = hooks.find(h => h.name === name);
    if (existing) return new WebhookClient({ id: existing.id, token: existing.token });
    const created = await channel.createWebhook({ name, avatar: cfg.webhooks.avatar || null, reason: 'Logging webhook' });
    return new WebhookClient({ id: created.id, token: created.token });
  } catch { return null; }
}

function buildEmbed(templateKey, map = {}) {
  const messages = messagesConfig.get();
  const t = messages.templates?.[templateKey] || { title: templateKey, desc: '' };
  return new EmbedBuilder()
    .setColor(colorFromHex(messages.meta?.color || '#2f3136'))
    .setTimestamp(new Date())
    .setFooter(messages.meta?.footer ? { text: messages.meta.footer } : null)
    .setTitle(repl(t.title, map))
    .setDescription(repl(t.desc, map));
}

// Generic sender. If webhook+impersonate, use actor's name/avatar.
async function sendLog(guild, eventKey, templateKey, map = {}, options = {}) {
  const ch = resolveDest(guild, eventKey);
  if (!ch || !ch.isTextBased()) return null;

  const embed = buildEmbed(templateKey, map);
  const cfg = loggingConfig.get();
  const webhook = await getWebhook(ch, cfg);
  const payload = { embeds: [embed], allowedMentions: { parse: [] } };

  if (webhook) {
    const username = (cfg.webhooks.impersonateUser && options.actor)
      ? (options.actor.globalName || options.actor.tag || options.actor.username || 'User')
      : (cfg.webhooks.name || 'AlterBot Logs');
    const avatarURL = (cfg.webhooks.impersonateUser && options.actor)
      ? (options.actor.displayAvatarURL?.({ size: 128, extension: 'png' }) || null)
      : (cfg.webhooks.avatar || null);
    return webhook.send({ ...payload, username, avatarURL }).catch(() => null);
  }

  return ch.send(payload).catch(() => null);
}

async function editLog(guild, mapRow, templateKey, map = {}) {
  const ch = guild.channels.cache.get(mapRow.log_channel_id);
  if (!ch?.isTextBased()) return;
  try {
    const msg = await ch.messages.fetch(mapRow.log_message_id);
    if (!msg) return;
    const embed = buildEmbed(templateKey, map);
    await msg.edit({ embeds: [embed] });
  } catch { /* ignore */ }
}

// ---------- /logging admin
const data = new SlashCommandBuilder()
  .setName('logging')
  .setDescription('Configure logging')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sc =>
    sc.setName('setchannel')
      .setDescription('Set destination channel for an event key or "default".')
      .addStringOption(o => o.setName('event').setDescription('event key or "default"').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('target channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
  .addSubcommand(sc =>
    sc.setName('toggle')
      .setDescription('Enable/disable an event.')
      .addStringOption(o => o.setName('event').setDescription('event key').setRequired(true))
      .addBooleanOption(o => o.setName('enabled').setDescription('true/false').setRequired(true)))
  .addSubcommand(sc =>
    sc.setName('webhook')
      .setDescription('Enable/disable webhook mode and options.')
      .addBooleanOption(o => o.setName('enabled').setDescription('Use webhooks?').setRequired(true))
      .addBooleanOption(o => o.setName('impersonate').setDescription('Webhook uses actor name+avatar'))
      .addStringOption(o => o.setName('name').setDescription('Webhook display name (fallback)'))
      .addStringOption(o => o.setName('avatar').setDescription('Webhook avatar URL (fallback)')))
  .addSubcommand(sc =>
    sc.setName('test')
      .setDescription('Send a test log message.'));

module.exports = {
  data,
  async execute(inter) {
    const sub = inter.options.getSubcommand();
    const cfg = loggingConfig.get();

    if (sub === 'setchannel') {
      const key = inter.options.getString('event');
      const channel = inter.options.getChannel('channel');
      if (key.toLowerCase() === 'default') cfg.destinations.default = channel.id;
      else { cfg.destinations.perEvent = cfg.destinations.perEvent || {}; cfg.destinations.perEvent[key] = channel.id; }
      loggingConfig.set(cfg);
      return inter.reply({ content: `✅ **${key}** → <#${channel.id}>`, ephemeral: true });
    }

    if (sub === 'toggle') {
      const key = inter.options.getString('event');
      const enabled = inter.options.getBoolean('enabled');
      cfg.events[key] = enabled;
      loggingConfig.set(cfg);
      return inter.reply({ content: `✅ Event **${key}** is now **${enabled ? 'enabled' : 'disabled'}**.`, ephemeral: true });
    }

    if (sub === 'webhook') {
      cfg.webhooks.enabled = inter.options.getBoolean('enabled');
      if (inter.options.getBoolean('impersonate') !== null) cfg.webhooks.impersonateUser = inter.options.getBoolean('impersonate');
      const name = inter.options.getString('name');   if (name) cfg.webhooks.name = name;
      const avatar = inter.options.getString('avatar'); if (avatar) cfg.webhooks.avatar = avatar;
      loggingConfig.set(cfg);
      return inter.reply({ content: `✅ Webhook: **${cfg.webhooks.enabled ? 'ON' : 'OFF'}** — Impersonate: **${cfg.webhooks.impersonateUser ? 'ON' : 'OFF'}**`, ephemeral: true });
    }

    if (sub === 'test') {
      await sendLog(inter.guild, 'test', 'test', { user: `${inter.user}` }, { actor: inter.user });
      return inter.reply({ content: '✅ Sent test log (uses messages.yml).', ephemeral: true });
    }
  },

  run: async (bot) => {
    // -------- MESSAGE
    bot.on('messageCreate', async (m) => {
      if (!evOn('messageCreate') || !m.guild || m.author?.bot) return;
      const msg = await sendLog(m.guild, 'messageCreate', 'messageCreate', {
        user: `${m.author} (${m.author.tag})`,
        usertag: m.author?.tag || '',
        channel: `${m.channel}`,
        jump: `[Jump to message](${m.url})`,
        content: m.content?.length ? `**Content:**\n${m.content.slice(0, 4000)}` : '*no text*'
      }, { actor: m.author });
      if (msg) upsertMap.run({ guild_id: m.guild.id, source_message_id: m.id, log_channel_id: msg.channel.id, log_message_id: msg.id });
    });

    bot.on('messageUpdate', async (o, n) => {
      if (!evOn('messageEdit') || !n.guild || n.author?.bot) return;
      try { if (o.partial) await o.fetch(); if (n.partial) await n.fetch(); } catch {}
      if (o.content === n.content) return;
      const mapRow = getMap.get(n.id);
      const map = {
        user: `${n.author} (${n.author.tag})`,
        usertag: n.author?.tag || '',
        channel: `${n.channel}`,
        jump: `[Jump](${n.url})`,
        before: o.content?.slice(0, 1024) || '*no text*',
        after: n.content?.slice(0, 1024) || '*no text*'
      };
      if (mapRow) await editLog(n.guild, mapRow, 'messageEdit', map);
      else {
        const msg = await sendLog(n.guild, 'messageEdit', 'messageEdit', map, { actor: n.author });
        if (msg) upsertMap.run({ guild_id: n.guild.id, source_message_id: n.id, log_channel_id: msg.channel.id, log_message_id: msg.id });
      }
    });

    bot.on('messageDelete', async (m) => {
      if (!evOn('messageDelete') || !m.guild) return;
      const row = getMap.get(m.id);
      const map = {
        user: m.author ? `${m.author} (${m.author.tag})` : 'unknown',
        channel: `${m.channel}`,
        content: m.content?.slice(0, 4000) || ''
      };
      if (row) await editLog(m.guild, row, 'messageDelete', map);
      else await sendLog(m.guild, 'messageDelete', 'messageDelete', map, { actor: m.author });
      deleteMap.run(m.id);
    });

    bot.on('messageDeleteBulk', async (col) => {
      const first = col.first(); if (!evOn('bulkMessageDelete') || !first?.guild) return;
      await sendLog(first.guild, 'bulkMessageDelete', 'bulkMessageDelete', { channel: `${first.channel}`, count: String(col.size) });
    });

    bot.on('messageReactionAdd', async (react, user) => {
      if (!evOn('messageReactionAdd') || !react.message.guild) return;
      await sendLog(react.message.guild, 'messageReactionAdd', 'messageReactionAdd', {
        user: `${user}`,
        emoji: `${react.emoji}`,
        channel: `${react.message.channel}`,
        jump: `[Jump](${react.message.url})`
      }, { actor: user });
    });
    bot.on('messageReactionRemove', async (react, user) => {
      if (!evOn('messageReactionRemove') || !react.message.guild) return;
      await sendLog(react.message.guild, 'messageReactionRemove', 'messageReactionRemove', {
        user: `${user}`,
        emoji: `${react.emoji}`,
        channel: `${react.message.channel}`,
        jump: `[Jump](${react.message.url})`
      }, { actor: user });
    });
    bot.on('messageReactionRemoveAll', async (msg) => {
      if (!evOn('messageReactionRemoveAll') || !msg.guild) return;
      await sendLog(msg.guild, 'messageReactionRemoveAll', 'messageReactionRemoveAll', {
        channel: `${msg.channel}`,
        jump: `[Jump](${msg.url})`
      });
    });
    bot.on('messageReactionRemoveEmoji', async (react) => {
      if (!evOn('messageReactionRemoveEmoji') || !react.message.guild) return;
      await sendLog(react.message.guild, 'messageReactionRemoveEmoji', 'messageReactionRemoveEmoji', {
        emoji: `${react.emoji}`,
        channel: `${react.message.channel}`,
        jump: `[Jump](${react.message.url})`
      });
    });

    // -------- MEMBERS
    bot.on('guildMemberAdd', async (m) => {
      if (!evOn('guildMemberAdd')) return;
      await sendLog(m.guild, 'guildMemberAdd', 'guildMemberAdd', { user: `${m.user}`, usertag: m.user?.tag || '' }, { actor: m.user });
    });
    bot.on('guildMemberRemove', async (m) => {
      if (!evOn('guildMemberRemove')) return;
      await sendLog(m.guild, 'guildMemberRemove', 'guildMemberRemove', { user: `${m.user}`, usertag: m.user?.tag || '' }, { actor: m.user });
    });
    bot.on('guildMemberUpdate', async (o, n) => {
      if (!evOn('guildMemberUpdate')) return;
      const oldRoles = new Set(o.roles.cache.keys()), newRoles = new Set(n.roles.cache.keys());
      const added = [...newRoles].filter(r => !oldRoles.has(r));
      const removed = [...oldRoles].filter(r => !newRoles.has(r));
      const changes = [];
      if (o.nickname !== n.nickname) changes.push(`**Nickname:** \`${o.nickname || 'none'}\` → \`${n.nickname || 'none'}\``);
      if (added.length) changes.push(`**Roles Added:** ${added.map(id => `<@&${id}>`).join(', ')}`);
      if (removed.length) changes.push(`**Roles Removed:** ${removed.map(id => `<@&${id}>`).join(', ')}`);
      if (!changes.length) return;
      await sendLog(n.guild, 'guildMemberUpdate', 'guildMemberUpdate', {
        user: `${n.user} (${n.user.tag})`,
        changes: changes.join('\n')
      }, { actor: n.user });
    });

    // -------- VOICE
    bot.on('voiceStateUpdate', async (oldS, newS) => {
      if (!evOn('voiceStateUpdate')) return;
      const u = newS.member?.user || oldS.member?.user; if (!u) return;
      if (!oldS.channelId && newS.channelId) {
        await sendLog(newS.guild, 'voiceJoin', 'voiceJoin', { user: `${u}`, to: `<#${newS.channelId}>` }, { actor: u });
      } else if (oldS.channelId && !newS.channelId) {
        await sendLog(oldS.guild, 'voiceLeave', 'voiceLeave', { user: `${u}`, from: `<#${oldS.channelId}>` }, { actor: u });
      } else if (oldS.channelId !== newS.channelId) {
        await sendLog(newS.guild, 'voiceMove', 'voiceMove', { user: `${u}`, from: `<#${oldS.channelId}>`, to: `<#${newS.channelId}>` }, { actor: u });
      } else {
        await sendLog(newS.guild, 'voiceUpdate', 'voiceUpdate', { user: `${u}`, channel: `<#${newS.channelId}>` });
      }
    });

    // -------- CHANNELS / THREADS
    bot.on('channelCreate', async (ch) => {
      if (!evOn('channelCreate') || !ch.guild) return;
      await sendLog(ch.guild, 'channelCreate', 'channelCreate', { channel: `${ch}`, type: ChannelType[ch.type] ?? ch.type });
    });
    bot.on('channelDelete', async (ch) => {
      if (!evOn('channelDelete') || !ch.guild) return;
      await sendLog(ch.guild, 'channelDelete', 'channelDelete', { name: ch.name, type: ChannelType[ch.type] ?? ch.type });
    });
    bot.on('channelUpdate', async (o, n) => {
      if (!evOn('channelUpdate') || !n.guild) return;
      const changes = [];
      if (o.name !== n.name) changes.push(`**Name:** \`${o.name}\` → \`${n.name}\``);
      if (o.parentId !== n.parentId) changes.push(`**Category:** <#${o.parentId || 'none'}> → <#${n.parentId || 'none'}>`);
      if (!changes.length) return;
      await sendLog(n.guild, 'channelUpdate', 'channelUpdate', { channel: `${n}`, changes: changes.join('\n') });
    });

    bot.on('threadCreate', async (th) => { if (evOn('threadCreate') && th.guild) await sendLog(th.guild, 'threadCreate', 'threadCreate', { thread: `${th}`, parent: `${th.parent}` }); });
    bot.on('threadDelete', async (th) => { if (evOn('threadDelete') && th.guild) await sendLog(th.guild, 'threadDelete', 'threadDelete', { name: th.name, parent: `${th.parent || 'unknown'}` }); });
    bot.on('threadUpdate', async (o, n) => {
      if (!evOn('threadUpdate') || !n.guild) return;
      const changes = []; if (o.name !== n.name) changes.push(`**Name:** \`${o.name}\` → \`${n.name}\``);
      if (!changes.length) return;
      await sendLog(n.guild, 'threadUpdate', 'threadUpdate', { thread: `${n}`, changes: changes.join('\n') });
    });

    // -------- ROLES
    bot.on('roleCreate', async (r) => { if (evOn('roleCreate') && r.guild) await sendLog(r.guild, 'roleCreate', 'roleCreate', { role: `${r}`, name: r.name }); });
    bot.on('roleDelete', async (r) => { if (evOn('roleDelete') && r.guild) await sendLog(r.guild, 'roleDelete', 'roleDelete', { name: r.name }); });
    bot.on('roleUpdate', async (o, n) => {
      if (!evOn('roleUpdate') || !n.guild) return;
      const changes = [];
      if (o.name !== n.name) changes.push(`**Name:** \`${o.name}\` → \`${n.name}\``);
      if (o.color !== n.color) changes.push(`**Color:** \`#${o.color.toString(16)}\` → \`#${n.color.toString(16)}\``);
      if (!changes.length) return;
      await sendLog(n.guild, 'roleUpdate', 'roleUpdate', { role: `${n}`, changes: changes.join('\n') });
    });

    // -------- EMOJIS / STICKERS
    bot.on('emojiCreate', async (eji) => { if (evOn('emojiCreate')) await sendLog(eji.guild, 'emojiCreate', 'emojiCreate', { emoji: `${eji}` }); });
    bot.on('emojiDelete', async (eji) => { if (evOn('emojiDelete')) await sendLog(eji.guild, 'emojiDelete', 'emojiDelete', { name: eji.name }); });
    bot.on('emojiUpdate', async (o, n) => { if (evOn('emojiUpdate')) await sendLog(n.guild, 'emojiUpdate', 'emojiUpdate', { old: o.name, name: n.name }); });

    bot.on('stickerCreate', async (st) => { if (evOn('stickerCreate')) await sendLog(st.guild, 'stickerCreate', 'stickerCreate', { name: st.name }); });
    bot.on('stickerDelete', async (st) => { if (evOn('stickerDelete')) await sendLog(st.guild, 'stickerDelete', 'stickerDelete', { name: st.name }); });
    bot.on('stickerUpdate', async (o, n) => { if (evOn('stickerUpdate')) await sendLog(n.guild, 'stickerUpdate', 'stickerUpdate', { old: o.name, name: n.name }); });

    // -------- INVITES
    bot.on('inviteCreate', async (inv) => { if (evOn('inviteCreate')) await sendLog(inv.guild, 'inviteCreate', 'inviteCreate', { code: inv.code, channel: `${inv.channel}`, max: inv.maxUses || '∞' }); });
    bot.on('inviteDelete', async (inv) => { if (evOn('inviteDelete')) await sendLog(inv.guild, 'inviteDelete', 'inviteDelete', { code: inv.code }); });

    // -------- GUILD / WEBHOOKS / PRESENCE / STAGE / SCHEDULED
    bot.on('guildUpdate', async (o, n) => {
      if (!evOn('guildUpdate')) return;
      const changes = [];
      if (o.name !== n.name) changes.push(`**Name:** \`${o.name}\` → \`${n.name}\``);
      if (!changes.length) return;
      await sendLog(n, 'guildUpdate', 'guildUpdate', { changes: changes.join('\n') });
    });
    bot.on('webhooksUpdate', async (ch) => { if (evOn('webhooksUpdate') && ch.guild) await sendLog(ch.guild, 'webhooksUpdate', 'webhooksUpdate', { channel: `${ch}` }); });

    bot.on('presenceUpdate', async (o, n) => {
      if (!evOn('presenceUpdate')) return;
      const u = n?.user || o?.user; if (!u) return;
      await sendLog(n?.guild || bot.guilds.cache.first(), 'presenceUpdate', 'presenceUpdate', { user: `${u}`, status: n.status || 'unknown' }, { actor: u });
    });

    bot.on('stageInstanceCreate', async (s) => { if (evOn('stageInstanceCreate')) await sendLog(s.guild, 'stageInstanceCreate', 'stageInstanceCreate', { topic: s.topic }); });
    bot.on('stageInstanceDelete', async (s) => { if (evOn('stageInstanceDelete')) await sendLog(s.guild, 'stageInstanceDelete', 'stageInstanceDelete', { topic: s.topic }); });
    bot.on('stageInstanceUpdate', async (o, n) => { if (evOn('stageInstanceUpdate')) await sendLog(n.guild, 'stageInstanceUpdate', 'stageInstanceUpdate', { old: o.topic, topic: n.topic }); });

    bot.on('guildScheduledEventCreate', async (e) => { if (evOn('scheduledEventCreate')) await sendLog(e.guild, 'scheduledEventCreate', 'scheduledEventCreate', { name: e.name }); });
    bot.on('guildScheduledEventDelete', async (e) => { if (evOn('scheduledEventDelete')) await sendLog(e.guild, 'scheduledEventDelete', 'scheduledEventDelete', { name: e.name }); });
    bot.on('guildScheduledEventUpdate', async (o, n) => { if (evOn('scheduledEventUpdate')) await sendLog(n.guild, 'scheduledEventUpdate', 'scheduledEventUpdate', { old: o.name, name: n.name }); });
    bot.on('guildScheduledEventUserAdd', async (e, u) => { if (evOn('scheduledEventUserAdd')) await sendLog(e.guild, 'scheduledEventUserAdd', 'scheduledEventUserAdd', { user: `${u}`, name: e.name }, { actor: u }); });
    bot.on('guildScheduledEventUserRemove', async (e, u) => { if (evOn('scheduledEventUserRemove')) await sendLog(e.guild, 'scheduledEventUserRemove', 'scheduledEventUserRemove', { user: `${u}`, name: e.name }, { actor: u }); });
  }
};
