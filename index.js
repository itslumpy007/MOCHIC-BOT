require("dotenv").config();

const fs = require("fs");
const path = require("path");
const play = require("play-dl");

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  ModalBuilder,
  Partials,
  PermissionFlagsBits,
  REST,
  RoleSelectMenuBuilder,
  Routes,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder
} = require("discord.js");
const {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus
} = require("@discordjs/voice");
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

function envFlag(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

const ENABLE_CORE_BOT = envFlag(process.env.ENABLE_CORE_BOT, true);
const ENABLE_MUSIC = envFlag(process.env.ENABLE_MUSIC, true);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
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
const AUTOMOD_RULE_KEYS = [
  "account-age-links",
  "member-age-links",
  "blocked-domain",
  "disallowed-domain",
  "account-age-attachments",
  "member-age-attachments",
  "attachment-size",
  "blocked-extension",
  "disallowed-extension",
  "invite-link",
  "mass-mentions",
  "emoji-spam",
  "caps",
  "banned-word",
  "spam",
  "scam-phrase",
  "scam-link",
  "masked-link",
  "obfuscated-invite",
  "obfuscated-banned-word",
  "raid-join",
  "nickname"
];
const AUTOMOD_RULE_ACTIONS = new Set(["delete", "alert", "warn", "timeout"]);
const BUILT_IN_SCAM_PHRASES = [
  "free nitro",
  "steam gift",
  "claim your reward",
  "claim reward",
  "gift inventory",
  "airdrop",
  "wallet connect",
  "connect your wallet",
  "double your crypto",
  "verify your account",
  "staff application form",
  "download this build",
  "test my game",
  "check this file",
  "limited time reward"
];
const SUSPICIOUS_SCAM_DOMAINS = [
  "bit.ly",
  "cutt.ly",
  "tinyurl.com",
  "grabify.link",
  "linktr.ee",
  "lnk.bio"
];
const TIKTOK_LIVE_RECONNECT_MS = 20 * 1000;
const TIKTOK_OFFLINE_RECHECK_MS = 60 * 1000;
const TIKTOK_HEALTHCHECK_MS = 90 * 1000;
const TIKTOK_ROOMINFO_POLL_MS = 45 * 1000;
const TIKTOK_OFFLINE_CONFIRMATION_ATTEMPTS = 2;
const spamTracker = new Map();
const joinTracker = new Map();
const musicQueues = new Map();
const pendingPanelActions = new Map();
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
      scamFilterEnabled: true,
      evasionFilterEnabled: true,
      scamPhraseList: [],
      alertOnlyRules: [],
      ruleActions: {},
      maxMentions: 5,
      emojiSpamEnabled: false,
      maxEmojiCount: 12,
      escalationEnabled: true,
      warnThreshold: 2,
      timeoutThreshold: 4,
      timeoutDurationMs: 10 * 60 * 1000,
      offenseWindowMs: 24 * 60 * 60 * 1000,
      offenses: {},
      analytics: {
        totalDetections: 0,
        ruleCounts: {},
        recentViolations: []
      },
      exemptChannelIds: [],
      exemptRoleIds: [],
      exemptUserIds: []
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
        scamPhraseList: Array.isArray(parsed.automod?.scamPhraseList) ? parsed.automod.scamPhraseList : [],
        alertOnlyRules: Array.isArray(parsed.automod?.alertOnlyRules) ? parsed.automod.alertOnlyRules : [],
        ruleActions: parsed.automod?.ruleActions && typeof parsed.automod.ruleActions === "object" ? parsed.automod.ruleActions : {},
        offenses: parsed.automod?.offenses && typeof parsed.automod.offenses === "object" ? parsed.automod.offenses : {},
        analytics: {
          ...defaults.automod.analytics,
          ...(parsed.automod?.analytics || {}),
          ruleCounts: parsed.automod?.analytics?.ruleCounts && typeof parsed.automod.analytics.ruleCounts === "object"
            ? parsed.automod.analytics.ruleCounts
            : {},
          recentViolations: Array.isArray(parsed.automod?.analytics?.recentViolations)
            ? parsed.automod.analytics.recentViolations.slice(0, 25)
            : []
        },
        exemptChannelIds: Array.isArray(parsed.automod?.exemptChannelIds) ? parsed.automod.exemptChannelIds : [],
        exemptRoleIds: Array.isArray(parsed.automod?.exemptRoleIds) ? parsed.automod.exemptRoleIds : [],
        exemptUserIds: Array.isArray(parsed.automod?.exemptUserIds) ? parsed.automod.exemptUserIds : []
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

function getScamPhrases() {
  const customPhrases = Array.isArray(config.automod.scamPhraseList) ? config.automod.scamPhraseList : [];
  return [...new Set([...BUILT_IN_SCAM_PHRASES, ...customPhrases].map(value => normalizeComparisonText(value)).filter(Boolean))];
}

function getAutoModAnalytics() {
  if (!config.automod.analytics || typeof config.automod.analytics !== "object") {
    config.automod.analytics = {
      totalDetections: 0,
      ruleCounts: {},
      recentViolations: []
    };
  }
  return config.automod.analytics;
}

function normalizeRuleAction(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return AUTOMOD_RULE_ACTIONS.has(normalized) ? normalized : null;
}

function getAutoModRuleAction(ruleKey) {
  const configured = normalizeRuleAction(config.automod.ruleActions?.[ruleKey]);
  if (configured) return configured;
  if (getAlertOnlyRules().includes(ruleKey)) return "alert";
  return "delete";
}

function normalizeRuleKey(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return AUTOMOD_RULE_KEYS.includes(normalized) ? normalized : null;
}

function parseRuleKeyList(input) {
  return [...new Set(
    String(input || "")
      .split(",")
      .map(value => normalizeRuleKey(value))
      .filter(Boolean)
  )];
}

function parseIdList(input) {
  return [...new Set(
    String(input || "")
      .split(",")
      .map(value => value.trim().replace(/[<#@&>]/g, ""))
      .filter(Boolean)
  )];
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

function stripZeroWidth(content) {
  return String(content || "").replace(/[\u200B-\u200D\uFEFF]/g, "");
}

function normalizeComparisonText(content) {
  return stripZeroWidth(content)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeBypassText(content) {
  return normalizeComparisonText(content).replace(/[^a-z0-9]/g, "");
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

function detectMaskedLink(content) {
  const regex = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;
  let match = regex.exec(content);

  while (match) {
    const display = normalizeComparisonText(match[1]);
    try {
      const hostname = normalizeDomain(new URL(match[2]).hostname);
      const domainLabel = hostname.split(".").slice(-2).join(".");
      if (hostname && !display.includes(hostname) && !display.includes(domainLabel)) {
        return hostname;
      }
    } catch (error) {
      // Ignore invalid links and continue scanning.
    }

    match = regex.exec(content);
  }

  return null;
}

function detectScamAttempt(message) {
  const content = message.content || "";
  const normalizedText = normalizeComparisonText(content);
  const domains = extractMessageDomains(content);

  const maskedDomain = detectMaskedLink(content);
  if (maskedDomain) {
    return {
      actionLabel: "masked-link",
      reason: `masked links pointing to ${maskedDomain} are not allowed here.`
    };
  }

  const suspiciousDomain = domains.find(domain =>
    domain.startsWith("xn--") ||
    SUSPICIOUS_SCAM_DOMAINS.some(entry => domain === entry || domain.endsWith(`.${entry}`))
  );

  const matchedPhrase = getScamPhrases().find(phrase => normalizedText.includes(phrase));
  if (matchedPhrase && suspiciousDomain) {
    return {
      actionLabel: "scam-link",
      reason: `that message matched scam wording and linked to ${suspiciousDomain}.`
    };
  }

  if (matchedPhrase) {
    return {
      actionLabel: "scam-phrase",
      reason: `that message matched a scam or phishing phrase (${matchedPhrase}).`
    };
  }

  return null;
}

function detectBypassAttempt(content) {
  const normalized = normalizeBypassText(content);
  if (!normalized) return null;

  if (normalized.includes("discordgg") || normalized.includes("discordcominvite")) {
    return {
      actionLabel: "obfuscated-invite",
      reason: "obfuscated invite links are not allowed here."
    };
  }

  const blockedWord = getBannedWords().find(term => {
    const normalizedTerm = normalizeBypassText(term);
    return normalizedTerm && normalized.includes(normalizedTerm);
  });

  if (blockedWord) {
    return {
      actionLabel: "obfuscated-banned-word",
      reason: `that phrase matched a blocked term after bypass normalization (${blockedWord}).`
    };
  }

  return null;
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

function recordAutoModAnalytics(action, reason, userTag = "Unknown user") {
  const analytics = getAutoModAnalytics();
  analytics.totalDetections = Number(analytics.totalDetections || 0) + 1;
  analytics.ruleCounts[action] = Number(analytics.ruleCounts[action] || 0) + 1;
  analytics.recentViolations = [
    {
      action,
      reason: String(reason || "").slice(0, 200),
      userTag: String(userTag || "Unknown user").slice(0, 80),
      createdAt: new Date().toISOString()
    },
    ...(Array.isArray(analytics.recentViolations) ? analytics.recentViolations : [])
  ].slice(0, 20);
}

function buildAutoModAnalyticsLines(limit = 5) {
  const analytics = getAutoModAnalytics();
  const topRules = Object.entries(analytics.ruleCounts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([rule, count]) => `${rule}: ${count}`);

  return topRules.length ? topRules.join("\n") : "No triggers recorded.";
}

function buildRecentAutoModAnalyticsLines(limit = 5) {
  const analytics = getAutoModAnalytics();
  return (analytics.recentViolations || [])
    .slice(0, limit)
    .map(entry => {
      const at = Math.floor(new Date(entry.createdAt).getTime() / 1000);
      return `<t:${at}:R> - ${entry.action} - ${entry.userTag}`;
    })
    .join("\n") || "No recent detections.";
}

function buildAutoModAnalyticsEmbed() {
  const analytics = getAutoModAnalytics();
  return makeEmbed({
    title: "AutoMod Analytics",
    description: "Recent trigger volume and the rules firing most often.",
    color: COLORS.yellow,
    fields: [
      { name: "Total Detections", value: `${analytics.totalDetections || 0}`, inline: true },
      { name: "Tracked Rules", value: `${Object.keys(analytics.ruleCounts || {}).length}`, inline: true },
      { name: "Exempt Users", value: `${config.automod.exemptUserIds.length}`, inline: true },
      { name: "Top Rules", value: buildAutoModAnalyticsLines(), inline: false },
      { name: "Recent Detections", value: buildRecentAutoModAnalyticsLines(), inline: false }
    ]
  });
}

function validateEnv() {
  const requiredVars = ["TOKEN", "CLIENT_ID", "GUILD_ID"];
  const missing = requiredVars.filter(key => !process.env[key]);

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (!ENABLE_CORE_BOT && !ENABLE_MUSIC) {
    throw new Error("At least one bot feature must be enabled. Set ENABLE_CORE_BOT=true or ENABLE_MUSIC=true.");
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

const allCommands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show the bot's main commands"),

  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Join voice and play a YouTube song or search result")
    .addStringOption(option =>
      option.setName("query").setDescription("YouTube URL or search query").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skip the current song"),

  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop playback and clear the queue"),

  new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Pause the current song"),

  new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Resume paused playback"),

  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("View the current music queue"),

  new SlashCommandBuilder()
    .setName("musicpanel")
    .setDescription("Open the interactive music control panel"),

  new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("Show the currently playing song"),

  new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Make the bot leave the voice channel"),

  new SlashCommandBuilder()
    .setName("adminpanel")
    .setDescription("Open the interactive Mochi admin panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

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
             { name: "invite-link", value: "invite-link" },
             { name: "scam-phrase", value: "scam-phrase" },
             { name: "scam-link", value: "scam-link" },
             { name: "masked-link", value: "masked-link" },
             { name: "obfuscated-invite", value: "obfuscated-invite" },
             { name: "obfuscated-banned-word", value: "obfuscated-banned-word" }
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
];

const MUSIC_COMMAND_NAMES = new Set([
  "play",
  "skip",
  "stop",
  "pause",
  "resume",
  "queue",
  "musicpanel",
  "nowplaying",
  "leave"
]);

const SHARED_COMMAND_NAMES = new Set(["help"]);

const commands = allCommands
  .filter(command => {
    if (SHARED_COMMAND_NAMES.has(command.name)) {
      return true;
    }

    if (MUSIC_COMMAND_NAMES.has(command.name)) {
      return ENABLE_MUSIC;
    }

    return ENABLE_CORE_BOT;
  })
  .map(command => command.toJSON());

let tiktokConnection = null;
let reconnectTimeout = null;
let wasLive = false;
let tiktokHealthInterval = null;
let tiktokConnectionVersion = 0;
let tiktokOfflineChecks = 0;
let tiktokLastConnectAt = null;
let tiktokLastDisconnectAt = null;
let tiktokLastError = null;
let tiktokCurrentUsername = null;
let tiktokLastRoomCheckAt = null;
let tiktokLastRoomStatus = null;
let tiktokLastRoomId = null;
let tiktokAnnouncedRoomId = null;
let tiktokRoomInfoSyncPromise = null;
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

function clearNotes(userId) {
  const count = getNotes(userId).length;
  delete config.notes[userId];
  saveConfig();
  return count;
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
  if (config.automod.exemptUserIds.includes(message.author.id)) return true;

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

function formatTrackDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "Live";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function buildMusicSummary(track, prefix = "Now playing") {
  return makeEmbed({
    title: prefix,
    description: `[${track.title}](${track.url})`,
    color: COLORS.rose,
    fields: [
      { name: "Duration", value: track.durationText, inline: true },
      { name: "Requested by", value: track.requestedBy, inline: true }
    ],
    thumbnail: track.thumbnail || null
  });
}

function buildMusicPanelCustomId(kind, action) {
  return `musicpanel:${kind}:${action}`;
}

function buildMusicPanelButtons(guildId) {
  const queue = musicQueues.get(guildId);
  const hasCurrent = Boolean(queue?.current);
  const hasQueue = Boolean(queue && (queue.current || queue.tracks.length));
  const isPaused = queue?.player?.state?.status === AudioPlayerStatus.Paused;

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buildMusicPanelCustomId("modal", "play"))
        .setLabel("Request Song")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(buildMusicPanelCustomId("action", "pause"))
        .setLabel("Pause")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasCurrent || isPaused),
      new ButtonBuilder()
        .setCustomId(buildMusicPanelCustomId("action", "resume"))
        .setLabel("Resume")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!hasCurrent || !isPaused),
      new ButtonBuilder()
        .setCustomId(buildMusicPanelCustomId("action", "skip"))
        .setLabel("Skip")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasCurrent),
      new ButtonBuilder()
        .setCustomId(buildMusicPanelCustomId("action", "refresh"))
        .setLabel("Refresh")
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buildMusicPanelCustomId("action", "queue"))
        .setLabel("Queue")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasQueue),
      new ButtonBuilder()
        .setCustomId(buildMusicPanelCustomId("action", "nowplaying"))
        .setLabel("Now Playing")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasCurrent),
      new ButtonBuilder()
        .setCustomId(buildMusicPanelCustomId("action", "stop"))
        .setLabel("Stop")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!hasQueue),
      new ButtonBuilder()
        .setCustomId(buildMusicPanelCustomId("action", "leave"))
        .setLabel("Leave")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!hasQueue)
    )
  ];
}

function buildMusicPanelEmbed(guildId) {
  const queue = musicQueues.get(guildId);
  const upcoming = queue?.tracks?.length
    ? queue.tracks.slice(0, 5).map((track, index) => `${index + 1}. ${track.title} • ${track.durationText}`).join("\n")
    : "Nothing queued yet.";
  const status =
    queue?.player?.state?.status === AudioPlayerStatus.Playing
      ? "Playing"
      : queue?.player?.state?.status === AudioPlayerStatus.Paused
        ? "Paused"
        : queue?.current
          ? "Buffering"
          : "Idle";

  return makeEmbed({
    title: "Mochi Music Panel",
    description: queue?.current
      ? `Current track: [${queue.current.title}](${queue.current.url})`
      : "Use the panel buttons below to request and control music in voice chat.",
    color: COLORS.rose,
    fields: [
      { name: "Status", value: status, inline: true },
      { name: "Voice Channel", value: queue?.voiceChannelId ? `<#${queue.voiceChannelId}>` : "Not connected", inline: true },
      { name: "Queued Songs", value: `${queue?.tracks?.length || 0}`, inline: true },
      { name: "Now Playing", value: queue?.current ? `${queue.current.title}\n${queue.current.durationText} • ${queue.current.requestedBy}` : "Nothing is playing right now.", inline: false },
      { name: "Up Next", value: upcoming.slice(0, 1024), inline: false }
    ],
    thumbnail: queue?.current?.thumbnail || null
  });
}

async function sendMusicMessage(queue, payload) {
  try {
    if (!queue?.textChannelId || !queue?.guildId) return;
    const guild = client.guilds.cache.get(queue.guildId) || await client.guilds.fetch(queue.guildId).catch(() => null);
    const channel = guild?.channels?.cache?.get(queue.textChannelId) || await client.channels.fetch(queue.textChannelId).catch(() => null);
    if (!channel?.send) return;
    await channel.send(payload);
  } catch (error) {
    console.error("Music message error:", error.message);
  }
}

function destroyMusicQueue(guildId) {
  const queue = musicQueues.get(guildId);
  if (!queue) return;

  try {
    queue.connection?.destroy();
  } catch (error) {
    console.error("Music disconnect error:", error.message);
  }

  try {
    queue.player?.stop();
  } catch (error) {
    console.error("Music player stop error:", error.message);
  }

  musicQueues.delete(guildId);
}

async function stopMusicQueue(guildId, reason = "Playback stopped.") {
  const queue = musicQueues.get(guildId);
  if (!queue) return;

  destroyMusicQueue(guildId);
  await sendMusicMessage(queue, {
    embeds: [
      makeEmbed({
        title: "Music stopped",
        description: reason,
        color: COLORS.purple
      })
    ]
  });
}

async function playNextTrack(guildId) {
  const queue = musicQueues.get(guildId);
  if (!queue) return;

  if (!queue.tracks.length) {
    queue.current = null;
    await stopMusicQueue(guildId, "The queue finished, so I left the voice channel.");
    return;
  }

  const nextTrack = queue.tracks.shift();
  queue.current = nextTrack;

  try {
    const stream = await play.stream(nextTrack.url);
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type || StreamType.Arbitrary,
      metadata: nextTrack
    });
    queue.player.play(resource);
    await sendMusicMessage(queue, { embeds: [buildMusicSummary(nextTrack)] });
  } catch (error) {
    console.error("Music playback error:", error.message);
    await sendMusicMessage(queue, {
      embeds: [
        makeEmbed({
          title: "Playback error",
          description: `I couldn't play **${nextTrack.title}**. Skipping to the next song.`,
          color: COLORS.red
        })
      ]
    });
    queue.current = null;
    await playNextTrack(guildId);
  }
}

