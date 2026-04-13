require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");
const { WebcastPushConnection } = require("tiktok-live-connector");

const {
  TOKEN,
  CLIENT_ID,
  GUILD_ID,
  VERIFY_CHANNEL_ID,
  RULES_CHANNEL_ID,
  LOG_CHANNEL_ID,
  TIKTOK_USERNAME,
  TIKTOK_CHANNEL_ID,
  SAKURA_ROLE_ID,
  STRAWBERRY_ROLE_ID,
  MATCHA_ROLE_ID,
  MYSTIC_ROLE_ID,
  TARO_ROLE_ID
} = process.env;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const COLORS = {
  pink: 0xffb6d9,
  rose: 0xff8fb1,
  purple: 0xc8a2ff,
  mint: 0xb8f2d6,
  blue: 0xbfdcff,
  red: 0xff8a8a,
  yellow: 0xffe59a,
  gray: 0xcfcfcf
};

const FOOTER = {
  text: "mochi bot moderation system"
};

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
const INVITE_REGEX = /(discord\.gg|discord\.com\/invite)\/[a-z0-9-]+/i;
const spamTracker = new Map();

const dataDir = path.join(__dirname, "data");
const configPath = path.join(dataDir, "config.json");

function createDefaultConfig() {
  return {
    verifyMessageId: null,
    warnings: {},
    notes: {},
    cases: [],
    nextCaseId: 1,
    automod: {
      invites: true,
      spam: true,
      caps: true,
      bannedWords: false,
      bannedWordList: [],
      maxMentions: 5,
      exemptChannelIds: [],
      exemptRoleIds: []
    },
    settings: {
      verifyChannelId: null,
      rulesChannelId: null,
      logChannelId: null,
      tiktokUsername: null,
      tiktokChannelId: null
    }
  };
}

function loadConfig() {
  const defaults = createDefaultConfig();

  if (!fs.existsSync(configPath)) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));

    return {
      ...defaults,
      ...parsed,
      warnings: parsed.warnings && typeof parsed.warnings === "object" ? parsed.warnings : {},
      notes: parsed.notes && typeof parsed.notes === "object" ? parsed.notes : {},
      cases: Array.isArray(parsed.cases) ? parsed.cases : [],
      automod: {
        ...defaults.automod,
        ...(parsed.automod || {}),
        bannedWordList: Array.isArray(parsed.automod?.bannedWordList) ? parsed.automod.bannedWordList : [],
        exemptChannelIds: Array.isArray(parsed.automod?.exemptChannelIds) ? parsed.automod.exemptChannelIds : [],
        exemptRoleIds: Array.isArray(parsed.automod?.exemptRoleIds) ? parsed.automod.exemptRoleIds : []
      },
      settings: {
        ...defaults.settings,
        ...(parsed.settings || {})
      },
      nextCaseId: Number.isInteger(parsed.nextCaseId) ? parsed.nextCaseId : defaults.nextCaseId
    };
  } catch (error) {
    console.error("Failed to load config, using defaults:", error.message);
    return defaults;
  }
}

let config = loadConfig();

function saveConfig() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function getVerifyChannelId() {
  return config.settings.verifyChannelId || VERIFY_CHANNEL_ID;
}

function getRulesChannelId() {
  return config.settings.rulesChannelId || RULES_CHANNEL_ID;
}

function getLogChannelId() {
  return config.settings.logChannelId || LOG_CHANNEL_ID;
}

function getTikTokUsername() {
  return config.settings.tiktokUsername || TIKTOK_USERNAME;
}

function getTikTokChannelId() {
  return config.settings.tiktokChannelId || TIKTOK_CHANNEL_ID;
}

function getBannedWords() {
  return Array.isArray(config.automod.bannedWordList) ? config.automod.bannedWordList : [];
}

