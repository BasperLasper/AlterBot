// modules/moderation.js
const path = require('path');
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, WebhookClient } = require('discord.js');
const { initConfig } = require('../utils/config');
const Database = require('better-sqlite3');

// ---------- Paths
const CONFIG_PATH   = path.join(__dirname, '..', 'modules_configs', 'Moderation', 'config.yml');
const MESSAGES_PATH = path.join(__dirname, '..', 'modules_configs', 'Moderation', 'messages.yml');
const DB_PATH       = path.join(__dirname, '..', 'modules_configs', 'Moderation', 'moderation.db');

// ---------- Config (auto-created)
const modConfig = initConfig(CONFIG_PATH, {
  defaults: {
    muteRoleName: 'Muted',
    dmUsers: true,
    dmOnUnactions: true,
    defaultReasonKey: 'no_reason',          // key from messages.yml -> common.reasons.no_reason
    slowmodeSeconds: 10
  },
  guards: {
    exemptRoles: [],                         // role IDs immune to mod actions
    allowAdminBypass: true                   // admins bypass exempt
  },
  destinations: {                            // per-action log channel mapping; id/#name/name
    default: '#logs',
    perAction: {
      ban: '#logs',
      unban: '#logs',
      tempban: '#logs',
      kick: '#logs',
      mute: '#logs',
      unmute: '#logs',
      tempmute: '#logs',
      lock: '#logs',
      unlock: '#logs',
      slowmode: '#logs',
      unslowmode: '#logs',
      clear: '#logs'
    }
  },
  webhooks: {                                // optional: log with webhooks (can impersonate actor)
    enabled: false,
    name: 'Moderation Logs',
    avatar: null,
    impersonateUser: true
  }
});

// ---------- Messages (everything editable)
const msgs = initConfig(MESSAGES_PATH, {
  meta: { color: '#EE4444', footer: 'Moderation' },
  common: {
    system: 'System',
    reasons: {
      no_reason: 'No reason provided',
      temp_ban_expired: 'Temp ban expired',
      temp_mute_expired: 'Temp mute expired'
    },
    errors: {
      user_not_in_guild: 'User not in guild.',
      target_is_exempt: 'Target is exempt.',
      missing_permission_ban: 'I lack **Ban Members** permission.',
      missing_permission_kick: 'I lack **Kick Members** permission.',
      missing_permission_manage_msgs: 'I lack **Manage Messages** permission.',
      invalid_duration: 'Invalid duration. Use e.g., `10m`, `2h`, `3d`.',
      not_text_channel: 'Not a text channel.'
    },
    replies: {
      banned: 'Banned {tag}.',
      temp_banned: 'Temp-banned {tag} for {duration}.',
      unbanned: 'Unbanned `{id}`.',
      kicked: 'Kicked {tag}.',
      muted: 'Muted {tag}.',
      temp_muted: 'Temp-muted {tag} for {duration}.',
      unmuted: 'Unmuted {tag}.',
      locked: 'Locked {channel}.',
      unlocked: 'Unlocked {channel}.',
      slowmode_on: 'Slowmode set to {seconds}s in {channel}.',
      slowmode_off: 'Slowmode disabled in {channel}.',
      cleared: 'Deleted {count} messages.'
    },
    dm: {
      ban:       'You were **banned** from **{guild}**. Reason: {reason}',
      tempban:   'You were **temporarily banned** from **{guild}** for **{duration}**. Reason: {reason}',
      unban:     'Your **ban** in **{guild}** has been lifted.',
      kick:      'You were **kicked** from **{guild}**. Reason: {reason}',
      mute:      'You were **muted** in **{guild}**. Reason: {reason}',
      tempmute:  'You were **temporarily muted** in **{guild}** for **{duration}**. Reason: {reason}',
      unmute:    'Your **mute** in **{guild}** has been lifted.'
    }
  },
  logs: {
    titles: {
      moderation: 'Moderation'
    },
    lines: {
      ban:        '🔨 **Ban** • {moderator} banned {target} | Reason: {reason}',
      tempban:    '⏳ **Temp Ban** • {moderator} temp-banned {target} for **{duration}** | Reason: {reason}',
      unban:      '♻️ **Unban** • {moderator} unbanned `{userId}` | Reason: {reason}',
      kick:       '👢 **Kick** • {moderator} kicked {target} | Reason: {reason}',
      mute:       '🔇 **Mute** • {moderator} muted {target} | Reason: {reason}',
      tempmute:   '⏱️ **Temp Mute** • {moderator} temp-muted {target} for **{duration}** | Reason: {reason}',
      unmute:     '🔊 **Unmute** • {moderator} unmuted {target} | Reason: {reason}',
      lock:       '🔒 **Lock** • {moderator} locked {channel}',
      unlock:     '🔓 **Unlock** • {moderator} unlocked {channel}',
      slowmode:   '🐢 **Slowmode** • {moderator} set {channel} to **{seconds}s**',
      unslowmode: '🚀 **Slowmode Off** • {moderator} disabled slowmode in {channel}',
      clear:      '🧹 **Clear** • {moderator} deleted **{count}** messages in {channel}'
    }
  }
});

