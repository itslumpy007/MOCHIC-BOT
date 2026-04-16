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
const joinTracker = new Map();
let tempBanInterval = null;

const dataDir = path.join(__dirname, "data");
const configPath = path.join(dataDir, "config.json");

function createDefaultConfig() {
  return {
    verifyMessageId: null,
    warnings: {},
    notes: {},
    cases: [],
    tempBans: [],
    nextCaseId: 1,
    automod: {
      invites: true,
      spam: true,
      caps: true,
      bannedWords: false,
      bannedWordList: [],
      linksEnabled: false,
      allowedDomainsOnly: false,
      allowedDomains: [],
      blockedDomains: [],
      attachmentsEnabled: false,
      allowedAttachmentExtensions: [],
      blockedAttachmentExtensions: [".exe", ".bat", ".cmd", ".scr"],
      maxAttachmentSizeMb: 10,
      ageProtectionEnabled: false,
      minAccountAgeForLinksMs: 0,
      minMemberAgeForLinksMs: 0,
      minAccountAgeForAttachmentsMs: 0,
      minMemberAgeForAttachmentsMs: 0,
      antiRaidEnabled: false,
      raidJoinThreshold: 5,
      raidWindowMs: 60 * 1000,
      raidAction: "log",
      raidAccountAgeLimitMs: 24 * 60 * 60 * 1000,
      nicknameFilterEnabled: false,
      nicknameBlockedTerms: [],
      alertOnlyRules: [],
      maxMentions: 5,
      emojiSpamEnabled: false,
      maxEmojiCount: 12,
      escalationEnabled: true,
      warnThreshold: 2,
      timeoutThreshold: 4,
      timeoutDurationMs: 10 * 60 * 1000,
      offenseWindowMs: 24 * 60 * 60 * 1000,
      offenses: {},
      exemptChannelIds: [],
      exemptRoleIds: []
    },
    settings: {
      verifyChannelId: null,
      rulesChannelId: null,
      logChannelId: null,
      automodLogChannelId: null,
      mutedRoleId: null,
      tiktokUsername: null,
      tiktokChannelId: null
    },
    permissions: {
      modRoleIds: [],
      adminRoleIds: []
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
      tempBans: Array.isArray(parsed.tempBans) ? parsed.tempBans : [],
      automod: {
        ...defaults.automod,
        ...(parsed.automod || {}),
        bannedWordList: Array.isArray(parsed.automod?.bannedWordList) ? parsed.automod.bannedWordList : [],
        allowedDomains: Array.isArray(parsed.automod?.allowedDomains) ? parsed.automod.allowedDomains : [],
        blockedDomains: Array.isArray(parsed.automod?.blockedDomains) ? parsed.automod.blockedDomains : [],
        allowedAttachmentExtensions: Array.isArray(parsed.automod?.allowedAttachmentExtensions) ? parsed.automod.allowedAttachmentExtensions : [],
        blockedAttachmentExtensions: Array.isArray(parsed.automod?.blockedAttachmentExtensions) ? parsed.automod.blockedAttachmentExtensions : defaults.automod.blockedAttachmentExtensions,
        nicknameBlockedTerms: Array.isArray(parsed.automod?.nicknameBlockedTerms) ? parsed.automod.nicknameBlockedTerms : [],
        alertOnlyRules: Array.isArray(parsed.automod?.alertOnlyRules) ? parsed.automod.alertOnlyRules : [],
        offenses: parsed.automod?.offenses && typeof parsed.automod.offenses === "object" ? parsed.automod.offenses : {},
        exemptChannelIds: Array.isArray(parsed.automod?.exemptChannelIds) ? parsed.automod.exemptChannelIds : [],
        exemptRoleIds: Array.isArray(parsed.automod?.exemptRoleIds) ? parsed.automod.exemptRoleIds : []
      },
      settings: {
        ...defaults.settings,
        ...(parsed.settings || {})
      },
      permissions: {
        ...defaults.permissions,
        ...(parsed.permissions || {}),
        modRoleIds: Array.isArray(parsed.permissions?.modRoleIds) ? parsed.permissions.modRoleIds : [],
        adminRoleIds: Array.isArray(parsed.permissions?.adminRoleIds) ? parsed.permissions.adminRoleIds : []
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

function getAutoModLogChannelId() {
  return config.settings.automodLogChannelId || getLogChannelId();
}

function getTikTokUsername() {
  return config.settings.tiktokUsername || TIKTOK_USERNAME;
}

function getTikTokChannelId() {
  return config.settings.tiktokChannelId || TIKTOK_CHANNEL_ID;
}

function getMutedRoleId() {
  return config.settings.mutedRoleId || null;
}

function getBannedWords() {
  return Array.isArray(config.automod.bannedWordList) ? config.automod.bannedWordList : [];
}

function getNicknameBlockedTerms() {
  return Array.isArray(config.automod.nicknameBlockedTerms) ? config.automod.nicknameBlockedTerms : [];
}

function getAlertOnlyRules() {
  return Array.isArray(config.automod.alertOnlyRules) ? config.automod.alertOnlyRules : [];
}

function getPermissionRoleIds(level) {
  return Array.isArray(config.permissions?.[`${level}RoleIds`]) ? config.permissions[`${level}RoleIds`] : [];
}

function normalizeDomain(value) {
  return (value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

function normalizeExtension(value) {
  const trimmed = (value || "").trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function countEmoji(content) {
  if (!content) return 0;
  const customMatches = content.match(/<a?:\w+:\d+>/g) || [];
  const unicodeMatches = content.match(/\p{Extended_Pictographic}/gu) || [];
  return customMatches.length + unicodeMatches.length;
}

function extractMessageDomains(content) {
  const matches = content.match(/https?:\/\/[^\s]+/gi) || [];
  const domains = [];

  for (const match of matches) {
    try {
      domains.push(normalizeDomain(new URL(match).hostname));
    } catch (error) {
      continue;
    }
  }

  return domains.filter(Boolean);
}

function getAccountAgeMs(user) {
  return Date.now() - user.createdTimestamp;
}

function getMemberAgeMs(member) {
  return member.joinedTimestamp ? Date.now() - member.joinedTimestamp : Number.MAX_SAFE_INTEGER;
}

function trackJoin(guildId) {
  const now = Date.now();
  const history = joinTracker.get(guildId) || [];
  const recent = history.filter(timestamp => now - timestamp <= config.automod.raidWindowMs);
  recent.push(now);
  joinTracker.set(guildId, recent);
  return recent.length;
}

function getAutoModOffenses(userId) {
  return Array.isArray(config.automod.offenses[userId]) ? config.automod.offenses[userId] : [];
}

function pruneAutoModOffenses(userId) {
  const now = Date.now();
  const offenses = getAutoModOffenses(userId).filter(entry => now - entry.timestamp <= config.automod.offenseWindowMs);
  config.automod.offenses[userId] = offenses;
  return offenses;
}

function recordAutoModOffense(userId, action, reason) {
  const offenses = pruneAutoModOffenses(userId);
  offenses.push({
    action,
    reason,
    timestamp: Date.now()
  });
  config.automod.offenses[userId] = offenses;
  saveConfig();
  return offenses;
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
    .setName("moddashboard")
    .setDescription("View a moderation system dashboard")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Export a backup snapshot")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option
        .setName("target")
        .setDescription("What to include in the backup")
        .setRequired(true)
        .addChoices(
          { name: "Full snapshot", value: "full" },
          { name: "Config only", value: "config" }
        )
    ),

  new SlashCommandBuilder()
    .setName("exportmod")
    .setDescription("Export moderation data")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption(option =>
      option
        .setName("target")
        .setDescription("Data to export")
        .setRequired(true)
        .addChoices(
          { name: "Cases", value: "cases" },
          { name: "Warnings", value: "warnings" },
          { name: "Notes", value: "notes" }
        )
    )
    .addUserOption(option =>
      option.setName("user").setDescription("Optional user filter").setRequired(false)
    ),

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
    .setName("mute")
    .setDescription("Mute a member with the Mochi muted role")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName("user").setDescription("User to mute").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason").setDescription("Reason for the mute").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Remove the Mochi muted role from a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName("user").setDescription("User to unmute").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason").setDescription("Reason for the unmute").setRequired(false)
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
    .setName("tempban")
    .setDescription("Ban a member temporarily and unban them automatically later")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(option =>
      option.setName("user").setDescription("User to temporarily ban").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("duration").setDescription("Duration like 1h, 1d, 7d").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason").setDescription("Reason for the temporary ban").setRequired(true)
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
    .setName("editcase")
    .setDescription("Edit the reason for an existing moderation case")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addIntegerOption(option =>
      option.setName("id").setDescription("Case number").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason").setDescription("Updated reason").setRequired(true)
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
        .setName("emojispam")
        .setDescription("Enable or disable emoji spam filtering")
        .addBooleanOption(option =>
          option.setName("enabled").setDescription("Enable or disable").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("emojilimit")
        .setDescription("Set the max emoji count allowed in one message")
        .addIntegerOption(option =>
          option.setName("limit").setDescription("Emoji limit").setRequired(true).setMinValue(3).setMaxValue(100)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("nicknamefilter")
        .setDescription("Enable or disable nickname filtering")
        .addBooleanOption(option =>
          option.setName("enabled").setDescription("Enable or disable").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("alertonly")
        .setDescription("Mark a rule as alert-only or enforce it")
        .addStringOption(option =>
          option.setName("rule").setDescription("Rule name").setRequired(true).addChoices(
            { name: "banned-word", value: "banned-word" },
            { name: "blocked-domain", value: "blocked-domain" },
            { name: "disallowed-domain", value: "disallowed-domain" },
             { name: "blocked-extension", value: "blocked-extension" },
             { name: "disallowed-extension", value: "disallowed-extension" },
             { name: "caps", value: "caps" },
             { name: "spam", value: "spam" },
             { name: "emoji-spam", value: "emoji-spam" },
             { name: "mass-mentions", value: "mass-mentions" },
             { name: "invite-link", value: "invite-link" }
           )
        )
        .addBooleanOption(option =>
          option.setName("enabled").setDescription("Enable alert-only mode").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("escalation")
        .setDescription("Enable or disable automod escalation")
        .addBooleanOption(option =>
          option.setName("enabled").setDescription("Enable or disable").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("warnthreshold")
        .setDescription("Set the offense count that triggers an automod warning")
        .addIntegerOption(option =>
          option.setName("count").setDescription("Offense count").setRequired(true).setMinValue(1).setMaxValue(20)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("timeoutthreshold")
        .setDescription("Set the offense count that triggers an automod timeout")
        .addIntegerOption(option =>
          option.setName("count").setDescription("Offense count").setRequired(true).setMinValue(1).setMaxValue(20)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("timeoutduration")
        .setDescription("Set the automod timeout duration")
        .addStringOption(option =>
          option.setName("duration").setDescription("Duration like 10m, 2h, 1d").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("offensewindow")
        .setDescription("Set how long automod offenses count toward escalation")
        .addStringOption(option =>
          option.setName("duration").setDescription("Duration like 1h, 12h, 1d").setRequired(true)
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
    .setName("automodlinks")
    .setDescription("Manage link and attachment filters")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName("links")
        .setDescription("Enable or disable link filtering")
        .addBooleanOption(option =>
          option.setName("enabled").setDescription("Enable or disable").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("allowedlinksonly")
        .setDescription("Allow only trusted domains when link filtering is enabled")
        .addBooleanOption(option =>
          option.setName("enabled").setDescription("Enable or disable").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("allowdomain")
        .setDescription("Add or remove an allowed domain")
        .addStringOption(option =>
          option.setName("mode").setDescription("add or remove").setRequired(true).addChoices(
            { name: "add", value: "add" },
            { name: "remove", value: "remove" }
          )
        )
        .addStringOption(option =>
          option.setName("domain").setDescription("Domain like example.com").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("blockdomain")
        .setDescription("Add or remove a blocked domain")
        .addStringOption(option =>
          option.setName("mode").setDescription("add or remove").setRequired(true).addChoices(
            { name: "add", value: "add" },
            { name: "remove", value: "remove" }
          )
        )
        .addStringOption(option =>
          option.setName("domain").setDescription("Domain like example.com").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("attachments")
        .setDescription("Enable or disable attachment filtering")
        .addBooleanOption(option =>
          option.setName("enabled").setDescription("Enable or disable").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("attachmentlimit")
        .setDescription("Set the maximum attachment size in MB")
        .addIntegerOption(option =>
          option.setName("mb").setDescription("Maximum size in MB").setRequired(true).setMinValue(1).setMaxValue(100)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("allowextension")
        .setDescription("Add or remove an allowed attachment extension")
        .addStringOption(option =>
          option.setName("mode").setDescription("add or remove").setRequired(true).addChoices(
            { name: "add", value: "add" },
            { name: "remove", value: "remove" }
          )
        )
        .addStringOption(option =>
          option.setName("extension").setDescription("Extension like .png or png").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("blockextension")
        .setDescription("Add or remove a blocked attachment extension")
        .addStringOption(option =>
          option.setName("mode").setDescription("add or remove").setRequired(true).addChoices(
            { name: "add", value: "add" },
            { name: "remove", value: "remove" }
          )
        )
        .addStringOption(option =>
          option.setName("extension").setDescription("Extension like .exe or exe").setRequired(true)
        )
    ),

  new SlashCommandBuilder()
    .setName("automodguard")
    .setDescription("Manage age protection and anti-raid")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName("ageprotection")
        .setDescription("Enable or disable age-based protections")
        .addBooleanOption(option =>
          option.setName("enabled").setDescription("Enable or disable").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("accountagelinks")
        .setDescription("Set minimum Discord account age for posting links")
        .addStringOption(option =>
          option.setName("duration").setDescription("Duration like 1d, 7d").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("memberagelinks")
        .setDescription("Set minimum server membership age for posting links")
        .addStringOption(option =>
          option.setName("duration").setDescription("Duration like 12h, 1d").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("accountageattachments")
        .setDescription("Set minimum Discord account age for attachments")
        .addStringOption(option =>
          option.setName("duration").setDescription("Duration like 1d, 7d").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("memberageattachments")
        .setDescription("Set minimum server membership age for attachments")
        .addStringOption(option =>
          option.setName("duration").setDescription("Duration like 12h, 1d").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("antiraid")
        .setDescription("Enable or disable anti-raid join detection")
        .addBooleanOption(option =>
          option.setName("enabled").setDescription("Enable or disable").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("raidthreshold")
        .setDescription("Set how many joins trigger anti-raid")
        .addIntegerOption(option =>
          option.setName("count").setDescription("Join count").setRequired(true).setMinValue(2).setMaxValue(100)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("raidwindow")
        .setDescription("Set the anti-raid join detection window")
        .addStringOption(option =>
          option.setName("duration").setDescription("Duration like 30s, 1m, 5m").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("raidaccountage")
        .setDescription("Set the account age that counts as suspicious during a raid")
        .addStringOption(option =>
          option.setName("duration").setDescription("Duration like 1d, 7d").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("raidaction")
        .setDescription("Set the anti-raid response")
        .addStringOption(option =>
          option.setName("action").setDescription("Raid response").setRequired(true).addChoices(
            { name: "log only", value: "log" },
            { name: "timeout suspicious joins", value: "timeout" }
          )
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
    .setName("nickfilter")
    .setDescription("Manage blocked nickname terms")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand.setName("list").setDescription("View blocked nickname terms")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("add")
        .setDescription("Add a blocked nickname term")
        .addStringOption(option =>
          option.setName("term").setDescription("Word or phrase to block in nicknames").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("remove")
        .setDescription("Remove a blocked nickname term")
        .addStringOption(option =>
          option.setName("term").setDescription("Word or phrase to remove").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand.setName("clear").setDescription("Clear blocked nickname terms")
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
        .setName("automodlogchannel")
        .setDescription("Set a separate channel for automod logs")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("Channel to use for automod logs")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("mutedrole")
        .setDescription("Set the muted role to use for /mute")
        .addRoleOption(option =>
          option.setName("role").setDescription("Role to use as the muted role").setRequired(true)
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
              { name: "automod log channel", value: "automodlogchannel" },
              { name: "muted role", value: "mutedrole" },
              { name: "verify channel", value: "verifychannel" },
              { name: "rules channel", value: "ruleschannel" },
              { name: "TikTok username", value: "tiktokuser" },
              { name: "TikTok alerts channel", value: "tiktokchannel" }
            )
        )
    ),

  new SlashCommandBuilder()
    .setName("staffroles")
    .setDescription("Manage staff role restrictions for Mochi commands")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand.setName("view").setDescription("View configured staff role restrictions")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("add")
        .setDescription("Add a role to a staff access tier")
        .addStringOption(option =>
          option.setName("tier").setDescription("Access tier").setRequired(true).addChoices(
            { name: "moderation", value: "mod" },
            { name: "admin", value: "admin" }
          )
        )
        .addRoleOption(option =>
          option.setName("role").setDescription("Role to add").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("remove")
        .setDescription("Remove a role from a staff access tier")
        .addStringOption(option =>
          option.setName("tier").setDescription("Access tier").setRequired(true).addChoices(
            { name: "moderation", value: "mod" },
            { name: "admin", value: "admin" }
          )
        )
        .addRoleOption(option =>
          option.setName("role").setDescription("Role to remove").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("reset")
        .setDescription("Clear all roles from an access tier")
        .addStringOption(option =>
          option.setName("tier").setDescription("Access tier").setRequired(true).addChoices(
            { name: "moderation", value: "mod" },
            { name: "admin", value: "admin" }
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

async function logAutoModEmbed(embed) {
  try {
    const automodLogChannelId = getAutoModLogChannelId();
    if (!automodLogChannelId) return;
    const channel = await client.channels.fetch(automodLogChannelId);
    if (!channel) return;
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("AutoMod log send error:", error.message);
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

  if (entry.editedAt && entry.editedBy) {
    baseFields.push({
      name: "Last edited",
      value: `${entry.editedBy} - <t:${Math.floor(new Date(entry.editedAt).getTime() / 1000)}:R>`,
      inline: false
    });
  }

  return [...baseFields, ...entry.details];
}

function updateCase(caseId, updates) {
  const entry = getCaseById(caseId);
  if (!entry) return null;

  if (typeof updates.reason === "string") {
    entry.reason = updates.reason;
  }

  if (Array.isArray(updates.details)) {
    entry.details = updates.details;
  }

  if (updates.editedBy) {
    entry.editedBy = updates.editedBy;
    entry.editedAt = new Date().toISOString();
  }

  saveConfig();
  return entry;
}

function memberHasConfiguredRole(member, roleIds) {
  if (!member || !Array.isArray(roleIds) || !roleIds.length) return false;
  return member.roles.cache.some(role => roleIds.includes(role.id));
}

function hasStaffAccess(member, level) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  const adminRoleIds = getPermissionRoleIds("admin");
  if (memberHasConfiguredRole(member, adminRoleIds)) return true;

  if (level === "admin") {
    return false;
  }

  const modRoleIds = getPermissionRoleIds("mod");
  if (memberHasConfiguredRole(member, modRoleIds)) return true;

  return (
    member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
    member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    member.permissions.has(PermissionFlagsBits.KickMembers) ||
    member.permissions.has(PermissionFlagsBits.BanMembers)
  );
}

async function ensureStaffAccess(interaction, level, label) {
  if (hasStaffAccess(interaction.member, level)) {
    return true;
  }

  await interaction.reply({
    content: `You do not have permission to use ${label}.`,
    ephemeral: true
  });
  return false;
}

async function ensureMutedRole(guild) {
  const savedRoleId = getMutedRoleId();
  let mutedRole = savedRoleId ? guild.roles.cache.get(savedRoleId) || await guild.roles.fetch(savedRoleId).catch(() => null) : null;

  if (!mutedRole) {
    mutedRole = guild.roles.cache.find(role => role.name.toLowerCase() === "mochi muted") || null;
  }

  if (!mutedRole) {
    mutedRole = await guild.roles.create({
      name: "Mochi Muted",
      color: COLORS.gray,
      reason: "Mute role for Mochi Bot moderation."
    });
  }

  config.settings.mutedRoleId = mutedRole.id;
  saveConfig();
  await applyMutedRoleToChannels(guild, mutedRole);
  return mutedRole;
}

async function applyMutedRoleToChannels(guild, mutedRole) {
  const overwrite = {
    SendMessages: false,
    AddReactions: false,
    Speak: false,
    Connect: false,
    SendMessagesInThreads: false,
    CreatePublicThreads: false,
    CreatePrivateThreads: false
  };

  for (const channel of guild.channels.cache.values()) {
    if (!channel?.permissionOverwrites?.edit) continue;
    await channel.permissionOverwrites.edit(mutedRole, overwrite).catch(() => {});
  }
}

function addTempBan({ userId, targetTag, moderatorTag, reason, expiresAt }) {
  const record = {
    userId,
    targetTag,
    moderatorTag,
    reason,
    expiresAt,
    createdAt: new Date().toISOString()
  };

  config.tempBans = config.tempBans.filter(entry => entry.userId !== userId);
  config.tempBans.push(record);
  saveConfig();
  return record;
}

function removeTempBan(userId) {
  const before = config.tempBans.length;
  config.tempBans = config.tempBans.filter(entry => entry.userId !== userId);
  if (config.tempBans.length !== before) {
    saveConfig();
  }
}

async function processExpiredTempBans() {
  if (!client.isReady()) return;
  if (!Array.isArray(config.tempBans) || !config.tempBans.length) return;

  const now = Date.now();
  const expired = config.tempBans.filter(entry => new Date(entry.expiresAt).getTime() <= now);
  if (!expired.length) return;

  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) return;

  for (const entry of expired) {
    await guild.members.unban(entry.userId, "Temporary ban expired.").catch(() => {});

    const caseEntry = addCase({
      action: "tempban-expired",
      targetId: entry.userId,
      targetTag: entry.targetTag || `User ${entry.userId}`,
      moderatorTag: "Mochi Bot",
      reason: `Temporary ban expired automatically. Original reason: ${entry.reason}`,
      details: [{ name: "Original moderator", value: entry.moderatorTag, inline: true }]
    });

    await logEmbed(
      makeEmbed({
        title: `Case #${caseEntry.id}: temporary ban expired`,
        description: `${entry.targetTag || entry.userId} was automatically unbanned.`,
        color: COLORS.mint,
        fields: buildCaseFields(caseEntry)
      })
    );

    removeTempBan(entry.userId);
  }
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
  const alertOnly = getAlertOnlyRules().includes(actionLabel);

  if (!alertOnly) {
    await message.delete().catch(() => {});

    const notice = await message.channel.send({
      content: `${message.author}, ${reason}`
    }).catch(() => null);

    if (notice) {
      setTimeout(() => notice.delete().catch(() => {}), 10000);
    }
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

  const offenses = recordAutoModOffense(message.author.id, actionLabel, reason);
  const activeOffenseCount = offenses.length;
  let escalationText = alertOnly ? "Alert only" : null;

  if (config.automod.escalationEnabled && !alertOnly) {
    if (
      activeOffenseCount >= config.automod.timeoutThreshold &&
      message.member &&
      message.member.moderatable
    ) {
      await message.member.timeout(
        config.automod.timeoutDurationMs,
        `AutoMod escalation: ${reason}`
      ).catch(() => {});

      const timeoutEntry = addCase({
        action: "automod:timeout",
        targetId: message.author.id,
        targetTag: message.author.tag,
        moderatorTag: "AutoMod",
        reason: `Automatic timeout after repeated automod violations. Latest: ${reason}`,
        details: [
          { name: "Offenses in window", value: `${activeOffenseCount}`, inline: true },
          { name: "Duration", value: formatDuration(config.automod.timeoutDurationMs), inline: true }
        ]
      });

      escalationText = `Automatic timeout applied for ${formatDuration(config.automod.timeoutDurationMs)}.`;

      await notifyUser(
        message.author,
        makeEmbed({
          title: "Automatic timeout",
          description: `You were automatically timed out in **${message.guild.name}** after repeated automod violations.`,
          color: COLORS.red,
          fields: buildCaseFields(timeoutEntry)
        })
      );

      await logEmbed(
        makeEmbed({
          title: `Case #${timeoutEntry.id}: automod timeout`,
          description: `${message.author.tag} was automatically timed out.`,
          color: COLORS.red,
          fields: buildCaseFields(timeoutEntry)
        })
      );
    } else if (activeOffenseCount >= config.automod.warnThreshold) {
      const warnings = addWarning(
        message.author.id,
        "AutoMod",
        `Automatic warning after repeated automod violations. Latest: ${reason}`
      );

      const warningEntry = addCase({
        action: "automod:warn",
        targetId: message.author.id,
        targetTag: message.author.tag,
        moderatorTag: "AutoMod",
        reason: `Automatic warning after repeated automod violations. Latest: ${reason}`,
        details: [
          { name: "Offenses in window", value: `${activeOffenseCount}`, inline: true },
          { name: "Total warnings", value: `${warnings.length}`, inline: true }
        ]
      });

      escalationText = `Automatic warning issued. Total warnings: ${warnings.length}.`;

      await notifyUser(
        message.author,
        makeEmbed({
          title: "Automatic warning",
          description: `You received an automatic warning in **${message.guild.name}** after repeated automod violations.`,
          color: COLORS.yellow,
          fields: buildCaseFields(warningEntry)
        })
      );

      await logEmbed(
        makeEmbed({
          title: `Case #${warningEntry.id}: automod warning`,
          description: `${message.author.tag} received an automatic warning.`,
          color: COLORS.yellow,
          fields: buildCaseFields(warningEntry)
        })
      );
    }
  }

  await logAutoModEmbed(
    makeEmbed({
      title: `Auto mod case #${entry.id}`,
      description: `${message.author.tag} had a message removed.`,
      color: COLORS.red,
      fields: [
        ...buildCaseFields(entry),
        { name: "Offenses in window", value: `${activeOffenseCount}`, inline: true },
        { name: "Mode", value: alertOnly ? "Alert only" : "Enforced", inline: true },
        { name: "Escalation", value: escalationText || "None", inline: false }
      ]
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
    `Link filtering: ${config.automod.linksEnabled ? "on" : "off"}`,
    `Allowed links only: ${config.automod.allowedDomainsOnly ? "on" : "off"}`,
    `Allowed domains: ${config.automod.allowedDomains.length}`,
    `Blocked domains: ${config.automod.blockedDomains.length}`,
    `Attachment filtering: ${config.automod.attachmentsEnabled ? "on" : "off"}`,
    `Max attachment size: ${config.automod.maxAttachmentSizeMb}MB`,
    `Allowed extensions: ${config.automod.allowedAttachmentExtensions.length}`,
    `Blocked extensions: ${config.automod.blockedAttachmentExtensions.length}`,
    `Age protection: ${config.automod.ageProtectionEnabled ? "on" : "off"}`,
    `Account age for links: ${formatDuration(config.automod.minAccountAgeForLinksMs)}`,
    `Member age for links: ${formatDuration(config.automod.minMemberAgeForLinksMs)}`,
    `Account age for attachments: ${formatDuration(config.automod.minAccountAgeForAttachmentsMs)}`,
    `Member age for attachments: ${formatDuration(config.automod.minMemberAgeForAttachmentsMs)}`,
    `Anti-raid: ${config.automod.antiRaidEnabled ? "on" : "off"}`,
    `Raid threshold: ${config.automod.raidJoinThreshold}`,
    `Raid window: ${formatDuration(config.automod.raidWindowMs)}`,
    `Raid account age: ${formatDuration(config.automod.raidAccountAgeLimitMs)}`,
    `Raid action: ${config.automod.raidAction}`,
    `Mention limit: ${config.automod.maxMentions}`,
    `Emoji spam: ${config.automod.emojiSpamEnabled ? "on" : "off"}`,
    `Emoji limit: ${config.automod.maxEmojiCount}`,
    `Escalation: ${config.automod.escalationEnabled ? "on" : "off"}`,
    `Warn threshold: ${config.automod.warnThreshold}`,
    `Timeout threshold: ${config.automod.timeoutThreshold}`,
    `Timeout duration: ${formatDuration(config.automod.timeoutDurationMs)}`,
    `Offense window: ${formatDuration(config.automod.offenseWindowMs)}`,
    `Exempt channels: ${config.automod.exemptChannelIds.length}`,
    `Exempt roles: ${config.automod.exemptRoleIds.length}`
  ].join("\n");
}

function buildSettingsSummary() {
  return [
    `Log channel: ${getLogChannelId() ? `<#${getLogChannelId()}>` : "Not set"}`,
    `Verify channel: ${getVerifyChannelId() ? `<#${getVerifyChannelId()}>` : "Not set"}`,
    `Rules channel: ${getRulesChannelId() ? `<#${getRulesChannelId()}>` : "Not set"}`,
    `Muted role: ${getMutedRoleId() ? `<@&${getMutedRoleId()}>` : "Not set"}`,
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
          "`/warn`, `/warnings`, `/clearwarnings`, `/timeout`, `/untimeout`, `/mute`, `/unmute`, `/kick`, `/ban`, `/tempban`, `/unban`, `/slowmode`",
        inline: false
      },
      {
        name: "Staff Records",
        value:
          "`/note`, `/notes`, `/case`, `/cases`, `/editcase`, `/automod`, `/automodlinks`, `/automodguard`, `/bannedwords`, `/settings`, `/staffroles`, `/exportmod`, `/backup`",
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
      { name: "AutoMod Log Channel", value: getAutoModLogChannelId() ? `<#${getAutoModLogChannelId()}>` : "Not set", inline: true },
      { name: "TikTok User", value: tiktokUsername ? `@${tiktokUsername}` : "Not set", inline: true },
      { name: "TikTok Alerts", value: tiktokChannelId ? `<#${tiktokChannelId}>` : "Not set", inline: true },
      { name: "TikTok Connected", value: tiktokConnection ? "Yes" : "No", inline: true },
      { name: "Verify Message", value: config.verifyMessageId || "Not cached", inline: false },
      { name: "Cases Logged", value: `${config.cases.length}`, inline: true },
      { name: "Banned Words", value: `${getBannedWords().length}`, inline: true }
    ]
  });
}

function buildDashboardEmbed() {
  const recentCases = config.cases.slice(-5).reverse();
  const recentAutomodCases = recentCases.filter(entry => entry.action.startsWith("automod:"));

  return makeEmbed({
    title: "Moderation dashboard",
    description: "Quick view of your moderation setup and recent activity.",
    color: COLORS.blue,
    fields: [
      { name: "Total cases", value: `${config.cases.length}`, inline: true },
      { name: "Warnings saved", value: `${Object.keys(config.warnings).length}`, inline: true },
      { name: "Staff notes", value: `${Object.keys(config.notes).length}`, inline: true },
      { name: "AutoMod log channel", value: getAutoModLogChannelId() ? `<#${getAutoModLogChannelId()}>` : "Not set", inline: true },
      { name: "Alert-only rules", value: getAlertOnlyRules().join(", ") || "None", inline: false },
      { name: "Nickname filter terms", value: `${getNicknameBlockedTerms().length}`, inline: true },
      {
        name: "Recent AutoMod cases",
        value: recentAutomodCases.length
          ? recentAutomodCases.map(entry => `#${entry.id} ${entry.action} - ${entry.targetTag}`).join("\n").slice(0, 1024)
          : "No recent automod cases.",
        inline: false
      }
    ]
  });
}

function buildJsonExportAttachment(prefix, payload) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    attachment: Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, "utf8"),
    name: `${prefix}-${stamp}.json`
  };
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
    await processExpiredTempBans();

    if (tempBanInterval) {
      clearInterval(tempBanInterval);
    }
    tempBanInterval = setInterval(() => {
      processExpiredTempBans().catch(error => {
        console.error("Temp ban processing error:", error.message);
      });
    }, 60 * 1000);
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

client.on("channelCreate", async channel => {
  try {
    if (!channel.guild) return;
    const mutedRoleId = getMutedRoleId();
    if (!mutedRoleId) return;
    const mutedRole = await channel.guild.roles.fetch(mutedRoleId).catch(() => null);
    if (!mutedRole || !channel.permissionOverwrites?.edit) return;

    await channel.permissionOverwrites.edit(mutedRole, {
      SendMessages: false,
      AddReactions: false,
      Speak: false,
      Connect: false,
      SendMessagesInThreads: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false
    }).catch(() => {});
  } catch (error) {
    console.error("Channel create mute overwrite error:", error.message);
  }
});

client.on("interactionCreate", async interaction => {
  try {
    if (!interaction.isChatInputCommand()) return;

    const { guild, channel } = interaction;
    const adminCommands = new Set([
      "status",
      "backup",
      "reload",
      "setupverify",
      "setuprules",
      "automod",
      "automodlinks",
      "automodguard",
      "bannedwords",
      "nickfilter",
      "settings",
      "staffroles"
    ]);
    const modCommands = new Set([
      "moddashboard",
      "exportmod",
      "lockdown",
      "unlockdown",
      "announce",
      "dm",
      "purge",
      "warn",
      "warnings",
      "clearwarnings",
      "timeout",
      "mute",
      "unmute",
      "untimeout",
      "kick",
      "ban",
      "tempban",
      "unban",
      "slowmode",
      "note",
      "notes",
      "case",
      "cases",
      "editcase"
    ]);

    if (adminCommands.has(interaction.commandName) && !(await ensureStaffAccess(interaction, "admin", `/${interaction.commandName}`))) {
      return;
    }

    if (
      modCommands.has(interaction.commandName) &&
      !adminCommands.has(interaction.commandName) &&
      !(await ensureStaffAccess(interaction, "mod", `/${interaction.commandName}`))
    ) {
      return;
    }

    if (interaction.commandName === "help") {
      return interaction.reply({ embeds: [buildHelpEmbed()], ephemeral: true });
    }

    if (interaction.commandName === "status") {
      return interaction.reply({ embeds: [buildStatusEmbed()], ephemeral: true });
    }

    if (interaction.commandName === "moddashboard") {
      return interaction.reply({ embeds: [buildDashboardEmbed()], ephemeral: true });
    }

    if (interaction.commandName === "backup") {
      const target = interaction.options.getString("target");
      const snapshot =
        target === "config"
          ? {
              exportedAt: new Date().toISOString(),
              target,
              config
            }
          : {
              exportedAt: new Date().toISOString(),
              target,
              config,
              summary: {
                caseCount: config.cases.length,
                warningUsers: Object.keys(config.warnings).length,
                noteUsers: Object.keys(config.notes).length
              }
            };

      return interaction.reply({
        content: `Backup export ready: ${target}.`,
        files: [buildJsonExportAttachment(`mochi-backup-${target}`, snapshot)],
        ephemeral: true
      });
    }

    if (interaction.commandName === "exportmod") {
      const target = interaction.options.getString("target");
      const user = interaction.options.getUser("user");
      const userId = user?.id || null;

      let data;

      if (target === "cases") {
        data = userId ? getCasesForUser(userId) : config.cases;
      }

      if (target === "warnings") {
        data = userId
          ? { [userId]: getWarnings(userId) }
          : config.warnings;
      }

      if (target === "notes") {
        data = userId
          ? { [userId]: getNotes(userId) }
          : config.notes;
      }

      return interaction.reply({
        content: `Moderation export ready: ${target}${user ? ` for ${user.tag}` : ""}.`,
        files: [
          buildJsonExportAttachment(`mochi-${target}${userId ? `-${userId}` : ""}`, {
            exportedAt: new Date().toISOString(),
            target,
            userId,
            data
          })
        ],
        ephemeral: true
      });
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

    if (interaction.commandName === "mute") {
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason");
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!(await ensureModeratable(interaction, member, "mute"))) return;
      if (!member.manageable) {
        return interaction.reply({ content: "I cannot manage that member's roles.", ephemeral: true });
      }

      const mutedRole = await ensureMutedRole(guild);
      if (member.roles.cache.has(mutedRole.id)) {
        return interaction.reply({ content: `${user.tag} is already muted.`, ephemeral: true });
      }

      await member.roles.add(mutedRole, `${interaction.user.tag}: ${reason}`);

      const entry = addCase({
        action: "mute",
        targetId: user.id,
        targetTag: user.tag,
        moderatorTag: interaction.user.tag,
        reason,
        details: [{ name: "Muted role", value: `<@&${mutedRole.id}>`, inline: true }]
      });

      await notifyUser(
        user,
        makeEmbed({
          title: "You were muted",
          description: `You were muted in **${guild.name}**.`,
          color: COLORS.red,
          fields: buildCaseFields(entry)
        })
      );

      await logEmbed(
        makeEmbed({
          title: `Case #${entry.id}: mute`,
          description: `${user.tag} was muted.`,
          color: COLORS.red,
          fields: buildCaseFields(entry)
        })
      );

      return interaction.reply({ content: `${user.tag} was muted.`, ephemeral: true });
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

    if (interaction.commandName === "unmute") {
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason") || "Mute removed by staff.";
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!(await ensureModeratable(interaction, member, "unmute"))) return;

      const mutedRoleId = getMutedRoleId();
      if (!mutedRoleId) {
        return interaction.reply({ content: "No muted role is configured yet.", ephemeral: true });
      }

      if (!member.roles.cache.has(mutedRoleId)) {
        return interaction.reply({ content: `${user.tag} is not muted.`, ephemeral: true });
      }

      await member.roles.remove(mutedRoleId, `${interaction.user.tag}: ${reason}`);

      const entry = addCase({
        action: "unmute",
        targetId: user.id,
        targetTag: user.tag,
        moderatorTag: interaction.user.tag,
        reason
      });

      await logEmbed(
        makeEmbed({
          title: `Case #${entry.id}: unmute`,
          description: `${user.tag} was unmuted.`,
          color: COLORS.mint,
          fields: buildCaseFields(entry)
        })
      );

      return interaction.reply({ content: `${user.tag} was unmuted.`, ephemeral: true });
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

    if (interaction.commandName === "tempban") {
      const user = interaction.options.getUser("user");
      const durationInput = interaction.options.getString("duration");
      const reason = interaction.options.getString("reason");
      const member = await guild.members.fetch(user.id).catch(() => null);
      const durationMs = parseDuration(durationInput);

      if (!durationMs) {
        return interaction.reply({ content: "Use a valid duration like 1h, 1d, or 7d.", ephemeral: true });
      }

      if (member && !(await ensureModeratable(interaction, member, "tempban"))) return;
      if (member && !member.bannable) {
        return interaction.reply({ content: "I cannot ban that member.", ephemeral: true });
      }

      const expiresAt = new Date(Date.now() + durationMs).toISOString();
      addTempBan({
        userId: user.id,
        targetTag: user.tag,
        moderatorTag: interaction.user.tag,
        reason,
        expiresAt
      });

      const entry = addCase({
        action: "tempban",
        targetId: user.id,
        targetTag: user.tag,
        moderatorTag: interaction.user.tag,
        reason,
        details: [{ name: "Expires", value: `<t:${Math.floor(new Date(expiresAt).getTime() / 1000)}:F>`, inline: true }]
      });

      await notifyUser(
        user,
        makeEmbed({
          title: "You were temporarily banned",
          description: `You were banned from **${guild.name}** for ${formatDuration(durationMs)}.`,
          color: COLORS.red,
          fields: buildCaseFields(entry)
        })
      );

      await guild.members.ban(user.id, { reason: `${interaction.user.tag}: ${reason}` });

      await logEmbed(
        makeEmbed({
          title: `Case #${entry.id}: temporary ban`,
          description: `${user.tag} was temporarily banned.`,
          color: COLORS.red,
          fields: buildCaseFields(entry)
        })
      );

      return interaction.reply({
        content: `${user.tag} was temporarily banned for ${formatDuration(durationMs)}.`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "unban") {
      const userId = interaction.options.getString("user_id");
      const reason = interaction.options.getString("reason");

      await guild.members.unban(userId, `${interaction.user.tag}: ${reason}`);
      removeTempBan(userId);

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

    if (interaction.commandName === "editcase") {
      const caseId = interaction.options.getInteger("id");
      const reason = interaction.options.getString("reason");
      const entry = updateCase(caseId, { reason, editedBy: interaction.user.tag });

      if (!entry) {
        return interaction.reply({ content: `Case #${caseId} was not found.`, ephemeral: true });
      }

      await logEmbed(
        makeEmbed({
          title: `Case #${entry.id}: case edited`,
          description: `Case #${entry.id} was updated by ${interaction.user.tag}.`,
          color: COLORS.blue,
          fields: buildCaseFields(entry)
        })
      );

      return interaction.reply({ content: `Updated case #${entry.id}.`, ephemeral: true });
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

      if (subcommand === "nicknamefilter") {
        config.automod.nicknameFilterEnabled = interaction.options.getBoolean("enabled");
      }

      if (subcommand === "alertonly") {
        const rule = interaction.options.getString("rule");
        const enabled = interaction.options.getBoolean("enabled");

        if (enabled && !config.automod.alertOnlyRules.includes(rule)) {
          config.automod.alertOnlyRules.push(rule);
        }

        if (!enabled) {
          config.automod.alertOnlyRules = config.automod.alertOnlyRules.filter(entry => entry !== rule);
        }
      }

      if (subcommand === "mentions") {
        config.automod.maxMentions = interaction.options.getInteger("limit");
      }

      if (subcommand === "emojispam") {
        config.automod.emojiSpamEnabled = interaction.options.getBoolean("enabled");
      }

      if (subcommand === "emojilimit") {
        config.automod.maxEmojiCount = interaction.options.getInteger("limit");
      }

      if (subcommand === "escalation") {
        config.automod.escalationEnabled = interaction.options.getBoolean("enabled");
      }

      if (subcommand === "warnthreshold") {
        config.automod.warnThreshold = interaction.options.getInteger("count");
      }

      if (subcommand === "timeoutthreshold") {
        config.automod.timeoutThreshold = interaction.options.getInteger("count");
      }

      if (subcommand === "timeoutduration") {
        const durationMs = parseDuration(interaction.options.getString("duration"));
        if (!durationMs) {
          return interaction.reply({
            content: "Use a valid duration like 10m, 2h, or 1d. Discord timeouts max out at 28d.",
            ephemeral: true
          });
        }
        config.automod.timeoutDurationMs = durationMs;
      }

      if (subcommand === "offensewindow") {
        const durationMs = parseDuration(interaction.options.getString("duration"));
        if (!durationMs) {
          return interaction.reply({
            content: "Use a valid duration like 1h, 12h, or 1d.",
            ephemeral: true
          });
        }
        config.automod.offenseWindowMs = durationMs;
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

    if (interaction.commandName === "automodlinks") {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "links") {
        config.automod.linksEnabled = interaction.options.getBoolean("enabled");
      }

      if (subcommand === "allowedlinksonly") {
        config.automod.allowedDomainsOnly = interaction.options.getBoolean("enabled");
      }

      if (subcommand === "allowdomain") {
        const mode = interaction.options.getString("mode");
        const domain = normalizeDomain(interaction.options.getString("domain"));
        if (!domain) {
          return interaction.reply({ content: "Enter a valid domain like example.com.", ephemeral: true });
        }

        if (mode === "add" && !config.automod.allowedDomains.includes(domain)) {
          config.automod.allowedDomains.push(domain);
        }

        if (mode === "remove") {
          config.automod.allowedDomains = config.automod.allowedDomains.filter(entry => entry !== domain);
        }
      }

      if (subcommand === "blockdomain") {
        const mode = interaction.options.getString("mode");
        const domain = normalizeDomain(interaction.options.getString("domain"));
        if (!domain) {
          return interaction.reply({ content: "Enter a valid domain like example.com.", ephemeral: true });
        }

        if (mode === "add" && !config.automod.blockedDomains.includes(domain)) {
          config.automod.blockedDomains.push(domain);
        }

        if (mode === "remove") {
          config.automod.blockedDomains = config.automod.blockedDomains.filter(entry => entry !== domain);
        }
      }

      if (subcommand === "attachments") {
        config.automod.attachmentsEnabled = interaction.options.getBoolean("enabled");
      }

      if (subcommand === "attachmentlimit") {
        config.automod.maxAttachmentSizeMb = interaction.options.getInteger("mb");
      }

      if (subcommand === "allowextension") {
        const mode = interaction.options.getString("mode");
        const extension = normalizeExtension(interaction.options.getString("extension"));
        if (!extension) {
          return interaction.reply({ content: "Enter a valid extension like .png or png.", ephemeral: true });
        }

        if (mode === "add" && !config.automod.allowedAttachmentExtensions.includes(extension)) {
          config.automod.allowedAttachmentExtensions.push(extension);
        }

        if (mode === "remove") {
          config.automod.allowedAttachmentExtensions = config.automod.allowedAttachmentExtensions.filter(entry => entry !== extension);
        }
      }

      if (subcommand === "blockextension") {
        const mode = interaction.options.getString("mode");
        const extension = normalizeExtension(interaction.options.getString("extension"));
        if (!extension) {
          return interaction.reply({ content: "Enter a valid extension like .exe or exe.", ephemeral: true });
        }

        if (mode === "add" && !config.automod.blockedAttachmentExtensions.includes(extension)) {
          config.automod.blockedAttachmentExtensions.push(extension);
        }

        if (mode === "remove") {
          config.automod.blockedAttachmentExtensions = config.automod.blockedAttachmentExtensions.filter(entry => entry !== extension);
        }
      }

      saveConfig();
      return interaction.reply({
        content: `Updated auto mod links setting: ${subcommand}.`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "automodguard") {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "ageprotection") {
        config.automod.ageProtectionEnabled = interaction.options.getBoolean("enabled");
      }

      if (subcommand === "accountagelinks") {
        const durationMs = parseDuration(interaction.options.getString("duration"));
        if (!durationMs) {
          return interaction.reply({ content: "Use a valid duration like 1d or 7d.", ephemeral: true });
        }
        config.automod.minAccountAgeForLinksMs = durationMs;
      }

      if (subcommand === "memberagelinks") {
        const durationMs = parseDuration(interaction.options.getString("duration"));
        if (!durationMs) {
          return interaction.reply({ content: "Use a valid duration like 12h or 1d.", ephemeral: true });
        }
        config.automod.minMemberAgeForLinksMs = durationMs;
      }

      if (subcommand === "accountageattachments") {
        const durationMs = parseDuration(interaction.options.getString("duration"));
        if (!durationMs) {
          return interaction.reply({ content: "Use a valid duration like 1d or 7d.", ephemeral: true });
        }
        config.automod.minAccountAgeForAttachmentsMs = durationMs;
      }

      if (subcommand === "memberageattachments") {
        const durationMs = parseDuration(interaction.options.getString("duration"));
        if (!durationMs) {
          return interaction.reply({ content: "Use a valid duration like 12h or 1d.", ephemeral: true });
        }
        config.automod.minMemberAgeForAttachmentsMs = durationMs;
      }

      if (subcommand === "antiraid") {
        config.automod.antiRaidEnabled = interaction.options.getBoolean("enabled");
      }

      if (subcommand === "raidthreshold") {
        config.automod.raidJoinThreshold = interaction.options.getInteger("count");
      }

      if (subcommand === "raidwindow") {
        const durationMs = parseDuration(interaction.options.getString("duration"));
        if (!durationMs) {
          return interaction.reply({ content: "Use a valid duration like 30s, 1m, or 5m.", ephemeral: true });
        }
        config.automod.raidWindowMs = durationMs;
      }

      if (subcommand === "raidaccountage") {
        const durationMs = parseDuration(interaction.options.getString("duration"));
        if (!durationMs) {
          return interaction.reply({ content: "Use a valid duration like 1d or 7d.", ephemeral: true });
        }
        config.automod.raidAccountAgeLimitMs = durationMs;
      }

      if (subcommand === "raidaction") {
        config.automod.raidAction = interaction.options.getString("action");
      }

      saveConfig();
      return interaction.reply({
        content: `Updated auto mod guard setting: ${subcommand}.`,
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

    if (interaction.commandName === "nickfilter") {
      const subcommand = interaction.options.getSubcommand();
      const nicknameTerms = getNicknameBlockedTerms();

      if (subcommand === "list") {
        return interaction.reply({
          embeds: [
            makeEmbed({
              title: "Blocked nickname terms",
              description: nicknameTerms.length ? nicknameTerms.join("\n").slice(0, 4000) : "No blocked nickname terms saved.",
              color: COLORS.yellow
            })
          ],
          ephemeral: true
        });
      }

      if (subcommand === "add") {
        const term = interaction.options.getString("term").trim().toLowerCase();
        if (!term) {
          return interaction.reply({ content: "Enter a valid nickname term.", ephemeral: true });
        }

        if (nicknameTerms.includes(term)) {
          return interaction.reply({ content: `"${term}" is already blocked in nicknames.`, ephemeral: true });
        }

        config.automod.nicknameBlockedTerms.push(term);
        saveConfig();
        return interaction.reply({ content: `Added "${term}" to blocked nickname terms.`, ephemeral: true });
      }

      if (subcommand === "remove") {
        const term = interaction.options.getString("term").trim().toLowerCase();
        const nextList = nicknameTerms.filter(entry => entry !== term);

        if (nextList.length === nicknameTerms.length) {
          return interaction.reply({ content: `"${term}" was not on the nickname block list.`, ephemeral: true });
        }

        config.automod.nicknameBlockedTerms = nextList;
        saveConfig();
        return interaction.reply({ content: `Removed "${term}" from blocked nickname terms.`, ephemeral: true });
      }

      if (subcommand === "clear") {
        config.automod.nicknameBlockedTerms = [];
        saveConfig();
        return interaction.reply({ content: "Cleared blocked nickname terms.", ephemeral: true });
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

      if (subcommand === "automodlogchannel") {
        config.settings.automodLogChannelId = interaction.options.getChannel("channel").id;
      }

      if (subcommand === "mutedrole") {
        config.settings.mutedRoleId = interaction.options.getRole("role").id;
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

        if (target === "automodlogchannel") {
          config.settings.automodLogChannelId = null;
        }

        if (target === "mutedrole") {
          config.settings.mutedRoleId = null;
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

      if (subcommand === "mutedrole") {
        const mutedRole = await guild.roles.fetch(config.settings.mutedRoleId).catch(() => null);
        if (mutedRole) {
          await applyMutedRoleToChannels(guild, mutedRole);
        }
      }

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

    if (interaction.commandName === "staffroles") {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "view") {
        return interaction.reply({
          embeds: [
            makeEmbed({
              title: "Staff role restrictions",
              description: "Configured roles that can access Mochi moderation tiers.",
              color: COLORS.blue,
              fields: [
                {
                  name: "Moderation tier",
                  value: getPermissionRoleIds("mod").map(id => `<@&${id}>`).join(", ") || "No custom roles set",
                  inline: false
                },
                {
                  name: "Admin tier",
                  value: getPermissionRoleIds("admin").map(id => `<@&${id}>`).join(", ") || "No custom roles set",
                  inline: false
                }
              ]
            })
          ],
          ephemeral: true
        });
      }

      const tier = interaction.options.getString("tier");
      const role = interaction.options.getRole("role");
      const key = `${tier}RoleIds`;
      const current = Array.isArray(config.permissions[key]) ? config.permissions[key] : [];

      if (subcommand === "add" && role && !current.includes(role.id)) {
        config.permissions[key] = [...current, role.id];
      }

      if (subcommand === "remove" && role) {
        config.permissions[key] = current.filter(id => id !== role.id);
      }

      if (subcommand === "reset") {
        config.permissions[key] = [];
      }

      saveConfig();
      return interaction.reply({
        content:
          subcommand === "reset"
            ? `Cleared ${tier} staff role restrictions.`
            : `Updated ${tier} staff roles.`,
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

    const accountAgeMs = getAccountAgeMs(message.author);
    const memberAgeMs = getMemberAgeMs(message.member);
    const messageDomains = extractMessageDomains(message.content);
    const normalizedBlockedDomains = config.automod.blockedDomains.map(normalizeDomain);
    const normalizedAllowedDomains = config.automod.allowedDomains.map(normalizeDomain);

    if (config.automod.ageProtectionEnabled && messageDomains.length) {
      if (config.automod.minAccountAgeForLinksMs > 0 && accountAgeMs < config.automod.minAccountAgeForLinksMs) {
        await handleAutoModViolation(
          message,
          `your Discord account must be at least ${formatDuration(config.automod.minAccountAgeForLinksMs)} old before posting links.`,
          "account-age-links"
        );
        return;
      }

      if (config.automod.minMemberAgeForLinksMs > 0 && memberAgeMs < config.automod.minMemberAgeForLinksMs) {
        await handleAutoModViolation(
          message,
          `you must be in the server for at least ${formatDuration(config.automod.minMemberAgeForLinksMs)} before posting links.`,
          "member-age-links"
        );
        return;
      }
    }

    if (config.automod.linksEnabled && messageDomains.length) {
      const blockedDomain = messageDomains.find(domain =>
        normalizedBlockedDomains.some(blocked => domain === blocked || domain.endsWith(`.${blocked}`))
      );

      if (blockedDomain) {
        await handleAutoModViolation(message, `links from ${blockedDomain} are not allowed here.`, "blocked-domain");
        return;
      }

      if (config.automod.allowedDomainsOnly) {
        const disallowedDomain = messageDomains.find(domain =>
          !normalizedAllowedDomains.some(allowed => domain === allowed || domain.endsWith(`.${allowed}`))
        );

        if (disallowedDomain) {
          await handleAutoModViolation(message, `links from ${disallowedDomain} are not on the allowed list.`, "disallowed-domain");
          return;
        }
      }
    }

    if (config.automod.attachmentsEnabled && message.attachments.size) {
      if (config.automod.ageProtectionEnabled) {
        if (config.automod.minAccountAgeForAttachmentsMs > 0 && accountAgeMs < config.automod.minAccountAgeForAttachmentsMs) {
          await handleAutoModViolation(
            message,
            `your Discord account must be at least ${formatDuration(config.automod.minAccountAgeForAttachmentsMs)} old before uploading attachments.`,
            "account-age-attachments"
          );
          return;
        }

        if (config.automod.minMemberAgeForAttachmentsMs > 0 && memberAgeMs < config.automod.minMemberAgeForAttachmentsMs) {
          await handleAutoModViolation(
            message,
            `you must be in the server for at least ${formatDuration(config.automod.minMemberAgeForAttachmentsMs)} before uploading attachments.`,
            "member-age-attachments"
          );
          return;
        }
      }

      const blockedExtensions = config.automod.blockedAttachmentExtensions.map(normalizeExtension);
      const allowedExtensions = config.automod.allowedAttachmentExtensions.map(normalizeExtension);

      for (const attachment of message.attachments.values()) {
        const fileName = attachment.name || "";
        const extension = normalizeExtension(path.extname(fileName));
        const sizeMb = attachment.size / (1024 * 1024);

        if (config.automod.maxAttachmentSizeMb > 0 && sizeMb > config.automod.maxAttachmentSizeMb) {
          await handleAutoModViolation(
            message,
            `attachments larger than ${config.automod.maxAttachmentSizeMb}MB are not allowed here.`,
            "attachment-size"
          );
          return;
        }

        if (extension && blockedExtensions.includes(extension)) {
          await handleAutoModViolation(
            message,
            `files with the ${extension} extension are not allowed here.`,
            "blocked-extension"
          );
          return;
        }

        if (allowedExtensions.length && (!extension || !allowedExtensions.includes(extension))) {
          await handleAutoModViolation(
            message,
            `only these attachment types are allowed here: ${allowedExtensions.join(", ")}.`,
            "disallowed-extension"
          );
          return;
        }
      }
    }

    if (config.automod.invites && INVITE_REGEX.test(message.content)) {
      await handleAutoModViolation(message, "invite links are not allowed here.", "invite-link");
      return;
    }

    if (config.automod.maxMentions > 0 && (message.mentions.users?.size || 0) >= config.automod.maxMentions) {
      await handleAutoModViolation(message, "please do not mass mention members.", "mass-mentions");
      return;
    }

    if (config.automod.emojiSpamEnabled && config.automod.maxEmojiCount > 0 && countEmoji(message.content) >= config.automod.maxEmojiCount) {
      await handleAutoModViolation(message, "please avoid emoji spam.", "emoji-spam");
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
    if (config.automod.antiRaidEnabled) {
      const joinCount = trackJoin(member.guild.id);
      const accountAgeMs = getAccountAgeMs(member.user);

      if (joinCount >= config.automod.raidJoinThreshold && accountAgeMs <= config.automod.raidAccountAgeLimitMs) {
        const details = [
          { name: "Recent joins", value: `${joinCount}`, inline: true },
          { name: "Account age", value: formatDuration(accountAgeMs), inline: true },
          { name: "Raid action", value: config.automod.raidAction, inline: true }
        ];

        let raidReason = `Potential raid join detected. ${joinCount} joins in ${formatDuration(config.automod.raidWindowMs)}.`;

        if (config.automod.raidAction === "timeout" && member.moderatable) {
          await member.timeout(
            config.automod.timeoutDurationMs,
            `Anti-raid: ${raidReason}`
          ).catch(() => {});
          raidReason += ` Automatic timeout applied for ${formatDuration(config.automod.timeoutDurationMs)}.`;
        }

        const raidEntry = addCase({
          action: "automod:raid-join",
          targetId: member.user.id,
          targetTag: member.user.tag,
          moderatorTag: "AutoMod",
          reason: raidReason,
          details
        });

        await logEmbed(
          makeEmbed({
            title: `Case #${raidEntry.id}: anti-raid`,
            description: `${member.user.tag} matched the anti-raid rules on join.`,
            color: COLORS.red,
            fields: buildCaseFields(raidEntry)
          })
        );
      }
    }

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

    if (config.automod.nicknameFilterEnabled) {
      const displayName = (member.nickname || member.user.username || "").toLowerCase();
      const blockedTerm = getNicknameBlockedTerms().find(term => displayName.includes(term));

      if (blockedTerm) {
        const entry = addCase({
          action: "automod:nickname",
          targetId: member.user.id,
          targetTag: member.user.tag,
          moderatorTag: "AutoMod",
          reason: `Nickname matched blocked term "${blockedTerm}" on join.`
        });

        await logAutoModEmbed(
          makeEmbed({
            title: `Auto mod case #${entry.id}`,
            description: `${member.user.tag} matched the nickname filter on join.`,
            color: COLORS.red,
            fields: buildCaseFields(entry)
          })
        );
      }
    }
  } catch (error) {
    console.error("Welcome error:", error);
  }
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    if (!config.automod.nicknameFilterEnabled) return;

    const previousName = (oldMember.nickname || oldMember.user.username || "").toLowerCase();
    const currentName = (newMember.nickname || newMember.user.username || "").toLowerCase();
    if (previousName === currentName) return;

    const blockedTerm = getNicknameBlockedTerms().find(term => currentName.includes(term));
    if (!blockedTerm) return;

    const entry = addCase({
      action: "automod:nickname",
      targetId: newMember.user.id,
      targetTag: newMember.user.tag,
      moderatorTag: "AutoMod",
      reason: `Nickname matched blocked term "${blockedTerm}".`,
      details: [{ name: "Nickname", value: newMember.displayName.slice(0, 1024), inline: false }]
    });

    await logAutoModEmbed(
      makeEmbed({
        title: `Auto mod case #${entry.id}`,
        description: `${newMember.user.tag} matched the nickname filter.`,
        color: COLORS.red,
        fields: buildCaseFields(entry)
      })
    );
  } catch (error) {
    console.error("Nickname filter error:", error);
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