function validateEnv() {
  const requiredVars = ["TOKEN", "CLIENT_ID", "GUILD_ID", "VERIFY_CHANNEL_ID"];
  const missing = requiredVars.filter(key => !process.env[key]);

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

const MOCHI_ROLES = {
  "🌸": { id: SAKURA_ROLE_ID, name: "Sakura" },
  "🍓": { id: STRAWBERRY_ROLE_ID, name: "Strawberry Milk" },
  "🍵": { id: MATCHA_ROLE_ID, name: "Matcha Dream" },
  "🫐": { id: MYSTIC_ROLE_ID, name: "Mystic Berry" },
  "💜": { id: TARO_ROLE_ID, name: "Taro Cloud" }
};

const ALL_ROLES = Object.values(MOCHI_ROLES)
  .map(role => role.id)
  .filter(Boolean);

const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show the bot's main commands"),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("View bot runtime status")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("reload")
    .setDescription("Reload parts of the bot without redeploying")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option
        .setName("target")
        .setDescription("What to reload")
        .setRequired(true)
        .addChoices(
          { name: "TikTok connection", value: "tiktok" },
          { name: "Config from disk", value: "config" },
          { name: "Both", value: "all" }
        )
    ),

  new SlashCommandBuilder()
    .setName("setupverify")
    .setDescription("Create the verify menu")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("setuprules")
    .setDescription("Post the server rules")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Lock the current channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("unlockdown")
    .setDescription("Unlock the current channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send a styled announcement")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(option =>
      option.setName("message").setDescription("Announcement text").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("dm")
    .setDescription("Send a DM to a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName("user").setDescription("User to DM").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("message").setDescription("Message text").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete messages in bulk")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option =>
      option.setName("amount").setDescription("How many messages to delete").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("View user info")
    .addUserOption(option =>
      option.setName("user").setDescription("User").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("serverstats")
    .setDescription("View server stats"),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName("user").setDescription("User to warn").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason").setDescription("Reason for the warning").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View warning history for a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName("user").setDescription("User to inspect").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clearwarnings")
    .setDescription("Clear all warnings for a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName("user").setDescription("User to clear").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason").setDescription("Reason for clearing warnings").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName("user").setDescription("User to timeout").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("duration").setDescription("Duration like 10m, 2h, 1d").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason").setDescription("Reason for the timeout").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a timeout from a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName("user").setDescription("User to untimeout").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason").setDescription("Reason for removing the timeout").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(option =>
      option.setName("user").setDescription("User to kick").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason").setDescription("Reason for the kick").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(option =>
      option.setName("user").setDescription("User to ban").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason").setDescription("Reason for the ban").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user by id")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(option =>
      option.setName("user_id").setDescription("User id to unban").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason").setDescription("Reason for the unban").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set channel slowmode")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption(option =>
      option.setName("seconds").setDescription("Slowmode in seconds, 0 to disable").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("note")
    .setDescription("Save a private staff note about a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName("user").setDescription("User to note").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("content").setDescription("Staff note").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("notes")
    .setDescription("View staff notes for a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName("user").setDescription("User to inspect").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("case")
    .setDescription("View a moderation case by id")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addIntegerOption(option =>
      option.setName("id").setDescription("Case number").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("cases")
    .setDescription("View recent moderation cases for a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName("user").setDescription("User to inspect").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Manage automatic moderation")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand.setName("view").setDescription("View current automod settings")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("invites")
        .setDescription("Toggle invite-link filtering")
        .addBooleanOption(option =>
          option.setName("enabled").setDescription("Enable or disable").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("spam")
        .setDescription("Toggle spam filtering")
        .addBooleanOption(option =>
          option.setName("enabled").setDescription("Enable or disable").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("caps")
        .setDescription("Toggle all-caps filtering")
        .addBooleanOption(option =>
          option.setName("enabled").setDescription("Enable or disable").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("bannedwords")
        .setDescription("Toggle banned-word filtering")
        .addBooleanOption(option =>
          option.setName("enabled").setDescription("Enable or disable").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("mentions")
        .setDescription("Set the max mentions allowed in one message")
        .addIntegerOption(option =>
          option.setName("limit").setDescription("Mention limit").setRequired(true).setMinValue(1).setMaxValue(25)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("exemptchannel")
        .setDescription("Add or remove a channel exemption")
        .addStringOption(option =>
          option.setName("mode").setDescription("add or remove").setRequired(true).addChoices(
            { name: "add", value: "add" },
            { name: "remove", value: "remove" }
          )
        )
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("Channel to exempt or unexempt")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("exemptrole")
        .setDescription("Add or remove a role exemption")
        .addStringOption(option =>
          option.setName("mode").setDescription("add or remove").setRequired(true).addChoices(
            { name: "add", value: "add" },
            { name: "remove", value: "remove" }
          )
        )
        .addRoleOption(option =>
          option.setName("role").setDescription("Role to exempt or unexempt").setRequired(true)
        )
    ),

  new SlashCommandBuilder()
    .setName("bannedwords")
    .setDescription("Manage the banned word list")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand.setName("list").setDescription("View the current banned words")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("add")
        .setDescription("Add a banned word or phrase")
        .addStringOption(option =>
          option.setName("term").setDescription("Word or phrase to block").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("remove")
        .setDescription("Remove a banned word or phrase")
        .addStringOption(option =>
          option.setName("term").setDescription("Word or phrase to remove").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand.setName("clear").setDescription("Clear the banned word list")
    ),

  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Manage bot settings")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand.setName("view").setDescription("View current bot settings")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("logchannel")
        .setDescription("Set the moderation log channel")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("Channel to use for logs")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("verifychannel")
        .setDescription("Set the verify channel")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("Channel to use for verification")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("ruleschannel")
        .setDescription("Set the rules channel")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("Channel to use for rules")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("tiktokuser")
        .setDescription("Set the TikTok username to watch")
        .addStringOption(option =>
          option.setName("username").setDescription("TikTok username without @").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("tiktokchannel")
        .setDescription("Set the Discord channel for TikTok alerts")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("Channel for TikTok notifications")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("reset")
        .setDescription("Reset one saved setting back to its env default")
        .addStringOption(option =>
          option
            .setName("target")
            .setDescription("Setting to reset")
            .setRequired(true)
            .addChoices(
              { name: "log channel", value: "logchannel" },
              { name: "verify channel", value: "verifychannel" },
              { name: "rules channel", value: "ruleschannel" },
              { name: "TikTok username", value: "tiktokuser" },
              { name: "TikTok alerts channel", value: "tiktokchannel" }
            )
        )
    )
].map(command => command.toJSON());

let tiktokConnection = null;
let reconnectTimeout = null;
let wasLive = false;
const startedAt = Date.now();

function makeEmbed({ title, description, color = COLORS.pink, fields = [], thumbnail = null }) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter(FOOTER)
    .setTimestamp();

  if (fields.length) embed.addFields(fields);
  if (thumbnail) embed.setThumbnail(thumbnail);

  return embed;
}

async function logEmbed(embed) {
  try {
    const logChannelId = getLogChannelId();
    if (!logChannelId) return;
    const channel = await client.channels.fetch(logChannelId);
    if (!channel) return;
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Log send error:", error.message);
  }
}

async function safeSend(channelId, payload) {
  try {
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;
    await channel.send(payload);
  } catch (error) {
    console.error("Failed to send message:", error.message);
  }
}

async function resolveVerifyMessageId() {
  if (config.verifyMessageId) return config.verifyMessageId;
  const verifyChannelId = getVerifyChannelId();
  if (!verifyChannelId) return null;

  try {
    const channel = await client.channels.fetch(verifyChannelId);
    if (!channel?.messages?.fetch) return null;

    const messages = await channel.messages.fetch({ limit: 25 });
    const verifyMessage = messages.find(message =>
      message.author?.id === client.user.id &&
      message.embeds?.some(embed =>
        typeof embed.title === "string" &&
        embed.title.toLowerCase().includes("welcome to the mochi garden")
      )
    );

    if (!verifyMessage) return null;

    config.verifyMessageId = verifyMessage.id;
    saveConfig();
    return verifyMessage.id;
  } catch (error) {
    console.error("Failed to resolve verify message:", error.message);
    return null;
  }
}

function parseDuration(input) {
  const match = /^(\d+)([smhd])$/i.exec((input || "").trim());
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  const milliseconds = value * multipliers[unit];
  if (!Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > MAX_TIMEOUT_MS) {
    return null;
  }

  return milliseconds;
}

function formatDuration(milliseconds) {
  if (milliseconds % (24 * 60 * 60 * 1000) === 0) return `${milliseconds / (24 * 60 * 60 * 1000)}d`;
  if (milliseconds % (60 * 60 * 1000) === 0) return `${milliseconds / (60 * 60 * 1000)}h`;
  if (milliseconds % (60 * 1000) === 0) return `${milliseconds / (60 * 1000)}m`;
  return `${Math.floor(milliseconds / 1000)}s`;
}

function getWarnings(userId) {
  return Array.isArray(config.warnings[userId]) ? config.warnings[userId] : [];
}

function addWarning(userId, moderatorTag, reason) {
  const warnings = getWarnings(userId);
  warnings.push({
    reason,
    moderatorTag,
    createdAt: new Date().toISOString()
  });
  config.warnings[userId] = warnings;
  saveConfig();
  return warnings;
}

function clearWarnings(userId) {
  const count = getWarnings(userId).length;
  delete config.warnings[userId];
  saveConfig();
  return count;
}

function getNotes(userId) {
  return Array.isArray(config.notes[userId]) ? config.notes[userId] : [];
}

function addNote(userId, moderatorTag, content) {
  const notes = getNotes(userId);
  notes.push({
    content,
    moderatorTag,
    createdAt: new Date().toISOString()
  });
  config.notes[userId] = notes;
  saveConfig();
  return notes;
}
function addCase({ action, targetId, targetTag, moderatorTag, reason, details = [] }) {
  const entry = {
    id: config.nextCaseId,
    action,
    targetId,
    targetTag,
    moderatorTag,
    reason,
    details,
    createdAt: new Date().toISOString()
  };

  config.nextCaseId += 1;
  config.cases.push(entry);
  saveConfig();
  return entry;
}

function getCasesForUser(userId) {
  return config.cases.filter(entry => entry.targetId === userId);
}

function getCaseById(caseId) {
  return config.cases.find(entry => entry.id === caseId) || null;
}

function buildCaseFields(entry) {
  const baseFields = [
    { name: "Action", value: entry.action, inline: true },
    { name: "Target", value: `${entry.targetTag} (${entry.targetId})`, inline: false },
    { name: "Moderator", value: entry.moderatorTag, inline: true },
    { name: "Created", value: `<t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:F>`, inline: false },
    { name: "Reason", value: entry.reason || "No reason provided.", inline: false }
  ];

  return [...baseFields, ...entry.details];
}

function isAutoModExempt(message) {
  if (!message.member) return true;
  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  if (config.automod.exemptChannelIds.includes(message.channel.id)) return true;

  return message.member.roles.cache.some(role => config.automod.exemptRoleIds.includes(role.id));
}

function hasExcessiveCaps(content) {
  const letters = content.match(/[a-z]/gi) || [];
  if (letters.length < 12) return false;

  const uppercaseCount = (content.match(/[A-Z]/g) || []).length;
  return uppercaseCount / letters.length >= 0.7;
}

function trackSpam(message) {
  const now = Date.now();
  const previous = spamTracker.get(message.author.id) || [];
  const recent = previous.filter(entry => now - entry.timestamp <= 8000);
  const normalized = message.content.trim().toLowerCase();

  recent.push({ timestamp: now, content: normalized });
  spamTracker.set(message.author.id, recent);

  const duplicateCount = recent.filter(entry => entry.content && entry.content === normalized).length;
  return recent.length >= 5 || duplicateCount >= 3;
}

async function notifyUser(user, embed) {
  await user.send({ embeds: [embed] }).catch(() => {});
}

async function ensureModeratable(interaction, member, actionLabel) {
  if (!member) {
    await interaction.reply({ content: "That member could not be found.", ephemeral: true });
    return false;
  }

  if (member.id === interaction.user.id) {
    await interaction.reply({ content: `You cannot ${actionLabel} yourself.`, ephemeral: true });
    return false;
  }

  if (member.id === interaction.guild.ownerId) {
    await interaction.reply({ content: `You cannot ${actionLabel} the server owner.`, ephemeral: true });
    return false;
  }

  if (interaction.member.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
    await interaction.reply({
      content: `You need a higher role than that member to ${actionLabel} them.`,
      ephemeral: true
    });
    return false;
  }

  if (interaction.guild.members.me.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
    await interaction.reply({
      content: `My role needs to be higher than that member to ${actionLabel} them.`,
      ephemeral: true
    });
    return false;
  }

  return true;
}

async function handleAutoModViolation(message, reason, actionLabel) {
  await message.delete().catch(() => {});

  const notice = await message.channel.send({
    content: `${message.author}, ${reason}`
  }).catch(() => null);

  if (notice) {
    setTimeout(() => notice.delete().catch(() => {}), 10000);
  }

  const entry = addCase({
    action: `automod:${actionLabel}`,
    targetId: message.author.id,
    targetTag: message.author.tag,
    moderatorTag: "AutoMod",
    reason,
    details: [
      { name: "Channel", value: `${message.channel}`, inline: true },
      {
        name: "Message",
        value: message.content?.slice(0, 1024) || "*No text content*",
        inline: false
      }
    ]
  });

  await logEmbed(
    makeEmbed({
      title: `Auto mod case #${entry.id}`,
      description: `${message.author.tag} had a message removed.`,
      color: COLORS.red,
      fields: buildCaseFields(entry)
    })
  );
}

function scheduleTikTokReconnect() {
  if (reconnectTimeout) return;

  console.log("Retrying TikTok connection in 60 seconds...");

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    startTikTokLive();
  }, 60000);
}

async function resetTikTokConnection() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  wasLive = false;

  if (tiktokConnection) {
    try {
      tiktokConnection.disconnect();
    } catch (error) {
      console.error("TikTok disconnect error:", error.message);
    }
    tiktokConnection = null;
  }

  await startTikTokLive();
}

async function startTikTokLive() {
  const tiktokUsername = getTikTokUsername();
  const tiktokChannelId = getTikTokChannelId();

  if (!tiktokUsername || !tiktokChannelId) {
    console.log("TikTok LIVE not configured.");
    return;
  }

  try {
    console.log(`Trying TikTok LIVE connection for @${tiktokUsername}...`);
    tiktokConnection = new WebcastPushConnection(tiktokUsername);
    await tiktokConnection.connect();
    console.log(`Connected to TikTok LIVE for @${tiktokUsername}`);

    if (!wasLive) {
      wasLive = true;
      await safeSend(tiktokChannelId, {
        embeds: [
          makeEmbed({
            title: "TikTok LIVE started",
            description:
              `**@${tiktokUsername}** is live right now.\n\n` +
              `Come join the stream here:\nhttps://tiktok.com/@${tiktokUsername}/live`,
            color: COLORS.rose
          })
        ]
      });
    }

    tiktokConnection.on("streamEnd", async () => {
      wasLive = false;
      await safeSend(tiktokChannelId, {
        embeds: [
          makeEmbed({
            title: "TikTok LIVE ended",
            description: `@${tiktokUsername}'s stream has ended.`,
            color: COLORS.purple
          })
        ]
      });
      scheduleTikTokReconnect();
    });

    tiktokConnection.on("disconnected", () => {
      wasLive = false;
      scheduleTikTokReconnect();
    });
  } catch (error) {
    console.log(`TikTok user offline or unavailable: ${error.message}`);
    wasLive = false;
    scheduleTikTokReconnect();
  }
}

function buildAutoModSummary() {
  return [
    `Invites: ${config.automod.invites ? "on" : "off"}`,
    `Spam: ${config.automod.spam ? "on" : "off"}`,
    `Caps: ${config.automod.caps ? "on" : "off"}`,
    `Banned words: ${config.automod.bannedWords ? "on" : "off"}`,
    `Banned word count: ${getBannedWords().length}`,
    `Mention limit: ${config.automod.maxMentions}`,
    `Exempt channels: ${config.automod.exemptChannelIds.length}`,
    `Exempt roles: ${config.automod.exemptRoleIds.length}`
  ].join("\n");
}

function buildSettingsSummary() {
  return [
    `Log channel: ${getLogChannelId() ? `<#${getLogChannelId()}>` : "Not set"}`,
    `Verify channel: ${getVerifyChannelId() ? `<#${getVerifyChannelId()}>` : "Not set"}`,
    `Rules channel: ${getRulesChannelId() ? `<#${getRulesChannelId()}>` : "Not set"}`,
    `TikTok username: ${getTikTokUsername() ? `@${getTikTokUsername()}` : "Not set"}`,
    `TikTok alerts channel: ${getTikTokChannelId() ? `<#${getTikTokChannelId()}>` : "Not set"}`
  ].join("\n");
}

function buildHelpEmbed() {
  return makeEmbed({
    title: "Mochi Bot Help",
    description: "Main moderation and server commands.",
    color: COLORS.blue,
    fields: [
      {
        name: "Moderation",
        value:
          "`/warn`, `/warnings`, `/clearwarnings`, `/timeout`, `/untimeout`, `/kick`, `/ban`, `/unban`, `/slowmode`",
        inline: false
      },
      {
        name: "Staff Records",
        value: "`/note`, `/notes`, `/case`, `/cases`, `/automod`, `/bannedwords`, `/settings`",
        inline: false
      },
      {
        name: "Runtime",
        value: "`/status`, `/reload`",
        inline: false
      },
      {
        name: "Server Tools",
        value: "`/setupverify`, `/setuprules`, `/announce`, `/purge`, `/lockdown`, `/unlockdown`",
        inline: false
      },
      {
        name: "Info",
        value: "`/userinfo`, `/serverstats`, `/help`",
        inline: false
      }
    ]
  });
}

function buildStatusEmbed() {
  const uptimeSeconds = Math.floor(startedAt / 1000);
  const verifyChannelId = getVerifyChannelId();
  const rulesChannelId = getRulesChannelId();
  const logChannelId = getLogChannelId();
  const tiktokUsername = getTikTokUsername();
  const tiktokChannelId = getTikTokChannelId();

  return makeEmbed({
    title: "Bot status",
    description: "Current runtime and configuration state.",
    color: COLORS.blue,
    fields: [
      { name: "Client", value: client.user ? client.user.tag : "Not ready", inline: true },
      { name: "Uptime", value: `<t:${uptimeSeconds}:R>`, inline: true },
      { name: "Ping", value: `${Math.round(client.ws.ping)}ms`, inline: true },
      { name: "Verify Channel", value: verifyChannelId ? `<#${verifyChannelId}>` : "Not set", inline: true },
      { name: "Rules Channel", value: rulesChannelId ? `<#${rulesChannelId}>` : "Not set", inline: true },
      { name: "Log Channel", value: logChannelId ? `<#${logChannelId}>` : "Not set", inline: true },
      { name: "TikTok User", value: tiktokUsername ? `@${tiktokUsername}` : "Not set", inline: true },
      { name: "TikTok Alerts", value: tiktokChannelId ? `<#${tiktokChannelId}>` : "Not set", inline: true },
      { name: "TikTok Connected", value: tiktokConnection ? "Yes" : "No", inline: true },
      { name: "Verify Message", value: config.verifyMessageId || "Not cached", inline: false },
      { name: "Cases Logged", value: `${config.cases.length}`, inline: true },
      { name: "Banned Words", value: `${getBannedWords().length}`, inline: true }
    ]
  });
}

client.once("clientReady", async () => {
  try {
    console.log(`Logged in as ${client.user.tag}`);
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands
    });

    console.log("Slash commands registered.");
    await resolveVerifyMessageId();
    await startTikTokLive();
  } catch (error) {
    console.error("Ready error:", error);
  }
});

client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const verifyMessageId = await resolveVerifyMessageId();
    if (!verifyMessageId || reaction.message.id !== verifyMessageId) return;

    const roleData = MOCHI_ROLES[reaction.emoji.name];
    if (!roleData?.id) return;

    const member = await reaction.message.guild.members.fetch(user.id);
    await member.roles.remove(ALL_ROLES.filter(id => id !== roleData.id));
    await member.roles.add(roleData.id);

    await logEmbed(
      makeEmbed({
        title: "Role selected",
        description: `${user.tag} received ${roleData.name}.`,
        color: COLORS.mint
      })
    );
  } catch (error) {
    console.error("Reaction add error:", error);
  }
});
client.on("messageReactionRemove", async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const verifyMessageId = await resolveVerifyMessageId();
    if (!verifyMessageId || reaction.message.id !== verifyMessageId) return;

    const roleData = MOCHI_ROLES[reaction.emoji.name];
    if (!roleData?.id) return;

    const member = await reaction.message.guild.members.fetch(user.id);
    if (!member.roles.cache.has(roleData.id)) return;

    await member.roles.remove(roleData.id);
    await logEmbed(
      makeEmbed({
        title: "Role removed",
        description: `${user.tag} removed ${roleData.name}.`,
        color: COLORS.yellow
      })
    );
  } catch (error) {
    console.error("Reaction remove error:", error);
  }
});