function createMusicQueue(guild, voiceChannel, textChannel) {
  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Pause
    }
  });

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true
  });

  const queue = {
    guildId: guild.id,
    textChannelId: textChannel.id,
    voiceChannelId: voiceChannel.id,
    connection,
    player,
    tracks: [],
    current: null
  };

  connection.subscribe(player);

  player.on(AudioPlayerStatus.Idle, () => {
    queue.current = null;
    playNextTrack(guild.id).catch(error => {
      console.error("Music queue idle error:", error.message);
    });
  });

  player.on("error", error => {
    console.error("Music player error:", error.message);
    playNextTrack(guild.id).catch(nextError => {
      console.error("Music recovery error:", nextError.message);
    });
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
      ]);
    } catch (error) {
      await stopMusicQueue(guild.id, "I got disconnected from voice, so I cleared the queue.");
    }
  });

  musicQueues.set(guild.id, queue);
  return queue;
}

async function ensureVoiceChannel(interaction) {
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const voiceChannel = member?.voice?.channel || null;

  if (!voiceChannel) {
    await interaction.reply({ content: "Join a voice channel first, then try that again.", ephemeral: true });
    return null;
  }

  const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
  const permissions = botMember ? voiceChannel.permissionsFor(botMember) : null;
  const missing = [];

  if (!permissions?.has(PermissionFlagsBits.ViewChannel)) {
    missing.push("View Channel");
  }

  if (!permissions?.has(PermissionFlagsBits.Connect)) {
    missing.push("Connect");
  }

  if (!permissions?.has(PermissionFlagsBits.Speak)) {
    missing.push("Speak");
  }

  if (missing.length) {
    await interaction.reply({
      content: `I can't use ${voiceChannel} yet. Missing voice permissions: ${missing.join(", ")}.`,
      ephemeral: true
    });
    return null;
  }

  return voiceChannel;
}

async function describeVoiceJoinFailure(interaction, voiceChannel, error) {
  const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
  const permissions = botMember ? voiceChannel.permissionsFor(botMember) : null;
  const missing = [];

  if (!permissions?.has(PermissionFlagsBits.ViewChannel)) missing.push("View Channel");
  if (!permissions?.has(PermissionFlagsBits.Connect)) missing.push("Connect");
  if (!permissions?.has(PermissionFlagsBits.Speak)) missing.push("Speak");
  if (!permissions?.has(PermissionFlagsBits.UseVAD)) missing.push("Use Voice Activity");

  if (missing.length) {
    return `I couldn't fully join ${voiceChannel}. Missing permissions: ${missing.join(", ")}.`;
  }

  if (voiceChannel.type === ChannelType.GuildStageVoice) {
    return `I reached ${voiceChannel}, but it's a Stage channel. I may need to be invited to speak before audio can work.`;
  }

  if (typeof voiceChannel.full === "boolean" && voiceChannel.full) {
    return `${voiceChannel} is full right now, so I can't join it.`;
  }

  const reason = String(error?.message || error || "unknown voice connection issue").slice(0, 200);
  return `I could see ${voiceChannel}, but the voice connection never became ready. Discord reported: ${reason}`;
}

function ensureSameVoiceChannel(interaction, queue) {
  const memberChannelId = interaction.member?.voice?.channelId;
  if (!queue || !queue.voiceChannelId || queue.voiceChannelId === memberChannelId) {
    return true;
  }

  interaction.reply({
    content: "You need to be in the same voice channel as the bot to use that music control.",
    ephemeral: true
  }).catch(() => {});
  return false;
}

async function resolveMusicTrack(query, requestedBy) {
  const trimmed = query.trim();
  const validation = play.yt_validate(trimmed);
  let video = null;

  if (validation === "video") {
    const info = await play.video_basic_info(trimmed);
    video = info.video_details;
  } else {
    const results = await play.search(trimmed, {
      limit: 1,
      source: { youtube: "video" }
    });
    video = results[0] || null;
  }

  if (!video?.url) {
    return null;
  }

  const durationInSec = Number(video.durationInSec || video.durationRaw || 0) || 0;

  return {
    title: video.title || "Unknown track",
    url: video.url,
    durationInSec,
    durationText: formatTrackDuration(durationInSec),
    thumbnail: video.thumbnails?.[0]?.url || video.thumbnail?.url || null,
    requestedBy
  };
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
  const ruleAction = getAutoModRuleAction(actionLabel);
  const alertOnly = ruleAction === "alert";

  if (!alertOnly) {
    await message.delete().catch(() => {});

    const notice = await message.channel.send({
      content: `${message.author}, ${reason}`
    }).catch(() => null);

    if (notice) {
      setTimeout(() => notice.delete().catch(() => {}), 10000);
    }
  }

  recordAutoModAnalytics(actionLabel, reason, message.author.tag);

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
  let escalationText = alertOnly ? "Alert only" : `Deleted (${ruleAction})`;

  if (!alertOnly && ruleAction === "timeout" && message.member?.moderatable) {
    await message.member.timeout(
      config.automod.timeoutDurationMs,
      `AutoMod rule action (${actionLabel}): ${reason}`
    ).catch(() => {});

    const timeoutEntry = addCase({
      action: "automod:timeout",
      targetId: message.author.id,
      targetTag: message.author.tag,
      moderatorTag: "AutoMod",
      reason: `Automatic timeout from the ${actionLabel} rule. Latest: ${reason}`,
      details: [
        { name: "Rule action", value: "timeout", inline: true },
        { name: "Duration", value: formatDuration(config.automod.timeoutDurationMs), inline: true }
      ]
    });

    escalationText = `Rule action timeout applied for ${formatDuration(config.automod.timeoutDurationMs)}.`;

    await notifyUser(
      message.author,
      makeEmbed({
        title: "Automatic timeout",
        description: `You were automatically timed out in **${message.guild.name}** by AutoMod.`,
        color: COLORS.red,
        fields: buildCaseFields(timeoutEntry)
      })
    );

    await logEmbed(
      makeEmbed({
        title: `Case #${timeoutEntry.id}: automod timeout`,
        description: `${message.author.tag} was automatically timed out by rule action.`,
        color: COLORS.red,
        fields: buildCaseFields(timeoutEntry)
      })
    );
  } else if (!alertOnly && ruleAction === "warn") {
    const warnings = addWarning(
      message.author.id,
      "AutoMod",
      `Automatic warning from the ${actionLabel} rule. Latest: ${reason}`
    );

    const warningEntry = addCase({
      action: "automod:warn",
      targetId: message.author.id,
      targetTag: message.author.tag,
      moderatorTag: "AutoMod",
      reason: `Automatic warning from the ${actionLabel} rule. Latest: ${reason}`,
      details: [
        { name: "Rule action", value: "warn", inline: true },
        { name: "Total warnings", value: `${warnings.length}`, inline: true }
      ]
    });

    escalationText = `Rule action warning issued. Total warnings: ${warnings.length}.`;

    await notifyUser(
      message.author,
      makeEmbed({
        title: "Automatic warning",
        description: `You received an automatic warning in **${message.guild.name}** from AutoMod.`,
        color: COLORS.yellow,
        fields: buildCaseFields(warningEntry)
      })
    );

    await logEmbed(
      makeEmbed({
        title: `Case #${warningEntry.id}: automod warning`,
        description: `${message.author.tag} received an automatic warning by rule action.`,
        color: COLORS.yellow,
        fields: buildCaseFields(warningEntry)
      })
    );
  }

  if (config.automod.escalationEnabled && !alertOnly && ruleAction !== "timeout") {
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
    } else if (activeOffenseCount >= config.automod.warnThreshold && ruleAction !== "warn") {
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
        { name: "Mode", value: ruleAction, inline: true },
        { name: "Escalation", value: escalationText || "None", inline: false }
      ]
    })
  );
}

function isLikelyTikTokOfflineError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return [
    "offline",
    "room_id",
    "user_not_found",
    "not currently live",
    "live has ended",
    "failed to fetch room info",
    "is not live"
  ].some(fragment => message.includes(fragment));
}

function isTikTokRoomLive(roomInfo) {
  return Number(roomInfo?.status) === 2;
}

function getTikTokRoomIdentifier(roomInfo, fallbackRoomId = null) {
  return String(
    roomInfo?.stream_id_str ||
    roomInfo?.stream_id ||
    roomInfo?.id_str ||
    roomInfo?.id ||
    fallbackRoomId ||
    ""
  );
}

async function fetchTikTokRoomInfo(uniqueId) {
  const probe = new WebcastPushConnection(uniqueId, {
    processInitialData: false,
    fetchRoomInfoOnConnect: false,
    enableWebsocketUpgrade: false
  });

  return probe.getRoomInfo();
}

async function announceTikTokLiveStarted(username, channelId, roomId, roomInfo = null) {
  const liveId = roomId || getTikTokRoomIdentifier(roomInfo);
  wasLive = true;

  if (liveId) {
    tiktokLastRoomId = liveId;
    if (tiktokAnnouncedRoomId === liveId) {
      return;
    }
    tiktokAnnouncedRoomId = liveId;
  }

  const viewerCount = roomInfo?.stats?.user_count_str || roomInfo?.stats?.user_count || null;
  const liveTitle = roomInfo?.title || null;

  await safeSend(channelId, {
    embeds: [
      makeEmbed({
        title: "TikTok LIVE started",
        description:
          `**@${username}** is live right now.\n\n` +
          `Come join the stream here:\nhttps://tiktok.com/@${username}/live`,
        color: COLORS.rose,
        fields: [
          ...(liveTitle ? [{ name: "Title", value: String(liveTitle).slice(0, 1024), inline: false }] : []),
          ...(viewerCount ? [{ name: "Viewers", value: `${viewerCount}`, inline: true }] : [])
        ]
      })
    ]
  });
}

function clearTikTokReconnect() {
  if (!reconnectTimeout) return;
  clearTimeout(reconnectTimeout);
  reconnectTimeout = null;
}

function cleanupTikTokConnection() {
  if (!tiktokConnection) return;

  try {
    tiktokConnection.removeAllListeners();
  } catch (error) {
    console.error("TikTok listener cleanup error:", error.message);
  }

  try {
    tiktokConnection.disconnect();
  } catch (error) {
    console.error("TikTok disconnect error:", error.message);
  }

  tiktokConnection = null;
}

async function sendTikTokEndedMessage(username, channelId, reason = null) {
  if (!wasLive) return;

  wasLive = false;
  tiktokAnnouncedRoomId = null;
  await safeSend(channelId, {
    embeds: [
      makeEmbed({
        title: "TikTok LIVE ended",
        description: reason
          ? `@${username}'s stream appears to have ended.\n\nReason: ${reason}`
          : `@${username}'s stream has ended.`,
        color: COLORS.purple
      })
    ]
  });
}

function scheduleTikTokReconnect(delayMs = TIKTOK_OFFLINE_RECHECK_MS, reason = "retry") {
  if (reconnectTimeout) return;

  console.log(`Retrying TikTok connection in ${Math.floor(delayMs / 1000)} seconds (${reason})...`);

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    startTikTokLive().catch(error => {
      console.error("TikTok retry error:", error.message);
    });
  }, delayMs);
}

function ensureTikTokHealthcheck() {
  if (tiktokHealthInterval) {
    clearInterval(tiktokHealthInterval);
  }

  tiktokHealthInterval = setInterval(async () => {
    const tiktokUsername = getTikTokUsername();
    const tiktokChannelId = getTikTokChannelId();

    if (!tiktokUsername || !tiktokChannelId) {
      clearTikTokReconnect();
      cleanupTikTokConnection();
      tiktokCurrentUsername = null;
      return;
    }

    if (tiktokCurrentUsername && tiktokCurrentUsername !== tiktokUsername) {
      resetTikTokConnection().catch(error => {
        console.error("TikTok username refresh error:", error.message);
      });
      return;
    }

    const shouldPollRoomInfo =
      !tiktokLastRoomCheckAt ||
      Date.now() - new Date(tiktokLastRoomCheckAt).getTime() >= TIKTOK_ROOMINFO_POLL_MS;

    if (shouldPollRoomInfo) {
      await syncTikTokRoomInfo("healthcheck");
    }

    if (!tiktokConnection && !reconnectTimeout && wasLive) {
      startTikTokLive().catch(error => {
        console.error("TikTok healthcheck restart error:", error.message);
      });
    }
  }, TIKTOK_HEALTHCHECK_MS);
}

async function syncTikTokRoomInfo(trigger = "poll") {
  if (tiktokRoomInfoSyncPromise) {
    return tiktokRoomInfoSyncPromise;
  }

  const tiktokUsername = getTikTokUsername();
  const tiktokChannelId = getTikTokChannelId();

  if (!tiktokUsername || !tiktokChannelId) return null;

  tiktokRoomInfoSyncPromise = (async () => {
    try {
      const roomInfo = await fetchTikTokRoomInfo(tiktokUsername);
      tiktokLastRoomCheckAt = new Date().toISOString();
      tiktokLastRoomStatus = roomInfo?.status ?? null;
      const liveRoomId = getTikTokRoomIdentifier(roomInfo);
      if (liveRoomId) {
        tiktokLastRoomId = liveRoomId;
      }

      if (isTikTokRoomLive(roomInfo)) {
        tiktokOfflineChecks = 0;
        tiktokLastError = null;

        if (!wasLive) {
          await announceTikTokLiveStarted(tiktokUsername, tiktokChannelId, liveRoomId, roomInfo);
        }

        if (!tiktokConnection && !reconnectTimeout) {
          startTikTokLive(roomInfo).catch(error => {
            console.error("TikTok room-info reconnect error:", error.message);
          });
        }

        return roomInfo;
      }

      tiktokOfflineChecks += 1;

      if (wasLive && tiktokOfflineChecks >= TIKTOK_OFFLINE_CONFIRMATION_ATTEMPTS) {
        await sendTikTokEndedMessage(
          tiktokUsername,
          tiktokChannelId,
          `room info check marked the stream offline (${trigger})`
        );
        cleanupTikTokConnection();
      }

      return roomInfo;
    } catch (error) {
      tiktokLastError = error?.message || "failed to poll room info";
      tiktokLastRoomCheckAt = new Date().toISOString();
      console.error("TikTok room info poll error:", tiktokLastError);
      return null;
    } finally {
      tiktokRoomInfoSyncPromise = null;
    }
  })();

  return tiktokRoomInfoSyncPromise;
}