// ---------- DB (temp actions)
const db = new Database(DB_PATH);
db.exec(`
CREATE TABLE IF NOT EXISTS temp_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,        -- 'tempmute' | 'tempban'
  end_ts INTEGER NOT NULL,   -- epoch ms
  metadata TEXT              -- JSON (e.g., muteRoleId)
);
`);

// ---------- Helpers
const hex = (h) => parseInt(String(h).replace('#',''), 16);
const color = () => hex(msgs.get().meta?.color || '#EE4444');
const fmt = (t, map) => Object.entries(map || {}).reduce((s,[k,v]) => s.replaceAll(`{${k}}`, String(v ?? '')), String(t ?? ''));
const title = (k) => msgs.get().logs?.titles?.[k] || 'Moderation';

function embed(desc, ttlKey='moderation') {
  const m = msgs.get();
  const e = new EmbedBuilder().setColor(color()).setDescription(desc).setTimestamp(new Date());
  if (m.meta?.footer) e.setFooter({ text: m.meta.footer });
  e.setTitle(title(ttlKey));
  return e;
}

function resolveDest(guild, actionKey) {
  const cfg = modConfig.get();
  let dest = cfg.destinations?.perAction?.[actionKey];
  if (!dest) dest = cfg.destinations?.default;
  if (!dest) return null;
  const by = String(dest).replace(/^#/, '');
  return guild.channels.cache.get(by) || guild.channels.cache.find(c => c.name === by) || null;
}

async function getWebhook(channel, cfg) {
  if (!cfg.webhooks?.enabled) return null;
  try {
    const name = cfg.webhooks.name || 'Moderation Logs';
    const hooks = await channel.fetchWebhooks();
    const existing = hooks.find(h => h.name === name);
    if (existing) return new WebhookClient({ id: existing.id, token: existing.token });
    const created = await channel.createWebhook({ name, avatar: cfg.webhooks.avatar || null, reason: 'Moderation webhook' });
    return new WebhookClient({ id: created.id, token: created.token });
  } catch { return null; }
}

async function logAction(guild, actionKey, line, actorUser = null) {
  const ch = resolveDest(guild, actionKey);
  if (!ch?.isTextBased()) return;
  const cfg = modConfig.get();
  const webhook = await getWebhook(ch, cfg);

  const payload = { embeds: [embed(line)] };
  if (webhook) {
    const useActor = cfg.webhooks.impersonateUser && actorUser;
    return webhook.send({
      ...payload,
      username: useActor ? (actorUser.globalName || actorUser.tag || actorUser.username) : (cfg.webhooks.name || 'Moderation Logs'),
      avatarURL: useActor && actorUser.displayAvatarURL ? actorUser.displayAvatarURL({ size: 128, extension: 'png' }) : (cfg.webhooks.avatar || undefined)
    }).catch(()=>{});
  }
  return ch.send(payload).catch(()=>{});
}

async function dmMaybe(user, key, map) {
  const cfg = modConfig.get();
  if (!cfg.defaults.dmUsers) return;
  const t = msgs.get().common?.dm?.[key];
  if (!t) return;
  try { await user.send(fmt(t, map)); } catch {}
}

function isExempt(member) {
  const cfg = modConfig.get();
  const exempt = new Set(cfg.guards?.exemptRoles || []);
  if (!exempt.size) return false;
  if (cfg.guards.allowAdminBypass && member.permissions.has(PermissionFlagsBits.Administrator)) return false;
  return member.roles.cache.some(r => exempt.has(r.id));
}

function parseDuration(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d+)\s*(s|m|h|d|w)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 }[m[2].toLowerCase()];
  return n * mult;
}