client.on("interactionCreate", async interaction => {
  try {
    if (!interaction.isChatInputCommand()) return;

    const { guild, channel } = interaction;

    if (interaction.commandName === "help") {
      return interaction.reply({ embeds: [buildHelpEmbed()], ephemeral: true });
    }

    if (interaction.commandName === "status") {
      return interaction.reply({ embeds: [buildStatusEmbed()], ephemeral: true });
    }

    if (interaction.commandName === "reload") {
      const target = interaction.options.getString("target");

      if (target === "config" || target === "all") {
        const previousVerifyMessageId = config.verifyMessageId;
        config = loadConfig();
        if (!config.verifyMessageId && previousVerifyMessageId) {
          config.verifyMessageId = previousVerifyMessageId;
        }
      }

      if (target === "tiktok" || target === "all") {
        await resetTikTokConnection();
      }

      return interaction.reply({
        content:
          target === "all"
            ? "Reloaded config and TikTok connection."
            : target === "config"
              ? "Reloaded config from disk."
              : "Reloaded TikTok connection.",
        ephemeral: true
      });
    }

    if (interaction.commandName === "setupverify") {
      await interaction.deferReply({ ephemeral: true });
      const verifyChannel = await client.channels.fetch(getVerifyChannelId());

      const verifyEmbed = makeEmbed({
        title: "welcome to the mochi garden",
        description:
          "Pick one flavor role by reacting below to unlock your vibe.\n\n" +
          "🌸 Sakura\n🍓 Strawberry Milk\n🍵 Matcha Dream\n🫐 Mystic Berry\n💜 Taro Cloud\n\n" +
          "You can switch your role anytime by changing your reaction.",
        color: COLORS.pink
      });

      const sentMessage = await verifyChannel.send({ embeds: [verifyEmbed] });
      for (const emoji of Object.keys(MOCHI_ROLES)) {
        await sentMessage.react(emoji);
      }

      config.verifyMessageId = sentMessage.id;
      saveConfig();
      return interaction.editReply("Verify menu created.");
    }

    if (interaction.commandName === "setuprules") {
      const rulesChannel = await client.channels.fetch(getRulesChannelId());

      await rulesChannel.send({
        embeds: [
          makeEmbed({
            title: "Server rules",
            description: "Please keep everything comfy, safe, and fun for everyone.",
            color: COLORS.purple,
            fields: [
              { name: "1", value: "Be kind and respectful to everyone.", inline: false },
              { name: "2", value: "No spam, harassment, or drama.", inline: false },
              { name: "3", value: "Follow Discord ToS at all times.", inline: false },
              { name: "4", value: "Use channels for their correct purpose.", inline: false },
              { name: "5", value: `Please verify in <#${getVerifyChannelId()}> to access the server.`, inline: false }
            ]
          })
        ]
      });

      return interaction.reply({ content: "Rules posted.", ephemeral: true });
    }

    if (interaction.commandName === "lockdown") {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
      await channel.send({
        embeds: [
          makeEmbed({
            title: "Channel locked",
            description: "This channel has been placed into lockdown by staff.",
            color: COLORS.red
          })
        ]
      });
      return interaction.reply({ content: "Channel locked.", ephemeral: true });
    }

    if (interaction.commandName === "unlockdown") {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
      await channel.send({
        embeds: [
          makeEmbed({
            title: "Channel unlocked",
            description: "This channel is open again. Please keep it comfy.",
            color: COLORS.mint
          })
        ]
      });
      return interaction.reply({ content: "Channel unlocked.", ephemeral: true });
    }

    if (interaction.commandName === "announce") {
      const message = interaction.options.getString("message");
      await channel.send({
        embeds: [
          makeEmbed({
            title: "Announcement",
            description: message,
            color: COLORS.blue
          })
        ]
      });
      return interaction.reply({ content: "Announcement sent.", ephemeral: true });
    }

    if (interaction.commandName === "dm") {
      const user = interaction.options.getUser("user");
      const message = interaction.options.getString("message");

      await notifyUser(
        user,
        makeEmbed({
          title: "Message from staff",
          description: message,
          color: COLORS.pink
        })
      );

      return interaction.reply({ content: "DM sent.", ephemeral: true });
    }

    if (interaction.commandName === "purge") {
      const amount = interaction.options.getInteger("amount");
      if (amount < 1 || amount > 100) {
        return interaction.reply({ content: "Choose a number from 1 to 100.", ephemeral: true });
      }

      await channel.bulkDelete(amount, true);
      return interaction.reply({ content: `Deleted ${amount} message(s).`, ephemeral: true });
    }

    if (interaction.commandName === "userinfo") {
      const user = interaction.options.getUser("user");
      const member = await guild.members.fetch(user.id);

      return interaction.reply({
        embeds: [
          makeEmbed({
            title: "User info",
            description: `${user}`,
            color: COLORS.purple,
            thumbnail: user.displayAvatarURL({ dynamic: true }),
            fields: [
              { name: "Tag", value: user.tag, inline: true },
              { name: "ID", value: user.id, inline: true },
              {
                name: "Joined Server",
                value: member.joinedAt ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : "Unknown",
                inline: false
              },
              {
                name: "Account Created",
                value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`,
                inline: false
              }
            ]
          })
        ]
      });
    }

    if (interaction.commandName === "serverstats") {
      return interaction.reply({
        embeds: [
          makeEmbed({
            title: "Server stats",
            description: "A quick look at the server.",
            color: COLORS.mint,
            fields: [
              { name: "Server Name", value: guild.name, inline: true },
              { name: "Members", value: `${guild.memberCount}`, inline: true },
              { name: "Channels", value: `${guild.channels.cache.size}`, inline: true },
              { name: "Roles", value: `${guild.roles.cache.size}`, inline: true }
            ],
            thumbnail: guild.iconURL({ dynamic: true })
          })
        ]
      });
    }

    if (interaction.commandName === "warn") {
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason");
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!(await ensureModeratable(interaction, member, "warn"))) return;

      const warnings = addWarning(user.id, interaction.user.tag, reason);
      const entry = addCase({
        action: "warn",
        targetId: user.id,
        targetTag: user.tag,
        moderatorTag: interaction.user.tag,
        reason,
        details: [{ name: "Total warnings", value: `${warnings.length}`, inline: true }]
      });

      await notifyUser(
        user,
        makeEmbed({
          title: "Warning received",
          description: `You were warned in **${guild.name}**.`,
          color: COLORS.yellow,
          fields: buildCaseFields(entry)
        })
      );

      await logEmbed(
        makeEmbed({
          title: `Case #${entry.id}: warning`,
          description: `${user.tag} received a warning.`,
          color: COLORS.yellow,
          fields: buildCaseFields(entry)
        })
      );

      return interaction.reply({
        content: `${user.tag} has been warned. Total warnings: ${warnings.length}.`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "warnings") {
      const user = interaction.options.getUser("user");
      const warnings = getWarnings(user.id);

      if (!warnings.length) {
        return interaction.reply({ content: `${user.tag} has no warnings.`, ephemeral: true });
      }

      const visible = warnings.slice(-10).map((warning, index) => {
        const warningNumber = warnings.length - Math.min(warnings.length, 10) + index + 1;
        return `${warningNumber}. ${warning.reason} - ${warning.moderatorTag} - <t:${Math.floor(new Date(warning.createdAt).getTime() / 1000)}:R>`;
      });

      return interaction.reply({
        embeds: [
          makeEmbed({
            title: "Warning history",
            description: `Warnings for ${user.tag}`,
            color: COLORS.yellow,
            fields: [{ name: "Entries", value: visible.join("\n").slice(0, 1024), inline: false }]
          })
        ],
        ephemeral: true
      });
    }

    if (interaction.commandName === "clearwarnings") {
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason");
      const count = clearWarnings(user.id);

      const entry = addCase({
        action: "clearwarnings",
        targetId: user.id,
        targetTag: user.tag,
        moderatorTag: interaction.user.tag,
        reason,
        details: [{ name: "Warnings cleared", value: `${count}`, inline: true }]
      });
      await logEmbed(
        makeEmbed({
          title: `Case #${entry.id}: warnings cleared`,
          description: `${user.tag}'s warnings were cleared.`,
          color: COLORS.mint,
          fields: buildCaseFields(entry)
        })
      );

      return interaction.reply({
        content: `Cleared ${count} warning(s) for ${user.tag}.`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "timeout") {
      const user = interaction.options.getUser("user");
      const durationInput = interaction.options.getString("duration");
      const reason = interaction.options.getString("reason");
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!(await ensureModeratable(interaction, member, "timeout"))) return;
      if (!member.moderatable) {
        return interaction.reply({ content: "I cannot timeout that member.", ephemeral: true });
      }

      const durationMs = parseDuration(durationInput);
      if (!durationMs) {
        return interaction.reply({
          content: "Use a valid duration like 10m, 2h, or 1d. Discord timeouts max out at 28d.",
          ephemeral: true
        });
      }

      await member.timeout(durationMs, `${interaction.user.tag}: ${reason}`);

      const entry = addCase({
        action: "timeout",
        targetId: user.id,
        targetTag: user.tag,
        moderatorTag: interaction.user.tag,
        reason,
        details: [{ name: "Duration", value: formatDuration(durationMs), inline: true }]
      });

      await notifyUser(
        user,
        makeEmbed({
          title: "You were timed out",
          description: `A moderator timed you out in **${guild.name}**.`,
          color: COLORS.red,
          fields: buildCaseFields(entry)
        })
      );

      await logEmbed(
        makeEmbed({
          title: `Case #${entry.id}: timeout`,
          description: `${user.tag} was timed out.`,
          color: COLORS.red,
          fields: buildCaseFields(entry)
        })
      );

      return interaction.reply({
        content: `${user.tag} was timed out for ${formatDuration(durationMs)}.`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "untimeout") {
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason") || "Timeout removed by staff.";
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!(await ensureModeratable(interaction, member, "untimeout"))) return;
      if (!member.moderatable) {
        return interaction.reply({ content: "I cannot remove that timeout.", ephemeral: true });
      }

      await member.timeout(null, `${interaction.user.tag}: ${reason}`);

      const entry = addCase({
        action: "untimeout",
        targetId: user.id,
        targetTag: user.tag,
        moderatorTag: interaction.user.tag,
        reason
      });

      await logEmbed(
        makeEmbed({
          title: `Case #${entry.id}: timeout removed`,
          description: `${user.tag}'s timeout was removed.`,
          color: COLORS.mint,
          fields: buildCaseFields(entry)
        })
      );

      return interaction.reply({ content: `${user.tag}'s timeout was removed.`, ephemeral: true });
    }

    if (interaction.commandName === "kick") {
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason");
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!(await ensureModeratable(interaction, member, "kick"))) return;
      if (!member.kickable) {
        return interaction.reply({ content: "I cannot kick that member.", ephemeral: true });
      }

      const entry = addCase({
        action: "kick",
        targetId: user.id,
        targetTag: user.tag,
        moderatorTag: interaction.user.tag,
        reason
      });

      await notifyUser(
        user,
        makeEmbed({
          title: "You were kicked",
          description: `You were removed from **${guild.name}**.`,
          color: COLORS.red,
          fields: buildCaseFields(entry)
        })
      );

      await member.kick(`${interaction.user.tag}: ${reason}`);

      await logEmbed(
        makeEmbed({
          title: `Case #${entry.id}: kick`,
          description: `${user.tag} was kicked.`,
          color: COLORS.red,
          fields: buildCaseFields(entry)
        })
      );

      return interaction.reply({ content: `${user.tag} was kicked.`, ephemeral: true });
    }

    if (interaction.commandName === "ban") {
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason");
      const member = await guild.members.fetch(user.id).catch(() => null);

      if (member && !(await ensureModeratable(interaction, member, "ban"))) return;
      if (member && !member.bannable) {
        return interaction.reply({ content: "I cannot ban that member.", ephemeral: true });
      }

      const entry = addCase({
        action: "ban",
        targetId: user.id,
        targetTag: user.tag,
        moderatorTag: interaction.user.tag,
        reason
      });

      await notifyUser(
        user,
        makeEmbed({
          title: "You were banned",
          description: `You were banned from **${guild.name}**.`,
          color: COLORS.red,
          fields: buildCaseFields(entry)
        })
      );

      await guild.members.ban(user.id, { reason: `${interaction.user.tag}: ${reason}` });

      await logEmbed(
        makeEmbed({
          title: `Case #${entry.id}: ban`,
          description: `${user.tag} was banned.`,
          color: COLORS.red,
          fields: buildCaseFields(entry)
        })
      );

      return interaction.reply({ content: `${user.tag} was banned.`, ephemeral: true });
    }

    if (interaction.commandName === "unban") {
      const userId = interaction.options.getString("user_id");
      const reason = interaction.options.getString("reason");

      await guild.members.unban(userId, `${interaction.user.tag}: ${reason}`);

      const entry = addCase({
        action: "unban",
        targetId: userId,
        targetTag: `User ${userId}`,
        moderatorTag: interaction.user.tag,
        reason
      });

      await logEmbed(
        makeEmbed({
          title: `Case #${entry.id}: unban`,
          description: `${userId} was unbanned.`,
          color: COLORS.mint,
          fields: buildCaseFields(entry)
        })
      );

      return interaction.reply({ content: `Unbanned user ${userId}.`, ephemeral: true });
    }

    if (interaction.commandName === "slowmode") {
      const seconds = interaction.options.getInteger("seconds");
      if (seconds < 0 || seconds > 21600) {
        return interaction.reply({
          content: "Slowmode must be between 0 and 21600 seconds.",
          ephemeral: true
        });
      }

      await channel.setRateLimitPerUser(seconds);
      return interaction.reply({
        content: seconds === 0 ? "Slowmode disabled." : `Slowmode set to ${seconds} second(s).`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "note") {
      const user = interaction.options.getUser("user");
      const content = interaction.options.getString("content");
      const notes = addNote(user.id, interaction.user.tag, content);

      const entry = addCase({
        action: "note",
        targetId: user.id,
        targetTag: user.tag,
        moderatorTag: interaction.user.tag,
        reason: content,
        details: [{ name: "Total notes", value: `${notes.length}`, inline: true }]
      });

      await logEmbed(
        makeEmbed({
          title: `Case #${entry.id}: staff note`,
          description: `A staff note was saved for ${user.tag}.`,
          color: COLORS.gray,
          fields: buildCaseFields(entry)
        })
      );

      return interaction.reply({ content: `Saved a note for ${user.tag}.`, ephemeral: true });
    }

    if (interaction.commandName === "notes") {
      const user = interaction.options.getUser("user");
      const notes = getNotes(user.id);

      if (!notes.length) {
        return interaction.reply({ content: `${user.tag} has no saved staff notes.`, ephemeral: true });
      }

      const visible = notes.slice(-10).map((note, index) => {
        const noteNumber = notes.length - Math.min(notes.length, 10) + index + 1;
        return `${noteNumber}. ${note.content} - ${note.moderatorTag} - <t:${Math.floor(new Date(note.createdAt).getTime() / 1000)}:R>`;
      });

      return interaction.reply({
        embeds: [
          makeEmbed({
            title: "Staff notes",
            description: `Notes for ${user.tag}`,
            color: COLORS.gray,
            fields: [{ name: "Entries", value: visible.join("\n").slice(0, 1024), inline: false }]
          })
        ],
        ephemeral: true
      });
    }
    if (interaction.commandName === "case") {
      const caseId = interaction.options.getInteger("id");
      const entry = getCaseById(caseId);

      if (!entry) {
        return interaction.reply({ content: `Case #${caseId} was not found.`, ephemeral: true });
      }

      return interaction.reply({
        embeds: [
          makeEmbed({
            title: `Case #${entry.id}`,
            description: `Moderation case details for ${entry.targetTag}.`,
            color: COLORS.blue,
            fields: buildCaseFields(entry)
          })
        ],
        ephemeral: true
      });
    }

    if (interaction.commandName === "cases") {
      const user = interaction.options.getUser("user");
      const entries = getCasesForUser(user.id).slice(-10);

      if (!entries.length) {
        return interaction.reply({ content: `${user.tag} has no recorded cases.`, ephemeral: true });
      }

      const lines = entries.map(entry =>
        `#${entry.id} ${entry.action} - ${entry.reason} - ${entry.moderatorTag} - <t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:R>`
      );

      return interaction.reply({
        embeds: [
          makeEmbed({
            title: "Recent cases",
            description: `Recent moderation cases for ${user.tag}`,
            color: COLORS.blue,
            fields: [{ name: "Cases", value: lines.join("\n").slice(0, 1024), inline: false }]
          })
        ],
        ephemeral: true
      });
    }

    if (interaction.commandName === "automod") {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "view") {
        return interaction.reply({
          embeds: [
            makeEmbed({
              title: "Auto mod settings",
              description: buildAutoModSummary(),
              color: COLORS.blue,
              fields: [
                {
                  name: "Exempt channels",
                  value: config.automod.exemptChannelIds.map(id => `<#${id}>`).join(", ") || "None",
                  inline: false
                },
                {
                  name: "Exempt roles",
                  value: config.automod.exemptRoleIds.map(id => `<@&${id}>`).join(", ") || "None",
                  inline: false
                }
              ]
            })
          ],
          ephemeral: true
        });
      }

      if (subcommand === "invites") {
        config.automod.invites = interaction.options.getBoolean("enabled");
      }

      if (subcommand === "spam") {
        config.automod.spam = interaction.options.getBoolean("enabled");
      }

      if (subcommand === "caps") {
        config.automod.caps = interaction.options.getBoolean("enabled");
      }

      if (subcommand === "bannedwords") {
        config.automod.bannedWords = interaction.options.getBoolean("enabled");
      }

      if (subcommand === "mentions") {
        config.automod.maxMentions = interaction.options.getInteger("limit");
      }

      if (subcommand === "exemptchannel") {
        const mode = interaction.options.getString("mode");
        const targetChannel = interaction.options.getChannel("channel");

        if (mode === "add" && !config.automod.exemptChannelIds.includes(targetChannel.id)) {
          config.automod.exemptChannelIds.push(targetChannel.id);
        }

        if (mode === "remove") {
          config.automod.exemptChannelIds = config.automod.exemptChannelIds.filter(id => id !== targetChannel.id);
        }
      }

      if (subcommand === "exemptrole") {
        const mode = interaction.options.getString("mode");
        const role = interaction.options.getRole("role");

        if (mode === "add" && !config.automod.exemptRoleIds.includes(role.id)) {
          config.automod.exemptRoleIds.push(role.id);
        }

        if (mode === "remove") {
          config.automod.exemptRoleIds = config.automod.exemptRoleIds.filter(id => id !== role.id);
        }
      }

      saveConfig();
      return interaction.reply({
        content: `Updated auto mod setting: ${subcommand}.`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "bannedwords") {
      const subcommand = interaction.options.getSubcommand();
      const bannedWords = getBannedWords();

      if (subcommand === "list") {
        return interaction.reply({
          embeds: [
            makeEmbed({
              title: "Banned words",
              description: bannedWords.length ? bannedWords.join("\n").slice(0, 4000) : "No banned words saved.",
              color: COLORS.yellow
            })
          ],
          ephemeral: true
        });
      }

      if (subcommand === "add") {
        const term = interaction.options.getString("term").trim().toLowerCase();
        if (!term) {
          return interaction.reply({ content: "Enter a valid word or phrase.", ephemeral: true });
        }

        if (bannedWords.includes(term)) {
          return interaction.reply({ content: `"${term}" is already on the banned list.`, ephemeral: true });
        }

        config.automod.bannedWordList.push(term);
        saveConfig();
        return interaction.reply({ content: `Added "${term}" to the banned-word list.`, ephemeral: true });
      }

      if (subcommand === "remove") {
        const term = interaction.options.getString("term").trim().toLowerCase();
        const nextList = bannedWords.filter(word => word !== term);

        if (nextList.length === bannedWords.length) {
          return interaction.reply({ content: `"${term}" was not on the banned list.`, ephemeral: true });
        }

        config.automod.bannedWordList = nextList;
        saveConfig();
        return interaction.reply({ content: `Removed "${term}" from the banned-word list.`, ephemeral: true });
      }

      if (subcommand === "clear") {
        config.automod.bannedWordList = [];
        saveConfig();
        return interaction.reply({ content: "Cleared the banned-word list.", ephemeral: true });
      }
    }

    if (interaction.commandName === "settings") {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "view") {
        return interaction.reply({
          embeds: [
            makeEmbed({
              title: "Bot settings",
              description: buildSettingsSummary(),
              color: COLORS.blue
            })
          ],
          ephemeral: true
        });
      }

      if (subcommand === "logchannel") {
        config.settings.logChannelId = interaction.options.getChannel("channel").id;
      }

      if (subcommand === "verifychannel") {
        config.settings.verifyChannelId = interaction.options.getChannel("channel").id;
        config.verifyMessageId = null;
      }

      if (subcommand === "ruleschannel") {
        config.settings.rulesChannelId = interaction.options.getChannel("channel").id;
      }

      if (subcommand === "tiktokuser") {
        config.settings.tiktokUsername = interaction.options.getString("username").replace(/^@/, "").trim();
      }

      if (subcommand === "tiktokchannel") {
        config.settings.tiktokChannelId = interaction.options.getChannel("channel").id;
      }

      if (subcommand === "reset") {
        const target = interaction.options.getString("target");

        if (target === "logchannel") {
          config.settings.logChannelId = null;
        }

        if (target === "verifychannel") {
          config.settings.verifyChannelId = null;
          config.verifyMessageId = null;
        }

        if (target === "ruleschannel") {
          config.settings.rulesChannelId = null;
        }

        if (target === "tiktokuser") {
          config.settings.tiktokUsername = null;
        }

        if (target === "tiktokchannel") {
          config.settings.tiktokChannelId = null;
        }
      }

      saveConfig();

      if (subcommand === "tiktokuser" || subcommand === "tiktokchannel") {
        await resetTikTokConnection();
      }

      if (subcommand === "reset") {
        const target = interaction.options.getString("target");
        if (target === "tiktokuser" || target === "tiktokchannel") {
          await resetTikTokConnection();
        }
      }

      return interaction.reply({
        content:
          subcommand === "reset"
            ? `Reset setting: ${interaction.options.getString("target")}.`
            : `Updated setting: ${subcommand}.`,
        ephemeral: true
      });
    }
  } catch (error) {
    console.error("Interaction error:", error);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("There was an error while handling that command.").catch(() => {});
    } else {
      await interaction.reply({
        content: "There was an error while handling that command.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

client.on("messageCreate", async message => {
  try {
    if (!message.guild || message.author.bot || !message.member) return;
    if (isAutoModExempt(message)) return;

    if (config.automod.invites && INVITE_REGEX.test(message.content)) {
      await handleAutoModViolation(message, "invite links are not allowed here.", "invite-link");
      return;
    }

    if (config.automod.maxMentions > 0 && (message.mentions.users?.size || 0) >= config.automod.maxMentions) {
      await handleAutoModViolation(message, "please do not mass mention members.", "mass-mentions");
      return;
    }

    if (config.automod.caps && hasExcessiveCaps(message.content)) {
      await handleAutoModViolation(message, "please avoid sending all-caps messages.", "caps");
      return;
    }

    if (
      config.automod.bannedWords &&
      getBannedWords().some(word => message.content.toLowerCase().includes(word))
    ) {
      await handleAutoModViolation(message, "that phrase is not allowed here.", "banned-word");
      return;
    }

    if (config.automod.spam && trackSpam(message)) {
      await handleAutoModViolation(message, "please slow down and avoid spam.", "spam");
    }
  } catch (error) {
    console.error("messageCreate error:", error);
  }
});

client.on("messageDelete", async message => {
  try {
    if (!message || message.author?.bot) return;

    await logEmbed(
      makeEmbed({
        title: "Message deleted",
        description: message.content || "*No text content*",
        color: COLORS.red,
        fields: [
          { name: "Author", value: message.author ? message.author.tag : "Unknown", inline: true },
          { name: "Channel", value: `${message.channel}`, inline: true }
        ]
      })
    );
  } catch (error) {
    console.error("Delete log error:", error);
  }
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  try {
    if (!oldMessage || !newMessage) return;
    if (oldMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    await logEmbed(
      makeEmbed({
        title: "Message edited",
        description: "A message was updated.",
        color: COLORS.yellow,
        fields: [
          { name: "Author", value: oldMessage.author ? oldMessage.author.tag : "Unknown", inline: true },
          { name: "Channel", value: `${oldMessage.channel}`, inline: true },
          { name: "Before", value: oldMessage.content?.slice(0, 1024) || "*No text*", inline: false },
          { name: "After", value: newMessage.content?.slice(0, 1024) || "*No text*", inline: false }
        ]
      })
    );
  } catch (error) {
    console.error("Update log error:", error);
  }
});

client.on("guildMemberAdd", async member => {
  try {
    await notifyUser(
      member.user,
      makeEmbed({
        title: "Welcome to the server",
        description:
          `Hi ${member.user.username}.\n\n` +
          `We are happy you joined.\n` +
          `Please head to <#${getVerifyChannelId()}> to verify and unlock the server.\n\n` +
          "Have fun and enjoy your stay.",
        color: COLORS.pink,
        thumbnail: member.user.displayAvatarURL({ dynamic: true })
      })
    );

    await logEmbed(
      makeEmbed({
        title: "Member joined",
        description: `${member.user.tag} joined the server.`,
        color: COLORS.mint,
        thumbnail: member.user.displayAvatarURL({ dynamic: true })
      })
    );
  } catch (error) {
    console.error("Welcome error:", error);
  }
});

process.on("unhandledRejection", error => {
  console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", error => {
  console.error("Uncaught exception:", error);
});

try {
  validateEnv();
  client.login(TOKEN);
} catch (error) {
  console.error("Startup error:", error.message);
  process.exit(1);
}