async function resetTikTokConnection() {
  clearTikTokReconnect();
  wasLive = false;
  tiktokOfflineChecks = 0;
  tiktokLastDisconnectAt = null;
  tiktokLastError = null;
  tiktokCurrentUsername = null;
  tiktokLastRoomCheckAt = null;
  tiktokLastRoomStatus = null;
  tiktokLastRoomId = null;
  tiktokAnnouncedRoomId = null;
  cleanupTikTokConnection();

  const roomInfo = await syncTikTokRoomInfo("reset");
  await startTikTokLive(roomInfo);
}

async function startTikTokLive(preloadedRoomInfo = null) {
  const tiktokUsername = getTikTokUsername();
  const tiktokChannelId = getTikTokChannelId();

  if (!tiktokUsername || !tiktokChannelId) {
    console.log("TikTok LIVE not configured.");
    tiktokCurrentUsername = null;
    cleanupTikTokConnection();
    clearTikTokReconnect();
    return;
  }

  const roomInfo = preloadedRoomInfo || await syncTikTokRoomInfo("connect");
  if (roomInfo) {
    tiktokLastRoomStatus = roomInfo?.status ?? null;
    const roomId = getTikTokRoomIdentifier(roomInfo);
    if (roomId) {
      tiktokLastRoomId = roomId;
    }
  }

  if (roomInfo && !isTikTokRoomLive(roomInfo)) {
    scheduleTikTokReconnect(TIKTOK_OFFLINE_RECHECK_MS, "room info offline");
    return;
  }

  clearTikTokReconnect();
  cleanupTikTokConnection();
  const connectionVersion = ++tiktokConnectionVersion;
  tiktokCurrentUsername = tiktokUsername;

  try {
    console.log(`Trying TikTok LIVE connection for @${tiktokUsername}...`);
    tiktokConnection = new WebcastPushConnection(tiktokUsername);
    await tiktokConnection.connect();

    if (connectionVersion !== tiktokConnectionVersion) {
      cleanupTikTokConnection();
      return;
    }

    console.log(`Connected to TikTok LIVE for @${tiktokUsername}`);
    tiktokLastConnectAt = new Date().toISOString();
    tiktokLastDisconnectAt = null;
    tiktokLastError = null;
    tiktokOfflineChecks = 0;

    await announceTikTokLiveStarted(
      tiktokUsername,
      tiktokChannelId,
      getTikTokRoomIdentifier(roomInfo),
      roomInfo
    );

    tiktokConnection.on("connected", () => {
      if (connectionVersion !== tiktokConnectionVersion) return;
      tiktokLastConnectAt = new Date().toISOString();
      tiktokLastError = null;
      tiktokOfflineChecks = 0;
    });

    tiktokConnection.on("streamEnd", async () => {
      if (connectionVersion !== tiktokConnectionVersion) return;
      tiktokLastDisconnectAt = new Date().toISOString();
      tiktokOfflineChecks = TIKTOK_OFFLINE_CONFIRMATION_ATTEMPTS;
      await sendTikTokEndedMessage(tiktokUsername, tiktokChannelId);
      cleanupTikTokConnection();
      scheduleTikTokReconnect(TIKTOK_OFFLINE_RECHECK_MS, "stream end");
    });

    tiktokConnection.on("disconnected", () => {
      if (connectionVersion !== tiktokConnectionVersion) return;
      tiktokLastDisconnectAt = new Date().toISOString();
      tiktokLastError = "socket disconnected";
      cleanupTikTokConnection();
      scheduleTikTokReconnect(wasLive ? TIKTOK_LIVE_RECONNECT_MS : TIKTOK_OFFLINE_RECHECK_MS, "socket disconnect");
    });

    tiktokConnection.on("error", error => {
      if (connectionVersion !== tiktokConnectionVersion) return;
      tiktokLastError = error?.message || "unknown TikTok socket error";
      console.error("TikTok socket error:", tiktokLastError);
      cleanupTikTokConnection();
      scheduleTikTokReconnect(wasLive ? TIKTOK_LIVE_RECONNECT_MS : TIKTOK_OFFLINE_RECHECK_MS, "socket error");
    });
  } catch (error) {
    tiktokConnection = null;
    tiktokLastError = error?.message || "unknown TikTok connect error";
    tiktokLastDisconnectAt = new Date().toISOString();

    if (isLikelyTikTokOfflineError(error)) {
      tiktokOfflineChecks += 1;
      console.log(`TikTok user offline or unavailable: ${error.message}`);

      if (wasLive && tiktokOfflineChecks >= TIKTOK_OFFLINE_CONFIRMATION_ATTEMPTS) {
        await sendTikTokEndedMessage(
          tiktokUsername,
          tiktokChannelId,
          "the watcher confirmed the account is offline"
        );
      }

      scheduleTikTokReconnect(TIKTOK_OFFLINE_RECHECK_MS, "offline check");
      return;
    }

    console.log(`TikTok connection error: ${error.message}`);
    scheduleTikTokReconnect(wasLive ? TIKTOK_LIVE_RECONNECT_MS : TIKTOK_OFFLINE_RECHECK_MS, "connect error");
  }
}

function buildAutoModSummary() {
  return [
    `Invites: ${config.automod.invites ? "on" : "off"}`,
    `Spam: ${config.automod.spam ? "on" : "off"}`,
    `Caps: ${config.automod.caps ? "on" : "off"}`,
    `Banned words: ${config.automod.bannedWords ? "on" : "off"}`,
    `Banned word count: ${getBannedWords().length}`,
    `Scam filter: ${config.automod.scamFilterEnabled ? "on" : "off"}`,
    `Scam phrase count: ${getScamPhrases().length}`,
    `Evasion filter: ${config.automod.evasionFilterEnabled ? "on" : "off"}`,
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
    `Exempt roles: ${config.automod.exemptRoleIds.length}`,
    `Exempt users: ${config.automod.exemptUserIds.length}`,
    `Custom rule actions: ${Object.keys(config.automod.ruleActions || {}).length}`
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
  const fields = [];

  if (ENABLE_CORE_BOT) {
    fields.push(
      {
        name: "Moderation",
        value:
          "`/adminpanel`, `/warn`, `/warnings`, `/clearwarnings`, `/timeout`, `/untimeout`, `/mute`, `/unmute`, `/kick`, `/ban`, `/tempban`, `/unban`, `/slowmode`",
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
      }
    );
  }

  if (ENABLE_MUSIC) {
    fields.push({
      name: "Music",
      value: "`/musicpanel`, `/play`, `/skip`, `/stop`, `/pause`, `/resume`, `/queue`, `/nowplaying`, `/leave`",
      inline: false
    });
  }

  if (ENABLE_CORE_BOT) {
    fields.push({
      name: "Info",
      value: "`/userinfo`, `/serverstats`, `/help`",
      inline: false
    });
  } else {
    fields.push({
      name: "Info",
      value: "`/help`",
      inline: false
    });
  }

  return makeEmbed({
    title: "Mochi Bot Help",
    description: "Main commands for the currently enabled bot features.",
    color: COLORS.blue,
    fields
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
      { name: "Core Features", value: ENABLE_CORE_BOT ? "Enabled" : "Disabled", inline: true },
      { name: "Music Features", value: ENABLE_MUSIC ? "Enabled" : "Disabled", inline: true },
      { name: "TikTok User", value: tiktokUsername ? `@${tiktokUsername}` : "Not set", inline: true },
      { name: "TikTok Alerts", value: tiktokChannelId ? `<#${tiktokChannelId}>` : "Not set", inline: true },
      {
        name: "TikTok Watcher",
        value: tiktokConnection ? "Connected" : reconnectTimeout ? "Retrying" : wasLive ? "Watching live state" : "Idle",
        inline: true
      },
      {
        name: "TikTok Health",
        value:
          `Offline checks: ${tiktokOfflineChecks}\n` +
          `Last connect: ${tiktokLastConnectAt ? `<t:${Math.floor(new Date(tiktokLastConnectAt).getTime() / 1000)}:R>` : "Never"}\n` +
          `Last room check: ${tiktokLastRoomCheckAt ? `<t:${Math.floor(new Date(tiktokLastRoomCheckAt).getTime() / 1000)}:R>` : "Never"}\n` +
          `Last room status: ${tiktokLastRoomStatus ?? "Unknown"}\n` +
          `Last room id: ${tiktokLastRoomId || "Unknown"}\n` +
          `Last issue: ${tiktokLastError ? tiktokLastError.slice(0, 120) : "None"}`,
        inline: false
      },
      { name: "Verify Message", value: config.verifyMessageId || "Not cached", inline: false },
      { name: "Cases Logged", value: `${config.cases.length}`, inline: true },
      { name: "Banned Words", value: `${getBannedWords().length}`, inline: true }
    ]
  });
}

function buildDashboardEmbed() {
  const allCases = Array.isArray(config.cases) ? config.cases : [];
  const recentCases = allCases.slice(-5).reverse();
  const recentAutomodCases = recentCases.filter(entry => typeof entry?.action === "string" && entry.action.startsWith("automod:"));
  const recentAutomodText = recentAutomodCases.length
    ? recentAutomodCases
        .map(entry => `#${entry.id || "?"} ${entry.action} - ${entry.targetTag || entry.targetId || "Unknown user"}`)
        .join("\n")
        .slice(0, 1024)
    : "No recent automod cases.";

  return makeEmbed({
    title: "Moderation dashboard",
    description: "Quick view of your moderation setup and recent activity.",
    color: COLORS.blue,
    fields: [
      { name: "Total cases", value: `${allCases.length}`, inline: true },
      { name: "Warnings saved", value: `${Object.keys(config.warnings || {}).length}`, inline: true },
      { name: "Staff notes", value: `${Object.keys(config.notes || {}).length}`, inline: true },
      { name: "AutoMod log channel", value: getAutoModLogChannelId() ? `<#${getAutoModLogChannelId()}>` : "Not set", inline: true },
      { name: "Alert-only rules", value: getAlertOnlyRules().join(", ") || "None", inline: false },
      { name: "Nickname filter terms", value: `${getNicknameBlockedTerms().length}`, inline: true },
      {
        name: "Recent AutoMod cases",
        value: recentAutomodText,
        inline: false
      }
    ]
  });
}

function buildAdminPanelCustomId(kind, action, targetId = null) {
  return `adminpanel:${kind}:${action}:${targetId || "none"}`;
}

function formatPanelRoleMentions(roleIds) {
  return roleIds.length ? roleIds.map(id => `<@&${id}>`).join(", ").slice(0, 1024) : "None configured.";
}

function parseDurationInputOrZero(input) {
  const normalized = (input || "").trim().toLowerCase();
  if (!normalized || ["0", "off", "none", "disable", "disabled"].includes(normalized)) {
    return 0;
  }

  return parseDuration(normalized);
}

function parseDurationPairInput(input) {
  const [firstRaw = "", secondRaw = ""] = String(input || "").split(/[|,]/).map(value => value.trim());
  const first = parseDurationInputOrZero(firstRaw);
  const second = parseDurationInputOrZero(secondRaw);
  if (first === null || second === null) {
    return null;
  }
  return [first, second];
}

function parseCommaSeparatedList(input, normalizer = value => value.trim().toLowerCase()) {
  return Array.from(
    new Set(
      (input || "")
        .split(/[\n,]/)
        .map(entry => normalizer(entry))
        .filter(Boolean)
    )
  );
}

async function resolveAdminPanelTarget(interaction, targetId) {
  if (!targetId || !interaction.guild) {
    return { member: null, user: null };
  }

  const member = await interaction.guild.members.fetch(targetId).catch(() => null);
  const user = member?.user || await client.users.fetch(targetId).catch(() => null);
  return { member, user };
}

function buildSelectedUserSummary(targetUserId) {
  if (!targetUserId) {
    return {
      summaryText: "No user selected yet. Use the user picker below to load moderation tools for someone.",
      historyText: "Select a member to view warnings, notes, and recent cases.",
      statusText: "Waiting for a selected user.",
      recentSignalsText: "No moderation data loaded yet."
    };
  }

  const warnings = getWarnings(targetUserId);
  const notes = getNotes(targetUserId);
  const cases = getCasesForUser(targetUserId).slice(-5).reverse();
  const latestWarning = warnings.at(-1);
  const latestNote = notes.at(-1);
  const latestCase = cases[0] || null;

  return {
    summaryText:
      `Warnings: ${warnings.length}\n` +
      `Notes: ${notes.length}\n` +
      `Cases: ${getCasesForUser(targetUserId).length}`,
    statusText: "Loading user status...",
    recentSignalsText: [
      latestWarning ? `Latest warning: ${(latestWarning.reason || "No reason").slice(0, 80)}` : "Latest warning: None",
      latestNote ? `Latest note: ${(latestNote.content || "No note").slice(0, 80)}` : "Latest note: None",
      latestCase ? `Latest case: #${latestCase.id} ${latestCase.action}` : "Latest case: None"
    ].join("\n").slice(0, 1024),
    historyText: cases.length
      ? cases
          .map(entry => `#${entry.id} ${entry.action || "unknown"} - ${(entry.reason || "No reason").slice(0, 70)}`)
          .join("\n")
          .slice(0, 1024)
      : "No recent cases for this user."
  };
}

function buildMemberRoleSummary(member) {
  if (!member) return "Not in server / unknown";

  const visibleRoles = member.roles.cache
    .filter(role => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map(role => role.toString());

  if (!visibleRoles.length) return "No assigned roles.";
  const shown = visibleRoles.slice(0, 6).join(", ");
  return visibleRoles.length > 6 ? `${shown} +${visibleRoles.length - 6} more` : shown;
}

function buildMemberPermissionSnapshot(member) {
  if (!member) return "Not in server / unknown";

  const labels = [];
  if (member.permissions.has(PermissionFlagsBits.Administrator)) labels.push("Administrator");
  if (member.permissions.has(PermissionFlagsBits.ModerateMembers)) labels.push("Moderate Members");
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) labels.push("Manage Messages");
  if (member.permissions.has(PermissionFlagsBits.KickMembers)) labels.push("Kick Members");
  if (member.permissions.has(PermissionFlagsBits.BanMembers)) labels.push("Ban Members");

  return labels.length ? labels.join(", ") : "No major staff permissions.";
}

async function getRecentMessagesForUser(channel, userId, limit = 5) {
  if (!channel?.messages?.fetch) return [];

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return [];

  return messages
    .filter(message => message.author?.id === userId)
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
    .first(limit)
    .map(message => {
      const content = (message.content || "*No text content*").replace(/\n/g, " ").slice(0, 120);
      return `<t:${Math.floor(message.createdTimestamp / 1000)}:R> - ${content}`;
    });
}

function clearPendingPanelAction(userId) {
  pendingPanelActions.delete(userId);
}

function setPendingPanelAction(userId, payload) {
  pendingPanelActions.set(userId, {
    ...payload,
    createdAt: Date.now()
  });
}

function getPendingPanelAction(userId) {
  const pending = pendingPanelActions.get(userId);
  if (!pending) return null;
  if (Date.now() - pending.createdAt > 10 * 60 * 1000) {
    pendingPanelActions.delete(userId);
    return null;
  }
  return pending;
}

function buildAutoModExemptionEmbed() {
  return makeEmbed({
    title: "AutoMod Exemptions",
    description: "Use the selectors below to replace the current exempt channels, roles, and users.",
    color: COLORS.yellow,
    fields: [
      {
        name: "Channels",
        value: config.automod.exemptChannelIds.map(id => `<#${id}>`).join(", ") || "None",
        inline: false
      },
      {
        name: "Roles",
        value: config.automod.exemptRoleIds.map(id => `<@&${id}>`).join(", ") || "None",
        inline: false
      },
      {
        name: "Users",
        value: config.automod.exemptUserIds.map(id => `<@${id}>`).join(", ") || "None",
        inline: false
      }
    ]
  });
}

function buildAutoModExemptionComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(buildAdminPanelCustomId("exemptselect", "channels"))
        .setPlaceholder("Choose exempt channels")
        .setMinValues(0)
        .setMaxValues(10)
    ),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(buildAdminPanelCustomId("exemptselect", "roles"))
        .setPlaceholder("Choose exempt roles")
        .setMinValues(0)
        .setMaxValues(10)
    ),
    new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(buildAdminPanelCustomId("exemptselect", "users"))
        .setPlaceholder("Choose exempt users")
        .setMinValues(0)
        .setMaxValues(10)
    )
  ];
}

function buildAdminPanelButtons(view, targetUserId = null) {
  const navigationRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildAdminPanelCustomId("view", "overview", targetUserId))
      .setLabel("Overview")
      .setStyle(view === "overview" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildAdminPanelCustomId("view", "moderation", targetUserId))
      .setLabel("Moderation")
      .setStyle(view === "moderation" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildAdminPanelCustomId("view", "automod", targetUserId))
      .setLabel("AutoMod")
      .setStyle(view === "automod" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildAdminPanelCustomId("view", "staff", targetUserId))
      .setLabel("Staff")
      .setStyle(view === "staff" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildAdminPanelCustomId("view", "setup", targetUserId))
      .setLabel("Setup")
      .setStyle(view === "setup" ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  const rows = [navigationRow];

  if (view === "overview") {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "status", targetUserId)).setLabel("Refresh Status").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "dashboard", targetUserId)).setLabel("Dashboard Snapshot").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "reload-config", targetUserId)).setLabel("Reload Config").setStyle(ButtonStyle.Success)
      )
    );
  }

  if (view === "moderation") {
    rows.push(
      new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(buildAdminPanelCustomId("selectuser", "moderation", targetUserId))
          .setPlaceholder(targetUserId ? "Change selected user" : "Select a user to moderate")
          .setMinValues(1)
          .setMaxValues(1)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("modal", "warn", targetUserId)).setLabel("Warn").setStyle(ButtonStyle.Secondary).setDisabled(!targetUserId),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("modal", "timeout", targetUserId)).setLabel("Timeout").setStyle(ButtonStyle.Secondary).setDisabled(!targetUserId),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "untimeout", targetUserId)).setLabel("Untimeout").setStyle(ButtonStyle.Success).setDisabled(!targetUserId),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("modal", "mute", targetUserId)).setLabel("Mute").setStyle(ButtonStyle.Secondary).setDisabled(!targetUserId),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "unmute", targetUserId)).setLabel("Unmute").setStyle(ButtonStyle.Success).setDisabled(!targetUserId)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("modal", "tempban", targetUserId)).setLabel("Temp Ban").setStyle(ButtonStyle.Danger).setDisabled(!targetUserId),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("modal", "kick", targetUserId)).setLabel("Kick").setStyle(ButtonStyle.Danger).setDisabled(!targetUserId),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("modal", "ban", targetUserId)).setLabel("Ban").setStyle(ButtonStyle.Danger).setDisabled(!targetUserId),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "clearwarnings", targetUserId)).setLabel("Clear Warnings").setStyle(ButtonStyle.Secondary).setDisabled(!targetUserId),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("modal", "note", targetUserId)).setLabel("Add Note").setStyle(ButtonStyle.Secondary).setDisabled(!targetUserId)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "history", targetUserId)).setLabel("Cases").setStyle(ButtonStyle.Secondary).setDisabled(!targetUserId),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "warnings-view", targetUserId)).setLabel("Warnings").setStyle(ButtonStyle.Secondary).setDisabled(!targetUserId),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "notes-view", targetUserId)).setLabel("Notes").setStyle(ButtonStyle.Secondary).setDisabled(!targetUserId),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "profile", targetUserId)).setLabel("Profile").setStyle(ButtonStyle.Secondary).setDisabled(!targetUserId),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "recent-messages", targetUserId)).setLabel("Recent Messages").setStyle(ButtonStyle.Secondary).setDisabled(!targetUserId),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("modal", "dmuser", targetUserId)).setLabel("DM User").setStyle(ButtonStyle.Primary).setDisabled(!targetUserId)
      )
    );
  }

  if (view === "automod") {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("toggle", "spam", targetUserId)).setLabel(`Spam ${config.automod.spam ? "On" : "Off"}`).setStyle(config.automod.spam ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("toggle", "invites", targetUserId)).setLabel(`Invites ${config.automod.invites ? "On" : "Off"}`).setStyle(config.automod.invites ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("toggle", "emoji", targetUserId)).setLabel(`Emoji ${config.automod.emojiSpamEnabled ? "On" : "Off"}`).setStyle(config.automod.emojiSpamEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("toggle", "caps", targetUserId)).setLabel(`Caps ${config.automod.caps ? "On" : "Off"}`).setStyle(config.automod.caps ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("toggle", "links", targetUserId)).setLabel(`Links ${config.automod.linksEnabled ? "On" : "Off"}`).setStyle(config.automod.linksEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("toggle", "bannedwords", targetUserId)).setLabel(`Words ${config.automod.bannedWords ? "On" : "Off"}`).setStyle(config.automod.bannedWords ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("toggle", "scam", targetUserId)).setLabel(`Scam ${config.automod.scamFilterEnabled ? "On" : "Off"}`).setStyle(config.automod.scamFilterEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("toggle", "evasion", targetUserId)).setLabel(`Evasion ${config.automod.evasionFilterEnabled ? "On" : "Off"}`).setStyle(config.automod.evasionFilterEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("toggle", "attachments", targetUserId)).setLabel(`Attachments ${config.automod.attachmentsEnabled ? "On" : "Off"}`).setStyle(config.automod.attachmentsEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("toggle", "nicknamefilter", targetUserId)).setLabel(`Nicknames ${config.automod.nicknameFilterEnabled ? "On" : "Off"}`).setStyle(config.automod.nicknameFilterEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("toggle", "ageprotect", targetUserId)).setLabel(`Age Guard ${config.automod.ageProtectionEnabled ? "On" : "Off"}`).setStyle(config.automod.ageProtectionEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("toggle", "allowonly", targetUserId)).setLabel(`Allow-Only ${config.automod.allowedDomainsOnly ? "On" : "Off"}`).setStyle(config.automod.allowedDomainsOnly ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("toggle", "antiraid", targetUserId)).setLabel(`Anti-Raid ${config.automod.antiRaidEnabled ? "On" : "Off"}`).setStyle(config.automod.antiRaidEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("toggle", "escalation", targetUserId)).setLabel(`Escalation ${config.automod.escalationEnabled ? "On" : "Off"}`).setStyle(config.automod.escalationEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "automod-exemptions", targetUserId)).setLabel("Exemptions").setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("configmodal", "limits", targetUserId)).setLabel("Limits").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("configmodal", "guard", targetUserId)).setLabel("Guard Settings").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("configmodal", "lists", targetUserId)).setLabel("Lists").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("configmodal", "rule-actions", targetUserId)).setLabel("Rule Actions").setStyle(ButtonStyle.Secondary)
      )
    );
  }

  if (view === "staff") {
    rows.push(
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(buildAdminPanelCustomId("selectrole", "mod", targetUserId))
          .setPlaceholder("Choose moderation panel roles")
          .setMinValues(1)
          .setMaxValues(10)
      ),
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(buildAdminPanelCustomId("selectrole", "admin", targetUserId))
          .setPlaceholder("Choose admin panel roles")
          .setMinValues(1)
          .setMaxValues(10)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "reset-mod-roles", targetUserId)).setLabel("Clear Mod Roles").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "reset-admin-roles", targetUserId)).setLabel("Clear Admin Roles").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "settings-view", targetUserId)).setLabel("View Settings").setStyle(ButtonStyle.Secondary)
      )
    );
  }

  if (view === "setup") {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "setupverify", targetUserId)).setLabel("Post Verify Panel").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "setuprules", targetUserId)).setLabel("Post Rules").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "settings-view", targetUserId)).setLabel("View Settings").setStyle(ButtonStyle.Secondary)
      )
    );
  }

  return rows;
}

async function buildAdminPanelEmbed(view, interaction, targetUserId = null) {
  if (view === "moderation") {
    const { member, user } = await resolveAdminPanelTarget(interaction, targetUserId);
    const { summaryText, historyText, recentSignalsText } = buildSelectedUserSummary(targetUserId);
    const mutedRoleId = getMutedRoleId();
    const isMuted = Boolean(member && mutedRoleId && member.roles.cache.has(mutedRoleId));
    const timeoutText = member?.communicationDisabledUntilTimestamp && member.communicationDisabledUntilTimestamp > Date.now()
      ? `<t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:R>`
      : "No";
    const statusText = user
      ? [
          `Muted: ${isMuted ? "Yes" : "No"}`,
          `Timed out: ${timeoutText}`,
          `Account age: <t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
          `Joined server: ${member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "Unknown"}`
        ].join("\n")
      : "Waiting for a selected user.";

    return makeEmbed({
      title: "Mochi Admin Panel - Moderation",
      description: "Select a member, then run guided moderation actions directly from the panel.",
      color: COLORS.red,
      fields: [
        {
          name: "Selected User",
          value: user ? `${user.tag} (${user.id})` : "No user selected yet.",
          inline: false
        },
        {
          name: "User Summary",
          value: summaryText,
          inline: false
        },
        {
          name: "Current Channel",
          value: interaction.channel ? `${interaction.channel}` : "Unknown",
          inline: true
        },
        {
          name: "Role Snapshot",
          value: user
            ? [
                `Top role: ${member?.roles?.highest ? member.roles.highest.toString() : "None"}`,
                `Roles: ${member ? member.roles.cache.filter(role => role.id !== member.guild.id).size : 0}`,
                `Key permissions: ${buildMemberPermissionSnapshot(member)}`
              ].join("\n").slice(0, 1024)
            : "Waiting for a selected user.",
          inline: false
        },
        {
          name: "User Status",
          value: statusText,
          inline: false
        },
        {
          name: "Server Roles",
          value: buildMemberRoleSummary(member),
          inline: false
        },
        {
          name: "Recent Signals",
          value: recentSignalsText,
          inline: false
        },
        {
          name: "Quick Actions",
          value: "`Warn`, `Timeout`, `Untimeout`, `Mute`, `Unmute`, `Kick`, `Ban`, `Temp Ban`, `Clear Warnings`, `Notes`, `Warnings`",
          inline: false
        },
        {
          name: "Recent Cases",
          value: historyText,
          inline: false
        }
      ]
    });
  }

  if (view === "automod") {
    const analytics = getAutoModAnalytics();
    return makeEmbed({
      title: "Mochi Admin Panel - AutoMod",
      description: "Live AutoMod controls for filters, raid safety, rule actions, and analytics.",
      color: COLORS.yellow,
      fields: [
        { name: "Spam Filter", value: config.automod.spam ? "Enabled" : "Disabled", inline: true },
        { name: "Invite Filter", value: config.automod.invites ? "Enabled" : "Disabled", inline: true },
        { name: "Emoji Spam", value: config.automod.emojiSpamEnabled ? `Enabled (${config.automod.maxEmojiCount})` : "Disabled", inline: true },
        { name: "Caps Filter", value: config.automod.caps ? "Enabled" : "Disabled", inline: true },
        { name: "Link Filter", value: config.automod.linksEnabled ? "Enabled" : "Disabled", inline: true },
        { name: "Banned Words", value: config.automod.bannedWords ? `Enabled (${getBannedWords().length})` : "Disabled", inline: true },
        { name: "Scam Filter", value: config.automod.scamFilterEnabled ? `Enabled (${getScamPhrases().length})` : "Disabled", inline: true },
        { name: "Evasion Filter", value: config.automod.evasionFilterEnabled ? "Enabled" : "Disabled", inline: true },
        { name: "Attachment Filter", value: config.automod.attachmentsEnabled ? `Enabled (${config.automod.maxAttachmentSizeMb}MB)` : "Disabled", inline: true },
        { name: "Age Protection", value: config.automod.ageProtectionEnabled ? "Enabled" : "Disabled", inline: true },
        { name: "Anti-Raid", value: config.automod.antiRaidEnabled ? `${config.automod.raidAction} @ ${config.automod.raidJoinThreshold}` : "Disabled", inline: true },
        { name: "Nickname Filter", value: config.automod.nicknameFilterEnabled ? `Enabled (${getNicknameBlockedTerms().length})` : "Disabled", inline: true },
        { name: "Allowed Domains Only", value: config.automod.allowedDomainsOnly ? "Enabled" : "Disabled", inline: true },
        { name: "Allowed Domains", value: `${config.automod.allowedDomains.length}`, inline: true },
        { name: "Blocked Domains", value: `${config.automod.blockedDomains.length}`, inline: true },
        { name: "Exempt Channels", value: `${config.automod.exemptChannelIds.length}`, inline: true },
        { name: "Exempt Roles", value: `${config.automod.exemptRoleIds.length}`, inline: true },
        { name: "Exempt Users", value: `${config.automod.exemptUserIds.length}`, inline: true },
        { name: "Mentions", value: `${config.automod.maxMentions}`, inline: true },
        { name: "Escalation", value: config.automod.escalationEnabled ? "Enabled" : "Disabled", inline: true },
        { name: "Warn Threshold", value: `${config.automod.warnThreshold}`, inline: true },
        { name: "Timeout Threshold", value: `${config.automod.timeoutThreshold}`, inline: true },
        { name: "Link Age Gates", value: `Account ${formatDuration(config.automod.minAccountAgeForLinksMs)} | Member ${formatDuration(config.automod.minMemberAgeForLinksMs)}`, inline: false },
        { name: "Attachment Age Gates", value: `Account ${formatDuration(config.automod.minAccountAgeForAttachmentsMs)} | Member ${formatDuration(config.automod.minMemberAgeForAttachmentsMs)}`, inline: false },
        { name: "Rule Actions", value: Object.keys(config.automod.ruleActions || {}).slice(0, 8).map(rule => `${rule}: ${getAutoModRuleAction(rule)}`).join("\n") || "Using default delete behavior for all rules.", inline: false },
        { name: "Top Triggered Rules", value: buildAutoModAnalyticsLines(5), inline: false },
        { name: "Recent Detections", value: buildRecentAutoModAnalyticsLines(4), inline: false },
        { name: "Analytics Total", value: `${analytics.totalDetections || 0}`, inline: true }
      ]
    });
  }

  if (view === "staff") {
    return makeEmbed({
      title: "Mochi Admin Panel - Staff Access",
      description: "Manage who can use moderation tools and who gets full admin-level control in the panel.",
      color: COLORS.mint,
      fields: [
        {
          name: "Moderation Roles",
          value: formatPanelRoleMentions(getPermissionRoleIds("mod")),
          inline: false
        },
        {
          name: "Admin Roles",
          value: formatPanelRoleMentions(getPermissionRoleIds("admin")),
          inline: false
        },
        {
          name: "How It Works",
          value: "Use the role pickers below to replace each access list. Slash command permissions still apply for Discord command defaults.",
          inline: false
        }
      ]
    });
  }

  if (view === "setup") {
    return makeEmbed({
      title: "Mochi Admin Panel - Setup",
      description: "High-frequency setup actions that are safe to trigger directly from the panel.",
      color: COLORS.blue,
      fields: [
        { name: "Log Channel", value: getLogChannelId() ? `<#${getLogChannelId()}>` : "Not set", inline: true },
        { name: "AutoMod Log", value: getAutoModLogChannelId() ? `<#${getAutoModLogChannelId()}>` : "Not set", inline: true },
        { name: "Verify Channel", value: getVerifyChannelId() ? `<#${getVerifyChannelId()}>` : "Not set", inline: true },
        { name: "Rules Channel", value: getRulesChannelId() ? `<#${getRulesChannelId()}>` : "Not set", inline: true },
        { name: "Muted Role", value: getMutedRoleId() ? `<@&${getMutedRoleId()}>` : "Not set", inline: true },
        { name: "TikTok Alerts", value: getTikTokChannelId() ? `<#${getTikTokChannelId()}>` : "Not set", inline: true }
      ]
    });
  }

  return makeEmbed({
    title: "Mochi Admin Panel - Overview",
    description: "Your interactive control center for moderation, AutoMod, and core server setup.",
    color: COLORS.purple,
    fields: [
      { name: "Cases Logged", value: `${config.cases.length}`, inline: true },
      { name: "Warning Users", value: `${Object.keys(config.warnings).length}`, inline: true },
      { name: "Staff Notes", value: `${Object.keys(config.notes).length}`, inline: true },
      { name: "AutoMod Status", value: config.automod.spam || config.automod.invites || config.automod.caps ? "Active" : "Mostly Off", inline: true },
      { name: "Current Channel", value: interaction.channel ? `${interaction.channel}` : "Unknown", inline: true },
      { name: "Staff Access", value: `Mod roles: ${getPermissionRoleIds("mod").length} | Admin roles: ${getPermissionRoleIds("admin").length}`, inline: true },
      {
        name: "Quick Actions",
        value: "`Refresh Status`, `Dashboard Snapshot`, `Reload Config`",
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
    console.log(`Feature flags -> core: ${ENABLE_CORE_BOT ? "on" : "off"}, music: ${ENABLE_MUSIC ? "on" : "off"}`);
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands
    });

    console.log("Slash commands registered.");

    if (ENABLE_CORE_BOT) {
      await resolveVerifyMessageId();
      ensureTikTokHealthcheck();
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
    }
  } catch (error) {
    console.error("Ready error:", error);
  }
});