async function ensureMuteRole(guild) {
  const name = modConfig.get().defaults.muteRoleName || 'Muted';
  let role = guild.roles.cache.find(r => r.name === name);
  if (!role) role = await guild.roles.create({ name, permissions: [], reason: 'Create mute role' });

  for (const ch of guild.channels.cache.values()) {
    if (!('permissionOverwrites' in ch)) continue;
    try {
      await ch.permissionOverwrites.edit(role, {
        SendMessages: false,
        AddReactions: false,
        SendMessagesInThreads: false,
        Speak: false
      });
    } catch {}
  }
  return role;
}

async function bulkClear(channel, count) {
  let deletedTotal = 0;
  let remaining = Math.max(1, Math.min(count, 1000)); // sane cap
  while (remaining > 0) {
    const toDelete = Math.min(remaining, 100);
    const msgs = await channel.bulkDelete(toDelete, true).catch(()=>null);
    if (!msgs) break;
    deletedTotal += msgs.size;
    if (msgs.size < toDelete) break; // likely hit 14 day limit
    remaining -= msgs.size;
  }
  return deletedTotal;
}

// temp actions scheduler
let scheduler = null;
function startScheduler(bot) {
  if (scheduler) return;
  scheduler = setInterval(async () => {
    const now = Date.now();
    const due = db.prepare(`SELECT * FROM temp_actions WHERE end_ts <= ?`).all(now);
    for (const row of due) {
      try {
        const guild = bot.guilds.cache.get(row.guild_id);
        if (!guild) continue;
        const member = await guild.members.fetch(row.user_id).catch(()=>null);
        const meta = row.metadata ? JSON.parse(row.metadata) : {};
        const mm = msgs.get();

        if (row.type === 'tempmute') {
          const roleId = meta.muteRoleId;
          if (member && roleId) await member.roles.remove(roleId, mm.common.reasons.temp_mute_expired).catch(()=>{});
          const line = fmt(mm.logs.lines.unmute, {
            moderator: mm.common.system,
            target: member ? `${member.user} (${member.user.tag})` : `\`${row.user_id}\``,
            reason: mm.common.reasons.temp_mute_expired
          });
          await logAction(guild, 'unmute', line);
          if (member && modConfig.get().defaults.dmOnUnactions) {
            const text = fmt(mm.common.dm.unmute, { guild: guild.name });
            try { await member.user.send(text); } catch {}
          }
        }

        if (row.type === 'tempban') {
          await guild.bans.remove(row.user_id, msgs.get().common.reasons.temp_ban_expired).catch(()=>{});
          const line = fmt(mm.logs.lines.unban, {
            moderator: mm.common.system,
            userId: row.user_id,
            reason: mm.common.reasons.temp_ban_expired
          });
          await logAction(guild, 'unban', line);
        }
      } finally {
        db.prepare(`DELETE FROM temp_actions WHERE id = ?`).run(row.id);
      }
    }
  }, 10_000);
}