client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (!ENABLE_CORE_BOT) return;
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
    if (!ENABLE_CORE_BOT) return;
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
    if (!ENABLE_CORE_BOT) return;
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
    if (interaction.isButton()) {
      if (interaction.customId.startsWith("musicpanel:")) {
        if (!ENABLE_MUSIC) {
          return interaction.reply({ content: "Music controls are disabled on this deployment.", ephemeral: true });
        }

        const [, kind, action] = interaction.customId.split(":");
        const queue = musicQueues.get(interaction.guild.id);

        if (kind === "modal" && action === "play") {
          const modal = new ModalBuilder()
            .setCustomId(buildMusicPanelCustomId("submit", "play"))
            .setTitle("Request a Song")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("query")
                  .setLabel("YouTube URL or search")
                  .setPlaceholder("lofi hip hop, artist - song name, or a YouTube link")
                  .setStyle(TextInputStyle.Paragraph)
                  .setRequired(true)
                  .setMaxLength(500)
              )
            );
          return interaction.showModal(modal);
        }

        if (kind === "action" && action === "refresh") {
          return interaction.update({
            embeds: [buildMusicPanelEmbed(interaction.guild.id)],
            components: buildMusicPanelButtons(interaction.guild.id)
          });
        }

        if (!queue) {
          return interaction.reply({ content: "There isn't an active music session right now.", ephemeral: true });
        }

        if (!ensureSameVoiceChannel(interaction, queue)) return;

        if (kind === "action" && action === "pause") {
          if (!queue.current || !queue.player.pause()) {
            return interaction.reply({ content: "Playback isn't active or couldn't be paused.", ephemeral: true });
          }
          return interaction.update({
            embeds: [buildMusicPanelEmbed(interaction.guild.id)],
            components: buildMusicPanelButtons(interaction.guild.id)
          });
        }

        if (kind === "action" && action === "resume") {
          if (!queue.current || !queue.player.unpause()) {
            return interaction.reply({ content: "Playback wasn't paused.", ephemeral: true });
          }
          return interaction.update({
            embeds: [buildMusicPanelEmbed(interaction.guild.id)],
            components: buildMusicPanelButtons(interaction.guild.id)
          });
        }

        if (kind === "action" && action === "skip") {
          queue.player.stop();
          return interaction.update({
            embeds: [buildMusicPanelEmbed(interaction.guild.id)],
            components: buildMusicPanelButtons(interaction.guild.id)
          });
        }

        if (kind === "action" && action === "stop") {
          await stopMusicQueue(interaction.guild.id, `${interaction.user.tag} stopped the queue from the music panel.`);
          return interaction.update({
            embeds: [buildMusicPanelEmbed(interaction.guild.id)],
            components: buildMusicPanelButtons(interaction.guild.id)
          });
        }

        if (kind === "action" && action === "leave") {
          await stopMusicQueue(interaction.guild.id, `${interaction.user.tag} disconnected the music bot from the panel.`);
          return interaction.update({
            embeds: [buildMusicPanelEmbed(interaction.guild.id)],
            components: buildMusicPanelButtons(interaction.guild.id)
          });
        }

        if (kind === "action" && action === "queue") {
          const upcoming = queue.tracks.length
            ? queue.tracks.slice(0, 10).map((track, index) => `${index + 1}. [${track.title}](${track.url}) • ${track.durationText}`).join("\n")
            : "No upcoming songs.";

          return interaction.reply({
            embeds: [
              makeEmbed({
                title: "Music queue",
                description: queue.current ? `Now playing: [${queue.current.title}](${queue.current.url})` : "Nothing is actively playing.",
                color: COLORS.blue,
                fields: [
                  { name: "Voice Channel", value: `<#${queue.voiceChannelId}>`, inline: true },
                  { name: "Queued Songs", value: `${queue.tracks.length}`, inline: true },
                  { name: "Up Next", value: upcoming.slice(0, 1024), inline: false }
                ],
                thumbnail: queue.current?.thumbnail || null
              })
            ],
            ephemeral: true
          });
        }

        if (kind === "action" && action === "nowplaying") {
          if (!queue.current) {
            return interaction.reply({ content: "There isn't anything playing right now.", ephemeral: true });
          }
          return interaction.reply({ embeds: [buildMusicSummary(queue.current)], ephemeral: true });
        }

        return;
      }

      if (!interaction.customId.startsWith("adminpanel:")) return;
      if (!ENABLE_CORE_BOT) {
        return interaction.reply({ content: "Admin controls are disabled on this deployment.", ephemeral: true });
      }

      const [, kind, action, targetIdRaw] = interaction.customId.split(":");
      const targetUserId = targetIdRaw && targetIdRaw !== "none" ? targetIdRaw : null;
      const accessLevel =
        kind === "toggle" ||
        kind === "selectrole" ||
        kind === "configmodal" ||
        kind === "exemptselect" ||
        ["reload-config", "setupverify", "setuprules", "settings-view", "reset-mod-roles", "reset-admin-roles"].includes(action)
          ? "admin"
          : "mod";

      if (!(await ensureStaffAccess(interaction, accessLevel, "the admin panel"))) {
        return;
      }

      if (kind === "view") {
        return interaction.update({
          embeds: [await buildAdminPanelEmbed(action, interaction, targetUserId)],
          components: buildAdminPanelButtons(action, targetUserId)
        });
      }

      if (kind === "exemptselect") {
        if (action === "channels") {
          config.automod.exemptChannelIds = interaction.values;
        }

        if (action === "roles") {
          config.automod.exemptRoleIds = interaction.values;
        }

        if (action === "users") {
          config.automod.exemptUserIds = interaction.values;
        }

        saveConfig();
        return interaction.update({
          embeds: [buildAutoModExemptionEmbed()],
          components: buildAutoModExemptionComponents()
        });
      }

      if (kind === "confirm") {
        const pending = getPendingPanelAction(interaction.user.id);
        if (!pending || pending.action !== action) {
          clearPendingPanelAction(interaction.user.id);
          return interaction.update({
            content: "That confirmation expired. Please try again from the panel.",
            embeds: [],
            components: []
          });
        }

        if (action === "cancel") {
          clearPendingPanelAction(interaction.user.id);
          return interaction.update({
            content: "Cancelled.",
            embeds: [],
            components: []
          });
        }

        if (action === "lockdown") {
          await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
          clearPendingPanelAction(interaction.user.id);
          await interaction.update({
            content: `Locked ${interaction.channel}.`,
            embeds: [],
            components: []
          });
          return interaction.message.edit({
            embeds: [await buildAdminPanelEmbed("moderation", interaction, pending.targetUserId || targetUserId)],
            components: buildAdminPanelButtons("moderation", pending.targetUserId || targetUserId)
          }).catch(() => {});
        }

        if (action === "kick") {
          const user = await client.users.fetch(pending.targetUserId).catch(() => null);
          const member = await interaction.guild.members.fetch(pending.targetUserId).catch(() => null);
          if (!user || !(await ensureModeratable(interaction, member, "kick"))) return;
          if (!member?.kickable) {
            clearPendingPanelAction(interaction.user.id);
            return interaction.update({ content: "I cannot kick that member.", embeds: [], components: [] });
          }

          const entry = addCase({
            action: "kick",
            targetId: user.id,
            targetTag: user.tag,
            moderatorTag: interaction.user.tag,
            reason: pending.reason
          });
          await member.kick(`${interaction.user.tag}: ${pending.reason}`);
          await logEmbed(makeEmbed({
            title: `Case #${entry.id}: kick`,
            description: `${user.tag} was kicked.`,
            color: COLORS.red,
            fields: buildCaseFields(entry)
          }));
          clearPendingPanelAction(interaction.user.id);
          return interaction.update({ content: `${user.tag} was kicked.`, embeds: [], components: [] });
        }

        if (action === "ban") {
          const user = await client.users.fetch(pending.targetUserId).catch(() => null);
          const member = await interaction.guild.members.fetch(pending.targetUserId).catch(() => null);
          if (!user) return;
          if (member && !(await ensureModeratable(interaction, member, "ban"))) return;
          if (member && !member.bannable) {
            clearPendingPanelAction(interaction.user.id);
            return interaction.update({ content: "I cannot ban that member.", embeds: [], components: [] });
          }

          const entry = addCase({
            action: "ban",
            targetId: user.id,
            targetTag: user.tag,
            moderatorTag: interaction.user.tag,
            reason: pending.reason
          });
          await interaction.guild.members.ban(user.id, { reason: `${interaction.user.tag}: ${pending.reason}` });
          await logEmbed(makeEmbed({
            title: `Case #${entry.id}: ban`,
            description: `${user.tag} was banned.`,
            color: COLORS.red,
            fields: buildCaseFields(entry)
          }));
          clearPendingPanelAction(interaction.user.id);
          return interaction.update({ content: `${user.tag} was banned.`, embeds: [], components: [] });
        }

        if (action === "tempban") {
          const user = await client.users.fetch(pending.targetUserId).catch(() => null);
          const member = await interaction.guild.members.fetch(pending.targetUserId).catch(() => null);
          if (!user) return;
          if (member && !(await ensureModeratable(interaction, member, "tempban"))) return;
          if (member && !member.bannable) {
            clearPendingPanelAction(interaction.user.id);
            return interaction.update({ content: "I cannot ban that member.", embeds: [], components: [] });
          }

          addTempBan({
            userId: user.id,
            targetTag: user.tag,
            moderatorTag: interaction.user.tag,
            reason: pending.reason,
            expiresAt: pending.expiresAt
          });
          await interaction.guild.members.ban(user.id, { reason: `${interaction.user.tag}: ${pending.reason}` });
          const entry = addCase({
            action: "tempban",
            targetId: user.id,
            targetTag: user.tag,
            moderatorTag: interaction.user.tag,
            reason: pending.reason,
            details: [{ name: "Expires", value: `<t:${Math.floor(new Date(pending.expiresAt).getTime() / 1000)}:F>`, inline: true }]
          });
          await logEmbed(makeEmbed({
            title: `Case #${entry.id}: temporary ban`,
            description: `${user.tag} was temporarily banned.`,
            color: COLORS.red,
            fields: buildCaseFields(entry)
          }));
          clearPendingPanelAction(interaction.user.id);
          return interaction.update({
            content: `${user.tag} was temporarily banned for ${pending.durationLabel}.`,
            embeds: [],
            components: []
          });
        }
      }

      if (kind === "modal") {
        if (!targetUserId) {
          return interaction.reply({ content: "Select a user in the moderation panel first.", ephemeral: true });
        }

        const modal = new ModalBuilder()
          .setCustomId(buildAdminPanelCustomId("submit", action, targetUserId))
          .setTitle(
            action === "warn"
              ? "Warn User"
              : action === "timeout"
                ? "Timeout User"
                : action === "mute"
                  ? "Mute User"
                  : action === "tempban"
                    ? "Temporary Ban User"
                    : action === "kick"
                      ? "Kick User"
                      : action === "ban"
                        ? "Ban User"
                        : action === "dmuser"
                          ? "DM User"
                          : "Add Staff Note"
          );

        if (action === "warn" || action === "mute" || action === "note" || action === "kick" || action === "ban" || action === "dmuser") {
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("reason")
                .setLabel(action === "note" ? "Note content" : action === "dmuser" ? "Message" : "Reason")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(500)
            )
          );
        }

        if (action === "timeout" || action === "tempban") {
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("duration")
                .setLabel("Duration")
                .setPlaceholder("Examples: 10m, 1h, 1d")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(10)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("reason")
                .setLabel("Reason")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(500)
            )
          );
        }

        return interaction.showModal(modal);
      }

      if (kind === "configmodal") {
        if (action === "mentions") {
          const modal = new ModalBuilder()
            .setCustomId(buildAdminPanelCustomId("configsubmit", "mentions", targetUserId))
            .setTitle("Set Mention Limit")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("limit")
                  .setLabel("Mention limit")
                  .setPlaceholder(`${config.automod.maxMentions}`)
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMaxLength(3)
              )
            );
          return interaction.showModal(modal);
        }

        if (action === "emoji-limit") {
          const modal = new ModalBuilder()
            .setCustomId(buildAdminPanelCustomId("configsubmit", "emoji-limit", targetUserId))
            .setTitle("Set Emoji Limit")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("limit")
                  .setLabel("Emoji limit")
                  .setPlaceholder(`${config.automod.maxEmojiCount}`)
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMaxLength(3)
              )
            );
          return interaction.showModal(modal);
        }

        if (action === "thresholds") {
          const modal = new ModalBuilder()
            .setCustomId(buildAdminPanelCustomId("configsubmit", "thresholds", targetUserId))
            .setTitle("Set AutoMod Thresholds")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("warn")
                  .setLabel("Warn threshold")
                  .setPlaceholder(`${config.automod.warnThreshold}`)
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMaxLength(3)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("timeout")
                  .setLabel("Timeout threshold")
                  .setPlaceholder(`${config.automod.timeoutThreshold}`)
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMaxLength(3)
              )
            );
          return interaction.showModal(modal);
        }

        if (action === "attachment-limit") {
          const modal = new ModalBuilder()
            .setCustomId(buildAdminPanelCustomId("configsubmit", "attachment-limit", targetUserId))
            .setTitle("Set Attachment Limit")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("limit")
                  .setLabel("Max attachment size in MB")
                  .setPlaceholder(`${config.automod.maxAttachmentSizeMb}`)
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMaxLength(3)
              )
            );
          return interaction.showModal(modal);
        }

        if (action === "raid") {
          const modal = new ModalBuilder()
            .setCustomId(buildAdminPanelCustomId("configsubmit", "raid", targetUserId))
            .setTitle("Set Anti-Raid Rules")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("threshold")
                  .setLabel("Join threshold")
                  .setPlaceholder(`${config.automod.raidJoinThreshold}`)
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMaxLength(3)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("window")
                  .setLabel("Raid window")
                  .setPlaceholder(formatDuration(config.automod.raidWindowMs))
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMaxLength(10)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("accountage")
                  .setLabel("Suspicious account age")
                  .setPlaceholder(formatDuration(config.automod.raidAccountAgeLimitMs))
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMaxLength(10)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("action")
                  .setLabel("Action: log or timeout")
                  .setPlaceholder(config.automod.raidAction)
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMaxLength(10)
              )
            );
          return interaction.showModal(modal);
        }

        if (action === "age-gates") {
          const modal = new ModalBuilder()
            .setCustomId(buildAdminPanelCustomId("configsubmit", "age-gates", targetUserId))
            .setTitle("Set Age Protection Gates")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("linkAccountAge")
                  .setLabel("Link account age")
                  .setPlaceholder(formatDuration(config.automod.minAccountAgeForLinksMs))
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMaxLength(10)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("linkMemberAge")
                  .setLabel("Link member age")
                  .setPlaceholder(formatDuration(config.automod.minMemberAgeForLinksMs))
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMaxLength(10)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("attachmentAccountAge")
                  .setLabel("Attachment account age")
                  .setPlaceholder(formatDuration(config.automod.minAccountAgeForAttachmentsMs))
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMaxLength(10)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("attachmentMemberAge")
                  .setLabel("Attachment member age")
                  .setPlaceholder(formatDuration(config.automod.minMemberAgeForAttachmentsMs))
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMaxLength(10)
              )
            );
          return interaction.showModal(modal);
        }

        if (action === "terms") {
          const modal = new ModalBuilder()
            .setCustomId(buildAdminPanelCustomId("configsubmit", "terms", targetUserId))
            .setTitle("Edit Filtered Terms")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("bannedWords")
                  .setLabel("Banned words or phrases")
                  .setPlaceholder("comma or new line separated")
                  .setStyle(TextInputStyle.Paragraph)
                  .setRequired(false)
                  .setValue(getBannedWords().join(", ").slice(0, 4000))
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("nicknameTerms")
                  .setLabel("Blocked nickname terms")
                  .setPlaceholder("comma or new line separated")
                  .setStyle(TextInputStyle.Paragraph)
                  .setRequired(false)
                  .setValue(getNicknameBlockedTerms().join(", ").slice(0, 4000))
              )
            );
          return interaction.showModal(modal);
        }

        if (action === "domains") {
          const modal = new ModalBuilder()
            .setCustomId(buildAdminPanelCustomId("configsubmit", "domains", targetUserId))
            .setTitle("Edit Domain Lists")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("allowedDomains")
                  .setLabel("Allowed domains")
                  .setPlaceholder("example.com, docs.example.com")
                  .setStyle(TextInputStyle.Paragraph)
                  .setRequired(false)
                  .setValue(config.automod.allowedDomains.join(", ").slice(0, 4000))
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("blockedDomains")
                  .setLabel("Blocked domains")
                  .setPlaceholder("spam.com, bad.example")
                  .setStyle(TextInputStyle.Paragraph)
                  .setRequired(false)
                  .setValue(config.automod.blockedDomains.join(", ").slice(0, 4000))
              )
            );
          return interaction.showModal(modal);
        }

        if (action === "limits") {
          const modal = new ModalBuilder()
            .setCustomId(buildAdminPanelCustomId("configsubmit", "limits", targetUserId))
            .setTitle("Set AutoMod Limits")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("mentions").setLabel("Mention limit").setStyle(TextInputStyle.Short).setRequired(true).setValue(`${config.automod.maxMentions}`)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("emojiLimit").setLabel("Emoji limit").setStyle(TextInputStyle.Short).setRequired(true).setValue(`${config.automod.maxEmojiCount}`)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("attachmentLimit").setLabel("Attachment limit (MB)").setStyle(TextInputStyle.Short).setRequired(true).setValue(`${config.automod.maxAttachmentSizeMb}`)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("warnThreshold").setLabel("Warn threshold").setStyle(TextInputStyle.Short).setRequired(true).setValue(`${config.automod.warnThreshold}`)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("timeoutThreshold").setLabel("Timeout threshold").setStyle(TextInputStyle.Short).setRequired(true).setValue(`${config.automod.timeoutThreshold}`)
              )
            );
          return interaction.showModal(modal);
        }

        if (action === "guard") {
          const modal = new ModalBuilder()
            .setCustomId(buildAdminPanelCustomId("configsubmit", "guard", targetUserId))
            .setTitle("Set Guard Rules")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("raidThreshold").setLabel("Raid threshold").setStyle(TextInputStyle.Short).setRequired(true).setValue(`${config.automod.raidJoinThreshold}`)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("raidWindow").setLabel("Raid window").setStyle(TextInputStyle.Short).setRequired(true).setValue(formatDuration(config.automod.raidWindowMs))
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("raidAction").setLabel("Raid action,account age").setStyle(TextInputStyle.Short).setRequired(true).setValue(`${config.automod.raidAction}, ${formatDuration(config.automod.raidAccountAgeLimitMs)}`)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("linkAges").setLabel("Link ages: account,member").setStyle(TextInputStyle.Short).setRequired(true).setValue(`${formatDuration(config.automod.minAccountAgeForLinksMs)}, ${formatDuration(config.automod.minMemberAgeForLinksMs)}`)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("attachmentAges").setLabel("Attachment ages: account,member").setStyle(TextInputStyle.Short).setRequired(true).setValue(`${formatDuration(config.automod.minAccountAgeForAttachmentsMs)}, ${formatDuration(config.automod.minMemberAgeForAttachmentsMs)}`)
              )
            );
          return interaction.showModal(modal);
        }

        if (action === "lists") {
          const modal = new ModalBuilder()
            .setCustomId(buildAdminPanelCustomId("configsubmit", "lists", targetUserId))
            .setTitle("Edit AutoMod Lists")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("bannedWords").setLabel("Banned words").setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(getBannedWords().join(", ").slice(0, 4000))
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("nicknameTerms").setLabel("Blocked nickname terms").setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(getNicknameBlockedTerms().join(", ").slice(0, 4000))
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("allowedDomains").setLabel("Allowed domains").setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(config.automod.allowedDomains.join(", ").slice(0, 4000))
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("blockedDomains").setLabel("Blocked domains").setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(config.automod.blockedDomains.join(", ").slice(0, 4000))
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("scamPhrases").setLabel("Extra scam phrases").setStyle(TextInputStyle.Paragraph).setRequired(false).setValue((config.automod.scamPhraseList || []).join(", ").slice(0, 4000))
              )
            );
          return interaction.showModal(modal);
        }

        if (action === "rule-actions") {
          const groupedRules = AUTOMOD_RULE_KEYS.reduce((acc, rule) => {
            const mode = getAutoModRuleAction(rule);
            acc[mode] = [...(acc[mode] || []), rule];
            return acc;
          }, {});

          const modal = new ModalBuilder()
            .setCustomId(buildAdminPanelCustomId("configsubmit", "rule-actions", targetUserId))
            .setTitle("Set Rule Actions")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("alertRules").setLabel("Alert-only rules").setStyle(TextInputStyle.Paragraph).setRequired(false).setValue((groupedRules.alert || []).join(", ").slice(0, 4000))
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("warnRules").setLabel("Warn rules").setStyle(TextInputStyle.Paragraph).setRequired(false).setValue((groupedRules.warn || []).join(", ").slice(0, 4000))
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("timeoutRules").setLabel("Timeout rules").setStyle(TextInputStyle.Paragraph).setRequired(false).setValue((groupedRules.timeout || []).join(", ").slice(0, 4000))
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("resetRules").setLabel("Reset custom rules to default delete").setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder("spam, caps")
              )
            );
          return interaction.showModal(modal);
        }
      }

      if (kind === "toggle") {
        if (action === "spam") config.automod.spam = !config.automod.spam;
        if (action === "invites") config.automod.invites = !config.automod.invites;
        if (action === "emoji") config.automod.emojiSpamEnabled = !config.automod.emojiSpamEnabled;
        if (action === "caps") config.automod.caps = !config.automod.caps;
        if (action === "links") config.automod.linksEnabled = !config.automod.linksEnabled;
        if (action === "bannedwords") config.automod.bannedWords = !config.automod.bannedWords;
        if (action === "scam") config.automod.scamFilterEnabled = !config.automod.scamFilterEnabled;
        if (action === "evasion") config.automod.evasionFilterEnabled = !config.automod.evasionFilterEnabled;
        if (action === "escalation") config.automod.escalationEnabled = !config.automod.escalationEnabled;
        if (action === "attachments") config.automod.attachmentsEnabled = !config.automod.attachmentsEnabled;
        if (action === "ageprotect") config.automod.ageProtectionEnabled = !config.automod.ageProtectionEnabled;
        if (action === "allowonly") config.automod.allowedDomainsOnly = !config.automod.allowedDomainsOnly;
        if (action === "antiraid") config.automod.antiRaidEnabled = !config.automod.antiRaidEnabled;
        if (action === "nicknamefilter") config.automod.nicknameFilterEnabled = !config.automod.nicknameFilterEnabled;

        saveConfig();
        return interaction.update({
          embeds: [await buildAdminPanelEmbed("automod", interaction, targetUserId)],
          components: buildAdminPanelButtons("automod", targetUserId)
        });
      }

      if (kind === "action") {
        if (action === "status") {
          return interaction.reply({ embeds: [buildStatusEmbed()], ephemeral: true });
        }

        if (action === "automod-analytics") {
          return interaction.reply({ embeds: [buildAutoModAnalyticsEmbed()], ephemeral: true });
        }

        if (action === "automod-exemptions") {
          return interaction.reply({
            embeds: [buildAutoModExemptionEmbed()],
            components: buildAutoModExemptionComponents(),
            ephemeral: true
          });
        }

        if (action === "dashboard") {
          return interaction.reply({ embeds: [buildDashboardEmbed()], ephemeral: true });
        }

        if (action === "reload-config") {
          const previousVerifyMessageId = config.verifyMessageId;
          config = loadConfig();
          if (!config.verifyMessageId && previousVerifyMessageId) {
            config.verifyMessageId = previousVerifyMessageId;
          }

          return interaction.update({
            embeds: [await buildAdminPanelEmbed("overview", interaction, targetUserId)],
            components: buildAdminPanelButtons("overview", targetUserId)
          });
        }

        if (action === "lockdown") {
          setPendingPanelAction(interaction.user.id, { action: "lockdown", targetUserId });
          return interaction.reply({
            content: `Confirm locking ${interaction.channel}?`,
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(buildAdminPanelCustomId("confirm", "lockdown", targetUserId)).setLabel("Confirm Lockdown").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(buildAdminPanelCustomId("confirm", "cancel", targetUserId)).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
              )
            ],
            ephemeral: true
          });
        }

        if (action === "unlockdown") {
          await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
          await interaction.reply({ content: `Unlocked ${interaction.channel}.`, ephemeral: true });
          return interaction.message.edit({
            embeds: [await buildAdminPanelEmbed("moderation", interaction, targetUserId)],
            components: buildAdminPanelButtons("moderation", targetUserId)
          }).catch(() => {});
        }

        if (action === "unmute") {
          if (!targetUserId) {
            return interaction.reply({ content: "Select a user in the moderation panel first.", ephemeral: true });
          }

          const user = await client.users.fetch(targetUserId).catch(() => null);
          const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
          if (!user || !(await ensureModeratable(interaction, member, "unmute"))) return;

          const mutedRoleId = getMutedRoleId();
          if (!mutedRoleId) {
            return interaction.reply({ content: "No muted role is configured yet.", ephemeral: true });
          }

          if (!member.roles.cache.has(mutedRoleId)) {
            return interaction.reply({ content: `${user.tag} is not muted.`, ephemeral: true });
          }

          await member.roles.remove(mutedRoleId, `${interaction.user.tag}: Unmuted from admin panel`);

          const entry = addCase({
            action: "unmute",
            targetId: user.id,
            targetTag: user.tag,
            moderatorTag: interaction.user.tag,
            reason: "Unmuted from admin panel."
          });

          await logEmbed(
            makeEmbed({
              title: `Case #${entry.id}: unmute`,
              description: `${user.tag} was unmuted.`,
              color: COLORS.mint,
              fields: buildCaseFields(entry)
            })
          );

          await interaction.reply({ content: `${user.tag} was unmuted.`, ephemeral: true });
          return interaction.message.edit({
            embeds: [await buildAdminPanelEmbed("moderation", interaction, targetUserId)],
            components: buildAdminPanelButtons("moderation", targetUserId)
          }).catch(() => {});
        }

        if (action === "untimeout") {
          if (!targetUserId) {
            return interaction.reply({ content: "Select a user in the moderation panel first.", ephemeral: true });
          }

          const user = await client.users.fetch(targetUserId).catch(() => null);
          const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
          if (!user || !(await ensureModeratable(interaction, member, "untimeout"))) return;

          if (!member?.communicationDisabledUntilTimestamp || member.communicationDisabledUntilTimestamp <= Date.now()) {
            return interaction.reply({ content: `${user.tag} is not currently timed out.`, ephemeral: true });
          }

          await member.timeout(null, `${interaction.user.tag}: Timeout removed from admin panel.`);
          const entry = addCase({
            action: "untimeout",
            targetId: user.id,
            targetTag: user.tag,
            moderatorTag: interaction.user.tag,
            reason: "Timeout removed from admin panel."
          });

          await logEmbed(
            makeEmbed({
              title: `Case #${entry.id}: timeout removed`,
              description: `${user.tag}'s timeout was removed.`,
              color: COLORS.mint,
              fields: buildCaseFields(entry)
            })
          );

          await interaction.reply({ content: `${user.tag} is no longer timed out.`, ephemeral: true });
          return interaction.message.edit({
            embeds: [await buildAdminPanelEmbed("moderation", interaction, targetUserId)],
            components: buildAdminPanelButtons("moderation", targetUserId)
          }).catch(() => {});
        }

        if (action === "history") {
          if (!targetUserId) {
            return interaction.reply({ content: "Select a user in the moderation panel first.", ephemeral: true });
          }

          const user = await client.users.fetch(targetUserId).catch(() => null);
          const entries = getCasesForUser(targetUserId).slice(-10);
          return interaction.reply({
            embeds: [
              makeEmbed({
                title: "Recent cases",
                description: `Recent moderation cases for ${user ? user.tag : targetUserId}`,
                color: COLORS.blue,
                fields: [
                  {
                    name: "Cases",
                    value: entries.length
                      ? entries.map(entry => `#${entry.id} ${entry.action} - ${entry.reason} - ${entry.moderatorTag}`).join("\n").slice(0, 1024)
                      : "No recorded cases."
                  }
                ]
              })
            ],
            ephemeral: true
          });
        }

        if (action === "profile") {
          if (!targetUserId) {
            return interaction.reply({ content: "Select a user in the moderation panel first.", ephemeral: true });
          }

          const { member, user } = await resolveAdminPanelTarget(interaction, targetUserId);
          if (!user) {
            return interaction.reply({ content: "That user could not be found.", ephemeral: true });
          }

          const warnings = getWarnings(targetUserId);
          const notes = getNotes(targetUserId);
          const cases = getCasesForUser(targetUserId);

          return interaction.reply({
            embeds: [
              makeEmbed({
                title: "Member profile",
                description: `${user.tag} (${user.id})`,
                color: COLORS.blue,
                fields: [
                  { name: "Account Created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: true },
                  { name: "Joined Server", value: member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : "Unknown", inline: true },
                  { name: "Top Role", value: member?.roles?.highest ? member.roles.highest.toString() : "None", inline: true },
                  { name: "Warnings", value: `${warnings.length}`, inline: true },
                  { name: "Notes", value: `${notes.length}`, inline: true },
                  { name: "Cases", value: `${cases.length}`, inline: true },
                  { name: "Permissions", value: buildMemberPermissionSnapshot(member), inline: false },
                  { name: "Roles", value: buildMemberRoleSummary(member), inline: false }
                ],
                thumbnail: user.displayAvatarURL({ dynamic: true })
              })
            ],
            ephemeral: true
          });
        }

        if (action === "recent-messages") {
          if (!targetUserId) {
            return interaction.reply({ content: "Select a user in the moderation panel first.", ephemeral: true });
          }

          const user = await client.users.fetch(targetUserId).catch(() => null);
          const messages = await getRecentMessagesForUser(interaction.channel, targetUserId);

          return interaction.reply({
            embeds: [
              makeEmbed({
                title: "Recent messages",
                description: `Recent messages from ${user ? user.tag : targetUserId} in ${interaction.channel}.`,
                color: COLORS.blue,
                fields: [
                  {
                    name: "Messages",
                    value: messages.length ? messages.join("\n").slice(0, 1024) : "No recent messages found in this channel."
                  }
                ]
              })
            ],
            ephemeral: true
          });
        }

        if (action === "warnings-view") {
          if (!targetUserId) {
            return interaction.reply({ content: "Select a user in the moderation panel first.", ephemeral: true });
          }

          const user = await client.users.fetch(targetUserId).catch(() => null);
          const warnings = getWarnings(targetUserId);
          return interaction.reply({
            embeds: [
              makeEmbed({
                title: "Warning history",
                description: `Warnings for ${user ? user.tag : targetUserId}`,
                color: COLORS.yellow,
                fields: [
                  {
                    name: "Entries",
                    value: warnings.length
                      ? warnings.map((warning, index) => `${index + 1}. ${warning.reason} - ${warning.moderatorTag}`).join("\n").slice(0, 1024)
                      : "No warnings saved."
                  }
                ]
              })
            ],
            ephemeral: true
          });
        }

        if (action === "notes-view") {
          if (!targetUserId) {
            return interaction.reply({ content: "Select a user in the moderation panel first.", ephemeral: true });
          }

          const user = await client.users.fetch(targetUserId).catch(() => null);
          const notes = getNotes(targetUserId);
          return interaction.reply({
            embeds: [
              makeEmbed({
                title: "Staff notes",
                description: `Notes for ${user ? user.tag : targetUserId}`,
                color: COLORS.gray,
                fields: [
                  {
                    name: "Entries",
                    value: notes.length
                      ? notes.map((note, index) => `${index + 1}. ${note.content} - ${note.moderatorTag}`).join("\n").slice(0, 1024)
                      : "No staff notes saved."
                  }
                ]
              })
            ],
            ephemeral: true
          });
        }

        if (action === "clearwarnings") {
          if (!targetUserId) {
            return interaction.reply({ content: "Select a user in the moderation panel first.", ephemeral: true });
          }

          const user = await client.users.fetch(targetUserId).catch(() => null);
          const count = clearWarnings(targetUserId);
          const entry = addCase({
            action: "clearwarnings",
            targetId: targetUserId,
            targetTag: user ? user.tag : targetUserId,
            moderatorTag: interaction.user.tag,
            reason: "Cleared from admin panel.",
            details: [{ name: "Warnings cleared", value: `${count}`, inline: true }]
          });
          await logEmbed(makeEmbed({
            title: `Case #${entry.id}: warnings cleared`,
            description: `${user ? user.tag : targetUserId}'s warnings were cleared.`,
            color: COLORS.mint,
            fields: buildCaseFields(entry)
          }));
          return interaction.reply({ content: `Cleared ${count} warning(s).`, ephemeral: true });
        }

        if (action === "clearnotes") {
          if (!targetUserId) {
            return interaction.reply({ content: "Select a user in the moderation panel first.", ephemeral: true });
          }

          const user = await client.users.fetch(targetUserId).catch(() => null);
          const count = clearNotes(targetUserId);
          const entry = addCase({
            action: "clearnotes",
            targetId: targetUserId,
            targetTag: user ? user.tag : targetUserId,
            moderatorTag: interaction.user.tag,
            reason: "Cleared notes from admin panel.",
            details: [{ name: "Notes cleared", value: `${count}`, inline: true }]
          });

          await logEmbed(makeEmbed({
            title: `Case #${entry.id}: notes cleared`,
            description: `${user ? user.tag : targetUserId}'s staff notes were cleared.`,
            color: COLORS.mint,
            fields: buildCaseFields(entry)
          }));
          return interaction.reply({ content: `Cleared ${count} note(s).`, ephemeral: true });
        }

        if (action === "setupverify") {
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
          return interaction.reply({ content: "Verify panel posted.", ephemeral: true });
        }

        if (action === "setuprules") {
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

        if (action === "settings-view") {
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

        if (action === "reset-mod-roles") {
          config.permissions.modRoleIds = [];
          saveConfig();
          return interaction.update({
            embeds: [await buildAdminPanelEmbed("staff", interaction, targetUserId)],
            components: buildAdminPanelButtons("staff", targetUserId)
          });
        }

        if (action === "reset-admin-roles") {
          config.permissions.adminRoleIds = [];
          saveConfig();
          return interaction.update({
            embeds: [await buildAdminPanelEmbed("staff", interaction, targetUserId)],
            components: buildAdminPanelButtons("staff", targetUserId)
          });
        }
      }

      return;
    }

    if (interaction.isRoleSelectMenu()) {
      if (!ENABLE_CORE_BOT) {
        return interaction.reply({ content: "Admin controls are disabled on this deployment.", ephemeral: true });
      }

      if (!interaction.customId.startsWith("adminpanel:")) return;
      const [, kind, action] = interaction.customId.split(":");
      if (!["selectrole", "exemptselect"].includes(kind)) return;
      if (!(await ensureStaffAccess(interaction, "admin", "the admin panel"))) return;

      if (kind === "selectrole" && action === "mod") {
        config.permissions.modRoleIds = interaction.values;
      }

      if (kind === "selectrole" && action === "admin") {
        config.permissions.adminRoleIds = interaction.values;
      }

      if (kind === "exemptselect" && action === "roles") {
        config.automod.exemptRoleIds = interaction.values;
        saveConfig();
        return interaction.update({
          embeds: [buildAutoModExemptionEmbed()],
          components: buildAutoModExemptionComponents()
        });
      }

      saveConfig();
      return interaction.update({
        embeds: [await buildAdminPanelEmbed("staff", interaction)],
        components: buildAdminPanelButtons("staff")
      });
    }

    if (interaction.isUserSelectMenu()) {
      if (!ENABLE_CORE_BOT) {
        return interaction.reply({ content: "Admin controls are disabled on this deployment.", ephemeral: true });
      }

      if (!interaction.customId.startsWith("adminpanel:")) return;
      const [, kind, action] = interaction.customId.split(":");
      if (!["selectuser", "exemptselect"].includes(kind)) return;
      if (!(await ensureStaffAccess(interaction, kind === "exemptselect" ? "admin" : "mod", "the admin panel"))) return;

      if (kind === "exemptselect" && action === "users") {
        config.automod.exemptUserIds = interaction.values;
        saveConfig();
        return interaction.update({
          embeds: [buildAutoModExemptionEmbed()],
          components: buildAutoModExemptionComponents()
        });
      }

      const selectedUserId = interaction.values[0];
      return interaction.update({
        embeds: [await buildAdminPanelEmbed(action, interaction, selectedUserId)],
        components: buildAdminPanelButtons(action, selectedUserId)
      });
    }

    if (interaction.isChannelSelectMenu()) {
      if (!ENABLE_CORE_BOT) {
        return interaction.reply({ content: "Admin controls are disabled on this deployment.", ephemeral: true });
      }

      if (!interaction.customId.startsWith("adminpanel:")) return;
      const [, kind, action] = interaction.customId.split(":");
      if (kind !== "exemptselect" || action !== "channels") return;
      if (!(await ensureStaffAccess(interaction, "admin", "the admin panel"))) return;

      config.automod.exemptChannelIds = interaction.values;
      saveConfig();
      return interaction.update({
        embeds: [buildAutoModExemptionEmbed()],
        components: buildAutoModExemptionComponents()
      });
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("musicpanel:")) {
        if (!ENABLE_MUSIC) {
          return interaction.reply({ content: "Music controls are disabled on this deployment.", ephemeral: true });
        }

        const [, kind, action] = interaction.customId.split(":");
        if (kind !== "submit" || action !== "play") return;

        const voiceChannel = await ensureVoiceChannel(interaction);
        if (!voiceChannel) return;

        await interaction.deferReply({ ephemeral: true });

        let queue = musicQueues.get(interaction.guild.id);
        if (queue && queue.voiceChannelId !== voiceChannel.id) {
          return interaction.editReply("You need to be in the same voice channel as the bot to add music.");
        }

        if (!queue) {
          queue = createMusicQueue(interaction.guild, voiceChannel, interaction.channel);
          try {
            await entersState(queue.connection, VoiceConnectionStatus.Ready, 20_000);
          } catch (error) {
            destroyMusicQueue(interaction.guild.id);
            return interaction.editReply(await describeVoiceJoinFailure(interaction, voiceChannel, error));
          }
        }

        const track = await resolveMusicTrack(interaction.fields.getTextInputValue("query"), interaction.user.tag).catch(() => null);
        if (!track) {
          if (!queue.current && !queue.tracks.length) {
            destroyMusicQueue(interaction.guild.id);
          }
          return interaction.editReply("I couldn't find a playable YouTube result for that request.");
        }

        queue.textChannelId = interaction.channel.id;
        queue.voiceChannelId = voiceChannel.id;

        const shouldStart = !queue.current && queue.player.state.status !== AudioPlayerStatus.Playing;
        queue.tracks.push(track);

        if (shouldStart) {
          await playNextTrack(interaction.guild.id);
        }

        await interaction.editReply(`Added **${track.title}** to the queue.`);
        return interaction.message?.edit?.({
          embeds: [buildMusicPanelEmbed(interaction.guild.id)],
          components: buildMusicPanelButtons(interaction.guild.id)
        }).catch(() => {});
      }

      if (!interaction.customId.startsWith("adminpanel:")) return;
      if (!ENABLE_CORE_BOT) {
        return interaction.reply({ content: "Admin controls are disabled on this deployment.", ephemeral: true });
      }
      const [, kind, action, targetIdRaw] = interaction.customId.split(":");
      const targetUserId = targetIdRaw && targetIdRaw !== "none" ? targetIdRaw : null;
      if (!["submit", "configsubmit"].includes(kind)) return;
      if (kind === "submit" && !targetUserId) return;
      if (!(await ensureStaffAccess(interaction, kind === "configsubmit" ? "admin" : "mod", "the admin panel"))) return;

      if (kind === "configsubmit") {
        if (action === "mentions") {
          const limit = Number(interaction.fields.getTextInputValue("limit"));
          if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
            return interaction.reply({ content: "Mention limit must be a whole number from 1 to 25.", ephemeral: true });
          }
          config.automod.maxMentions = limit;
        }

        if (action === "emoji-limit") {
          const limit = Number(interaction.fields.getTextInputValue("limit"));
          if (!Number.isInteger(limit) || limit < 3 || limit > 100) {
            return interaction.reply({ content: "Emoji limit must be a whole number from 3 to 100.", ephemeral: true });
          }
          config.automod.maxEmojiCount = limit;
        }

        if (action === "thresholds") {
          const warn = Number(interaction.fields.getTextInputValue("warn"));
          const timeout = Number(interaction.fields.getTextInputValue("timeout"));
          if (!Number.isInteger(warn) || !Number.isInteger(timeout) || warn < 1 || timeout < 1 || warn > 20 || timeout > 20) {
            return interaction.reply({ content: "Thresholds must be whole numbers from 1 to 20.", ephemeral: true });
          }
          config.automod.warnThreshold = warn;
          config.automod.timeoutThreshold = timeout;
        }

        if (action === "attachment-limit") {
          const limit = Number(interaction.fields.getTextInputValue("limit"));
          if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            return interaction.reply({ content: "Attachment limit must be a whole number from 1 to 100 MB.", ephemeral: true });
          }
          config.automod.maxAttachmentSizeMb = limit;
        }

        if (action === "raid") {
          const threshold = Number(interaction.fields.getTextInputValue("threshold"));
          const windowMs = parseDuration(interaction.fields.getTextInputValue("window"));
          const accountAgeMs = parseDuration(interaction.fields.getTextInputValue("accountage"));
          const raidAction = interaction.fields.getTextInputValue("action").trim().toLowerCase();

          if (!Number.isInteger(threshold) || threshold < 2 || threshold > 100) {
            return interaction.reply({ content: "Raid threshold must be a whole number from 2 to 100.", ephemeral: true });
          }

          if (!windowMs) {
            return interaction.reply({ content: "Raid window must be a valid duration like 30s, 1m, or 5m.", ephemeral: true });
          }

          if (!accountAgeMs) {
            return interaction.reply({ content: "Suspicious account age must be a valid duration like 1d or 7d.", ephemeral: true });
          }

          if (!["log", "timeout"].includes(raidAction)) {
            return interaction.reply({ content: "Raid action must be either `log` or `timeout`.", ephemeral: true });
          }

          config.automod.raidJoinThreshold = threshold;
          config.automod.raidWindowMs = windowMs;
          config.automod.raidAccountAgeLimitMs = accountAgeMs;
          config.automod.raidAction = raidAction;
        }

        if (action === "age-gates") {
          const linkAccountAge = parseDurationInputOrZero(interaction.fields.getTextInputValue("linkAccountAge"));
          const linkMemberAge = parseDurationInputOrZero(interaction.fields.getTextInputValue("linkMemberAge"));
          const attachmentAccountAge = parseDurationInputOrZero(interaction.fields.getTextInputValue("attachmentAccountAge"));
          const attachmentMemberAge = parseDurationInputOrZero(interaction.fields.getTextInputValue("attachmentMemberAge"));

          if ([linkAccountAge, linkMemberAge, attachmentAccountAge, attachmentMemberAge].some(value => value === null)) {
            return interaction.reply({ content: "Use durations like 12h or 7d. You can also enter `0` to disable a gate.", ephemeral: true });
          }

          config.automod.minAccountAgeForLinksMs = linkAccountAge;
          config.automod.minMemberAgeForLinksMs = linkMemberAge;
          config.automod.minAccountAgeForAttachmentsMs = attachmentAccountAge;
          config.automod.minMemberAgeForAttachmentsMs = attachmentMemberAge;
        }

        if (action === "terms") {
          config.automod.bannedWordList = parseCommaSeparatedList(interaction.fields.getTextInputValue("bannedWords"));
          config.automod.nicknameBlockedTerms = parseCommaSeparatedList(interaction.fields.getTextInputValue("nicknameTerms"));
        }

        if (action === "domains") {
          config.automod.allowedDomains = parseCommaSeparatedList(
            interaction.fields.getTextInputValue("allowedDomains"),
            normalizeDomain
          );
          config.automod.blockedDomains = parseCommaSeparatedList(
            interaction.fields.getTextInputValue("blockedDomains"),
            normalizeDomain
          );
        }

        if (action === "limits") {
          const mentions = Number(interaction.fields.getTextInputValue("mentions"));
          const emojiLimit = Number(interaction.fields.getTextInputValue("emojiLimit"));
          const attachmentLimit = Number(interaction.fields.getTextInputValue("attachmentLimit"));
          const warnThreshold = Number(interaction.fields.getTextInputValue("warnThreshold"));
          const timeoutThreshold = Number(interaction.fields.getTextInputValue("timeoutThreshold"));

          if (
            !Number.isInteger(mentions) || mentions < 1 || mentions > 25 ||
            !Number.isInteger(emojiLimit) || emojiLimit < 3 || emojiLimit > 100 ||
            !Number.isInteger(attachmentLimit) || attachmentLimit < 1 || attachmentLimit > 100 ||
            !Number.isInteger(warnThreshold) || warnThreshold < 1 || warnThreshold > 20 ||
            !Number.isInteger(timeoutThreshold) || timeoutThreshold < 1 || timeoutThreshold > 20
          ) {
            return interaction.reply({ content: "Check the limits: mentions 1-25, emoji 3-100, attachments 1-100 MB, thresholds 1-20.", ephemeral: true });
          }

          config.automod.maxMentions = mentions;
          config.automod.maxEmojiCount = emojiLimit;
          config.automod.maxAttachmentSizeMb = attachmentLimit;
          config.automod.warnThreshold = warnThreshold;
          config.automod.timeoutThreshold = timeoutThreshold;
        }

        if (action === "guard") {
          const raidThreshold = Number(interaction.fields.getTextInputValue("raidThreshold"));
          const raidWindow = parseDuration(interaction.fields.getTextInputValue("raidWindow"));
          const [raidActionRaw = "", raidAccountAgeRaw = ""] = interaction.fields.getTextInputValue("raidAction").split(/[|,]/).map(value => value.trim());
          const raidAction = raidActionRaw.toLowerCase();
          const raidAccountAge = parseDurationInputOrZero(raidAccountAgeRaw);
          const linkAges = parseDurationPairInput(interaction.fields.getTextInputValue("linkAges"));
          const attachmentAges = parseDurationPairInput(interaction.fields.getTextInputValue("attachmentAges"));

          if (!Number.isInteger(raidThreshold) || raidThreshold < 2 || raidThreshold > 100) {
            return interaction.reply({ content: "Raid threshold must be a whole number from 2 to 100.", ephemeral: true });
          }
          if (!raidWindow) {
            return interaction.reply({ content: "Raid window must be a valid duration like 30s, 1m, or 5m.", ephemeral: true });
          }
          if (!["log", "timeout"].includes(raidAction)) {
            return interaction.reply({ content: "Raid action must be either `log` or `timeout`.", ephemeral: true });
          }
          if (raidAccountAge === null) {
            return interaction.reply({ content: "Raid account age must be a valid duration like `1d` or `7d`.", ephemeral: true });
          }
          if (!linkAges || !attachmentAges) {
            return interaction.reply({ content: "Age pairs must use `account, member` durations like `7d, 1d` or `0, 0`.", ephemeral: true });
          }

          config.automod.raidJoinThreshold = raidThreshold;
          config.automod.raidWindowMs = raidWindow;
          config.automod.raidAction = raidAction;
          config.automod.raidAccountAgeLimitMs = raidAccountAge;
          config.automod.minAccountAgeForLinksMs = linkAges[0];
          config.automod.minMemberAgeForLinksMs = linkAges[1];
          config.automod.minAccountAgeForAttachmentsMs = attachmentAges[0];
          config.automod.minMemberAgeForAttachmentsMs = attachmentAges[1];
        }

        if (action === "lists") {
          config.automod.bannedWordList = parseCommaSeparatedList(interaction.fields.getTextInputValue("bannedWords"));
          config.automod.nicknameBlockedTerms = parseCommaSeparatedList(interaction.fields.getTextInputValue("nicknameTerms"));
          config.automod.allowedDomains = parseCommaSeparatedList(interaction.fields.getTextInputValue("allowedDomains"), normalizeDomain);
          config.automod.blockedDomains = parseCommaSeparatedList(interaction.fields.getTextInputValue("blockedDomains"), normalizeDomain);
          config.automod.scamPhraseList = parseCommaSeparatedList(interaction.fields.getTextInputValue("scamPhrases"), normalizeComparisonText);
        }

        if (action === "rule-actions") {
          const alertRules = parseRuleKeyList(interaction.fields.getTextInputValue("alertRules"));
          const warnRules = parseRuleKeyList(interaction.fields.getTextInputValue("warnRules"));
          const timeoutRules = parseRuleKeyList(interaction.fields.getTextInputValue("timeoutRules"));
          const resetRules = parseRuleKeyList(interaction.fields.getTextInputValue("resetRules"));
          const ruleActions = {};

          for (const rule of alertRules) ruleActions[rule] = "alert";
          for (const rule of warnRules) ruleActions[rule] = "warn";
          for (const rule of timeoutRules) ruleActions[rule] = "timeout";
          for (const rule of resetRules) delete ruleActions[rule];

          config.automod.ruleActions = ruleActions;
          config.automod.alertOnlyRules = alertRules;
        }

        saveConfig();
        return interaction.reply({ content: `Updated AutoMod setting: ${action}.`, ephemeral: true });
      }

      const user = await client.users.fetch(targetUserId).catch(() => null);
      const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
      if (!user) {
        return interaction.reply({ content: "That user could not be found.", ephemeral: true });
      }

      if (["warn", "timeout", "mute", "tempban"].includes(action) && !(await ensureModeratable(interaction, member, action))) {
        return;
      }

      if (action === "warn") {
        const reason = interaction.fields.getTextInputValue("reason");
        const warnings = addWarning(user.id, interaction.user.tag, reason);
        const entry = addCase({
          action: "warn",
          targetId: user.id,
          targetTag: user.tag,
          moderatorTag: interaction.user.tag,
          reason,
          details: [{ name: "Total warnings", value: `${warnings.length}`, inline: true }]
        });

        await notifyUser(user, makeEmbed({
          title: "Warning received",
          description: `You were warned in **${interaction.guild.name}**.`,
          color: COLORS.yellow,
          fields: buildCaseFields(entry)
        }));

        await logEmbed(makeEmbed({
          title: `Case #${entry.id}: warning`,
          description: `${user.tag} received a warning.`,
          color: COLORS.yellow,
          fields: buildCaseFields(entry)
        }));

        return interaction.reply({ content: `${user.tag} has been warned.`, ephemeral: true });
      }

      if (action === "timeout") {
        const durationInput = interaction.fields.getTextInputValue("duration");
        const reason = interaction.fields.getTextInputValue("reason");
        const durationMs = parseDuration(durationInput);
        if (!durationMs) {
          return interaction.reply({ content: "Use a valid duration like 10m, 2h, or 1d.", ephemeral: true });
        }
        if (!member?.moderatable) {
          return interaction.reply({ content: "I cannot timeout that member.", ephemeral: true });
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
        await logEmbed(makeEmbed({
          title: `Case #${entry.id}: timeout`,
          description: `${user.tag} was timed out.`,
          color: COLORS.red,
          fields: buildCaseFields(entry)
        }));
        return interaction.reply({ content: `${user.tag} was timed out for ${formatDuration(durationMs)}.`, ephemeral: true });
      }

      if (action === "mute") {
        const reason = interaction.fields.getTextInputValue("reason");
        if (!member?.manageable) {
          return interaction.reply({ content: "I cannot manage that member's roles.", ephemeral: true });
        }
        const mutedRole = await ensureMutedRole(interaction.guild);
        await member.roles.add(mutedRole, `${interaction.user.tag}: ${reason}`);
        const entry = addCase({
          action: "mute",
          targetId: user.id,
          targetTag: user.tag,
          moderatorTag: interaction.user.tag,
          reason,
          details: [{ name: "Muted role", value: `<@&${mutedRole.id}>`, inline: true }]
        });
        await logEmbed(makeEmbed({
          title: `Case #${entry.id}: mute`,
          description: `${user.tag} was muted.`,
          color: COLORS.red,
          fields: buildCaseFields(entry)
        }));
        return interaction.reply({ content: `${user.tag} was muted.`, ephemeral: true });
      }

      if (action === "tempban") {
        const durationInput = interaction.fields.getTextInputValue("duration");
        const reason = interaction.fields.getTextInputValue("reason");
        const durationMs = parseDuration(durationInput);
        if (!durationMs) {
          return interaction.reply({ content: "Use a valid duration like 1h, 1d, or 7d.", ephemeral: true });
        }
        if (member && !member.bannable) {
          return interaction.reply({ content: "I cannot ban that member.", ephemeral: true });
        }

        const expiresAt = new Date(Date.now() + durationMs).toISOString();
        setPendingPanelAction(interaction.user.id, {
          action: "tempban",
          targetUserId: user.id,
          reason,
          expiresAt,
          durationLabel: formatDuration(durationMs)
        });
        return interaction.reply({
          content: `Confirm temp banning ${user.tag} for ${formatDuration(durationMs)}?\nReason: ${reason}`,
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(buildAdminPanelCustomId("confirm", "tempban", user.id)).setLabel("Confirm Temp Ban").setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId(buildAdminPanelCustomId("confirm", "cancel", user.id)).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
            )
          ],
          ephemeral: true
        });
      }

      if (action === "note") {
        const content = interaction.fields.getTextInputValue("reason");
        const notes = addNote(user.id, interaction.user.tag, content);
        const entry = addCase({
          action: "note",
          targetId: user.id,
          targetTag: user.tag,
          moderatorTag: interaction.user.tag,
          reason: content,
          details: [{ name: "Total notes", value: `${notes.length}`, inline: true }]
        });
        await logEmbed(makeEmbed({
          title: `Case #${entry.id}: staff note`,
          description: `A staff note was saved for ${user.tag}.`,
          color: COLORS.gray,
          fields: buildCaseFields(entry)
        }));
        return interaction.reply({ content: `Saved a note for ${user.tag}.`, ephemeral: true });
      }

      if (action === "dmuser") {
        const content = interaction.fields.getTextInputValue("reason");
        await notifyUser(
          user,
          makeEmbed({
            title: "Message from staff",
            description: content,
            color: COLORS.pink
          })
        );

        const entry = addCase({
          action: "dm",
          targetId: user.id,
          targetTag: user.tag,
          moderatorTag: interaction.user.tag,
          reason: content
        });

        await logEmbed(makeEmbed({
          title: `Case #${entry.id}: direct message`,
          description: `A staff DM was sent to ${user.tag}.`,
          color: COLORS.blue,
          fields: buildCaseFields(entry)
        }));
        return interaction.reply({ content: `Sent a DM to ${user.tag}.`, ephemeral: true });
      }

      if (action === "kick") {
        const reason = interaction.fields.getTextInputValue("reason");
        if (!member?.kickable) {
          return interaction.reply({ content: "I cannot kick that member.", ephemeral: true });
        }
        setPendingPanelAction(interaction.user.id, {
          action: "kick",
          targetUserId: user.id,
          reason
        });
        return interaction.reply({
          content: `Confirm kicking ${user.tag}?\nReason: ${reason}`,
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(buildAdminPanelCustomId("confirm", "kick", user.id)).setLabel("Confirm Kick").setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId(buildAdminPanelCustomId("confirm", "cancel", user.id)).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
            )
          ],
          ephemeral: true
        });
      }

      if (action === "ban") {
        const reason = interaction.fields.getTextInputValue("reason");
        if (member && !member.bannable) {
          return interaction.reply({ content: "I cannot ban that member.", ephemeral: true });
        }
        setPendingPanelAction(interaction.user.id, {
          action: "ban",
          targetUserId: user.id,
          reason
        });
        return interaction.reply({
          content: `Confirm banning ${user.tag}?\nReason: ${reason}`,
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(buildAdminPanelCustomId("confirm", "ban", user.id)).setLabel("Confirm Ban").setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId(buildAdminPanelCustomId("confirm", "cancel", user.id)).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
            )
          ],
          ephemeral: true
        });
      }
    }

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
      "adminpanel",
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

    if (interaction.commandName === "musicpanel") {
      return interaction.reply({
        embeds: [buildMusicPanelEmbed(guild.id)],
        components: buildMusicPanelButtons(guild.id),
        ephemeral: true
      });
    }

    if (interaction.commandName === "play") {
      const voiceChannel = await ensureVoiceChannel(interaction);
      if (!voiceChannel) return;

      await interaction.deferReply();

      let queue = musicQueues.get(guild.id);
      if (queue && queue.voiceChannelId !== voiceChannel.id) {
        return interaction.editReply("You need to be in the same voice channel as the bot to add music.");
      }

      if (!queue) {
        queue = createMusicQueue(guild, voiceChannel, channel);
        try {
          await entersState(queue.connection, VoiceConnectionStatus.Ready, 20_000);
        } catch (error) {
          destroyMusicQueue(guild.id);
          return interaction.editReply(await describeVoiceJoinFailure(interaction, voiceChannel, error));
        }
      }

      const track = await resolveMusicTrack(interaction.options.getString("query"), interaction.user.tag).catch(() => null);
      if (!track) {
        if (!queue.current && !queue.tracks.length) {
          destroyMusicQueue(guild.id);
        }
        return interaction.editReply("I couldn't find a playable YouTube result for that query.");
      }

      queue.textChannelId = channel.id;
      queue.voiceChannelId = voiceChannel.id;

      const shouldStart = !queue.current && queue.player.state.status !== AudioPlayerStatus.Playing;
      queue.tracks.push(track);

      if (shouldStart) {
        await playNextTrack(guild.id);
        return interaction.editReply(`Queued and started **${track.title}**.`);
      }

      return interaction.editReply(`Added **${track.title}** to the queue at position ${queue.tracks.length}.`);
    }

    if (interaction.commandName === "skip") {
      const queue = musicQueues.get(guild.id);
      if (!queue || !queue.current) {
        return interaction.reply({ content: "There isn't anything playing right now.", ephemeral: true });
      }

      if (!ensureSameVoiceChannel(interaction, queue)) return;
      const skippedTitle = queue.current.title;
      queue.player.stop();
      return interaction.reply({ content: `Skipped **${skippedTitle}**.` });
    }

    if (interaction.commandName === "stop") {
      const queue = musicQueues.get(guild.id);
      if (!queue) {
        return interaction.reply({ content: "There isn't an active music queue right now.", ephemeral: true });
      }

      if (!ensureSameVoiceChannel(interaction, queue)) return;
      await stopMusicQueue(guild.id, `${interaction.user.tag} stopped the queue.`);
      return interaction.reply({ content: "Stopped playback and cleared the queue." });
    }

    if (interaction.commandName === "pause") {
      const queue = musicQueues.get(guild.id);
      if (!queue || !queue.current) {
        return interaction.reply({ content: "There isn't anything playing right now.", ephemeral: true });
      }

      if (!ensureSameVoiceChannel(interaction, queue)) return;
      if (!queue.player.pause()) {
        return interaction.reply({ content: "Playback is already paused or couldn't be paused.", ephemeral: true });
      }

      return interaction.reply({ content: `Paused **${queue.current.title}**.` });
    }

    if (interaction.commandName === "resume") {
      const queue = musicQueues.get(guild.id);
      if (!queue || !queue.current) {
        return interaction.reply({ content: "There isn't anything to resume right now.", ephemeral: true });
      }

      if (!ensureSameVoiceChannel(interaction, queue)) return;
      if (!queue.player.unpause()) {
        return interaction.reply({ content: "Playback wasn't paused.", ephemeral: true });
      }

      return interaction.reply({ content: `Resumed **${queue.current.title}**.` });
    }

    if (interaction.commandName === "queue") {
      const queue = musicQueues.get(guild.id);
      if (!queue || (!queue.current && !queue.tracks.length)) {
        return interaction.reply({ content: "The music queue is empty right now.", ephemeral: true });
      }

      const upcoming = queue.tracks.length
        ? queue.tracks.slice(0, 10).map((track, index) => `${index + 1}. [${track.title}](${track.url}) • ${track.durationText}`).join("\n")
        : "No upcoming songs.";

      return interaction.reply({
        embeds: [
          makeEmbed({
            title: "Music queue",
            description: queue.current ? `Now playing: [${queue.current.title}](${queue.current.url})` : "Nothing is actively playing.",
            color: COLORS.blue,
            fields: [
              { name: "Voice Channel", value: `<#${queue.voiceChannelId}>`, inline: true },
              { name: "Queued Songs", value: `${queue.tracks.length}`, inline: true },
              { name: "Up Next", value: upcoming.slice(0, 1024), inline: false }
            ],
            thumbnail: queue.current?.thumbnail || null
          })
        ]
      });
    }

    if (interaction.commandName === "nowplaying") {
      const queue = musicQueues.get(guild.id);
      if (!queue || !queue.current) {
        return interaction.reply({ content: "There isn't anything playing right now.", ephemeral: true });
      }

      return interaction.reply({ embeds: [buildMusicSummary(queue.current)] });
    }

    if (interaction.commandName === "leave") {
      const queue = musicQueues.get(guild.id);
      if (!queue) {
        return interaction.reply({ content: "I'm not in a voice channel right now.", ephemeral: true });
      }

      if (!ensureSameVoiceChannel(interaction, queue)) return;
      await stopMusicQueue(guild.id, `${interaction.user.tag} disconnected the music bot.`);
      return interaction.reply({ content: "Left the voice channel and cleared the queue." });
    }

    if (interaction.commandName === "adminpanel") {
      return interaction.reply({
        embeds: [await buildAdminPanelEmbed("overview", interaction)],
        components: buildAdminPanelButtons("overview"),
        ephemeral: true
      });
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

         if (enabled) {
          config.automod.ruleActions[rule] = "alert";
        } else {
          delete config.automod.ruleActions[rule];
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
    if (!ENABLE_CORE_BOT) return;
    if (!message.guild || message.author.bot || !message.member) return;
    if (isAutoModExempt(message)) return;

    const accountAgeMs = getAccountAgeMs(message.author);
    const memberAgeMs = getMemberAgeMs(message.member);
    const messageDomains = extractMessageDomains(message.content);
    const normalizedBlockedDomains = config.automod.blockedDomains.map(normalizeDomain);
    const normalizedAllowedDomains = config.automod.allowedDomains.map(normalizeDomain);

    if (config.automod.scamFilterEnabled) {
      const scamMatch = detectScamAttempt(message);
      if (scamMatch) {
        await handleAutoModViolation(message, scamMatch.reason, scamMatch.actionLabel);
        return;
      }
    }

    if (config.automod.evasionFilterEnabled) {
      const bypassMatch = detectBypassAttempt(message.content);
      if (bypassMatch) {
        await handleAutoModViolation(message, bypassMatch.reason, bypassMatch.actionLabel);
        return;
      }
    }

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
    if (!ENABLE_CORE_BOT) return;
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
    if (!ENABLE_CORE_BOT) return;
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
        recordAutoModAnalytics("raid-join", raidReason, member.user.tag);

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
        recordAutoModAnalytics("nickname", `Nickname matched blocked term "${blockedTerm}" on join.`, member.user.tag);

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
    if (!ENABLE_CORE_BOT) return;
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
    recordAutoModAnalytics("nickname", `Nickname matched blocked term "${blockedTerm}".`, newMember.user.tag);

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