// ---------- Slash commands
const data = new SlashCommandBuilder()
  .setName('mod')
  .setDescription('Moderation tools')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  // ban
  .addSubcommand(sc => sc.setName('ban')
    .setDescription('Ban a member')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason (optional)')))
  .addSubcommand(sc => sc.setName('tempban')
    .setDescription('Temporarily ban a member')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('e.g., 10m, 2h, 3d').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason (optional)')))
  .addSubcommand(sc => sc.setName('unban')
    .setDescription('Unban a user by ID')
    .addStringOption(o => o.setName('userid').setDescription('User ID').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason (optional)')))
  // kick
  .addSubcommand(sc => sc.setName('kick')
    .setDescription('Kick a member')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason (optional)')))
  // mute/tempmute/unmute
  .addSubcommand(sc => sc.setName('mute')
    .setDescription('Mute a member (role-based)')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason (optional)')))
  .addSubcommand(sc => sc.setName('tempmute')
    .setDescription('Temporarily mute a member (role-based)')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('e.g., 10m, 2h, 3d').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason (optional)')))
  .addSubcommand(sc => sc.setName('unmute')
    .setDescription('Unmute a member')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason (optional)')))
  // lock/unlock
  .addSubcommand(sc => sc.setName('lock').setDescription('Lock this channel (deny @everyone send)'))
  .addSubcommand(sc => sc.setName('unlock').setDescription('Unlock this channel'))
  // slowmode / unslowmode
  .addSubcommand(sc => sc.setName('slowmode')
    .setDescription('Set slowmode (seconds)')
    .addIntegerOption(o => o.setName('seconds').setDescription('0-21600').setRequired(true)))
  .addSubcommand(sc => sc.setName('unslowmode').setDescription('Disable slowmode in this channel'))
  // clear
  .addSubcommand(sc => sc.setName('clear')
    .setDescription('Delete N recent messages (<=14 days old; chunks of <=100)')
    .addIntegerOption(o => o.setName('count').setDescription('1-1000').setRequired(true)));

const admin = new SlashCommandBuilder()
  .setName('modcfg')
  .setDescription('Configure moderation logging')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sc => sc.setName('setdest')
    .setDescription('Set destination channel for an action key or "default"')
    .addStringOption(o => o.setName('action').setDescription('action key or "default"').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Target channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
  .addSubcommand(sc => sc.setName('webhook')
    .setDescription('Enable/disable webhook mode and options')
    .addBooleanOption(o => o.setName('enabled').setDescription('Use webhooks?').setRequired(true))
    .addBooleanOption(o => o.setName('impersonate').setDescription('Impersonate actor name+avatar'))
    .addStringOption(o => o.setName('name').setDescription('Webhook display name'))
    .addStringOption(o => o.setName('avatar').setDescription('Webhook avatar URL')))
  .addSubcommand(sc => sc.setName('list').setDescription('Show current moderation destinations/webhook status'));

module.exports = {
  commands: [data, admin],      // multi-command support (your loader supports arrays)
  aliases: ['-mod'],

  async execute(inter) {
    const isCfg = inter.commandName === 'modcfg';
    const m = msgs.get();
    const cfg = modConfig.get();

    // Utility: get default reason from messages
    const defaultReason = m.common?.reasons?.[cfg.defaults.defaultReasonKey] || m.common?.reasons?.no_reason || 'No reason provided';

    // Admin config commands
    if (isCfg) {
      const sub = inter.options.getSubcommand();
      if (sub === 'setdest') {
        const key = inter.options.getString('action', true);
        const channel = inter.options.getChannel('channel', true);
        if (key.toLowerCase() === 'default') cfg.destinations.default = channel.id;
        else { cfg.destinations.perAction = cfg.destinations.perAction || {}; cfg.destinations.perAction[key] = channel.id; }
        modConfig.set(cfg);
        return inter.reply({ content: `✅ **${key}** → <#${channel.id}>`, ephemeral: true });
      }

      if (sub === 'webhook') {
        cfg.webhooks.enabled = inter.options.getBoolean('enabled', true);
        const imp = inter.options.getBoolean('impersonate');
        const name = inter.options.getString('name');
        const avatar = inter.options.getString('avatar');
        if (imp !== null) cfg.webhooks.impersonateUser = imp;
        if (name) cfg.webhooks.name = name;
        if (avatar) cfg.webhooks.avatar = avatar;
        modConfig.set(cfg);
        return inter.reply({ content: `✅ Webhook: **${cfg.webhooks.enabled ? 'ON' : 'OFF'}** — Impersonate: **${cfg.webhooks.impersonateUser ? 'ON' : 'OFF'}**`, ephemeral: true });
      }

      if (sub === 'list') {
        const rows = [];
        const per = cfg.destinations?.perAction || {};
        const keys = Object.keys(per).sort();
        for (const k of keys) {
          const v = per[k];
          const mention = inter.guild.channels.cache.get(String(v)) ? `<#${v}>` : (String(v).startsWith('#') ? v : `#${v}`);
          rows.push(`• **${k}** → ${mention}`);
        }
        const defMention = cfg.destinations?.default
          ? (inter.guild.channels.cache.get(String(cfg.destinations.default)) ? `<#${cfg.destinations.default}>` : `#${cfg.destinations.default}`)
          : '—';
        const e = new EmbedBuilder()
          .setColor(color())
          .setTitle('🧾 Moderation config')
          .addFields(
            { name: 'Webhook', value: `**Enabled:** ${cfg.webhooks?.enabled ? 'Yes' : 'No'}\n**Impersonate:** ${cfg.webhooks?.impersonateUser ? 'Yes' : 'No'}\n**Name:** ${cfg.webhooks?.name || 'Moderation Logs'}`, inline: false },
            { name: 'Default Destination', value: defMention, inline: false },
            { name: 'Per-action Destinations', value: rows.length ? rows.join('\n') : '—', inline: false }
          )
          .setTimestamp(new Date());
        if (m.meta?.footer) e.setFooter({ text: m.meta.footer });
        return inter.reply({ embeds: [e], ephemeral: true });
      }

      return;
    }

    // Moderation commands
    const sub = inter.options.getSubcommand();
    await inter.deferReply({ ephemeral: true });

    // Handy reply builder using messages.yml
    const reply = (key, map) => inter.editReply(fmt(m.common.replies[key], map));
    const error = (key) => inter.editReply(m.common.errors[key] || 'Error');

    try {
      // BAN
      if (sub === 'ban') {
        const target = inter.options.getUser('user', true);
        const reason = inter.options.getString('reason') || defaultReason;
        const member = await inter.guild.members.fetch(target.id).catch(()=>null);
        if (!member) return error('user_not_in_guild');
        if (!inter.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) return error('missing_permission_ban');
        if (isExempt(member)) return error('target_is_exempt');

        await dmMaybe(target, 'ban', { guild: inter.guild.name, reason });
        await member.ban({ reason }).catch(()=>{});
        const line = fmt(m.logs.lines.ban, { moderator: `${inter.user}`, target: `${target} (${target.tag})`, reason });
        await logAction(inter.guild, 'ban', line, inter.user);
        return reply('banned', { tag: target.tag });
      }

      if (sub === 'tempban') {
        const target = inter.options.getUser('user', true);
        const durationStr = inter.options.getString('duration', true);
        const reason = inter.options.getString('reason') || defaultReason;
        const durMs = parseDuration(durationStr);
        if (!durMs) return error('invalid_duration');
        const member = await inter.guild.members.fetch(target.id).catch(()=>null);
        if (!inter.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) return error('missing_permission_ban');
        if (member && isExempt(member)) return error('target_is_exempt');

        await dmMaybe(target, 'tempban', { guild: inter.guild.name, reason, duration: durationStr });
        await inter.guild.members.ban(target.id, { reason }).catch(()=>{});
        db.prepare(`INSERT INTO temp_actions (guild_id, user_id, type, end_ts, metadata) VALUES (?, ?, 'tempban', ?, '{}')`)
          .run(inter.guild.id, target.id, Date.now() + durMs);
        const line = fmt(m.logs.lines.tempban, { moderator: `${inter.user}`, target: `${target} (${target.tag})`, reason, duration: durationStr });
        await logAction(inter.guild, 'tempban', line, inter.user);
        return reply('temp_banned', { tag: target.tag, duration: durationStr });
      }

      if (sub === 'unban') {
        const userId = inter.options.getString('userid', true);
        const reason = inter.options.getString('reason') || defaultReason;
        if (!inter.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) return error('missing_permission_ban');
        await inter.guild.bans.remove(userId, reason).catch(()=>{});
        const line = fmt(m.logs.lines.unban, { moderator: `${inter.user}`, userId, reason });
        await logAction(inter.guild, 'unban', line, inter.user);
        // DM unbanned user is unreliable; skip
        return reply('unbanned', { id: userId });
      }

      // KICK
      if (sub === 'kick') {
        const target = inter.options.getUser('user', true);
        const reason = inter.options.getString('reason') || defaultReason;
        const member = await inter.guild.members.fetch(target.id).catch(()=>null);
        if (!member) return error('user_not_in_guild');
        if (!inter.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) return error('missing_permission_kick');
        if (isExempt(member)) return error('target_is_exempt');

        await dmMaybe(target, 'kick', { guild: inter.guild.name, reason });
        await member.kick(reason).catch(()=>{});
        const line = fmt(m.logs.lines.kick, { moderator: `${inter.user}`, target: `${target} (${target.tag})`, reason });
        await logAction(inter.guild, 'kick', line, inter.user);
        return reply('kicked', { tag: target.tag });
      }

      // MUTE / TEMP MUTE / UNMUTE
      if (sub === 'mute' || sub === 'tempmute') {
        const target = inter.options.getUser('user', true);
        const reason = inter.options.getString('reason') || defaultReason;
        const member = await inter.guild.members.fetch(target.id).catch(()=>null);
        if (!member) return error('user_not_in_guild');
        if (isExempt(member)) return error('target_is_exempt');

        const muteRole = await ensureMuteRole(inter.guild);
        await member.roles.add(muteRole, reason).catch(()=>{});

        if (sub === 'tempmute') {
          const durationStr = inter.options.getString('duration', true);
          const durMs = parseDuration(durationStr);
          if (!durMs) return error('invalid_duration');
          db.prepare(`INSERT INTO temp_actions (guild_id, user_id, type, end_ts, metadata) VALUES (?, ?, 'tempmute', ?, ?)`)
            .run(inter.guild.id, member.id, Date.now() + durMs, JSON.stringify({ muteRoleId: muteRole.id }));
          await dmMaybe(target, 'tempmute', { guild: inter.guild.name, reason, duration: durationStr });
          const line = fmt(m.logs.lines.tempmute, { moderator: `${inter.user}`, target: `${target} (${target.tag})`, reason, duration: durationStr });
          await logAction(inter.guild, 'tempmute', line, inter.user);
          return reply('temp_muted', { tag: target.tag, duration: durationStr });
        } else {
          await dmMaybe(target, 'mute', { guild: inter.guild.name, reason });
          const line = fmt(m.logs.lines.mute, { moderator: `${inter.user}`, target: `${target} (${target.tag})`, reason });
          await logAction(inter.guild, 'mute', line, inter.user);
          return reply('muted', { tag: target.tag });
        }
      }

      if (sub === 'unmute') {
        const target = inter.options.getUser('user', true);
        const reason = inter.options.getString('reason') || defaultReason;
        const member = await inter.guild.members.fetch(target.id).catch(()=>null);
        if (!member) return error('user_not_in_guild');

        const muteRole = await ensureMuteRole(inter.guild);
        await member.roles.remove(muteRole, reason).catch(()=>{});
        db.prepare(`DELETE FROM temp_actions WHERE guild_id = ? AND user_id = ? AND type = 'tempmute'`).run(inter.guild.id, member.id);

        if (modConfig.get().defaults.dmOnUnactions) await dmMaybe(target, 'unmute', { guild: inter.guild.name });
        const line = fmt(m.logs.lines.unmute, { moderator: `${inter.user}`, target: `${target} (${target.tag})`, reason });
        await logAction(inter.guild, 'unmute', line, inter.user);
        return reply('unmuted', { tag: target.tag });
      }

      // LOCK / UNLOCK
      if (sub === 'lock') {
        const ch = inter.channel;
        await ch.permissionOverwrites.edit(inter.guild.roles.everyone, { SendMessages: false }).catch(()=>{});
        const line = fmt(m.logs.lines.lock, { moderator: `${inter.user}`, channel: `${ch}` });
        await logAction(inter.guild, 'lock', line, inter.user);
        return reply('locked', { channel: `${ch}` });
      }
      if (sub === 'unlock') {
        const ch = inter.channel;
        await ch.permissionOverwrites.edit(inter.guild.roles.everyone, { SendMessages: null }).catch(()=>{});
        const line = fmt(m.logs.lines.unlock, { moderator: `${inter.user}`, channel: `${ch}` });
        await logAction(inter.guild, 'unlock', line, inter.user);
        return reply('unlocked', { channel: `${ch}` });
      }

      // SLOWMODE / UNSLOWMODE
      if (sub === 'slowmode') {
        const ch = inter.channel;
        const secs = inter.options.getInteger('seconds', true);
        if (secs < 0 || secs > 21600) return inter.editReply('❌ 0..21600');
        await ch.setRateLimitPerUser(secs).catch(()=>{});
        const line = fmt(m.logs.lines.slowmode, { moderator: `${inter.user}`, channel: `${ch}`, seconds: secs });
        await logAction(inter.guild, 'slowmode', line, inter.user);
        return reply('slowmode_on', { seconds: String(secs), channel: `${ch}` });
      }
      if (sub === 'unslowmode') {
        const ch = inter.channel;
        await ch.setRateLimitPerUser(0).catch(()=>{});
        const line = fmt(m.logs.lines.unslowmode, { moderator: `${inter.user}`, channel: `${ch}` });
        await logAction(inter.guild, 'unslowmode', line, inter.user);
        return reply('slowmode_off', { channel: `${ch}` });
      }

      // CLEAR
      if (sub === 'clear') {
        if (!inter.channel?.isTextBased()) return error('not_text_channel');
        if (!inter.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) return error('missing_permission_manage_msgs');
        const count = inter.options.getInteger('count', true);
        const deleted = await bulkClear(inter.channel, count);
        const line = fmt(m.logs.lines.clear, { moderator: `${inter.user}`, count: String(deleted), channel: `${inter.channel}` });
        await logAction(inter.guild, 'clear', line, inter.user);
        return reply('cleared', { count: String(deleted) });
      }

      return inter.editReply('❌ Unknown subcommand.');
    } catch (e) {
      console.error('[Moderation] error:', e);
      return inter.editReply('❌ An error occurred.');
    }
  },

  async run(bot) {
    startScheduler(bot);
  }
};
