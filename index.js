require("dotenv").config();

const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

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
const { createCanvas } = require("@napi-rs/canvas");
const { createLogger } = require("./lib/logger");

const {
  TOKEN,
  CLIENT_ID,
  GUILD_ID,
  VERIFY_CHANNEL_ID,
  RULES_CHANNEL_ID,
  LOG_CHANNEL_ID,
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

function resolveDataDir(value, fallback) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return fallback;
  }

  return path.isAbsolute(raw) ? raw : path.resolve(__dirname, raw);
}

const ENABLE_CORE_BOT = envFlag(process.env.ENABLE_CORE_BOT, true);
const WEB_PORT = Number(process.env.PORT || process.env.WEB_PORT || 3000);
const WEB_ADMIN_TOKEN = process.env.WEB_ADMIN_TOKEN || "";
const WEB_BASE_URL = (process.env.WEB_BASE_URL || "").replace(/\/$/, "");
const SUPPORT_PUBLIC_URL = (process.env.SUPPORT_PUBLIC_URL || "").replace(/\/$/, "");
const WEB_OAUTH_REDIRECT_URI = (process.env.WEB_OAUTH_REDIRECT_URI || "").trim();
const WEB_STAFF_OAUTH_REDIRECT_URI = (process.env.WEB_STAFF_OAUTH_REDIRECT_URI || "").trim();
const WEB_SUPPORT_OAUTH_REDIRECT_URI = (process.env.WEB_SUPPORT_OAUTH_REDIRECT_URI || "").trim();
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";
const SESSION_SECRET = process.env.SESSION_SECRET || WEB_ADMIN_TOKEN || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL || "gpt-4o-mini";
const webPublicDir = path.join(__dirname, "web", "public");
const log = createLogger("bot");

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

let webServer = null;
let shuttingDown = false;

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
const BIRTHDAY_ROLE_DURATION_MS = 24 * 60 * 60 * 1000;
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
  "scam-image",
  "masked-link",
  "obfuscated-invite",
  "obfuscated-banned-word",
  "ai-review",
  "raid-join",
  "nickname"
];
const AUTOMOD_RULE_ACTIONS = new Set(["delete", "alert", "warn", "timeout", "kick", "ban"]);
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
const HIGH_RISK_SCAM_DOMAINS = [
  "bit.ly",
  "cutt.ly",
  "tinyurl.com",
  "grabify.link"
];
const COMMON_LINK_AGGREGATOR_DOMAINS = [
  "linktr.ee",
  "lnk.bio",
  "bio.link",
  "beacons.ai"
];
const spamTracker = new Map();
const joinTracker = new Map();
const anonymousAffirmationCooldowns = new Map();
const verificationButtonCooldowns = new Map();
const verificationCaptchaChallenges = new Map();
const generalChatActivityCache = new Map();
const googleBlockListSyncState = {
  running: false,
  lastSyncAt: null
};
const pendingPanelActions = new Map();
const webSessions = new Map();
const webOauthStates = new Map();
const mochiSessions = new Map();
const MOCHI_PATH = normalizeMochiPath(process.env.MOCHI_PATH || "/mochi");
const WEB_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MOCHI_SESSION_TTL_MS = Number.isFinite(Number(process.env.MOCHI_SESSION_TTL_MINUTES))
  ? Math.max(5, Number(process.env.MOCHI_SESSION_TTL_MINUTES)) * 60 * 1000
  : 30 * 60 * 1000;
let mochiLeaderboardCache = null;
let mochiRecentRunsCache = null;
let mochiProfilesCache = null;
let tempBanInterval = null;
let scheduledReportInterval = null;
let googleBlockListInterval = null;
let generalChatSweepInterval = null;
let birthdaySweepInterval = null;

const dataDir = resolveDataDir(
  process.env.MOCHI_DATA_DIR || process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH,
  path.join(__dirname, "data")
);
const mochiLeaderboardPath = path.join(dataDir, "mochi-leaderboard.json");
const mochiRunsPath = path.join(dataDir, "mochi-runs.json");
const mochiProfilesPath = path.join(dataDir, "mochi-profiles.json");
const supportPath = path.join(dataDir, "support.json");
const configPath = path.join(dataDir, "config.json");
const messageArchivePath = path.join(dataDir, "message-archive.jsonl");
let messageArchiveLastPruneAt = 0;
let supportStoreCache = null;

function createDefaultConfig() {
  return {
    verifyMessageId: null,
    bonusVerifyMessageId: null,
    birthdays: {},
    warnings: {},
    notes: {},
    cases: [],
    appeals: [],
    nextAppealId: 1,
    auditLog: [],
    modTemplates: [
      { label: "Spam", category: "spam", action: "warn", duration: "", reason: "Please stop spamming or repeating messages." },
      { label: "Harassment", category: "harassment", action: "warn", duration: "", reason: "Harassment or targeted insults are not allowed." },
      { label: "Scam link", category: "scam", action: "timeout", duration: "1h", reason: "Suspicious or scam links are not allowed." }
    ],
    webAccounts: [],
    channelProfiles: "",
    reportSettings: {
      enabled: false,
      channelId: null,
      frequency: "daily",
      lastSentAt: null
    },
    aiReviews: {},
    tempBans: [],
    nextCaseId: 1,
    automod: {
      invites: true,
      spam: true,
      caps: true,
      bannedWords: false,
      bannedWordsContextSensitivity: 65,
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
      aiModerationEnabled: false,
      aiModerationModel: "omni-moderation-latest",
      aiModerationThreshold: 70,
      aiModerationAction: "review",
      aiModerationCategoryThresholds: {},
      aiModerationSuppressLowConfidenceReviews: true,
      aiCustomRulesEnabled: false,
      aiCustomRulesModel: "gpt-4o-mini",
      aiCustomRulesThreshold: 75,
      aiCustomRulesAction: "review",
      aiCustomRules: "",
      aiCustomInstructions: "",
      aiMinMessageLength: 4,
      aiIncludeRecentContext: false,
      aiContextMessageCount: 3,
      dryRunEnabled: false,
      linkReputationEnabled: true,
      languageAwareFiltersEnabled: true,
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
      quietHoursMode: "relaxed",
      contextMessageCount: 3,
      spamWindowMs: 8000,
      spamBurstThreshold: 5,
      spamDuplicateThreshold: 3,
      channelRuleOverrides: {},
      scamPhraseList: [],
      googleBlockListEnabled: false,
      googleBlockListUrl: "",
      googleBlockListSyncMinutes: 15,
      googleBlockListTerms: [],
      googleBlockListLastSyncedAt: null,
      googleBlockListLastError: null,
      googleBlockListLastCount: 0,
      alertOnlyRules: ["ai-review"],
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
      rulesCardTitle: "Server rules ✿",
      rulesCardDescription: "A cozy little guide to keep the server kind, comfy, and fun for everyone. Thanks for helping keep Mochi sweet and safe.",
      rulesCardRules: [
        "Be kind, thoughtful, and respectful to everyone.",
        "Please keep spam, harassment, and drama out of the chat.",
        "Follow Discord's Terms of Service and community rules.",
        "Use each channel for its intended purpose.",
        "Stay active in general chat within two months, or you may be kicked from the server.",
        "Please use the verify button in {verify} so you can fully access the server."
      ].join("\n"),
      welcomeChannelId: null,
      generalChatChannelId: null,
      generalChatInactivityEnabled: true,
      generalChatInactivityWarnings: {},
      anonymousAffirmationsEnabled: true,
      anonymousAffirmationsChannelId: null,
      anonymousAffirmationsCooldownMs: 60 * 1000,
      verificationCaptchaEnabled: false,
      verificationRequiresApproval: false,
      logChannelId: null,
      automodLogChannelId: null,
      mutedRoleId: null,
      birthdayRoleId: null,
      birthdayAnnouncementChannelId: null,
      messageArchiveEnabled: true,
      messageArchiveRetentionDays: 30,
      tiktokHandle: "",
      tiktokNicknameAliases: [],
      verifiedRoleId: null,
      unverifiedRoleId: null
    },
    pendingVerifications: [],
    permissions: {
      modRoleIds: [],
      adminRoleIds: []
    }
  };
}

function createDefaultSupportStore() {
  return {
    nextTicketId: 1,
    tickets: []
  };
}

function normalizeVerificationText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeRulesCardText(value, maxLength = 500) {
  return String(value || "")
    .replace(/\r\n?/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeRulesCardBlock(value, maxLength = 4000) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, maxLength);
}

function normalizeTikTokVerificationInputToken(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/(?:www\.|m\.)?tiktok\.com\/@/i, "")
    .replace(/^@+/, "")
    .replace(/[?#].*$/, "")
    .replace(/\/.*$/, "");
}

function splitTikTokVerificationInput(value) {
  return String(value || "")
    .split(/[\s,\n;]+/)
    .map(item => normalizeTikTokVerificationInputToken(item))
    .filter(Boolean);
}

function getTikTokHandle() {
  const [handle = ""] = splitTikTokVerificationInput(config.settings?.tiktokHandle || "");
  return handle;
}

function getTikTokNicknameAliases() {
  const aliases = config.settings?.tiktokNicknameAliases;
  const aliasList = Array.isArray(aliases)
    ? aliases
    : typeof aliases === "string"
      ? aliases.split(/[\n,]+/)
      : [];

  const handleExtras = splitTikTokVerificationInput(config.settings?.tiktokHandle || "").slice(1);
  return [...aliasList, ...handleExtras]
    .map(alias => normalizeVerificationText(alias))
    .filter(Boolean);
}

function addTikTokNicknameAlias(alias) {
  const normalizedAlias = normalizeVerificationText(alias);
  if (!normalizedAlias) return false;

  const currentAliases = Array.isArray(config.settings.tiktokNicknameAliases)
    ? config.settings.tiktokNicknameAliases
    : splitTikTokVerificationInput(config.settings.tiktokNicknameAliases || "");

  const alreadySaved = currentAliases.some(item => normalizeVerificationText(item) === normalizedAlias);
  if (alreadySaved) return false;

  config.settings.tiktokNicknameAliases = [...currentAliases, alias];
  saveConfig();
  return true;
}

function getVerificationRoleId() {
  return config.settings?.verifiedRoleId || null;
}

function getUnverifiedRoleId() {
  return config.settings?.unverifiedRoleId || null;
}

function getWelcomeChannelId() {
  return config.settings?.welcomeChannelId || null;
}

function getGeneralChatChannelId() {
  return config.settings?.generalChatChannelId || null;
}

function isGeneralChatInactivityEnabled() {
  return config.settings?.generalChatInactivityEnabled !== false;
}

function getGeneralChatInactivityWarningStore() {
  if (!config.generalChatInactivityWarnings || typeof config.generalChatInactivityWarnings !== "object") {
    config.generalChatInactivityWarnings = {};
  }
  return config.generalChatInactivityWarnings;
}

function wasGeneralChatWarningSent(memberId, lastActiveAt) {
  if (!memberId || !lastActiveAt) return false;
  const entry = getGeneralChatInactivityWarningStore()[memberId];
  return Boolean(entry && entry.lastActiveAt === lastActiveAt);
}

function markGeneralChatWarningSent(memberId, lastActiveAt) {
  if (!memberId || !lastActiveAt) return;
  getGeneralChatInactivityWarningStore()[memberId] = {
    lastActiveAt,
    warnedAt: new Date().toISOString()
  };
  saveConfig();
}

function clearGeneralChatWarning(memberId) {
  if (!memberId) return;
  if (config.generalChatInactivityWarnings && typeof config.generalChatInactivityWarnings === "object") {
    delete config.generalChatInactivityWarnings[memberId];
    saveConfig();
  }
}

function isAnonymousAffirmationsEnabled() {
  return config.settings?.anonymousAffirmationsEnabled !== false;
}

function getAnonymousAffirmationsChannelId() {
  return config.settings?.anonymousAffirmationsChannelId || null;
}

function getAnonymousAffirmationsCooldownMs() {
  const cooldown = Number(config.settings?.anonymousAffirmationsCooldownMs);
  return Number.isFinite(cooldown) && cooldown > 0 ? cooldown : 60 * 1000;
}

function isTikTokVerificationEnabled() {
  return Boolean(getTikTokHandle() && getVerificationRoleId());
}

function isVerificationCaptchaEnabled() {
  return config.settings?.verificationCaptchaEnabled === true;
}

function isVerificationApprovalRequired() {
  return config.settings?.verificationRequiresApproval === true;
}

function getPendingVerification(userId) {
  const list = Array.isArray(config.pendingVerifications) ? config.pendingVerifications : [];
  return list.find(entry => entry.userId === userId) || null;
}

async function approveVerification(pendingId, moderatorTag) {
  if (!Array.isArray(config.pendingVerifications)) config.pendingVerifications = [];
  const idx = config.pendingVerifications.findIndex(e => e.id === pendingId);
  if (idx === -1) return { ok: false, error: "Pending verification not found." };
  const entry = config.pendingVerifications[idx];
  config.pendingVerifications.splice(idx, 1);

  const verifiedRoleId = getVerificationRoleId();
  const unverifiedRoleId = getUnverifiedRoleId();
  const guild = client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID).catch(() => null);
  const member = guild ? await guild.members.fetch(entry.userId).catch(() => null) : null;

  if (member && verifiedRoleId) {
    if (!member.roles.cache.has(verifiedRoleId)) {
      await member.roles.add(verifiedRoleId, "Verification approved by admin").catch(() => {});
    }
    if (unverifiedRoleId && member.roles.cache.has(unverifiedRoleId)) {
      await member.roles.remove(unverifiedRoleId, "Verification approved by admin").catch(() => {});
    }
    await member.send("Your verification request has been approved. Welcome to the server!").catch(() => {});
  }

  saveConfig();
  recordAuditLog(moderatorTag, "verification-approved", { userId: entry.userId, userTag: entry.userTag });
  return { ok: true, entry };
}

async function denyVerification(pendingId, reason, moderatorTag) {
  if (!Array.isArray(config.pendingVerifications)) config.pendingVerifications = [];
  const idx = config.pendingVerifications.findIndex(e => e.id === pendingId);
  if (idx === -1) return { ok: false, error: "Pending verification not found." };
  const entry = config.pendingVerifications[idx];
  config.pendingVerifications.splice(idx, 1);

  const guild = client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID).catch(() => null);
  const member = guild ? await guild.members.fetch(entry.userId).catch(() => null) : null;
  if (member) {
    const msg = reason
      ? `Your verification request was denied. Reason: ${reason}`
      : "Your verification request was denied. Please contact a staff member if you have questions.";
    await member.send(msg).catch(() => {});
  }

  saveConfig();
  recordAuditLog(moderatorTag, "verification-denied", { userId: entry.userId, userTag: entry.userTag, reason: reason || "" });
  return { ok: true, entry };
}

function normalizeVerificationCaptchaInput(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function createVerificationCaptchaChallenge() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const length = 5;
  const bytes = crypto.randomBytes(length);
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += alphabet[bytes[index] % alphabet.length];
  }
  return code;
}

function setVerificationCaptchaChallenge(userId, code) {
  verificationCaptchaChallenges.set(userId, {
    code,
    expiresAt: Date.now() + 2 * 60 * 1000
  });
}

function getVerificationCaptchaChallenge(userId) {
  const challenge = verificationCaptchaChallenges.get(userId) || null;
  if (!challenge) return null;
  if (challenge.expiresAt <= Date.now()) {
    verificationCaptchaChallenges.delete(userId);
    return null;
  }
  return challenge;
}

function clearVerificationCaptchaChallenge(userId) {
  verificationCaptchaChallenges.delete(userId);
}

function shouldRequireVerificationCaptcha(member) {
  if (!isVerificationCaptchaEnabled() || !member?.user) {
    return { required: false, reason: null, accountAgeMs: null };
  }

  const accountAgeMs = getAccountAgeMs(member.user);
  const suspiciousAgeLimitMs = Number(config.automod?.raidAccountAgeLimitMs) || 0;
  if (suspiciousAgeLimitMs > 0 && accountAgeMs <= suspiciousAgeLimitMs) {
    return {
      required: true,
      reason: "new or suspicious account",
      accountAgeMs
    };
  }

  return { required: false, reason: null, accountAgeMs };
}

function getSelectedMochiRoleId(member) {
  if (!member?.roles?.cache) return null;
  return ALL_ROLES.find(roleId => roleId && member.roles.cache.has(roleId)) || null;
}

function getTikTokVerificationSetupIssues() {
  const issues = [];
  if (!getVerifyChannelId()) issues.push("verify channel");
  if (!getTikTokHandle()) issues.push("TikTok handle");
  if (!getVerificationRoleId()) issues.push("verified role");
  return issues;
}

function getRuleVerificationSetupIssues() {
  const issues = [];
  if (!getVerifyChannelId()) issues.push("verify channel");
  if (!getVerificationRoleId()) issues.push("verified role");
  return issues;
}

function matchesTikTokVerification(member) {
  const handle = normalizeVerificationText(getTikTokHandle());
  if (!handle) return false;
  const displayName = normalizeVerificationText(member?.displayName || member?.nickname || member?.user?.username || "");
  const aliases = getTikTokNicknameAliases();
  return Boolean(
    displayName &&
    (
      displayName.includes(handle) ||
      aliases.some(alias => displayName.includes(alias))
    )
  );
}

function buildTikTokVerificationSummary() {
  const handle = getTikTokHandle();
  const aliases = getTikTokNicknameAliases();
  return [
    `Verification mode: Rules + button verify`,
    `Verification CAPTCHA: ${isVerificationCaptchaEnabled() ? "Enabled (new/suspicious accounts only)" : "Disabled"}`,
    `TikTok bonus: ${handle ? `Enabled (@${handle})` : "Disabled"}`,
    `Saved nicknames: ${aliases.length}`,
    `Verified role: ${getVerificationRoleId() ? `<@&${getVerificationRoleId()}>` : "Not set"}`,
    `Unverified role: ${getUnverifiedRoleId() ? `<@&${getUnverifiedRoleId()}>` : "Not set"}`,
    `Welcome channel: ${getWelcomeChannelId() ? `<#${getWelcomeChannelId()}>` : "Not set"}`,
    `Bonus automation: ${isTikTokVerificationEnabled() ? "Enabled" : "Disabled"}`
  ].join("\n");
}

function buildRuleVerifyEmbed() {
  const verifiedRoleId = getVerificationRoleId();
  const unverifiedRoleId = getUnverifiedRoleId();
  const handle = getTikTokHandle();
  const captchaEnabled = isVerificationCaptchaEnabled();

  return makeEmbed({
    title: "Rules check + verification",
    description:
      "Most members use this quick path.\n\n" +
      "Read the rules, click the button once, and I’ll unlock the server for you.",
    color: COLORS.pink,
    fields: [
      { name: "1. Read the rules", value: "Make sure you’ve looked over the rules card in this channel.", inline: false },
      { name: "2. Click verify", value: "Press the button below to confirm you’ve read everything and get access.", inline: false },
      ...(captchaEnabled
        ? [{ name: "3. CAPTCHA", value: "A quick human check appears only for newer or suspicious accounts.", inline: false }]
        : []),
      { name: captchaEnabled ? "4. Optional bonus" : "3. Optional bonus", value: handle ? `TikTok matching can still run as a bonus path for @${handle}.` : "TikTok matching can be enabled later for special cases.", inline: false },
      { name: "🍥 Flavor roles", value: "React below if you want a flavor role. They are optional.", inline: false },
      { name: "How it works", value: captchaEnabled
        ? "1. Read the rules\n2. Click verify\n3. Solve the CAPTCHA if prompted\n4. React for an optional flavor role"
        : "1. Read the rules\n2. Click verify\n3. React for an optional flavor role", inline: false },
      { name: "Verified role", value: verifiedRoleId ? `<@&${verifiedRoleId}>` : "Not set", inline: true },
      { name: "Unverified role", value: unverifiedRoleId ? `<@&${unverifiedRoleId}>` : "Optional", inline: true }
    ],
    image: { url: "attachment://cute-rules-card.png" }
  });
}

function buildRuleVerifyComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("verify:rules-check")
        .setLabel("I Read the Rules")
        .setEmoji("📜")
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

async function postRuleVerifyPanel(source = "manual") {
  const setupIssues = getRuleVerificationSetupIssues();
  if (setupIssues.length) {
    const listed = setupIssues.length === 1
      ? setupIssues[0]
      : `${setupIssues.slice(0, -1).join(", ")} and ${setupIssues[setupIssues.length - 1]}`;
    throw new Error(`Set the ${listed} first.`);
  }

  const verifyChannelId = getVerifyChannelId();
  const verifyChannel = await client.channels.fetch(verifyChannelId).catch(() => null);
  if (!verifyChannel || typeof verifyChannel.send !== "function") {
    throw new Error("The verify channel could not be found.");
  }

  const botMember = verifyChannel.guild?.members?.me || verifyChannel.guild?.members?.cache?.get(client.user.id) || null;
  const requiredPermissions = ["ViewChannel", "SendMessages", "EmbedLinks"];
  if (botMember && typeof verifyChannel.permissionsFor === "function") {
    const permissions = verifyChannel.permissionsFor(botMember);
    const missing = requiredPermissions.filter(permission => !permissions?.has(PermissionFlagsBits[permission]));
    if (missing.length) {
      throw new Error(`I am missing permissions in the verify channel: ${missing.join(", ")}.`);
    }
  }

  const sentMessage = await verifyChannel.send({
    embeds: [buildRuleVerifyEmbed()],
    components: buildRuleVerifyComponents(),
    files: [buildCuteRulesCardAttachment()]
  });

  await addMochiRoleReactions(sentMessage);

  config.verifyMessageId = sentMessage.id;
  saveConfig();

  recordAuditLog(source, "verification-panel-posted", {
    channelId: verifyChannelId,
    messageId: sentMessage.id,
    verifiedRoleId: getVerificationRoleId(),
    unverifiedRoleId: getUnverifiedRoleId()
  });

  return {
    channelId: verifyChannelId,
    messageId: sentMessage.id,
    source
  };
}

function buildVerificationCaptchaModal(code) {
  const modal = new ModalBuilder()
    .setCustomId("verify:captcha")
    .setTitle("Verification CAPTCHA");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("captchaAnswer")
        .setLabel(`Type the code: ${code}`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(8)
    )
  );

  return modal;
}

async function completeRulesVerification(member) {
  const verifiedRoleId = getVerificationRoleId();
  const unverifiedRoleId = getUnverifiedRoleId();
  if (!verifiedRoleId) {
    return {
      ok: false,
      embed: makeEmbed({
        title: "Try again",
        description: "Ask staff to set the verified role first.",
        color: COLORS.red
      })
    };
  }

  if (isVerificationApprovalRequired()) {
    if (member.roles.cache.has(verifiedRoleId)) {
      return {
        ok: true,
        embed: makeEmbed({
          title: "You're already verified",
          description: "You already have access. Thanks for reading the rules.",
          color: COLORS.mint
        })
      };
    }
    const existing = getPendingVerification(member.id);
    if (existing) {
      return {
        ok: true,
        embed: makeEmbed({
          title: "Request pending",
          description: "Your verification request is already pending. An admin will review it soon.",
          color: COLORS.yellow
        })
      };
    }
    if (!Array.isArray(config.pendingVerifications)) config.pendingVerifications = [];
    config.pendingVerifications.push({
      id: crypto.randomUUID(),
      userId: member.id,
      userTag: member.user?.tag || member.user?.username || member.id,
      requestedAt: new Date().toISOString()
    });
    saveConfig();
    return {
      ok: true,
      embed: makeEmbed({
        title: "Request submitted",
        description: "Your verification request has been submitted. An admin will review it soon.",
        color: COLORS.blue
      })
    };
  }

  const rolesToAdd = member.roles.cache.has(verifiedRoleId) ? [] : [verifiedRoleId];
  const rolesToRemove = unverifiedRoleId && member.roles.cache.has(unverifiedRoleId) ? [unverifiedRoleId] : [];

  if (!rolesToAdd.length && !rolesToRemove.length) {
    return {
      ok: true,
      embed: makeEmbed({
        title: "You’re already verified",
        description: "You already have access. Thanks for reading the rules.",
        color: COLORS.mint
      })
    };
  }

  if (!member.manageable) {
    return {
      ok: false,
      embed: makeEmbed({
        title: "Try again",
        description: "I cannot manage your roles right now.",
        color: COLORS.red
      })
    };
  }

  if (rolesToRemove.length) {
    await member.roles.remove(rolesToRemove, "Rules check verification").catch(() => {});
  }

  if (rolesToAdd.length) {
    await member.roles.add(rolesToAdd, "Rules check verification").catch(() => {});
  }

  const bonusMatched = isTikTokVerificationEnabled() && matchesTikTokVerification(member);
  return {
    ok: true,
    embed: makeEmbed({
      title: "Verified",
      description: bonusMatched
        ? `You’re verified, and your nickname also matches the TikTok bonus setting for @${getTikTokHandle()}.`
        : "You’re verified. Welcome in.",
      color: COLORS.mint
    })
  };
}

async function postOnboardingRepair(source = "manual") {
  const rulesResult = await postRulesMessage(source).catch(error => {
    throw new Error(`Rules panel: ${error.message}`);
  });
  const verifyResult = await postRuleVerifyPanel(source).catch(error => {
    throw new Error(`Verify panel: ${error.message}`);
  });
  let bonusResult = null;
  if (isTikTokVerificationEnabled()) {
    bonusResult = await postTikTokVerifyPanel(source).catch(error => {
      throw new Error(`TikTok bonus panel: ${error.message}`);
    });
  }

  recordAuditLog(source, "onboarding-repaired", {
    rulesChannelId: rulesResult.channelId,
    verifyChannelId: verifyResult.channelId,
    verifyMessageId: verifyResult.messageId,
    bonusPanelPosted: Boolean(bonusResult),
    bonusChannelId: bonusResult?.channelId || null,
    bonusMessageId: bonusResult?.messageId || null
  });

  return {
    rules: rulesResult,
    verify: verifyResult,
    bonus: bonusResult
  };
}

async function syncTikTokVerification(member, source = "manual") {
  if (!member?.guild) {
    return { matched: false, changed: false, reason: "Member not found." };
  }

  const handle = getTikTokHandle();
  const verifiedRoleId = getVerificationRoleId();
  const unverifiedRoleId = getUnverifiedRoleId();
  if (!handle || (!verifiedRoleId && !unverifiedRoleId)) {
    return { matched: false, changed: false, reason: "TikTok verification is not configured." };
  }

  const matched = matchesTikTokVerification(member);
  const rolesToAdd = [];
  const rolesToRemove = [];

  if (matched) {
    if (verifiedRoleId && !member.roles.cache.has(verifiedRoleId)) {
      rolesToAdd.push(verifiedRoleId);
    }
    if (unverifiedRoleId && member.roles.cache.has(unverifiedRoleId)) {
      rolesToRemove.push(unverifiedRoleId);
    }
  }

  if (!rolesToAdd.length && !rolesToRemove.length) {
    return {
      matched,
      changed: false,
      reason: matched
        ? "Nickname already matches the TikTok bonus setting."
        : `Nickname does not match the TikTok bonus setting.`
    };
  }

  if ((rolesToAdd.length || rolesToRemove.length) && !member.manageable) {
    throw new Error("I cannot manage that member's roles.");
  }

  if (rolesToRemove.length) {
    await member.roles.remove(rolesToRemove, `TikTok verification sync (${source})`).catch(() => {});
  }

  if (rolesToAdd.length) {
    await member.roles.add(rolesToAdd, `TikTok verification sync (${source})`).catch(() => {});
  }

  return {
    matched,
    changed: Boolean(rolesToAdd.length || rolesToRemove.length),
    reason: matched
      ? `Verified as @${handle}.`
      : `Nickname does not match the TikTok bonus setting.`
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
      birthdays: parsed.birthdays && typeof parsed.birthdays === "object" ? parsed.birthdays : {},
      warnings: parsed.warnings && typeof parsed.warnings === "object" ? parsed.warnings : {},
      notes: parsed.notes && typeof parsed.notes === "object" ? parsed.notes : {},
      cases: Array.isArray(parsed.cases) ? parsed.cases : [],
      appeals: Array.isArray(parsed.appeals) ? parsed.appeals : [],
      generalChatInactivityWarnings: parsed.generalChatInactivityWarnings && typeof parsed.generalChatInactivityWarnings === "object"
        ? parsed.generalChatInactivityWarnings
        : {},
      auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog.slice(-200) : [],
      modTemplates: Array.isArray(parsed.modTemplates) ? parsed.modTemplates : defaults.modTemplates,
      webAccounts: Array.isArray(parsed.webAccounts)
        ? parsed.webAccounts.map(entry => sanitizeWebAccountRecord(entry)).filter(Boolean)
        : [],
      channelProfiles: typeof parsed.channelProfiles === "string" ? parsed.channelProfiles : "",
      reportSettings: {
        ...defaults.reportSettings,
        ...(parsed.reportSettings || {})
      },
      aiReviews: parsed.aiReviews && typeof parsed.aiReviews === "object" ? parsed.aiReviews : {},
      tempBans: Array.isArray(parsed.tempBans) ? parsed.tempBans : [],
      automod: {
        ...defaults.automod,
        ...(parsed.automod || {}),
        bannedWordList: Array.isArray(parsed.automod?.bannedWordList) ? parsed.automod.bannedWordList : [],
        bannedWordsContextSensitivity: Number.isFinite(Number(parsed.automod?.bannedWordsContextSensitivity))
          ? Math.max(0, Math.min(100, Number(parsed.automod.bannedWordsContextSensitivity)))
          : defaults.automod.bannedWordsContextSensitivity,
        allowedDomains: Array.isArray(parsed.automod?.allowedDomains) ? parsed.automod.allowedDomains : [],
        blockedDomains: Array.isArray(parsed.automod?.blockedDomains) ? parsed.automod.blockedDomains : [],
        allowedAttachmentExtensions: Array.isArray(parsed.automod?.allowedAttachmentExtensions) ? parsed.automod.allowedAttachmentExtensions : [],
        blockedAttachmentExtensions: Array.isArray(parsed.automod?.blockedAttachmentExtensions) ? parsed.automod.blockedAttachmentExtensions : defaults.automod.blockedAttachmentExtensions,
        nicknameBlockedTerms: Array.isArray(parsed.automod?.nicknameBlockedTerms) ? parsed.automod.nicknameBlockedTerms : [],
        scamPhraseList: Array.isArray(parsed.automod?.scamPhraseList) ? parsed.automod.scamPhraseList : [],
        aiModerationCategoryThresholds: parsed.automod?.aiModerationCategoryThresholds && typeof parsed.automod.aiModerationCategoryThresholds === "object"
          ? parsed.automod.aiModerationCategoryThresholds
          : {},
        aiModerationSuppressLowConfidenceReviews: parsed.automod?.aiModerationSuppressLowConfidenceReviews !== undefined
          ? Boolean(parsed.automod.aiModerationSuppressLowConfidenceReviews)
          : defaults.automod.aiModerationSuppressLowConfidenceReviews,
        googleBlockListEnabled: parsed.automod?.googleBlockListEnabled !== undefined ? Boolean(parsed.automod.googleBlockListEnabled) : defaults.automod.googleBlockListEnabled,
        googleBlockListUrl: typeof parsed.automod?.googleBlockListUrl === "string" ? parsed.automod.googleBlockListUrl : "",
        googleBlockListSyncMinutes: Number.isFinite(Number(parsed.automod?.googleBlockListSyncMinutes)) ? Number(parsed.automod.googleBlockListSyncMinutes) : defaults.automod.googleBlockListSyncMinutes,
        googleBlockListTerms: Array.isArray(parsed.automod?.googleBlockListTerms) ? parsed.automod.googleBlockListTerms : [],
        googleBlockListLastSyncedAt: typeof parsed.automod?.googleBlockListLastSyncedAt === "string" ? parsed.automod.googleBlockListLastSyncedAt : null,
        googleBlockListLastError: typeof parsed.automod?.googleBlockListLastError === "string" ? parsed.automod.googleBlockListLastError : null,
        googleBlockListLastCount: Number.isFinite(Number(parsed.automod?.googleBlockListLastCount)) ? Number(parsed.automod.googleBlockListLastCount) : 0,
        alertOnlyRules: Array.isArray(parsed.automod?.alertOnlyRules) ? parsed.automod.alertOnlyRules : defaults.automod.alertOnlyRules,
        ruleActions: parsed.automod?.ruleActions && typeof parsed.automod.ruleActions === "object" ? parsed.automod.ruleActions : {},
        channelRuleOverrides: parsed.automod?.channelRuleOverrides && typeof parsed.automod.channelRuleOverrides === "object"
          ? parsed.automod.channelRuleOverrides
          : {},
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
      nextCaseId: Number.isInteger(parsed.nextCaseId) ? parsed.nextCaseId : defaults.nextCaseId,
      nextAppealId: Number.isInteger(parsed.nextAppealId) ? parsed.nextAppealId : defaults.nextAppealId,
      pendingVerifications: Array.isArray(parsed.pendingVerifications) ? parsed.pendingVerifications : []
    };
  } catch (error) {
    log.warn("Failed to load config; using defaults.", error);
    return defaults;
  }
}

let config = loadConfig();

if (!config.automod.ruleActions?.["ai-review"] && !config.automod.alertOnlyRules.includes("ai-review")) {
  config.automod.alertOnlyRules.push("ai-review");
}

function saveConfig() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function cloneAuditValue(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.slice();
  if (typeof value === "object") return JSON.parse(JSON.stringify(value));
  return value;
}

function buildAuditDiff(before = {}, after = {}, keys = []) {
  const changes = [];
  for (const key of keys) {
    const previous = cloneAuditValue(before?.[key]);
    const next = cloneAuditValue(after?.[key]);
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;
    changes.push({ key, before: previous, after: next });
  }
  return changes;
}

function recordAuditLog(actorTag, action, details = {}) {
  if (!Array.isArray(config.auditLog)) config.auditLog = [];
  config.auditLog.push({
    actorTag: actorTag || "System",
    action,
    details,
    createdAt: new Date().toISOString()
  });
  config.auditLog = config.auditLog.slice(-200);
  saveConfig();
}

function isMessageArchiveEnabled() {
  return Boolean(config.settings?.messageArchiveEnabled);
}

function getMessageArchiveRetentionDays() {
  const days = Number(config.settings?.messageArchiveRetentionDays);
  if (!Number.isFinite(days)) return 30;
  return Math.max(1, Math.min(3650, Math.floor(days)));
}

function buildDiscordMessageUrl(guildId, channelId, messageId) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

function parseMessageArchiveLine(line) {
  if (!line || !line.trim()) return null;
  try {
    const parsed = JSON.parse(line);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.id || !parsed.userId || !parsed.channelId || !parsed.createdAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readMessageArchiveEntries() {
  if (!fs.existsSync(messageArchivePath)) return [];
  const raw = fs.readFileSync(messageArchivePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map(parseMessageArchiveLine)
    .filter(Boolean);
}

function pruneMessageArchive(force = false) {
  if (!isMessageArchiveEnabled()) return;
  const retentionDays = getMessageArchiveRetentionDays();
  if (!retentionDays) return;
  if (!force && Date.now() - messageArchiveLastPruneAt < 5 * 60 * 1000) return;
  if (!fs.existsSync(messageArchivePath)) return;

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const kept = readMessageArchiveEntries().filter(entry => Number(entry.createdTimestamp || 0) >= cutoff);
  const output = kept.map(entry => JSON.stringify(entry)).join("\n");
  fs.writeFileSync(messageArchivePath, output ? `${output}\n` : "");
  messageArchiveLastPruneAt = Date.now();
}

function recordMessageArchive(message) {
  if (!message?.guild || !message.author || message.author.bot || !message.member) return;
  if (!isMessageArchiveEnabled()) return;

  fs.mkdirSync(dataDir, { recursive: true });
  const entry = {
    id: message.id,
    userId: message.author.id,
    userTag: message.author.tag || `${message.author.username || "Unknown"}#0000`,
    guildId: message.guild.id,
    channelId: message.channel?.id || null,
    channelName: message.channel?.name || message.channel?.parent?.name || "Unknown channel",
    channelMention: typeof message.channel?.toString === "function"
      ? message.channel.toString()
      : message.channel?.id
        ? `<#${message.channel.id}>`
        : "Unknown channel",
    content: String(message.content || "").replace(/\r?\n/g, " ").trim().slice(0, 2000) || "No text content",
    createdAt: message.createdAt?.toISOString?.() || new Date(message.createdTimestamp || Date.now()).toISOString(),
    createdTimestamp: message.createdTimestamp || Date.now(),
    url: message.url || buildDiscordMessageUrl(message.guild.id, message.channel?.id || "unknown", message.id)
  };

  fs.appendFileSync(messageArchivePath, `${JSON.stringify(entry)}\n`);
  pruneMessageArchive();
}

function getGeneralChatInactiveThresholdMs() {
  return 60 * 24 * 60 * 60 * 1000;
}

function isGeneralChatKickExempt(member) {
  if (!member || member.user?.bot) return true;
  if (member.id === member.guild?.ownerId) return true;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageMessages)) return true;
  if (config.automod?.exemptUserIds?.includes(member.id)) return true;
  return member.roles?.cache?.some(role => config.automod?.exemptRoleIds?.includes(role.id)) || false;
}

async function resolveGeneralChatChannel(guild) {
  const configuredId = getGeneralChatChannelId();
  if (configuredId) {
    const channel = await guild.channels.fetch(configuredId).catch(() => null);
    if (channel) return channel;
  }

  const fallbackNames = new Set(["general", "general-chat", "main-chat", "chat"]);
  const channel = [...guild.channels.cache.values()].find(item => {
    if (!item || !item.isTextBased?.()) return false;
    const name = String(item.name || "").toLowerCase();
    return fallbackNames.has(name);
  }) || null;

  return channel;
}

async function buildGeneralChatActivityMap(channel, cutoffTimestamp) {
  if (!channel?.messages?.fetch) return new Map();

  const latestByUser = new Map();
  let before = null;

  for (let page = 0; page < 25; page += 1) {
    const messages = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {})
    }).catch(() => null);

    if (!messages?.size) break;

    for (const message of messages.values()) {
      if (message.author?.bot) continue;
      const timestamp = message.createdTimestamp || Date.now();
      if (timestamp < cutoffTimestamp) continue;
      const current = latestByUser.get(message.author.id) || 0;
      if (timestamp > current) {
        latestByUser.set(message.author.id, timestamp);
      }
    }

    const oldest = [...messages.values()].reduce((min, message) => {
      if (!min) return message;
      return message.createdTimestamp < min.createdTimestamp ? message : min;
    }, null);

    before = oldest?.id || null;
    if (!before || (oldest?.createdTimestamp || 0) < cutoffTimestamp || messages.size < 100) {
      break;
    }
  }

  return latestByUser;
}

async function buildGeneralChatRuleStatus(guild = null, limit = 10) {
  const targetGuild = guild || await client.guilds.fetch(GUILD_ID).catch(() => client.guilds.cache.get(GUILD_ID) || null);
  if (!targetGuild) {
    return {
      enabled: isGeneralChatInactivityEnabled(),
      channelId: getGeneralChatChannelId(),
      channelName: null,
      thresholdDays: 60,
      checkedAt: new Date().toISOString(),
      skipped: "guild-missing",
      membersAtRisk: [],
      atRiskCount: 0,
      lastRun: null
    };
  }

  const generalChannel = await resolveGeneralChatChannel(targetGuild);
  if (!generalChannel) {
    return {
      enabled: isGeneralChatInactivityEnabled(),
      channelId: getGeneralChatChannelId(),
      channelName: null,
      thresholdDays: 60,
      checkedAt: new Date().toISOString(),
      skipped: "general-channel-missing",
      membersAtRisk: [],
      atRiskCount: 0,
      lastRun: null
    };
  }

  const botMember = targetGuild.members.me || await targetGuild.members.fetchMe().catch(() => null);
  const permissions = typeof generalChannel.permissionsFor === "function" ? generalChannel.permissionsFor(botMember) : null;
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])) {
    return {
      enabled: isGeneralChatInactivityEnabled(),
      channelId: getGeneralChatChannelId() || null,
      channelName: generalChannel.name || null,
      thresholdDays: 60,
      checkedAt: new Date().toISOString(),
      skipped: "missing-channel-permissions",
      membersAtRisk: [],
      atRiskCount: 0,
      lastRun: null
    };
  }

  const cutoffTimestamp = Date.now() - getGeneralChatInactiveThresholdMs();
  const warningTimestamp = Date.now() - (53 * 24 * 60 * 60 * 1000);
  const recentActivity = await buildGeneralChatActivityMap(generalChannel, cutoffTimestamp);
  const members = await targetGuild.members.fetch().catch(() => targetGuild.members.cache);
  const membersAtRisk = [];

  for (const member of members.values()) {
    if (isGeneralChatKickExempt(member)) continue;

    const lastChatAt = recentActivity.get(member.id) || member.joinedTimestamp || 0;
    if (lastChatAt && lastChatAt >= cutoffTimestamp) continue;

    const lastActiveText = lastChatAt ? `<t:${Math.floor(lastChatAt / 1000)}:F>` : "their join date";
    const warningSent = wasGeneralChatWarningSent(member.id, lastChatAt);
    const warningDue = Boolean(lastChatAt && lastChatAt < warningTimestamp && lastChatAt >= cutoffTimestamp);
    membersAtRisk.push({
      userId: member.user.id,
      tag: member.user.tag,
      lastActiveAt: lastChatAt ? new Date(lastChatAt).toISOString() : null,
      lastActiveText,
      daysInactive: Math.max(0, Math.ceil((Date.now() - lastChatAt) / (24 * 60 * 60 * 1000))),
      kickable: Boolean(member.kickable),
      warningSent,
      warningDue
    });
  }

  membersAtRisk.sort((a, b) => b.daysInactive - a.daysInactive || a.tag.localeCompare(b.tag));

  return {
    enabled: isGeneralChatInactivityEnabled(),
    channelId: generalChannel.id,
    channelName: generalChannel.name || null,
    thresholdDays: 60,
    warningDays: 53,
    checkedAt: new Date().toISOString(),
    skipped: null,
    membersAtRisk: membersAtRisk.slice(0, limit),
    atRiskCount: membersAtRisk.length,
    warningDueCount: membersAtRisk.filter(member => member.warningDue).length,
    warningSentCount: membersAtRisk.filter(member => member.warningSent).length,
    lastRun: null
  };
}

async function enforceGeneralChatActivity(guild = null, options = {}) {
  const force = Boolean(options.force);
  if (!force && !isGeneralChatInactivityEnabled()) {
    return { checked: 0, kicked: 0, skipped: "disabled" };
  }

  const targetGuild = guild || await client.guilds.fetch(GUILD_ID).catch(() => client.guilds.cache.get(GUILD_ID) || null);
  if (!targetGuild) return { checked: 0, kicked: 0, skipped: "guild-missing" };

  const generalChannel = await resolveGeneralChatChannel(targetGuild);
  if (!generalChannel) return { checked: 0, kicked: 0, skipped: "general-channel-missing" };

  const botMember = targetGuild.members.me || await targetGuild.members.fetchMe().catch(() => null);
  const permissions = typeof generalChannel.permissionsFor === "function" ? generalChannel.permissionsFor(botMember) : null;
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])) {
    return { checked: 0, kicked: 0, skipped: "missing-channel-permissions" };
  }

  const cutoffTimestamp = Date.now() - getGeneralChatInactiveThresholdMs();
  const warningTimestamp = Date.now() - (53 * 24 * 60 * 60 * 1000);
  const recentActivity = await buildGeneralChatActivityMap(generalChannel, cutoffTimestamp);
  const members = await targetGuild.members.fetch().catch(() => targetGuild.members.cache);
  let checked = 0;
  let warned = 0;
  let kicked = 0;

  for (const member of members.values()) {
    if (isGeneralChatKickExempt(member)) continue;
    checked += 1;

    const lastChatAt = recentActivity.get(member.id) || member.joinedTimestamp || 0;
    if (lastChatAt && lastChatAt >= cutoffTimestamp) continue;

    const lastActiveText = lastChatAt ? `<t:${Math.floor(lastChatAt / 1000)}:F>` : "their join date";
    const shouldWarn = Boolean(lastChatAt && lastChatAt < warningTimestamp && lastChatAt >= cutoffTimestamp);
    const warningAlreadySent = wasGeneralChatWarningSent(member.id, lastChatAt);

    if (shouldWarn && !warningAlreadySent) {
      const warningReason = `No activity in ${generalChannel.name || "general chat"} for nearly 2 months. Last activity: ${lastActiveText}.`;
      const warningEntry = addCase({
        action: "automod:inactive-general-chat-warning",
        targetId: member.user.id,
        targetTag: member.user.tag,
        moderatorTag: "AutoMod",
        reason: warningReason,
        details: [
          { name: "Channel", value: `#${generalChannel.name || generalChannel.id}`, inline: true },
          { name: "Last activity", value: lastActiveText, inline: true },
          { name: "Follow-up", value: "Kick in about one week if there is still no activity.", inline: false }
        ]
      });

      await member.user.send({
        embeds: [
          makeEmbed({
            title: "A gentle reminder",
            description: `You have about one week before you may be kicked from **${targetGuild.name}** for not chatting in ${generalChannel}.`,
            color: COLORS.yellow,
            fields: [
              { name: "Last activity", value: lastActiveText, inline: true },
              { name: "Channel", value: `${generalChannel}`, inline: true },
              { name: "What to do", value: "Send a message in general chat to keep your spot.", inline: false }
            ]
          })
        ]
      }).catch(() => {});

      markGeneralChatWarningSent(member.id, lastChatAt);
      recordAutoModAnalytics("inactive-general-chat-warning", warningReason, member.user.tag);
      warned += 1;

      await logAutoModEmbed(
        makeEmbed({
          title: `Auto mod case #${warningEntry.id}`,
          description: `${member.user.tag} was warned about general chat inactivity.`,
          color: COLORS.yellow,
          fields: buildCaseFields(warningEntry)
        })
      );
    }

    if (!member.kickable) continue;
    const reason = `No activity in ${generalChannel.name || "general chat"} for 2 months. Last activity: ${lastActiveText}.`;
    const entry = addCase({
      action: "automod:inactive-general-chat",
      targetId: member.user.id,
      targetTag: member.user.tag,
      moderatorTag: "AutoMod",
      reason,
      details: [
        { name: "Channel", value: `#${generalChannel.name || generalChannel.id}`, inline: true },
        { name: "Last activity", value: lastActiveText, inline: true }
      ]
      });

    await member.user.send({
      embeds: [
        makeEmbed({
          title: "A gentle goodbye",
          description: `You were removed from **${targetGuild.name}** because there was no activity in ${generalChannel} for more than two months.`,
          color: COLORS.purple
        })
      ]
    }).catch(() => {});

    await member.kick(reason).catch(() => {});
    clearGeneralChatWarning(member.user.id);
    recordAutoModAnalytics("inactive-general-chat", reason, member.user.tag);
    kicked += 1;

    await logAutoModEmbed(
      makeEmbed({
        title: `Auto mod case #${entry.id}`,
        description: `${member.user.tag} was kicked for inactivity in ${generalChannel.name || "general chat"}.`,
        color: COLORS.red,
        fields: buildCaseFields(entry)
      })
    );
  }

  return { checked, warned, kicked, skipped: null };
}

function startGeneralChatSweep() {
  if (generalChatSweepInterval) clearInterval(generalChatSweepInterval);
  generalChatSweepInterval = setInterval(() => {
    enforceGeneralChatActivity().catch(error => {
      log.error("General chat sweep error.", error);
    });
  }, 6 * 60 * 60 * 1000);
}

function getVerifyChannelId() {
  return config.settings.verifyChannelId || VERIFY_CHANNEL_ID;
}

function getVerifyChannelMention() {
  const verifyChannelId = getVerifyChannelId();
  return verifyChannelId ? `<#${verifyChannelId}>` : "the verify channel";
}

function getRulesChannelId() {
  return config.settings.rulesChannelId || RULES_CHANNEL_ID;
}

function getRulesCardTitle() {
  return normalizeRulesCardText(config.settings.rulesCardTitle || "Server rules ✿", 120) || "Server rules ✿";
}

function getRulesCardDescription() {
  return normalizeRulesCardText(
    config.settings.rulesCardDescription || "A cozy little guide to keep the server kind, comfy, and fun for everyone. Thanks for helping keep Mochi sweet and safe.",
    500
  ) || "A cozy little guide to keep the server kind, comfy, and fun for everyone. Thanks for helping keep Mochi sweet and safe.";
}

function getRulesCardLines() {
  const raw = Array.isArray(config.settings.rulesCardRules)
    ? config.settings.rulesCardRules.join("\n")
    : String(config.settings.rulesCardRules || "");
  const lines = raw
    .split(/\r?\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 25);
  return lines.length ? lines : [
    "Be kind, thoughtful, and respectful to everyone.",
    "Please keep spam, harassment, and drama out of the chat.",
    "Follow Discord's Terms of Service and community rules.",
    "Use each channel for its intended purpose.",
    "Stay active in general chat within two months, or you may be kicked from the server.",
    "Please use the verify button in the verify channel so you can fully access the server."
  ];
}

function getLogChannelId() {
  return config.settings.logChannelId || LOG_CHANNEL_ID;
}

function getAutoModLogChannelId() {
  return config.settings.automodLogChannelId || getLogChannelId();
}

function getMutedRoleId() {
  return config.settings.mutedRoleId || null;
}

function getBirthdayRoleId() {
  return config.settings.birthdayRoleId || null;
}

function getBirthdayAnnouncementChannelId() {
  return config.settings.birthdayAnnouncementChannelId || null;
}

function getBirthdayStore() {
  if (!config.birthdays || typeof config.birthdays !== "object") {
    config.birthdays = {};
  }
  return config.birthdays;
}

function normalizeBirthdayMonthDay(month, day) {
  const parsedMonth = Number(month);
  const parsedDay = Number(day);
  if (!Number.isInteger(parsedMonth) || !Number.isInteger(parsedDay)) return null;
  if (parsedMonth < 1 || parsedMonth > 12) return null;
  if (parsedDay < 1 || parsedDay > 31) return null;

  const testDate = new Date(Date.UTC(2024, parsedMonth - 1, parsedDay));
  if (testDate.getUTCMonth() !== parsedMonth - 1 || testDate.getUTCDate() !== parsedDay) {
    return null;
  }

  return {
    month: parsedMonth,
    day: parsedDay
  };
}

function formatBirthdayMonthDay(month, day) {
  return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

function getBirthdayEntry(userId) {
  return getBirthdayStore()[userId] || null;
}

function setBirthdayEntry(userId, month, day) {
  const normalized = normalizeBirthdayMonthDay(month, day);
  if (!normalized) return null;

  const store = getBirthdayStore();
  const current = store[userId] || {};
  store[userId] = {
    ...current,
    month: normalized.month,
    day: normalized.day,
    public: true,
    updatedAt: new Date().toISOString()
  };
  saveConfig();
  return store[userId];
}

function removeBirthdayEntry(userId) {
  const store = getBirthdayStore();
  if (!store[userId]) return false;
  delete store[userId];
  saveConfig();
  return true;
}

function getBirthdayKey(month, day) {
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getBirthdayTodayKey(date = new Date()) {
  return getBirthdayKey(date.getMonth() + 1, date.getDate());
}

function getNextBirthdayDate(month, day, fromDate = new Date()) {
  const year = fromDate.getFullYear();
  let next = new Date(year, month - 1, day, 9, 0, 0, 0);
  if (next < fromDate) {
    next = new Date(year + 1, month - 1, day, 9, 0, 0, 0);
  }
  return next;
}

function buildBirthdaySummary() {
  const birthdays = Object.entries(getBirthdayStore());
  return [
    `Birthday role: ${getBirthdayRoleId() ? `<@&${getBirthdayRoleId()}>` : "Not set"}`,
    `Announcement channel: ${getBirthdayAnnouncementChannelId() ? `<#${getBirthdayAnnouncementChannelId()}>` : "Not set"}`,
    `Saved birthdays: ${birthdays.length}`,
    `Role duration: ${formatDuration(BIRTHDAY_ROLE_DURATION_MS)}`,
    `Mode: ${birthdays.length ? "Public month/day birthday giggles" : "No birthdays saved yet"}`
  ].join("\n");
}

function buildBirthdayDescription(entry, userTag = null) {
  if (!entry) return "No birthday set.";
  const label = userTag ? `${userTag}` : "This member";
  return [
    `${label} has a public birthday saved. Cute.`,
    `Birthday: ${formatBirthdayMonthDay(entry.month, entry.day)}`,
    `Role duration: ${formatDuration(BIRTHDAY_ROLE_DURATION_MS)}`,
    entry.public === false ? "Visibility: private" : "Visibility: public"
  ].join("\n");
}

function buildBirthdayCardAttachment() {
  return {
    attachment: fs.readFileSync(path.join(__dirname, "assets", "birthday-card.png")),
    name: "birthday-card.png"
  };
}

function buildBirthdayEmbed(user, entry) {
  return makeEmbed({
    title: "Birthday profile",
    description: buildBirthdayDescription(entry, user?.tag || user?.username || null),
    color: COLORS.pink,
    fields: user
      ? [
          { name: "User", value: `${user.tag || user.username || user.id}`, inline: true },
          { name: "Birthday", value: entry ? formatBirthdayMonthDay(entry.month, entry.day) : "Not set", inline: true },
          { name: "Public", value: entry ? (entry.public === false ? "No" : "Yes") : "No", inline: true }
        ]
      : []
  });
}

function buildBirthdayPanelEmbed() {
  return makeEmbed({
    title: "Birthday giggle nook",
    description:
      "Tap the button below and tell me your month and day.\n\n" +
      "I’ll tuck it into the birthday giggle nook, hand out the birthday role for 24 hours, and post a silly-sweet birthday cheer when your day comes around.",
    color: COLORS.pink,
    fields: [
      { name: "Privacy", value: "Only month and day are stored. No year is saved.", inline: false },
      { name: "Reward", value: `Birthday role lasts ${formatDuration(BIRTHDAY_ROLE_DURATION_MS)}.`, inline: true },
      { name: "Public", value: "Birthdays are visible to staff and can be listed publicly.", inline: true }
    ],
    image: { url: "attachment://birthday-card.png" }
  });
}

function buildBirthdayPanelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("birthday:set")
        .setLabel("Set My Birthday")
        .setEmoji("🎂")
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

function buildBirthdayModal() {
  const modal = new ModalBuilder()
    .setCustomId("birthday:set")
    .setTitle("Drop your birthday");

  const monthInput = new TextInputBuilder()
    .setCustomId("birthdayMonth")
    .setLabel("Birthday month")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("1-12")
    .setMaxLength(2);

  const dayInput = new TextInputBuilder()
    .setCustomId("birthdayDay")
    .setLabel("Birthday day")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("1-31")
    .setMaxLength(2);

  modal.addComponents(
    new ActionRowBuilder().addComponents(monthInput),
    new ActionRowBuilder().addComponents(dayInput)
  );
  return modal;
}

function buildBirthdayListEmbed(limit = 10) {
  const upcoming = getUpcomingBirthdays(limit);
  return makeEmbed({
    title: "Upcoming birthdays",
    description: upcoming.length
      ? upcoming.map((entry, index) => `${index + 1}. <@${entry.userId}> - ${formatBirthdayMonthDay(entry.month, entry.day)} - <t:${Math.floor(entry.nextBirthday.getTime() / 1000)}:R>`).join("\n")
      : "No birthdays have been saved yet.",
    color: COLORS.blue
  });
}

async function postBirthdayPanel(source = "manual") {
  const channelId = getBirthdayAnnouncementChannelId();
  if (!channelId) {
    throw new Error("Set a birthday announcement channel first.");
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.send) {
    throw new Error("The birthday announcement channel could not be found or cannot send messages.");
  }

  const message = await channel.send({
    embeds: [buildBirthdayPanelEmbed()],
    components: buildBirthdayPanelComponents(),
    files: [buildBirthdayCardAttachment()]
  });

  recordAuditLog(source, "birthday-panel-posted", {
    channelId,
    messageId: message.id
  });

  return message;
}

function getUpcomingBirthdays(limit = 10, fromDate = new Date()) {
  return Object.entries(getBirthdayStore())
    .map(([userId, entry]) => {
      const nextBirthday = getNextBirthdayDate(entry.month, entry.day, fromDate);
      return {
        userId,
        ...entry,
        nextBirthday
      };
    })
    .sort((a, b) => a.nextBirthday - b.nextBirthday)
    .slice(0, limit);
}

function normalizeWebLoginUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function normalizeWebAccessLevel(value) {
  return String(value || "").trim().toLowerCase() === "admin" ? "admin" : "mod";
}

function normalizeWebDiscordId(value) {
  return String(value || "").trim().replace(/[<@!>]/g, "") || null;
}

function sanitizeWebAccountRecord(entry) {
  if (!entry || typeof entry !== "object") return null;
  const username = String(entry.username || "").trim();
  if (!username) return null;

  return {
    username,
    usernameLower: normalizeWebLoginUsername(username),
    accessLevel: normalizeWebAccessLevel(entry.accessLevel),
    discordUserId: normalizeWebDiscordId(entry.discordUserId),
    enabled: entry.enabled !== false,
    passwordHash: typeof entry.passwordHash === "string" ? entry.passwordHash : "",
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : new Date().toISOString(),
    lastLoginAt: typeof entry.lastLoginAt === "string" ? entry.lastLoginAt : null,
    lastLoginMode: typeof entry.lastLoginMode === "string" ? entry.lastLoginMode : null,
    loginAudit: Array.isArray(entry.loginAudit)
      ? entry.loginAudit.map(item => sanitizeWebAccountLoginAuditEntry(item)).filter(Boolean).slice(-20)
      : []
  };
}

function sanitizeWebAccountLoginAuditEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString();
  const mode = typeof entry.mode === "string" ? entry.mode.trim().toLowerCase() : "login";
  return {
    createdAt,
    mode,
    source: typeof entry.source === "string" ? entry.source.trim() : "",
    note: typeof entry.note === "string" ? entry.note.trim() : ""
  };
}

function appendWebAccountLoginAudit(account, entry) {
  if (!account || typeof account !== "object") return null;
  const auditEntry = sanitizeWebAccountLoginAuditEntry({
    createdAt: new Date().toISOString(),
    ...entry
  });
  if (!auditEntry) return null;

  if (!Array.isArray(account.loginAudit)) {
    account.loginAudit = [];
  }

  account.loginAudit.push(auditEntry);
  account.loginAudit = account.loginAudit.slice(-20);
  account.lastLoginAt = auditEntry.createdAt;
  account.lastLoginMode = auditEntry.mode;
  account.updatedAt = auditEntry.createdAt;
  saveConfig();
  return auditEntry;
}

function getWebAccounts() {
  if (!Array.isArray(config.webAccounts)) {
    config.webAccounts = [];
  }
  config.webAccounts = config.webAccounts.map(entry => sanitizeWebAccountRecord(entry)).filter(Boolean);
  return config.webAccounts;
}

function getWebAccountByUsername(username) {
  const normalized = normalizeWebLoginUsername(username);
  if (!normalized) return null;
  return getWebAccounts().find(account => account.usernameLower === normalized) || null;
}

function getWebAccountByDiscordId(discordUserId) {
  const normalized = normalizeWebDiscordId(discordUserId);
  if (!normalized) return null;
  return getWebAccounts().find(account => account.discordUserId === normalized) || null;
}

function hashWebAccountPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const iterations = 120000;
  const digest = crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2$sha256$${iterations}$${salt}$${digest}`;
}

function verifyWebAccountPassword(password, passwordHash) {
  const parts = String(passwordHash || "").split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") return false;

  const iterations = Number(parts[2]);
  const salt = parts[3];
  const expected = parts[4];
  if (!Number.isInteger(iterations) || !salt || !expected) return false;

  const actual = crypto.pbkdf2Sync(String(password || ""), salt, iterations, Buffer.from(expected, "hex").length, "sha256").toString("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function serializeWebAccount(account) {
  return {
    username: account.username,
    accessLevel: account.accessLevel,
    discordUserId: account.discordUserId,
    enabled: account.enabled,
    hasPassword: Boolean(account.passwordHash),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    lastLoginAt: account.lastLoginAt,
    lastLoginMode: account.lastLoginMode,
    loginAudit: Array.isArray(account.loginAudit) ? account.loginAudit.slice(-10) : [],
    loginAuditCount: Array.isArray(account.loginAudit) ? account.loginAudit.length : 0
  };
}

function serializeWebAccounts() {
  return getWebAccounts().map(account => serializeWebAccount(account));
}

function upsertWebAccount(input) {
  const username = String(input?.username || "").trim();
  const normalizedUsername = normalizeWebLoginUsername(username);
  if (!normalizedUsername) {
    throw new Error("Username is required.");
  }

  const accessLevel = normalizeWebAccessLevel(input?.accessLevel);
  const enabled = input?.enabled !== false;
  const discordUserId = normalizeWebDiscordId(input?.discordUserId);
  const password = String(input?.password || "").trim();
  const passwordConfirm = String(input?.passwordConfirm || "").trim();
  const originalUsername = normalizeWebLoginUsername(input?.originalUsername);
  const existing = originalUsername
    ? getWebAccountByUsername(originalUsername)
    : getWebAccountByUsername(username);

  const duplicateUsername = getWebAccounts().find(account =>
    account.usernameLower === normalizedUsername && account !== existing
  );
  if (duplicateUsername) {
    throw new Error("That web username is already in use.");
  }

  if (password && passwordConfirm && password !== passwordConfirm) {
    throw new Error("Password and confirmation do not match.");
  }

  if ((!existing || !existing.passwordHash) && !password) {
    throw new Error("Set a password for new web accounts.");
  }

  if (password && password.length < 8) {
    throw new Error("Use a password with at least 8 characters.");
  }

  if (discordUserId) {
    const duplicate = getWebAccounts().find(account =>
      account.discordUserId === discordUserId &&
      account.usernameLower !== (existing ? existing.usernameLower : normalizedUsername)
    );
    if (duplicate) {
      throw new Error(`Discord user ID is already linked to ${duplicate.username}.`);
    }
  }

  if (existing) {
    existing.username = username;
    existing.usernameLower = normalizedUsername;
    existing.accessLevel = accessLevel;
    existing.discordUserId = discordUserId;
    existing.enabled = enabled;
    if (password) {
      existing.passwordHash = hashWebAccountPassword(password);
    }
    existing.updatedAt = new Date().toISOString();
    saveConfig();
    return existing;
  }

  const account = sanitizeWebAccountRecord({
    username,
    accessLevel,
    discordUserId,
    enabled,
    passwordHash: hashWebAccountPassword(password),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastLoginAt: null,
    lastLoginMode: null
  });

  getWebAccounts().push(account);
  saveConfig();
  return account;
}

function deleteWebAccount(username) {
  const normalized = normalizeWebLoginUsername(username);
  if (!normalized) return false;
  const accounts = getWebAccounts();
  const index = accounts.findIndex(account => account.usernameLower === normalized);
  if (index < 0) return false;
  accounts.splice(index, 1);
  saveConfig();
  return true;
}

function toggleWebAccountEnabled(username, enabled = null) {
  const account = getWebAccountByUsername(username);
  if (!account) return null;
  account.enabled = enabled === null ? !account.enabled : Boolean(enabled);
  account.updatedAt = new Date().toISOString();
  saveConfig();
  return account;
}

function resetWebAccountPassword(username, password = "") {
  const account = getWebAccountByUsername(username);
  if (!account) return null;
  const nextPassword = String(password || "").trim() || crypto.randomBytes(10).toString("base64url");
  account.passwordHash = hashWebAccountPassword(nextPassword);
  account.updatedAt = new Date().toISOString();
  saveConfig();
  return { account, password: nextPassword };
}

function getBannedWords() {
  return Array.isArray(config.automod.bannedWordList) ? config.automod.bannedWordList : [];
}

function getBannedWordsContextSensitivity() {
  const sensitivity = Number(config.automod.bannedWordsContextSensitivity);
  if (!Number.isFinite(sensitivity)) return 65;
  return Math.max(0, Math.min(100, sensitivity));
}

function normalizeBlockListTerms(value) {
  return [...new Set(
    String(value || "")
      .split(/\r?\n/)
      .flatMap(line => line.split(/[;,]/))
      .map(term => term.replace(/^[*-•]\s*/, "").trim())
      .filter(term => term && !term.startsWith("#") && !term.startsWith("//"))
      .map(term => normalizeComparisonText(term))
      .filter(Boolean)
  )];
}

function getNicknameBlockedTerms() {
  const localTerms = Array.isArray(config.automod.nicknameBlockedTerms) ? config.automod.nicknameBlockedTerms : [];
  const googleTerms = Array.isArray(config.automod.googleBlockListTerms) ? config.automod.googleBlockListTerms : [];
  return [...new Set([...localTerms, ...googleTerms].map(term => normalizeComparisonText(term)).filter(Boolean))];
}

function getAlertOnlyRules() {
  return Array.isArray(config.automod.alertOnlyRules) ? config.automod.alertOnlyRules : [];
}

function getScamPhrases() {
  const customPhrases = Array.isArray(config.automod.scamPhraseList) ? config.automod.scamPhraseList : [];
  return [...new Set([...BUILT_IN_SCAM_PHRASES, ...customPhrases].map(value => normalizeComparisonText(value)).filter(Boolean))];
}

function getGoogleBlockListRefreshMs() {
  const minutes = Number(config.automod?.googleBlockListSyncMinutes);
  const normalized = Number.isFinite(minutes) ? Math.max(5, Math.min(1440, minutes)) : 15;
  return normalized * 60 * 1000;
}

function getGoogleBlockListDocId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const publishedMatch = raw.match(/docs\.google\.com\/document\/d\/e\/([a-zA-Z0-9_-]+)\/pub/i);
  if (publishedMatch) return publishedMatch[1];
  const urlMatch = raw.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/i);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw)) return raw;
  return "";
}

function getGoogleBlockListExportUrl(value) {
  const docId = getGoogleBlockListDocId(value);
  return docId ? `https://docs.google.com/document/d/${docId}/export?format=txt` : "";
}

function getGoogleBlockListFetchCandidates(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];

  if (/docs\.google\.com\/document\/d\/e\/[a-zA-Z0-9_-]+\/pub/i.test(raw)) {
    return raw.includes("?") ? [raw, raw.split("?")[0] + "?output=txt"] : [`${raw}?output=txt`, raw];
  }

  const exportUrl = getGoogleBlockListExportUrl(raw);
  if (exportUrl) return [exportUrl];

  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw)) {
    return [`https://docs.google.com/document/d/${raw}/export?format=txt`];
  }

  return [];
}

async function syncGoogleBlockList(source = "manual", force = false) {
  if (!config.automod?.googleBlockListEnabled) {
    config.automod.googleBlockListTerms = [];
    config.automod.googleBlockListLastError = null;
    config.automod.googleBlockListLastCount = 0;
    saveConfig();
    return { enabled: false, synced: false, count: 0 };
  }

  const fetchCandidates = getGoogleBlockListFetchCandidates(config.automod.googleBlockListUrl);
  if (!fetchCandidates.length) {
    config.automod.googleBlockListTerms = [];
    config.automod.googleBlockListLastError = "Set a valid Google Doc URL first.";
    config.automod.googleBlockListLastCount = 0;
    saveConfig();
    return { enabled: true, synced: false, count: 0, error: config.automod.googleBlockListLastError };
  }

  const lastSyncedAt = config.automod.googleBlockListLastSyncedAt ? new Date(config.automod.googleBlockListLastSyncedAt).getTime() : 0;
  if (!force && lastSyncedAt && Date.now() - lastSyncedAt < getGoogleBlockListRefreshMs()) {
    return {
      enabled: true,
      synced: false,
      count: Array.isArray(config.automod.googleBlockListTerms) ? config.automod.googleBlockListTerms.length : 0,
      skipped: true
    };
  }

  if (googleBlockListSyncState.running) {
    return { enabled: true, synced: false, count: Array.isArray(config.automod.googleBlockListTerms) ? config.automod.googleBlockListTerms.length : 0, skipped: true };
  }

  googleBlockListSyncState.running = true;
  try {
    let response = null;
    let usedUrl = "";
    let lastStatus = 0;
    for (const candidate of fetchCandidates) {
      response = await fetch(candidate, {
        headers: { "User-Agent": "MochiBot/1.0" }
      });
      usedUrl = candidate;
      lastStatus = response.status;
      if (response.ok) break;
    }

    if (!response?.ok) {
      throw new Error(`Google Doc fetch failed (${lastStatus || 404}).`);
    }

    const responseText = await response.text();
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const text = contentType.includes("text/html") && usedUrl.includes("/pub")
      ? responseText
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/gi, " ")
          .replace(/&amp;/gi, "&")
          .replace(/&lt;/gi, "<")
          .replace(/&gt;/gi, ">")
          .replace(/&quot;/gi, "\"")
          .replace(/&#39;/gi, "'")
      : responseText;
    const terms = normalizeBlockListTerms(text);
    config.automod.googleBlockListTerms = terms;
    config.automod.googleBlockListLastSyncedAt = new Date().toISOString();
    config.automod.googleBlockListLastError = null;
    config.automod.googleBlockListLastCount = terms.length;
    googleBlockListSyncState.lastSyncAt = config.automod.googleBlockListLastSyncedAt;
    saveConfig();
    recordAuditLog(source, "google-block-list-synced", {
      docId: getGoogleBlockListDocId(config.automod.googleBlockListUrl),
      sourceUrl: usedUrl,
      count: terms.length
    });
    return { enabled: true, synced: true, count: terms.length };
  } catch (error) {
    config.automod.googleBlockListLastError = error.message;
    saveConfig();
    recordAuditLog(source, "google-block-list-sync-failed", {
      docId: getGoogleBlockListDocId(config.automod.googleBlockListUrl),
      sourceUrl: config.automod.googleBlockListUrl,
      error: error.message
    });
    return { enabled: true, synced: false, count: Array.isArray(config.automod.googleBlockListTerms) ? config.automod.googleBlockListTerms.length : 0, error: error.message };
  } finally {
    googleBlockListSyncState.running = false;
  }
}

function startGoogleBlockListSync() {
  if (googleBlockListInterval) clearInterval(googleBlockListInterval);
  googleBlockListInterval = setInterval(() => {
    syncGoogleBlockList("interval").catch(error => {
      log.error("Google block list sync error.", error);
    });
  }, 5 * 60 * 1000);
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

function getAutoModRuleAction(ruleKey, automod = config.automod) {
  const configured = normalizeRuleAction(automod.ruleActions?.[ruleKey]);
  if (configured) return configured;
  if (AUTOMOD_RULE_ACTIONS.has(ruleKey)) return ruleKey;
  const alertOnlyRules = Array.isArray(automod.alertOnlyRules) ? automod.alertOnlyRules : [];
  if (alertOnlyRules.includes(ruleKey)) return "alert";
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

function parseChannelProfileSelector(selector) {
  const normalized = String(selector || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "*") return "*";
  return normalized.replace(/^#/, "");
}

function parseChannelProfileDirective(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const [firstToken, ...rest] = text.split(",").map(part => part.trim()).filter(Boolean);
  if (!firstToken) return null;

  const directives = rest.length ? [firstToken, ...rest] : [firstToken];
  const overrides = {};
  let preset = null;

  for (const directive of directives) {
    const [rawKey, ...rawValueParts] = directive.split("=");
    const key = String(rawKey || "").trim().toLowerCase();
    const rawValue = rawValueParts.length ? rawValueParts.join("=").trim() : "";

    if (!rawValueParts.length) {
      if (["light", "standard", "strict"].includes(key)) {
        preset = key;
      } else if (key === "dryrun") {
        overrides.dryRunEnabled = true;
      } else if (key === "dryrun-off" || key === "nodryrun") {
        overrides.dryRunEnabled = false;
      }
      continue;
    }

    if (key === "preset" && ["light", "standard", "strict"].includes(rawValue.toLowerCase())) {
      preset = rawValue.toLowerCase();
      continue;
    }

    if (key === "ignore") {
      overrides.channelRuleOverrides = parseCommaSeparatedList(rawValue, value => normalizeRuleKey(value))
        .filter(Boolean);
      continue;
    }

    if (["dryrun", "linkreputationenabled", "languageawarefiltersenabled", "quiethoursenabled"].includes(key)) {
      overrides[key] = envFlag(rawValue, false);
      continue;
    }

    if (["quiethoursmode"].includes(key)) {
      const mode = String(rawValue || "").trim().toLowerCase();
      overrides[key] = ["relaxed", "strict"].includes(mode) ? mode : "relaxed";
      continue;
    }

    if (["quiethoursstart", "quiethoursend"].includes(key)) {
      overrides[key] = String(rawValue || "").trim().slice(0, 16);
      continue;
    }

    if (["spamwindowms", "spamburstthreshold", "spamduplicatethreshold", "contextmessagecount", "maxmentions", "maxemojicount", "maxattachmentsizemb"].includes(key)) {
      const numeric = Number(rawValue);
      if (Number.isFinite(numeric)) overrides[key] = numeric;
      continue;
    }

    if (["invites", "spam", "caps", "bannedwords", "linksenabled", "alloweddomainsonly", "attachmentsenabled", "ageprotectionenabled", "antiraidenabled", "nicknamefilterenabled", "scamfilterenabled", "evasionfilterenabled", "emojispamenabled", "escalationenabled"].includes(key)) {
      overrides[key] = envFlag(rawValue, false);
      continue;
    }
  }

  return { preset, overrides };
}

function parseChannelProfiles(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith(";")) return null;

      const separatorIndex = trimmed.indexOf(":");
      if (separatorIndex === -1) return null;

      const selector = parseChannelProfileSelector(trimmed.slice(0, separatorIndex));
      const directive = parseChannelProfileDirective(trimmed.slice(separatorIndex + 1));
      if (!selector || !directive) return null;

      return {
        selector,
        preset: directive.preset,
        overrides: directive.overrides
      };
    })
    .filter(Boolean)
    .slice(0, 100);
}

const AUTO_MOD_PRESETS = {
  light: {
    invites: true,
    spam: true,
    caps: false,
    bannedWords: false,
    linksEnabled: false,
    allowedDomainsOnly: false,
    attachmentsEnabled: false,
    ageProtectionEnabled: false,
    antiRaidEnabled: true,
    nicknameFilterEnabled: false,
    scamFilterEnabled: true,
    evasionFilterEnabled: true,
    emojiSpamEnabled: false,
    escalationEnabled: true,
    maxMentions: 8,
    spamWindowMs: 10000,
    spamBurstThreshold: 6,
    spamDuplicateThreshold: 4,
    raidJoinThreshold: 8,
    warnThreshold: 3,
    timeoutThreshold: 5,
    timeoutDurationMs: 10 * 60 * 1000,
    offenseWindowMs: 24 * 60 * 60 * 1000,
    raidWindowMs: 60 * 1000,
    raidAction: "log"
  },
  standard: {
    invites: true,
    spam: true,
    caps: true,
    bannedWords: true,
    linksEnabled: true,
    allowedDomainsOnly: false,
    attachmentsEnabled: true,
    ageProtectionEnabled: true,
    antiRaidEnabled: true,
    nicknameFilterEnabled: false,
    scamFilterEnabled: true,
    evasionFilterEnabled: true,
    emojiSpamEnabled: true,
    escalationEnabled: true,
    maxMentions: 5,
    spamWindowMs: 8000,
    spamBurstThreshold: 5,
    spamDuplicateThreshold: 3,
    maxEmojiCount: 12,
    maxAttachmentSizeMb: 10,
    raidJoinThreshold: 5,
    warnThreshold: 2,
    timeoutThreshold: 4,
    timeoutDurationMs: 10 * 60 * 1000,
    offenseWindowMs: 24 * 60 * 60 * 1000,
    raidWindowMs: 60 * 1000,
    raidAccountAgeLimitMs: 24 * 60 * 60 * 1000,
    raidAction: "log"
  },
  strict: {
    invites: true,
    spam: true,
    caps: true,
    bannedWords: true,
    linksEnabled: true,
    allowedDomainsOnly: true,
    attachmentsEnabled: true,
    ageProtectionEnabled: true,
    antiRaidEnabled: true,
    nicknameFilterEnabled: true,
    scamFilterEnabled: true,
    evasionFilterEnabled: true,
    emojiSpamEnabled: true,
    escalationEnabled: true,
    maxMentions: 4,
    spamWindowMs: 6000,
    spamBurstThreshold: 4,
    spamDuplicateThreshold: 2,
    maxEmojiCount: 8,
    maxAttachmentSizeMb: 8,
    raidJoinThreshold: 4,
    warnThreshold: 2,
    timeoutThreshold: 3,
    timeoutDurationMs: 30 * 60 * 1000,
    offenseWindowMs: 48 * 60 * 60 * 1000,
    raidWindowMs: 60 * 1000,
    raidAccountAgeLimitMs: 7 * 24 * 60 * 60 * 1000,
    minAccountAgeForLinksMs: 24 * 60 * 60 * 1000,
    minMemberAgeForLinksMs: 10 * 60 * 1000,
    minAccountAgeForAttachmentsMs: 24 * 60 * 60 * 1000,
    minMemberAgeForAttachmentsMs: 10 * 60 * 1000,
    raidAction: "timeout"
  }
};

function cloneAutoModSettings(source = {}) {
  return {
    ...source,
    bannedWordList: [...(source.bannedWordList || [])],
    allowedDomains: [...(source.allowedDomains || [])],
    blockedDomains: [...(source.blockedDomains || [])],
    allowedAttachmentExtensions: [...(source.allowedAttachmentExtensions || [])],
    blockedAttachmentExtensions: [...(source.blockedAttachmentExtensions || [])],
    exemptChannelIds: [...(source.exemptChannelIds || [])],
    exemptRoleIds: [...(source.exemptRoleIds || [])],
    exemptUserIds: [...(source.exemptUserIds || [])],
    nicknameBlockedTerms: [...(source.nicknameBlockedTerms || [])],
    scamPhraseList: [...(source.scamPhraseList || [])],
    googleBlockListTerms: [...(source.googleBlockListTerms || [])],
    alertOnlyRules: [...(source.alertOnlyRules || [])],
    channelRuleOverrides: { ...(source.channelRuleOverrides || {}) },
    ruleActions: { ...(source.ruleActions || {}) }
  };
}

function normalizeProfileRuleList(value) {
  return parseCommaSeparatedList(value, entry => normalizeRuleKey(entry)).filter(Boolean);
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

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasAlphaNumeric(value) {
  return /[\p{L}\p{N}]/u.test(value);
}

function buildBoundaryPattern(term) {
  const normalized = normalizeComparisonText(term).trim().replace(/\s+/g, " ");
  if (!normalized) return null;

  const parts = normalized.split(" ").filter(Boolean).map(escapeRegExp);
  const escaped = parts.length > 1
    ? parts.join("[\\s\\p{P}\\p{S}_]+")
    : escapeRegExp(normalized);
  const start = hasAlphaNumeric(normalized[0]) ? "(^|[^\\p{L}\\p{N}_])" : "(^|\\s)";
  const end = hasAlphaNumeric(normalized[normalized.length - 1]) ? "($|[^\\p{L}\\p{N}_])" : "($|\\s)";
  return new RegExp(`${start}${escaped}${end}`, "iu");
}

function buildBypassPattern(term) {
  const normalized = normalizeBypassText(term);
  if (!normalized || normalized.length < 4) return null;

  const escaped = escapeRegExp(normalized);
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`, "iu");
}

function getBannedWordContextSnippet(content, matchIndex, matchLength, windowSize = 48) {
  const start = Math.max(0, matchIndex - windowSize);
  const end = Math.min(content.length, matchIndex + matchLength + windowSize);
  return content.slice(start, end);
}

function getBannedWordContextScore(snippet, term) {
  const normalizedSnippet = normalizeComparisonText(snippet).replace(/\s+/g, " ");
  const normalizedTerm = normalizeComparisonText(term).replace(/\s+/g, " ").trim();
  if (!normalizedSnippet || !normalizedTerm) return 0;

  let score = 0;
  const weightedMarkers = [
    { marker: `not ${normalizedTerm}`, weight: 60 },
    { marker: `no ${normalizedTerm}`, weight: 60 },
    { marker: `without ${normalizedTerm}`, weight: 55 },
    { marker: `instead of ${normalizedTerm}`, weight: 45 },
    { marker: `rather than ${normalizedTerm}`, weight: 45 },
    { marker: "the word", weight: 35 },
    { marker: "word is", weight: 30 },
    { marker: "word means", weight: 30 },
    { marker: "means", weight: 20 },
    { marker: "meaning", weight: 20 },
    { marker: "definition", weight: 20 },
    { marker: "example", weight: 18 },
    { marker: "examples", weight: 18 },
    { marker: "translation", weight: 18 },
    { marker: "translated", weight: 18 },
    { marker: "spelling", weight: 12 },
    { marker: "spell", weight: 12 },
    { marker: "quoted", weight: 15 },
    { marker: "quote", weight: 12 },
    { marker: "reference", weight: 15 },
    { marker: "referencing", weight: 15 },
    { marker: "called", weight: 10 },
    { marker: "about", weight: 8 },
    { marker: "talking about", weight: 18 }
  ];

  for (const entry of weightedMarkers) {
    if (normalizedSnippet.includes(entry.marker)) score += entry.weight;
  }

  if (/["'“”‘’].{0,18}\bthe word\b/i.test(snippet)) score += 20;
  if (/\bwhat does\b.*\bmean\b/i.test(snippet)) score += 35;
  if (/\bmeans?\s+(to|that)\b/i.test(normalizedSnippet)) score += 12;
  return Math.min(100, score);
}

function findBannedWordMatch(content, automod = config.automod) {
  const normalizedContent = normalizeComparisonText(content).replace(/\s+/g, " ");
  const bannedWords = Array.isArray(automod.bannedWordList) ? automod.bannedWordList : getBannedWords();
  const sensitivity = Number.isFinite(Number(automod.bannedWordsContextSensitivity))
    ? Math.max(0, Math.min(100, Number(automod.bannedWordsContextSensitivity)))
    : getBannedWordsContextSensitivity();
  for (const term of bannedWords) {
    const pattern = buildBoundaryPattern(term);
    if (!pattern) continue;

    const match = normalizedContent.match(pattern);
    if (!match) continue;

    const contextSnippet = getBannedWordContextSnippet(normalizedContent, match.index || 0, match[0].length);
    if (getBannedWordContextScore(contextSnippet, term) >= sensitivity) continue;

    return term;
  }

  return null;
}

function findBypassBannedWordMatch(content, automod = config.automod) {
  if (!automod.bannedWords) return null;
  if (findBannedWordMatch(content, automod)) return null;

  const normalized = normalizeBypassText(content);
  if (!normalized) return null;

  const bannedWords = Array.isArray(automod.bannedWordList) ? automod.bannedWordList : getBannedWords();
  return bannedWords.find(term => {
    const pattern = buildBypassPattern(term);
    if (!pattern) return false;
    return pattern.test(normalized);
  }) || null;
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

function getScamPhraseContextSnippet(content, matchIndex, matchLength, windowSize = 48) {
  const start = Math.max(0, matchIndex - windowSize);
  const end = Math.min(content.length, matchIndex + matchLength + windowSize);
  return content.slice(start, end);
}

function getScamPhraseContextScore(snippet, phrase) {
  const normalizedSnippet = normalizeComparisonText(snippet).replace(/\s+/g, " ");
  const normalizedPhrase = normalizeComparisonText(phrase).replace(/\s+/g, " ").trim();
  if (!normalizedSnippet || !normalizedPhrase) return 0;

  let score = 0;
  const weightedMarkers = [
    { marker: `not ${normalizedPhrase}`, weight: 60 },
    { marker: `no ${normalizedPhrase}`, weight: 60 },
    { marker: `without ${normalizedPhrase}`, weight: 55 },
    { marker: `rather than ${normalizedPhrase}`, weight: 45 },
    { marker: `instead of ${normalizedPhrase}`, weight: 45 },
    { marker: "the phrase", weight: 25 },
    { marker: "the word", weight: 25 },
    { marker: "word means", weight: 30 },
    { marker: "means", weight: 18 },
    { marker: "meaning", weight: 18 },
    { marker: "definition", weight: 18 },
    { marker: "example", weight: 18 },
    { marker: "examples", weight: 18 },
    { marker: "reference", weight: 16 },
    { marker: "referencing", weight: 16 },
    { marker: "about", weight: 10 },
    { marker: "talking about", weight: 18 },
    { marker: "discussion", weight: 12 },
    { marker: "guide", weight: 12 },
    { marker: "tutorial", weight: 12 },
    { marker: "how to", weight: 20 },
    { marker: "what is", weight: 16 }
  ];

  for (const entry of weightedMarkers) {
    if (normalizedSnippet.includes(entry.marker)) score += entry.weight;
  }

  if (/["'“”‘’].{0,18}\b(the phrase|the word)\b/i.test(snippet)) score += 15;
  return Math.min(100, score);
}

function isSuspiciousDomain(domain) {
  return getSuspiciousDomainRisk(domain) >= 70;
}

function getSuspiciousDomainRisk(domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) return 0;

  if (HIGH_RISK_SCAM_DOMAINS.some(entry => normalized === entry || normalized.endsWith(`.${entry}`))) return 95;
  if (COMMON_LINK_AGGREGATOR_DOMAINS.some(entry => normalized === entry || normalized.endsWith(`.${entry}`))) return 25;
  if (normalized.startsWith("xn--")) return 90;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) return 90;
  if (normalized.endsWith(".zip") || normalized.endsWith(".mov")) return 85;

  const segments = normalized.split(".");
  if (segments.some(segment => segment.length >= 18)) return 75;
  if (segments.some(segment => /[0-9]{5,}/.test(segment))) return 75;
  if (segments.some(segment => /[^a-z0-9-]/.test(segment))) return 65;
  return 0;
}

const IMAGE_ATTACHMENT_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff"]);

function isImageAttachment(attachment) {
  const contentType = String(attachment?.contentType || "").trim().toLowerCase();
  if (contentType.startsWith("image/")) return true;

  const extension = normalizeExtension(path.extname(attachment?.name || ""));
  return IMAGE_ATTACHMENT_EXTENSIONS.has(extension);
}

function extractMessageUrls(content) {
  const matches = String(content || "").match(/https?:\/\/[^\s]+/gi) || [];
  return [...new Set(matches.map(match => {
    try {
      return new URL(match).href;
    } catch {
      return null;
    }
  }).filter(Boolean))];
}

function detectScamAttempt(message, automod = config.automod) {
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

  const suspiciousDomain = domains.find(domain => automod.linkReputationEnabled === false ? false : getSuspiciousDomainRisk(domain) >= 80);

  const matchedPhrase = getScamPhrases().find(phrase => normalizedText.includes(phrase));
  if (matchedPhrase) {
    const phraseIndex = normalizedText.indexOf(matchedPhrase);
    const phraseContext = getScamPhraseContextScore(
      getScamPhraseContextSnippet(normalizedText, Math.max(0, phraseIndex), matchedPhrase.length),
      matchedPhrase
    );

    if (suspiciousDomain && phraseContext < 75) {
      return {
        actionLabel: "scam-link",
        reason: `that message matched scam wording and linked to ${suspiciousDomain}.`
      };
    }

    if (phraseContext >= 75) {
      return null;
    }

    return {
      actionLabel: "scam-phrase",
      reason: `that message matched a scam or phishing phrase (${matchedPhrase}).`
    };
  }

  return null;
}

function detectBypassAttempt(content, automod = config.automod) {
  const normalized = normalizeBypassText(content);
  if (!normalized) return null;

  if (normalized.includes("discordgg") || normalized.includes("discordcominvite")) {
    return {
      actionLabel: "obfuscated-invite",
      reason: "obfuscated invite links are not allowed here."
    };
  }

  const blockedWord = findBypassBannedWordMatch(content, automod);

  if (blockedWord) {
    return {
      actionLabel: "obfuscated-banned-word",
      reason: `that phrase matched a blocked term after bypass normalization (${blockedWord}).`
    };
  }

  return null;
}

function getAiModerationThreshold() {
  const threshold = Number(config.automod.aiModerationThreshold);
  if (!Number.isFinite(threshold)) return 0.7;
  return Math.max(0, Math.min(1, threshold > 1 ? threshold / 100 : threshold));
}

function normalizeAiModerationCategoryName(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeAiModerationCategoryThresholds(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value).reduce((acc, [key, rawThreshold]) => {
    const normalizedKey = normalizeAiModerationCategoryName(key);
    const threshold = Number(rawThreshold);
    if (!normalizedKey || !Number.isFinite(threshold)) return acc;
    acc[normalizedKey] = Math.max(0, Math.min(1, threshold > 1 ? threshold / 100 : threshold));
    return acc;
  }, {});
}

function parseAiModerationCategoryThresholdsInput(value) {
  const text = String(value || "").trim();
  if (!text) return {};

  try {
    return normalizeAiModerationCategoryThresholds(JSON.parse(text));
  } catch {
    // Fall back to a light-weight line parser for admin convenience.
  }

  const entries = {};
  for (const line of text.split(/[\n,]/).map(part => part.trim()).filter(Boolean)) {
    const separatorIndex = line.indexOf(":") >= 0 ? line.indexOf(":") : line.indexOf("=");
    if (separatorIndex < 1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const threshold = Number(line.slice(separatorIndex + 1).trim());
    if (!key || !Number.isFinite(threshold)) continue;
    entries[key] = threshold;
  }

  return normalizeAiModerationCategoryThresholds(entries);
}

function getAiModerationCategoryThresholds() {
  return normalizeAiModerationCategoryThresholds(config.automod.aiModerationCategoryThresholds);
}

function isAiModerationSuppressionEnabled() {
  return Boolean(config.automod.aiModerationSuppressLowConfidenceReviews);
}

function getAiModerationPresetConfig(name) {
  const normalized = String(name || "").trim().toLowerCase();
  const presets = {
    lenient: {
      aiModerationEnabled: true,
      aiModerationAction: "review",
      aiModerationThreshold: 85,
      aiModerationSuppressLowConfidenceReviews: true,
      aiModerationCategoryThresholds: {
        sexual: 95,
        hate: 90,
        violence: 90,
        "self-harm": 85,
        illicit: 85
      }
    },
    balanced: {
      aiModerationEnabled: true,
      aiModerationAction: "review",
      aiModerationThreshold: 70,
      aiModerationSuppressLowConfidenceReviews: true,
      aiModerationCategoryThresholds: {
        sexual: 90,
        hate: 85,
        violence: 85,
        "self-harm": 80,
        illicit: 80
      }
    },
    strict: {
      aiModerationEnabled: true,
      aiModerationAction: "review",
      aiModerationThreshold: 55,
      aiModerationSuppressLowConfidenceReviews: false,
      aiModerationCategoryThresholds: {
        sexual: 80,
        hate: 75,
        violence: 75,
        "self-harm": 70,
        illicit: 70
      }
    }
  };
  return presets[normalized] || null;
}

function applyAiModerationPreset(name) {
  const preset = getAiModerationPresetConfig(name);
  if (!preset) return null;

  config.automod.aiModerationEnabled = Boolean(preset.aiModerationEnabled);
  config.automod.aiModerationAction = preset.aiModerationAction;
  config.automod.aiModerationThreshold = preset.aiModerationThreshold;
  config.automod.aiModerationSuppressLowConfidenceReviews = Boolean(preset.aiModerationSuppressLowConfidenceReviews);
  config.automod.aiModerationCategoryThresholds = normalizeAiModerationCategoryThresholds(preset.aiModerationCategoryThresholds);
  saveConfig();
  return preset;
}

function buildAiModerationPresetPreview(name, targetUserId = null) {
  const preset = getAiModerationPresetConfig(name);
  if (!preset) return null;

  const categoryThresholds = normalizeAiModerationCategoryThresholds(preset.aiModerationCategoryThresholds);
  const thresholdLines = Object.entries(categoryThresholds).map(([category, threshold]) => `${category}: ${Math.round(threshold * 100)}%`);
  return makeEmbed({
    title: `${name[0].toUpperCase()}${name.slice(1)} AI preset`,
    description: [
      "This preset updates the AI moderation defaults.",
      "Confirm to apply it, or cancel to keep the current settings."
    ].join(" "),
    color: COLORS.blue,
    fields: [
      { name: "AI moderation", value: preset.aiModerationEnabled ? "Enabled" : "Disabled", inline: true },
      { name: "AI action", value: preset.aiModerationAction || "review", inline: true },
      { name: "Base threshold", value: `${preset.aiModerationThreshold}%`, inline: true },
      { name: "Suppress low-confidence", value: preset.aiModerationSuppressLowConfidenceReviews ? "On" : "Off", inline: true },
      { name: "Category overrides", value: thresholdLines.join("\n") || "None", inline: false },
      { name: "Applies to", value: targetUserId ? `Selected member context: ${targetUserId}` : "Server-wide AI moderation settings", inline: false }
    ]
  });
}

function getAiModerationModel() {
  return String(config.automod.aiModerationModel || "omni-moderation-latest").trim() || "omni-moderation-latest";
}

function getAiMinMessageLength() {
  const length = Number(config.automod.aiMinMessageLength);
  return Number.isInteger(length) ? Math.max(1, Math.min(500, length)) : 4;
}

function getAiCustomRulesThreshold() {
  const threshold = Number(config.automod.aiCustomRulesThreshold);
  if (!Number.isFinite(threshold)) return 0.75;
  return Math.max(0, Math.min(1, threshold > 1 ? threshold / 100 : threshold));
}

function getAiCustomRulesModel() {
  return String(config.automod.aiCustomRulesModel || "gpt-4o-mini").trim() || "gpt-4o-mini";
}

function normalizeAiAutoModAction(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["review", "warn", "timeout", "kick", "ban"].includes(normalized) ? normalized : "review";
}

function getAiModerationAction() {
  return normalizeAiAutoModAction(config.automod.aiModerationAction);
}

function getAiCustomRulesAction() {
  return normalizeAiAutoModAction(config.automod.aiCustomRulesAction);
}

function getAiCustomInstructions() {
  return String(config.automod.aiCustomInstructions || "").trim().slice(0, 2000);
}

function getAiContextMessageCount() {
  const count = Number(config.automod.aiContextMessageCount);
  return Number.isInteger(count) ? Math.max(1, Math.min(10, count)) : 3;
}

function getAiModerationThresholdForCategory(category) {
  const normalizedCategory = normalizeAiModerationCategoryName(category);
  const overrides = getAiModerationCategoryThresholds();
  const override = Object.entries(overrides).find(([key]) =>
    normalizedCategory === key ||
    normalizedCategory.startsWith(`${key}/`) ||
    normalizedCategory.startsWith(`${key}-`) ||
    normalizedCategory.startsWith(`${key}:`)
  )?.[1];

  let threshold = Number.isFinite(Number(override)) ? Number(override) : getAiModerationThreshold();
  if (!Number.isFinite(Number(override)) && isAiModerationSuppressionEnabled()) {
    threshold = Math.max(threshold, isSevereAiModerationCategory(normalizedCategory) ? 0.85 : 0.95);
  }
  return threshold;
}

function getTopModerationCategory(result) {
  const scores = result?.category_scores || {};
  return Object.entries(scores)
    .filter(([, score]) => Number.isFinite(Number(score)))
    .sort((a, b) => Number(b[1]) - Number(a[1]))[0] || [null, 0];
}

function isSevereAiModerationCategory(category) {
  const normalized = String(category || "").trim().toLowerCase();
  if (!normalized) return false;
  return [
    "sexual",
    "hate",
    "violence",
    "self-harm",
    "illicit"
  ].some(prefix => normalized.startsWith(prefix));
}

function mapAiScamCategory(category, hasUrls, hasImages) {
  const normalized = String(category || "").trim().toLowerCase();
  if (normalized === "scam-image") return "scam-image";
  if (normalized === "scam-link") return "scam-link";
  if (normalized === "scam-phrase") return "scam-phrase";
  if (normalized === "impersonation" || normalized === "phishing" || normalized === "credential-theft" || normalized === "giveaway-scam") {
    if (hasImages) return "scam-image";
    if (hasUrls) return "scam-link";
    return "scam-phrase";
  }
  if (hasImages) return "scam-image";
  if (hasUrls) return "scam-link";
  return "scam-phrase";
}

async function detectAiScamIssue(message, automod = config.automod) {
  if (!OPENAI_API_KEY || !automod.aiModerationEnabled) return null;

  const content = String(message.content || "").trim();
  const urls = extractMessageUrls(content);
  const imageAttachments = Array.from(message.attachments.values()).filter(isImageAttachment).slice(0, 3);

  if (!urls.length && !imageAttachments.length) return null;

  const attachmentLines = imageAttachments.map(attachment => {
    const fileName = attachment.name || "image";
    const mimeType = attachment.contentType || "image/*";
    return `- ${fileName} (${mimeType})`;
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          {
            role: "system",
            content:
              "You review Discord messages for scam, phishing, impersonation, malicious link, and scam image behavior. " +
              "Be conservative and only flag likely scams. If the message is harmless, return violated=false."
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  `Review this Discord message for scam behavior.\n\n` +
                  `Message author: ${message.author.tag}\n` +
                  `Channel: #${message.channel?.name || "unknown"}\n` +
                  `Message text:\n${content || "(no text)"}\n\n` +
                  `Extracted URLs:\n${urls.length ? urls.join("\n") : "None"}\n\n` +
                  `Image attachments:\n${attachmentLines.length ? attachmentLines.join("\n") : "None"}\n\n` +
                  `Decide whether this is a scam, phishing attempt, malicious link, impersonation attempt, or scam image. ` +
                  `Prefer "scam-image" when the evidence is mainly in an image, "scam-link" when the evidence is mainly a URL, ` +
                  `and "scam-phrase" for text-only scams.`
              },
              ...imageAttachments.map(attachment => ({
                type: "input_image",
                image_url: attachment.url
              }))
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "scam_detection",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                violated: { type: "boolean" },
                category: {
                  type: "string",
                  enum: ["scam-link", "scam-image", "scam-phrase", "phishing", "impersonation", "credential-theft", "giveaway-scam", "malware", "other"]
                },
                confidence: { type: "integer" },
                evidence: { type: "string" },
                explanation: { type: "string" }
              },
              required: ["violated", "category", "confidence", "evidence", "explanation"]
            }
          }
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      log.error(`AI scam request failed with status ${response.status}.`, errorText.slice(0, 300));
      return null;
    }

    const payload = await response.json();
    const text = getResponseOutputText(payload);
    if (!text) return null;

    const result = JSON.parse(text);
    const confidence = Number(result.confidence || 0);
    if (!result.violated || confidence / 100 < getAiModerationThreshold()) return null;

    const actionLabel = mapAiScamCategory(result.category, urls.length > 0, imageAttachments.length > 0);
    return {
      actionLabel,
      reason: `AI scam review flagged this message as ${result.category || "potential scam"} (${confidence}% confidence).`,
      details: [
        { name: "AI Scam Category", value: result.category || "unknown", inline: true },
        { name: "AI Scam Confidence", value: `${confidence}%`, inline: true },
        { name: "AI Scam Model", value: "gpt-4o-mini", inline: true },
        { name: "AI Scam Evidence", value: String(result.evidence || "No evidence provided.").slice(0, 1024), inline: false },
        { name: "AI Scam Explanation", value: String(result.explanation || "No explanation provided.").slice(0, 1024), inline: false }
      ]
    };
  } catch (error) {
    if (error.name !== "AbortError") {
      log.error("AI scam error.", error);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function detectAiModerationIssue(message) {
  if (!OPENAI_API_KEY || !config.automod.aiModerationEnabled) return null;

  const content = String(message.content || "").trim();
  if (!content || content.length < getAiMinMessageLength()) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: getAiModerationModel(),
        input: content.slice(0, 4000)
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      log.error(`AI moderation request failed with status ${response.status}.`, errorText.slice(0, 300));
      return null;
    }

    const payload = await response.json();
    const result = payload?.results?.[0];
    if (!result) return null;

    const [category, scoreValue] = getTopModerationCategory(result);
    const normalizedCategory = String(category || "").trim().toLowerCase();
    const score = Number(scoreValue || 0);
    const threshold = getAiModerationThresholdForCategory(normalizedCategory);
    if (!result.flagged || score < threshold) return null;

    const percent = Math.round(score * 100);
    const action = getAiModerationAction();
    return {
      actionLabel: action === "review" ? "ai-review" : action,
      reason: `AI review flagged this message as ${category || "policy risk"} (${percent}% confidence).`,
      details: [
        { name: "AI Category", value: category || "unknown", inline: true },
        { name: "AI Confidence", value: `${percent}%`, inline: true },
        { name: "AI Model", value: getAiModerationModel().slice(0, 100), inline: true },
        { name: "AI Action", value: action, inline: true }
      ]
    };
  } catch (error) {
    if (error.name !== "AbortError") {
      log.error("AI moderation error.", error);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function detectAiCustomRuleIssue(message) {
  if (!OPENAI_API_KEY || !config.automod.aiModerationEnabled || !config.automod.aiCustomRulesEnabled) return null;

  const rules = String(config.automod.aiCustomRules || "").trim();
  const content = String(message.content || "").trim();
  if (!rules || !content || content.length < getAiMinMessageLength()) return null;

  const recentContext = config.automod.aiIncludeRecentContext
    ? await getRecentMessagesForUser(message.channel, message.author.id, getAiContextMessageCount()).catch(() => [])
    : [];
  const extraInstructions = getAiCustomInstructions();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: getAiCustomRulesModel(),
        input: [
          {
            role: "system",
            content:
              "You classify Discord messages against server-specific rules. " +
              "Use only the supplied rules, guidance, and message context. Do not flag ambiguous jokes or harmless chat."
          },
          {
            role: "user",
            content:
              `Server rules:\n${rules.slice(0, 4000)}\n\n` +
              `Extra moderator guidance:\n${extraInstructions || "None"}\n\n` +
              `Recent context from same user:\n${recentContext.length ? recentContext.join("\n") : "None"}\n\n` +
              `Message from ${message.author.tag} in #${message.channel?.name || "unknown"}:\n${content.slice(0, 2000)}`
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "custom_rule_check",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                violated: { type: "boolean" },
                ruleName: { type: "string" },
                confidence: { type: "integer" },
                explanation: { type: "string" }
              },
              required: ["violated", "ruleName", "confidence", "explanation"]
            }
          }
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      log.error(`AI custom rules request failed with status ${response.status}.`, errorText.slice(0, 300));
      return null;
    }

    const payload = await response.json();
    const text = getResponseOutputText(payload);
    if (!text) return null;

    const result = JSON.parse(text);
    const confidence = Number(result.confidence || 0);
    if (!result.violated || confidence / 100 < getAiCustomRulesThreshold()) return null;

    const action = getAiCustomRulesAction();
    return {
      actionLabel: action === "review" ? "ai-review" : action,
      reason: `AI custom rule review flagged this message for ${result.ruleName || "server rule"} (${confidence}% confidence).`,
      details: [
        { name: "AI Category", value: result.ruleName || "server-rule", inline: true },
        { name: "AI Confidence", value: `${confidence}%`, inline: true },
        { name: "AI Model", value: getAiCustomRulesModel().slice(0, 100), inline: true },
        { name: "AI Action", value: action, inline: true },
        { name: "AI Explanation", value: String(result.explanation || "No explanation.").slice(0, 1024), inline: false }
      ]
    };
  } catch (error) {
    if (error.name !== "AbortError") {
      log.error("AI custom rules error.", error);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
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

  if (!ENABLE_CORE_BOT) {
    throw new Error("At least one bot feature must be enabled. Set ENABLE_CORE_BOT=true.");
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
    .setName("mochi")
    .setDescription("Play Mochi Bird in a browser"),

  new SlashCommandBuilder()
    .setName("mochi-leaderboard")
    .setDescription("Show the Mochi Bird leaderboard"),

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
          { name: "Config from disk", value: "config" }
        )
    ),

  new SlashCommandBuilder()
    .setName("setupverify")
    .setDescription("Create the rules verification panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("setuptiktokverify")
    .setDescription("Create the TikTok onboarding panel")
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
    .setName("lockverified")
    .setDescription("Lock a category so only the verified role can see it")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(option =>
      option
        .setName("scope")
        .setDescription("What to lock")
        .addChoices(
          { name: "Current category", value: "current" },
          { name: "All categories", value: "all" }
        )
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("unlockverified")
    .setDescription("Remove verified-role visibility locks from categories")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(option =>
      option
        .setName("scope")
        .setDescription("What to unlock")
        .addChoices(
          { name: "Current category", value: "current" },
          { name: "All categories", value: "all" }
        )
        .setRequired(false)
    ),

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
    .setDescription("Delete messages in bulk or clear a channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("How many recent messages to delete")
        .setRequired(false)
    )
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel to clear instead of the current one")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName("all")
        .setDescription("Delete the whole channel history")
        .setRequired(false)
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
    .setName("birthday")
    .setDescription("Manage public birthday dates")
    .addSubcommand(subcommand =>
      subcommand
        .setName("set")
        .setDescription("Set your public birthday month and day")
        .addIntegerOption(option =>
          option.setName("month").setDescription("Birthday month").setRequired(true).setMinValue(1).setMaxValue(12)
        )
        .addIntegerOption(option =>
          option.setName("day").setDescription("Birthday day").setRequired(true).setMinValue(1).setMaxValue(31)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("view")
        .setDescription("View a public birthday")
        .addUserOption(option =>
          option.setName("user").setDescription("User to view").setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("remove")
        .setDescription("Remove your public birthday")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("list")
        .setDescription("List upcoming birthdays")
    ),

  new SlashCommandBuilder()
    .setName("birthdaypanel")
    .setDescription("Post the birthday signup panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

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
             { name: "scam-image", value: "scam-image" },
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
        .setName("birthdayrole")
        .setDescription("Set the temporary birthday role")
        .addRoleOption(option =>
          option.setName("role").setDescription("Role to give on birthdays").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("birthdaychannel")
        .setDescription("Set the public birthday announcement channel")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("Channel to post birthday announcements")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
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
        .setName("captcha")
        .setDescription("Enable or disable the verification CAPTCHA")
        .addBooleanOption(option =>
          option.setName("enabled").setDescription("Enable or disable").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("welcomechannel")
        .setDescription("Set the welcome channel shown to unverified members")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("Channel to use as the welcome channel")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("affirmchannel")
        .setDescription("Set the anonymous affirmations channel")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("Channel to use for anonymous affirmations")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("affirmenabled")
        .setDescription("Enable or disable anonymous affirmations")
        .addBooleanOption(option =>
          option.setName("enabled").setDescription("Enable or disable").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("affirmcooldown")
        .setDescription("Set the anonymous affirmations cooldown")
        .addStringOption(option =>
          option
            .setName("duration")
            .setDescription("Duration like 10s, 1m, 5m")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("tiktokhandle")
        .setDescription("Set the TikTok handle used for nickname verification")
        .addStringOption(option =>
          option
            .setName("handle")
            .setDescription("TikTok handle, with or without @")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("tiktokaliases")
        .setDescription("Set alternate nicknames that should count as verified")
        .addStringOption(option =>
          option
            .setName("aliases")
            .setDescription("Comma or newline separated alternate nicknames")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("verifiedrole")
        .setDescription("Set the role given after nickname verification")
        .addRoleOption(option =>
          option.setName("role").setDescription("Role to grant on verify").setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("unverifiedrole")
        .setDescription("Set the role given before nickname verification")
        .addRoleOption(option =>
          option.setName("role").setDescription("Role to restrict unverified members").setRequired(true)
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
              { name: "birthday role", value: "birthdayrole" },
              { name: "birthday channel", value: "birthdaychannel" },
              { name: "verify channel", value: "verifychannel" },
              { name: "verification captcha", value: "captcha" },
              { name: "welcome channel", value: "welcomechannel" },
              { name: "affirmations channel", value: "affirmchannel" },
              { name: "affirmations enabled", value: "affirmenabled" },
              { name: "affirmations cooldown", value: "affirmcooldown" },
              { name: "TikTok handle", value: "tiktokhandle" },
              { name: "TikTok aliases", value: "tiktokaliases" },
              { name: "verified role", value: "verifiedrole" },
              { name: "unverified role", value: "unverifiedrole" },
              { name: "birthday role", value: "birthdayrole" },
              { name: "birthday channel", value: "birthdaychannel" },
              { name: "rules channel", value: "ruleschannel" }
            )
        )
    ),

  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Open the verification panel")
    .setDMPermission(false),

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

const commands = allCommands.map(command => command.toJSON());
const startedAt = Date.now();

function makeEmbed({ title, description, color = COLORS.pink, fields = [], thumbnail = null, image = null }) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter(FOOTER)
    .setTimestamp();

  if (fields.length) embed.addFields(fields);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image.url);

  return embed;
}

function buildCuteRulesCardAttachment() {
  const canvas = createCanvas(1280, 480);
  const ctx = canvas.getContext("2d");

  const roundedRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const fillRoundedRect = (x, y, w, h, r, fill) => {
    ctx.save();
    roundedRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  };

  const strokeRoundedRect = (x, y, w, h, r, stroke, width = 2) => {
    ctx.save();
    roundedRect(x, y, w, h, r);
    ctx.lineWidth = width;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.restore();
  };

  const background = ctx.createLinearGradient(0, 0, 1280, 480);
  background.addColorStop(0, "#fff4fb");
  background.addColorStop(0.5, "#f6f0ff");
  background.addColorStop(1, "#eef9ff");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 1280, 480);

  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#ffffff";
  for (const [x, y, r] of [[120, 92, 86], [1140, 92, 110], [1070, 390, 96], [220, 392, 104]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const [x, y, s] of [[86, 86, 18], [104, 128, 10], [1160, 92, 16], [1120, 132, 12], [1000, 382, 14], [250, 374, 12], [190, 116, 12], [1070, 112, 11]]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
    ctx.fillRect(-s / 2, -2, s, 4);
    ctx.fillRect(-2, -s / 2, 4, s);
    ctx.restore();
  }

  fillRoundedRect(44, 38, 1192, 404, 38, "rgba(255, 255, 255, 0.58)");
  strokeRoundedRect(44, 38, 1192, 404, 38, "rgba(216, 189, 255, 0.55)", 3);
  fillRoundedRect(92, 82, 1096, 316, 30, "rgba(255, 255, 255, 0.78)");
  strokeRoundedRect(92, 82, 1096, 316, 30, "rgba(247, 217, 240, 0.72)", 2);

  ctx.save();
  ctx.translate(210, 238);
  ctx.fillStyle = "#f5cfe8";
  ctx.beginPath();
  ctx.arc(0, 0, 78, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff6fb";
  ctx.beginPath();
  ctx.arc(0, 0, 61, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f19ec3";
  ctx.font = "bold 54px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("✿", 0, 18);
  ctx.restore();

  ctx.fillStyle = "#775b86";
  ctx.font = "bold 58px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Mochi Server Rules", 336, 166);
  ctx.fillStyle = "#9a7fa8";
  ctx.font = "24px sans-serif";
  ctx.fillText("A tiny guide for keeping things sweet, safe, and cozy.", 336, 214);
  ctx.fillStyle = "#b58ec0";
  ctx.font = "22px sans-serif";
  ctx.fillText("Please read the rules below, then enjoy your stay.", 336, 254);

  ctx.fillStyle = "#d9c2ea";
  ctx.font = "20px sans-serif";
  ctx.fillText("Thank you for helping keep the garden lovely ✨", 336, 304);

  ctx.strokeStyle = "rgba(214, 183, 235, 0.65)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(336, 280);
  ctx.lineTo(932, 280);
  ctx.stroke();

  ctx.fillStyle = "#f5c2dc";
  ctx.beginPath();
  ctx.arc(1038, 232, 82, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff7fb";
  ctx.beginPath();
  ctx.arc(1038, 232, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ee99c2";
  ctx.beginPath();
  ctx.moveTo(1016, 226);
  ctx.bezierCurveTo(1016, 204, 1040, 196, 1038, 218);
  ctx.bezierCurveTo(1036, 196, 1060, 204, 1060, 226);
  ctx.bezierCurveTo(1060, 252, 1038, 264, 1038, 264);
  ctx.bezierCurveTo(1038, 264, 1016, 252, 1016, 226);
  ctx.fill();

  return {
    attachment: canvas.toBuffer("image/png"),
    name: "cute-rules-card.png"
  };
}

function buildCuteRulesMessage() {
  const attachment = buildCuteRulesCardAttachment();
  const rules = getRulesCardLines();
  const embed = makeEmbed({
    title: getRulesCardTitle(),
    description: getRulesCardDescription(),
    color: COLORS.purple,
    fields: rules.map((rule, index) => ({
      name: String(index + 1),
      value: rule.replace(/\{verify\}/gi, getVerifyChannelMention()),
      inline: false
    })),
    image: { url: `attachment://${attachment.name}` }
  });

  return { attachment, embed };
}

async function postRulesMessage(source = "manual") {
  const rulesChannelId = getRulesChannelId();
  if (!rulesChannelId) {
    throw new Error("Set the rules channel first.");
  }

  const rulesChannel = await client.channels.fetch(rulesChannelId).catch(() => null);
  if (!rulesChannel || typeof rulesChannel.send !== "function") {
    throw new Error("The rules channel could not be found or cannot send messages.");
  }

  const { attachment, embed } = buildCuteRulesMessage();
  const message = await rulesChannel.send({
    files: [attachment],
    embeds: [embed]
  });

  recordAuditLog(source, "rules-panel-posted", {
    channelId: rulesChannelId,
    messageId: message.id
  });

  return {
    channelId: rulesChannelId,
    messageId: message.id,
    source
  };
}

async function logEmbed(embed) {
  try {
    const logChannelId = getLogChannelId();
    if (!logChannelId) return;
    const channel = await client.channels.fetch(logChannelId);
    if (!channel) return;
    await channel.send({ embeds: [embed] });
  } catch (error) {
    log.warn("Failed to send mod log embed.", error);
  }
}

async function sendSecurityAlert(embed) {
  await logEmbed(embed);
  recordAuditLog("AutoMod", "raid-alert", {
    title: embed.data?.title || "Security alert",
    description: String(embed.data?.description || "").slice(0, 500)
  });
}

async function logAutoModEmbed(embed) {
  try {
    const automodLogChannelId = getAutoModLogChannelId();
    if (!automodLogChannelId) return;
    const channel = await client.channels.fetch(automodLogChannelId);
    if (!channel) return;
    await channel.send({ embeds: [embed] });
  } catch (error) {
    log.warn("Failed to send AutoMod log embed.", error);
  }
}

async function safeSend(channelId, payload) {
  try {
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;
    await channel.send(payload);
  } catch (error) {
    log.warn("Failed to send channel message.", error);
  }
}

async function resolveVerifyMessageId() {
  const verifyChannelId = getVerifyChannelId();
  if (!verifyChannelId) return null;

  try {
    const channel = await client.channels.fetch(verifyChannelId);
    if (!channel?.messages?.fetch) return null;

    if (config.verifyMessageId) {
      const cachedMessage = await channel.messages.fetch(config.verifyMessageId).catch(() => null);
      const cachedIsRulesPanel = Boolean(
        cachedMessage?.author?.id === client.user.id &&
        (
          cachedMessage.embeds?.some(embed =>
            typeof embed.title === "string" &&
            embed.title.toLowerCase().includes("rules check + verification")
          ) ||
          cachedMessage.components?.some(row =>
            row.components?.some(component => component.customId === "verify:rules-check")
          )
        )
      );
      const cachedIsBonusPanel = Boolean(
        cachedMessage?.author?.id === client.user.id &&
        (
          cachedMessage.embeds?.some(embed =>
            typeof embed.title === "string" &&
            embed.title.toLowerCase().includes("tiktok bonus verification")
          ) ||
          cachedMessage.components?.some(row =>
            row.components?.some(component => component.customId === "verify:tiktok-check")
          )
        )
      );

      if (cachedMessage && cachedIsRulesPanel) return config.verifyMessageId;
      if (cachedMessage && cachedIsBonusPanel) {
        config.bonusVerifyMessageId = cachedMessage.id;
        config.verifyMessageId = null;
        saveConfig();
      } else {
        config.verifyMessageId = null;
        saveConfig();
      }
    }

    const isRulesVerifyPanelMessage = message => {
      if (!message || message.author?.id !== client.user.id) {
        return false;
      }

      const hasExpectedEmbed = message.embeds?.some(embed =>
        typeof embed.title === "string" &&
        embed.title.toLowerCase().includes("rules check + verification")
      );

      const hasExpectedButton = message.components?.some(row =>
        row.components?.some(component => component.customId === "verify:rules-check")
      );

      return Boolean(hasExpectedEmbed || hasExpectedButton);
    };

    const isBonusVerifyPanelMessage = message => {
      if (!message || message.author?.id !== client.user.id) {
        return false;
      }

      const hasExpectedEmbed = message.embeds?.some(embed =>
        typeof embed.title === "string" &&
        embed.title.toLowerCase().includes("tiktok bonus verification")
      );

      const hasExpectedButton = message.components?.some(row =>
        row.components?.some(component => component.customId === "verify:tiktok-check")
      );

      return Boolean(hasExpectedEmbed || hasExpectedButton);
    };

    const fetchVerifyPanelMessage = async () => {
      let before = null;
      for (let page = 0; page < 5; page += 1) {
        const messages = await channel.messages.fetch({
          limit: 100,
          ...(before ? { before } : {})
        });

        if (!messages.size) {
          return null;
        }

        const verifyMessage = messages.find(isRulesVerifyPanelMessage) || messages.find(isBonusVerifyPanelMessage);
        if (verifyMessage) {
          return verifyMessage;
        }

        before = [...messages.values()].at(-1)?.id || null;
        if (!before || messages.size < 100) {
          return null;
        }
      }

      return null;
    };

    const verifyMessage = await fetchVerifyPanelMessage();

    if (!verifyMessage) return null;

    if (isRulesVerifyPanelMessage(verifyMessage)) {
      config.verifyMessageId = verifyMessage.id;
      saveConfig();
      return verifyMessage.id;
    }

    if (isBonusVerifyPanelMessage(verifyMessage)) {
      config.bonusVerifyMessageId = verifyMessage.id;
      saveConfig();
      return verifyMessage.id;
    }

    return null;
  } catch (error) {
    log.error("Failed to resolve verify message.", error);
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

function isPanelAuditAction(action) {
  return [
    "settings-updated",
    "automod-updated",
    "rule-actions-updated",
    "permissions-updated",
    "ops-config-updated",
    "backup-downloaded",
    "backup-restored",
    "tiktok-verify-posted",
    "verification-panel-repaired",
    "verified-visibility-locked",
    "verified-visibility-unlocked",
    "verification-mark-unverified",
    "appeal-created",
    "appeal-status-updated",
    "channel-exempt-added",
    "channel-rule-override-added",
    "google-block-list-synced",
    "google-block-list-sync-failed",
    "raid-alert",
    "rules-panel-posted",
    "verification-panel-posted",
    "onboarding-repaired",
    "bonus-panel-posted",
    "affirmations-panel-posted"
  ].includes(String(action || ""));
}

function getRecentPanelChanges(limit = 8) {
  return (config.auditLog || [])
    .filter(entry => isPanelAuditAction(entry.action))
    .slice(-limit)
    .reverse();
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

function calculateUserRisk(userId) {
  const warnings = getWarnings(userId).length;
  const cases = getCasesForUser(userId);
  const now = Date.now();
  const visibleCases = cases.filter(entry => entry.action !== "automod:ai-review" || !getAiReviewStatus(entry.id));
  const recentCases = cases.filter(entry =>
    entry.action !== "automod:ai-review" &&
    now - new Date(entry.createdAt).getTime() <= 7 * 24 * 60 * 60 * 1000
  );
  const aiFlags = cases.filter(entry => entry.action === "automod:ai-review" && !getAiReviewStatus(entry.id)).length;
  const severeCases = cases.filter(entry => ["ban", "tempban", "kick", "timeout", "automod:timeout"].includes(entry.action)).length;
  const score = Math.min(100, warnings * 10 + recentCases.length * 8 + aiFlags * 2 + severeCases * 12);
  const strikes = Math.floor(score / 25);
  const level = score >= 75 ? "high" : score >= 40 ? "medium" : score > 0 ? "low" : "clear";
  return { score, strikes, level, warnings, cases: visibleCases.length, recentCases: recentCases.length, aiFlags };
}

function buildRiskLeaderboard(limit = 10) {
  const userIds = new Set([
    ...Object.keys(config.warnings || {}),
    ...(config.cases || []).map(entry => entry.targetId).filter(Boolean)
  ]);
  return [...userIds]
    .map(userId => {
      const risk = calculateUserRisk(userId);
      const latestCase = getCasesForUser(userId).slice(-1)[0];
      return {
        userId,
        tag: latestCase?.targetTag || userId,
        ...risk
      };
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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

function getAiReviewStatus(caseId) {
  return config.aiReviews?.[String(caseId)] || null;
}

function setAiReviewStatus(caseId, status) {
  if (!config.aiReviews || typeof config.aiReviews !== "object") {
    config.aiReviews = {};
  }
  config.aiReviews[String(caseId)] = {
    ...status,
    updatedAt: new Date().toISOString()
  };
  saveConfig();
  return config.aiReviews[String(caseId)];
}

async function processBirthdaySweep(source = "scheduled") {
  if (!ENABLE_CORE_BOT) {
    return { checked: 0, granted: 0, removed: 0, announced: 0, expired: 0 };
  }

  const birthdayEntries = Object.entries(getBirthdayStore());
  if (!birthdayEntries.length) {
    return { checked: 0, granted: 0, removed: 0, announced: 0, expired: 0 };
  }

  const guild = client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) {
    return { checked: birthdayEntries.length, granted: 0, removed: 0, announced: 0, expired: 0 };
  }

  const birthdayRoleId = getBirthdayRoleId();
  const announcementChannelId = getBirthdayAnnouncementChannelId();
  const birthdayRole = birthdayRoleId
    ? guild.roles.cache.get(birthdayRoleId) || await guild.roles.fetch(birthdayRoleId).catch(() => null)
    : null;
  const announcementChannel = announcementChannelId
    ? guild.channels.cache.get(announcementChannelId) || await guild.channels.fetch(announcementChannelId).catch(() => null)
    : null;
  const now = new Date();
  const currentYear = now.getFullYear();
  const todayKey = getBirthdayTodayKey(now);
  const updatedEntries = [];
  let granted = 0;
  let removed = 0;
  let announced = 0;
  let expired = 0;

  for (const [userId, rawEntry] of birthdayEntries) {
    const entry = rawEntry && typeof rawEntry === "object" ? rawEntry : null;
    const normalized = entry ? normalizeBirthdayMonthDay(entry.month, entry.day) : null;
    if (!normalized) continue;

    const nextEntry = {
      ...entry,
      month: normalized.month,
      day: normalized.day
    };

    const member = await guild.members.fetch(userId).catch(() => null);
    const roleExpiresAt = entry?.roleExpiresAt ? new Date(entry.roleExpiresAt).getTime() : 0;
    if (roleExpiresAt && roleExpiresAt <= Date.now()) {
      let shouldClearExpiry = false;

      if (!member || !birthdayRole) {
        shouldClearExpiry = true;
      } else if (!member.roles.cache.has(birthdayRole.id)) {
        shouldClearExpiry = true;
      } else if (member.manageable) {
        await member.roles.remove(birthdayRole.id, `Birthday role expired (${source})`).catch(() => {});
        removed += 1;
        shouldClearExpiry = true;
      }

      if (shouldClearExpiry && (entry.roleGrantedAt || entry.roleExpiresAt)) {
        nextEntry.roleGrantedAt = null;
        nextEntry.roleExpiresAt = null;
        nextEntry.lastBirthdayRoleYear = entry.lastBirthdayRoleYear || null;
        expired += 1;
      }
    }

    if (!member) {
      updatedEntries.push([userId, nextEntry]);
      continue;
    }

    const entryKey = getBirthdayKey(normalized.month, normalized.day);
      if (entryKey === todayKey && entry.lastBirthdayRoleYear !== currentYear) {
      let shouldMarkRoleYear = false;

      if (birthdayRole) {
        if (member.roles.cache.has(birthdayRole.id)) {
          shouldMarkRoleYear = true;
        } else if (member.manageable) {
          await member.roles.add(birthdayRole.id, `Birthday role granted (${source})`).catch(() => {});
          granted += 1;
          shouldMarkRoleYear = true;
        }
      }

      if (shouldMarkRoleYear) {
        nextEntry.roleGrantedAt = now.toISOString();
        nextEntry.roleExpiresAt = new Date(Date.now() + BIRTHDAY_ROLE_DURATION_MS).toISOString();
        nextEntry.lastBirthdayRoleYear = currentYear;
      }

      if (announcementChannel && entry.lastBirthdayAnnouncementYear !== currentYear) {
        await announcementChannel.send({
          embeds: [
            makeEmbed({
              title: "Birthday chaos, lovingly",
              description: `It’s <@${userId}>’s birthday today, which means cake is mandatory, confetti is suspiciously everywhere, and the vibe is officially extra bubbly. Happy birthday, star!`,
              color: COLORS.pink,
              fields: [
                { name: "Birthday", value: formatBirthdayMonthDay(normalized.month, normalized.day), inline: true },
                { name: "Role duration", value: formatDuration(BIRTHDAY_ROLE_DURATION_MS), inline: true }
              ],
              image: { url: "attachment://birthday-card.png" }
            })
          ],
          files: [buildBirthdayCardAttachment()]
        }).catch(() => {});
        nextEntry.lastBirthdayAnnouncementYear = currentYear;
        announced += 1;
      }
    }

    updatedEntries.push([userId, nextEntry]);
  }

  if (updatedEntries.length) {
    config.birthdays = Object.fromEntries(updatedEntries);
    saveConfig();
  }

  return {
    checked: birthdayEntries.length,
    granted,
    removed,
    announced,
    expired
  };
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

function shouldSendScheduledReport() {
  const settings = config.reportSettings || {};
  if (!settings.enabled || !settings.channelId) return false;
  const last = settings.lastSentAt ? new Date(settings.lastSentAt).getTime() : 0;
  const interval = settings.frequency === "weekly" ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return Date.now() - last >= interval;
}

async function sendScheduledModReport() {
  if (!client.isReady() || !shouldSendScheduledReport()) return;
  const settings = config.reportSettings;
  const channel = await client.channels.fetch(settings.channelId).catch(() => null);
  if (!channel?.send) return;

  const ops = buildWebOpsPayload(true);
  const analytics = getAutoModAnalytics();
  await channel.send({
    embeds: [
      makeEmbed({
        title: "Mochi moderation report",
        description: `Scheduled ${settings.frequency || "daily"} moderation summary.`,
        color: COLORS.blue,
        fields: [
          { name: "Cases", value: `${config.cases.length}`, inline: true },
          { name: "Open AI Reviews", value: `${ops.openAiReviews}`, inline: true },
          { name: "AI False Positives", value: `${ops.falsePositiveCount}`, inline: true },
          { name: "AutoMod Detections", value: `${analytics.totalDetections || 0}`, inline: true },
          { name: "Top Risk Users", value: ops.riskUsers.slice(0, 5).map(user => `${user.tag}: ${user.score}`).join("\n") || "None", inline: false }
        ]
      })
    ]
  }).catch(() => null);

  config.reportSettings.lastSentAt = new Date().toISOString();
  saveConfig();
}

function startScheduledReports() {
  if (scheduledReportInterval) clearInterval(scheduledReportInterval);
  scheduledReportInterval = setInterval(() => {
    sendScheduledModReport().catch(error => log.error("Scheduled report error.", error));
  }, 15 * 60 * 1000);
}

function isAutoModExempt(message) {
  if (!message.member) return true;
  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  if (config.automod.exemptChannelIds.includes(message.channel.id)) return true;
  if (config.automod.exemptUserIds.includes(message.author.id)) return true;

  return message.member.roles.cache.some(role => config.automod.exemptRoleIds.includes(role.id));
}

function isLikelyLatinText(content) {
  const letters = String(content || "").match(/\p{L}/gu) || [];
  if (!letters.length) return true;
  const latin = String(content || "").match(/[A-Za-z]/g) || [];
  return latin.length / letters.length >= 0.5;
}

function hasExcessiveCaps(content, automod = config.automod) {
  if (automod.languageAwareFiltersEnabled && !isLikelyLatinText(content)) return false;
  const letters = content.match(/[a-z]/gi) || [];
  if (letters.length < 12) return false;

  const uppercaseCount = (content.match(/[A-Z]/g) || []).length;
  return uppercaseCount / letters.length >= 0.7;
}

function getSpamWindowMs(automod = config.automod) {
  const value = Number(automod.spamWindowMs);
  return Number.isFinite(value) ? Math.max(1000, Math.min(60 * 1000, value)) : 8000;
}

function getSpamBurstThreshold(automod = config.automod) {
  const value = Number(automod.spamBurstThreshold);
  return Number.isFinite(value) ? Math.max(2, Math.min(20, value)) : 5;
}

function getSpamDuplicateThreshold(automod = config.automod) {
  const value = Number(automod.spamDuplicateThreshold);
  return Number.isFinite(value) ? Math.max(2, Math.min(10, value)) : 3;
}

function getContextMessageCount(automod = config.automod) {
  const value = Number(automod.contextMessageCount);
  return Number.isInteger(value) ? Math.max(1, Math.min(10, value)) : 3;
}

async function trackSpam(message, automod = config.automod) {
  if (automod.languageAwareFiltersEnabled && !isLikelyLatinText(message.content)) return false;
  const now = Date.now();
  const previous = spamTracker.get(message.author.id) || [];
  const recent = previous.filter(entry => now - entry.timestamp <= getSpamWindowMs(automod));
  const normalized = message.content.trim().toLowerCase();

  recent.push({ timestamp: now, content: normalized });
  spamTracker.set(message.author.id, recent);

  const duplicateCount = recent.filter(entry => entry.content && entry.content === normalized).length;
  const contextCount = getContextMessageCount(automod);
  if (contextCount > 1 && message.channel?.messages?.fetch) {
    const history = await getRecentMessagesForUser(message.channel, message.author.id, contextCount - 1).catch(() => []);
    const repeated = history.filter(entry => normalizeComparisonText(entry.content || "").replace(/\s+/g, " ") === normalizeComparisonText(message.content || "").replace(/\s+/g, " ")).length;
    if (repeated + 1 >= getSpamDuplicateThreshold(automod)) {
      return true;
    }
  }

  return recent.length >= getSpamBurstThreshold(automod) || duplicateCount >= getSpamDuplicateThreshold(automod);
}

function normalizeTimeOfDay(value) {
  const text = String(value || "").trim();
  const match = text.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function isWithinQuietHours(automod = config.automod, date = new Date()) {
  if (!automod.quietHoursEnabled) return false;

  const start = normalizeTimeOfDay(automod.quietHoursStart || "22:00");
  const end = normalizeTimeOfDay(automod.quietHoursEnd || "08:00");
  if (!start || !end) return false;

  const current = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function resolveChannelProfile(message) {
  const lines = parseChannelProfiles(config.channelProfiles || "");
  if (!lines.length) return null;

  const channelId = String(message.channel?.id || "");
  const channelName = String(message.channel?.name || "").trim().toLowerCase();

  const matchesSelector = selector => {
    if (!selector) return false;
    if (selector === "*") return true;
    if (selector === channelId) return true;
    if (selector === channelName) return true;
    if (selector === `#${channelName}`) return true;
    return false;
  };

  return lines.find(entry => matchesSelector(entry.selector)) || null;
}

function applyPresetToAutomod(base, presetName) {
  const preset = AUTO_MOD_PRESETS[String(presetName || "").trim().toLowerCase()];
  if (!preset) return base;
  return {
    ...base,
    ...preset
  };
}

function applyChannelProfileToAutomod(base, profile) {
  if (!profile) return cloneAutoModSettings(base);

  let next = cloneAutoModSettings(base);
  if (profile.preset) {
    next = applyPresetToAutomod(next, profile.preset);
  }

  const overrides = profile.overrides || {};
  for (const [key, value] of Object.entries(overrides)) {
    if (key === "channelRuleOverrides") continue;
    if (key in next) {
      next[key] = value;
    }
  }

  return next;
}

function applyQuietHoursToAutomod(base, quietHoursActive) {
  if (!quietHoursActive) return cloneAutoModSettings(base);

  const next = cloneAutoModSettings(base);
  if (String(base.quietHoursMode || "relaxed").toLowerCase() === "strict") {
    next.spamWindowMs = Math.max(3000, Math.floor(getSpamWindowMs(base) * 0.75));
    next.spamBurstThreshold = Math.max(2, getSpamBurstThreshold(base) - 1);
    next.spamDuplicateThreshold = Math.max(2, getSpamDuplicateThreshold(base) - 1);
    next.maxMentions = Math.max(1, Number(base.maxMentions || 0) - 1);
    next.maxEmojiCount = Math.max(4, Number(base.maxEmojiCount || 0) - 2);
  } else {
    next.spamWindowMs = Math.min(60000, Math.floor(getSpamWindowMs(base) * 1.25));
    next.spamBurstThreshold = Math.min(20, getSpamBurstThreshold(base) + 1);
    next.spamDuplicateThreshold = Math.min(10, getSpamDuplicateThreshold(base) + 1);
    next.maxMentions = Math.max(1, Number(base.maxMentions || 0) + 1);
    next.maxEmojiCount = Math.max(4, Number(base.maxEmojiCount || 0) + 2);
  }

  return next;
}

function resolveAutoModPolicy(message) {
  const profile = resolveChannelProfile(message);
  const base = cloneAutoModSettings(config.automod);
  const withProfile = applyChannelProfileToAutomod(base, profile);
  const quietHoursActive = isWithinQuietHours(withProfile);
  const automod = applyQuietHoursToAutomod(withProfile, quietHoursActive);
  const ignoredRules = new Set([
    ...(Array.isArray(automod.channelRuleOverrides?.[message.channel.id]) ? automod.channelRuleOverrides[message.channel.id] : []),
    ...(Array.isArray(profile?.overrides?.channelRuleOverrides) ? profile.overrides.channelRuleOverrides : [])
  ]);

  return {
    profile,
    quietHoursActive,
    automod,
    ignoredRules
  };
}

function isRuleIgnored(policy, ruleKey) {
  return Boolean(policy?.ignoredRules?.has(ruleKey));
}

function buildAutoModCaseDetails(message, extraDetails = [], policy = null) {
  const details = [
    { name: "Channel", value: `${message.channel}`, inline: true },
    { name: "Dry Run", value: policy?.automod?.dryRunEnabled ? "Yes" : "No", inline: true },
    ...(policy?.profile
      ? [{ name: "Channel Profile", value: policy.profile.selector, inline: true }]
      : []),
    ...(policy?.quietHoursActive
      ? [{ name: "Quiet Hours", value: String(policy.automod?.quietHoursMode || "relaxed"), inline: true }]
      : []),
    {
      name: "Message",
      value: message.content?.slice(0, 1024) || "*No text content*",
      inline: false
    },
    ...extraDetails
  ];

  return details;
}

function getMessageContextPreview(message, automod = config.automod) {
  const count = Math.max(1, Math.min(10, Number(automod.contextMessageCount) || 3));
  return getRecentMessagesForUser(message.channel, message.author.id, count).catch(() => []);
}

async function evaluateAutoModMessage(message, policy = resolveAutoModPolicy(message), previewOnly = false) {
  const automod = policy.automod;
  const accountAgeMs = getAccountAgeMs(message.author);
  const memberAgeMs = getMemberAgeMs(message.member);
  const messageDomains = extractMessageDomains(message.content);
  const normalizedBlockedDomains = (automod.blockedDomains || []).map(normalizeDomain);
  const normalizedAllowedDomains = (automod.allowedDomains || []).map(normalizeDomain);
  const contextMessages = [];

  const matches = [];
  const addMatch = match => {
    if (match && !isRuleIgnored(policy, match.actionLabel)) {
      matches.push(match);
    }
  };

  if (automod.scamFilterEnabled) {
    addMatch(detectScamAttempt(message, automod));
  }

  if (automod.aiModerationEnabled && matches.length === 0) {
    addMatch(await detectAiScamIssue(message, automod));
  }

  if (automod.evasionFilterEnabled) {
    addMatch(detectBypassAttempt(message.content, automod));
  }

  if (automod.ageProtectionEnabled && messageDomains.length) {
    if (automod.minAccountAgeForLinksMs > 0 && accountAgeMs < automod.minAccountAgeForLinksMs) {
      addMatch({
        actionLabel: "account-age-links",
        reason: `your Discord account must be at least ${formatDuration(automod.minAccountAgeForLinksMs)} old before posting links.`
      });
    }

    if (automod.minMemberAgeForLinksMs > 0 && memberAgeMs < automod.minMemberAgeForLinksMs) {
      addMatch({
        actionLabel: "member-age-links",
        reason: `you must be in the server for at least ${formatDuration(automod.minMemberAgeForLinksMs)} before posting links.`
      });
    }
  }

  if (automod.linksEnabled && messageDomains.length) {
    const blockedDomain = messageDomains.find(domain =>
      normalizedBlockedDomains.some(blocked => domain === blocked || domain.endsWith(`.${blocked}`))
    );

    if (blockedDomain) {
      addMatch({
        actionLabel: "blocked-domain",
        reason: `links from ${blockedDomain} are not allowed here.`
      });
    }

    if (automod.allowedDomainsOnly) {
      const disallowedDomain = messageDomains.find(domain =>
        !normalizedAllowedDomains.some(allowed => domain === allowed || domain.endsWith(`.${allowed}`))
      );

      if (disallowedDomain) {
        addMatch({
          actionLabel: "disallowed-domain",
          reason: `links from ${disallowedDomain} are not on the allowed list.`
        });
      }
    }
  }

  if (automod.attachmentsEnabled && message.attachments.size) {
    if (automod.ageProtectionEnabled) {
      if (automod.minAccountAgeForAttachmentsMs > 0 && accountAgeMs < automod.minAccountAgeForAttachmentsMs) {
        addMatch({
          actionLabel: "account-age-attachments",
          reason: `your Discord account must be at least ${formatDuration(automod.minAccountAgeForAttachmentsMs)} old before uploading attachments.`
        });
      }

      if (automod.minMemberAgeForAttachmentsMs > 0 && memberAgeMs < automod.minMemberAgeForAttachmentsMs) {
        addMatch({
          actionLabel: "member-age-attachments",
          reason: `you must be in the server for at least ${formatDuration(automod.minMemberAgeForAttachmentsMs)} before uploading attachments.`
        });
      }
    }

    const blockedExtensions = (automod.blockedAttachmentExtensions || []).map(normalizeExtension);
    const allowedExtensions = (automod.allowedAttachmentExtensions || []).map(normalizeExtension);

    for (const attachment of message.attachments.values()) {
      const fileName = attachment.name || "";
      const extension = normalizeExtension(path.extname(fileName));
      const sizeMb = attachment.size / (1024 * 1024);

      if (automod.maxAttachmentSizeMb > 0 && sizeMb > automod.maxAttachmentSizeMb) {
        addMatch({
          actionLabel: "attachment-size",
          reason: `attachments larger than ${automod.maxAttachmentSizeMb}MB are not allowed here.`
        });
      }

      if (extension && blockedExtensions.includes(extension)) {
        addMatch({
          actionLabel: "blocked-extension",
          reason: `files with the ${extension} extension are not allowed here.`
        });
      }

      if (allowedExtensions.length && (!extension || !allowedExtensions.includes(extension))) {
        addMatch({
          actionLabel: "disallowed-extension",
          reason: `only these attachment types are allowed here: ${allowedExtensions.join(", ")}.`
        });
      }
    }
  }

  if (automod.invites && INVITE_REGEX.test(message.content)) {
    addMatch({ actionLabel: "invite-link", reason: "invite links are not allowed here." });
  }

  if (automod.maxMentions > 0 && (message.mentions.users?.size || 0) >= automod.maxMentions) {
    addMatch({ actionLabel: "mass-mentions", reason: "please do not mass mention members." });
  }

  if (automod.emojiSpamEnabled && automod.maxEmojiCount > 0 && countEmoji(message.content) >= automod.maxEmojiCount) {
    addMatch({ actionLabel: "emoji-spam", reason: "please avoid emoji spam." });
  }

  if (automod.caps && hasExcessiveCaps(message.content, automod)) {
    addMatch({ actionLabel: "caps", reason: "please avoid sending all-caps messages." });
  }

  const bannedWordMatch = automod.bannedWords ? findBannedWordMatch(message.content, automod) : null;
  if (bannedWordMatch) {
    addMatch({
      actionLabel: "banned-word",
      reason: `that phrase is not allowed here (${bannedWordMatch}).`
    });
  }

  if (automod.spam && await trackSpam(message, automod)) {
    addMatch({ actionLabel: "spam", reason: "please slow down and avoid spam." });
  }

  if (automod.linkReputationEnabled && messageDomains.length) {
    const suspiciousDomain = messageDomains.find(domain => getSuspiciousDomainRisk(domain) >= 80);
    if (suspiciousDomain && !policy.ignoredRules.has("scam-link")) {
      addMatch({
        actionLabel: "scam-link",
        reason: `that message links to a suspicious domain (${suspiciousDomain}).`
      });
    }
  }

  if (previewOnly && contextMessages.length) {
    return {
      match: matches[0] || null,
      contextMessages,
      allMatches: matches
    };
  }

  return {
    match: matches[0] || null,
    contextMessages,
    allMatches: matches
  };
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

async function handleAutoModViolation(message, reason, actionLabel, extraDetails = [], options = {}) {
  const policy = options.policy || resolveAutoModPolicy(message);
  const automod = policy.automod;
  const ruleAction = getAutoModRuleAction(actionLabel, automod);
  const alertOnly = ruleAction === "alert";
  const dryRun = Boolean(options.dryRun ?? automod.dryRunEnabled);

  if (!alertOnly && !dryRun) {
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
    reason: dryRun ? `[Dry Run] ${reason}` : reason,
    details: [
      ...buildAutoModCaseDetails(message, extraDetails, policy),
      ...(dryRun ? [{ name: "Simulation", value: "This rule was previewed only.", inline: false }] : [])
    ]
  });

  const offenses = dryRun ? getAutoModOffenses(message.author.id) : recordAutoModOffense(message.author.id, actionLabel, reason);
  const activeOffenseCount = offenses.length;
  let escalationText = dryRun ? "Dry run only" : alertOnly ? "Alert only" : `Deleted (${ruleAction})`;

  if (!alertOnly && !dryRun && ruleAction === "timeout" && message.member?.moderatable) {
    await message.member.timeout(
      automod.timeoutDurationMs,
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
        { name: "Duration", value: formatDuration(automod.timeoutDurationMs), inline: true }
      ]
    });

    escalationText = `Rule action timeout applied for ${formatDuration(automod.timeoutDurationMs)}.`;

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
  } else if (!alertOnly && !dryRun && ruleAction === "kick" && message.member?.kickable) {
    const kickEntry = addCase({
      action: "automod:kick",
      targetId: message.author.id,
      targetTag: message.author.tag,
      moderatorTag: "AutoMod",
      reason: `Automatic kick from the ${actionLabel} rule. Latest: ${reason}`,
      details: [
        { name: "Rule action", value: "kick", inline: true }
      ]
    });

    escalationText = "Rule action kick applied.";

    await notifyUser(
      message.author,
      makeEmbed({
        title: "Automatic kick",
        description: `You were automatically kicked from **${message.guild.name}** by AutoMod.`,
        color: COLORS.red,
        fields: buildCaseFields(kickEntry)
      })
    );

    await message.member.kick(`AutoMod rule action (${actionLabel}): ${reason}`).catch(() => {});

    await logEmbed(
      makeEmbed({
        title: `Case #${kickEntry.id}: automod kick`,
        description: `${message.author.tag} was automatically kicked by rule action.`,
        color: COLORS.red,
        fields: buildCaseFields(kickEntry)
      })
    );
  } else if (!alertOnly && !dryRun && ruleAction === "ban") {
    const banEntry = addCase({
      action: "automod:ban",
      targetId: message.author.id,
      targetTag: message.author.tag,
      moderatorTag: "AutoMod",
      reason: `Automatic ban from the ${actionLabel} rule. Latest: ${reason}`,
      details: [
        { name: "Rule action", value: "ban", inline: true }
      ]
    });

    escalationText = "Rule action ban applied.";

    await notifyUser(
      message.author,
      makeEmbed({
        title: "Automatic ban",
        description: `You were automatically banned from **${message.guild.name}** by AutoMod.`,
        color: COLORS.red,
        fields: buildCaseFields(banEntry)
      })
    );

    await message.guild.members.ban(message.author.id, { reason: `AutoMod rule action (${actionLabel}): ${reason}` }).catch(() => {});

    await logEmbed(
      makeEmbed({
        title: `Case #${banEntry.id}: automod ban`,
        description: `${message.author.tag} was automatically banned by rule action.`,
        color: COLORS.red,
        fields: buildCaseFields(banEntry)
      })
    );
  } else if (!alertOnly && !dryRun && ruleAction === "warn") {
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

  if (automod.escalationEnabled && !alertOnly && !dryRun && ruleAction === "delete") {
    if (
      activeOffenseCount >= config.automod.timeoutThreshold &&
      message.member &&
      message.member.moderatable
    ) {
      await message.member.timeout(
        automod.timeoutDurationMs,
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
          { name: "Duration", value: formatDuration(automod.timeoutDurationMs), inline: true }
        ]
      });

      escalationText = `Automatic timeout applied for ${formatDuration(automod.timeoutDurationMs)}.`;

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
    } else if (activeOffenseCount >= automod.warnThreshold && ruleAction !== "warn") {
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
      description: alertOnly
        ? `${message.author.tag} matched an AutoMod review rule.`
        : dryRun
          ? `${message.author.tag} matched an AutoMod rule in dry-run mode.`
          : `${message.author.tag} had a message removed.`,
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

function buildAutoModSummary() {
  const channelProfileCount = parseChannelProfiles(config.channelProfiles || "").length;
  const overrideCount = Object.values(config.automod.channelRuleOverrides || {}).reduce((sum, rules) => sum + (Array.isArray(rules) ? rules.length : 0), 0);
  return [
    `Invites: ${config.automod.invites ? "on" : "off"}`,
    `Spam: ${config.automod.spam ? "on" : "off"}`,
    `Caps: ${config.automod.caps ? "on" : "off"}`,
    `Banned words: ${config.automod.bannedWords ? "on" : "off"}`,
    `Banned word context: ${getBannedWordsContextSensitivity()}`,
    `Banned word count: ${getBannedWords().length}`,
    `Scam filter: ${config.automod.scamFilterEnabled ? "on" : "off"}`,
    `Scam phrase count: ${getScamPhrases().length}`,
    `Evasion filter: ${config.automod.evasionFilterEnabled ? "on" : "off"}`,
    `AI moderation: ${config.automod.aiModerationEnabled ? "on" : "off"}`,
    `AI custom rules: ${config.automod.aiCustomRulesEnabled ? "on" : "off"}`,
    `AI model: ${config.automod.aiModerationModel}`,
    `AI threshold: ${config.automod.aiModerationThreshold}%`,
    `AI context: ${config.automod.aiIncludeRecentContext ? `${config.automod.aiContextMessageCount} msgs` : "off"}`,
    `Link filtering: ${config.automod.linksEnabled ? "on" : "off"}`,
    `Allowed links only: ${config.automod.allowedDomainsOnly ? "on" : "off"}`,
    `Allowed domains: ${config.automod.allowedDomains.length}`,
    `Blocked domains: ${config.automod.blockedDomains.length}`,
    `Dry run: ${config.automod.dryRunEnabled ? "on" : "off"}`,
    `Quiet hours: ${config.automod.quietHoursEnabled ? `${config.automod.quietHoursStart}-${config.automod.quietHoursEnd}` : "off"}`,
    `Channel profiles: ${channelProfileCount}`,
    `Channel overrides: ${overrideCount}`,
    `Context window: ${getContextMessageCount(config.automod)}`,
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
    `Verification CAPTCHA: ${isVerificationCaptchaEnabled() ? "Enabled" : "Disabled"}`,
    `Rules channel: ${getRulesChannelId() ? `<#${getRulesChannelId()}>` : "Not set"}`,
    `General chat: ${getGeneralChatChannelId() ? `<#${getGeneralChatChannelId()}>` : "Not set"}`,
    `General chat inactivity: ${isGeneralChatInactivityEnabled() ? "Enabled" : "Disabled"}`,
    `Anonymous affirmations: ${isAnonymousAffirmationsEnabled() ? "Enabled" : "Disabled"} (${getAnonymousAffirmationsChannelId() ? `<#${getAnonymousAffirmationsChannelId()}>` : "Not set"})`,
    `Muted role: ${getMutedRoleId() ? `<@&${getMutedRoleId()}>` : "Not set"}`,
    buildBirthdaySummary(),
    buildTikTokVerificationSummary()
  ].join("\n");
}

async function sendAnonymousAffirmation(author, message) {
  if (!isAnonymousAffirmationsEnabled()) {
    throw new Error("Anonymous affirmations are disabled right now.");
  }

  const channelId = getAnonymousAffirmationsChannelId();
  if (!channelId) {
    throw new Error("Set an affirmations channel first.");
  }

  const lastSentAt = anonymousAffirmationCooldowns.get(author.id) || 0;
  const cooldownMs = getAnonymousAffirmationsCooldownMs();
  const elapsed = Date.now() - lastSentAt;
  if (elapsed < cooldownMs) {
    const remainingSeconds = Math.ceil((cooldownMs - elapsed) / 1000);
    throw new Error(`Please wait ${remainingSeconds}s before sending another affirmation.`);
  }

  const content = String(message || "").trim().slice(0, 1500);
  if (!content) {
    throw new Error("Write an affirmation before sending it.");
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.send) {
    throw new Error("The affirmations channel could not be found or cannot send messages.");
  }

  await channel.send({
    embeds: [
      makeEmbed({
        title: "A little anonymous kindness",
        description: content,
        color: COLORS.pink,
        footer: {
          text: "Sent with love through the affirmations button"
        }
      })
    ]
  });

  anonymousAffirmationCooldowns.set(author.id, Date.now());
  return { channelId };
}

function buildTikTokVerifyEmbed() {
  const handle = getTikTokHandle();
  const aliases = getTikTokNicknameAliases();
  return makeEmbed({
    title: "TikTok bonus verification",
    description:
      handle
        ? `Optional bonus path: pick a flavor role below, then tap **Set My Name** and type your TikTok username.\n\nI’ll match it against **@${handle}** and any saved nicknames, then hand you the verified role if it matches.`
        : `Optional bonus path: pick a flavor role by reacting below, then tap the button and type your TikTok username.\n\nAsk staff if you are not sure what format they want.`,
    color: COLORS.pink,
    fields: [
      { name: "🌸 Bonus handle", value: handle ? `@${handle}` : "Not set", inline: true },
      { name: "✨ Verified role", value: getVerificationRoleId() ? `<@&${getVerificationRoleId()}>` : "Not set", inline: true },
      { name: "🫧 Unverified role", value: getUnverifiedRoleId() ? `<@&${getUnverifiedRoleId()}>` : "Optional", inline: true },
      { name: "🍡 Saved nicknames", value: aliases.length ? `${aliases.length} saved` : "None saved", inline: false },
      { name: "How it works", value: "1. Tap Set My Name\n2. Type your TikTok username\n3. Enjoy the garden if it matches", inline: false },
      { name: "Flavor roles", value: "Optional flavor-role reactions live on the main verify panel.", inline: false }
    ]
  });
}

function buildTikTokVerifyCardAttachment() {
  return {
    attachment: fs.readFileSync(path.join(__dirname, "assets", "tiktok-verify-card.png")),
    name: "tiktok-verify-card.png"
  };
}

async function addMochiRoleReactions(message) {
  for (const emoji of Object.keys(MOCHI_ROLES)) {
    await message.react(emoji).catch(() => {});
  }
}

function buildTikTokSuccessCardAttachment(finalNickname) {
  const nickname = String(finalNickname || "").replace(/^@+/, "").trim() || "username";
  const canvas = createCanvas(1280, 520);
  const ctx = canvas.getContext("2d");

  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const fillRR = (x, y, w, h, r, fill) => {
    ctx.save();
    rr(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  };

  const strokeRR = (x, y, w, h, r, stroke, lw = 2) => {
    ctx.save();
    rr(x, y, w, h, r);
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.restore();
  };

  const bg = ctx.createLinearGradient(0, 0, 1280, 520);
  bg.addColorStop(0, "#eff8ef");
  bg.addColorStop(1, "#dff0df");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1280, 520);

  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#ffffff";
  for (const [x, y, r] of [[110, 110, 90], [1160, 90, 130], [1040, 430, 100], [240, 420, 110]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  fillRR(60, 40, 1160, 440, 32, "rgba(27, 32, 40, 0.78)");
  strokeRR(60, 40, 1160, 440, 32, "rgba(126, 190, 132, 0.75)", 3);

  const panel = ctx.createLinearGradient(120, 100, 1180, 430);
  panel.addColorStop(0, "rgba(39, 46, 54, 0.96)");
  panel.addColorStop(1, "rgba(31, 37, 44, 0.94)");
  fillRR(120, 80, 1040, 360, 28, panel);
  strokeRR(120, 80, 1040, 360, 28, "rgba(141, 212, 149, 0.65)", 2);

  ctx.save();
  ctx.translate(210, 230);
  ctx.fillStyle = "#78c27a";
  ctx.beginPath();
  ctx.arc(0, 0, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = "#f5fff5";
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-28, 2);
  ctx.lineTo(-7, 24);
  ctx.lineTo(34, -22);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#d8f7d8";
  ctx.font = "bold 54px sans-serif";
  ctx.fillText("Nickname updated", 320, 165);
  ctx.fillStyle = "#a9d8a5";
  ctx.font = "24px sans-serif";
  ctx.fillText(`Final nickname: @${nickname}`, 320, 222);
  ctx.fillStyle = "#cfe7cc";
  ctx.font = "22px sans-serif";
  ctx.fillText("Enjoy the garden!", 320, 270);

  ctx.strokeStyle = "rgba(217, 243, 214, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(320, 252);
  ctx.lineTo(560, 252);
  ctx.stroke();

  ctx.save();
  ctx.translate(980, 220);
  ctx.fillStyle = "#3d4740";
  ctx.beginPath();
  ctx.arc(0, 0, 102, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f6f7ee";
  ctx.beginPath();
  ctx.arc(0, 0, 84, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f3a7c0";
  ctx.beginPath();
  ctx.arc(0, 0, 88, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = "#fff9fc";
  ctx.beginPath();
  ctx.arc(0, 0, 78, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2f2732";
  ctx.beginPath();
  ctx.arc(-28, -7, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(28, -7, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#d98aa2";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 16, 17, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = "#f7c6d7";
  ctx.beginPath();
  ctx.arc(-35, 15, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(35, 15, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#7c6e84";
  ctx.font = "20px sans-serif";
  ctx.fillText("You’re all set. Enjoy the garden!", 150, 850);

  return {
    attachment: canvas.toBuffer("image/png"),
    name: "tiktok-success-card.png"
  };
}

function buildTikTokPendingCardAttachment(enteredName) {
  const username = String(enteredName || "").replace(/^@+/, "").trim() || "username";
  const canvas = createCanvas(1280, 520);
  const ctx = canvas.getContext("2d");

  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const fillRR = (x, y, w, h, r, fill) => {
    ctx.save();
    rr(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  };

  const strokeRR = (x, y, w, h, r, stroke, lw = 2) => {
    ctx.save();
    rr(x, y, w, h, r);
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.restore();
  };

  const bg = ctx.createLinearGradient(0, 0, 1280, 520);
  bg.addColorStop(0, "#fff5df");
  bg.addColorStop(1, "#f4e7bf");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1280, 520);

  ctx.globalAlpha = 0.2;
  ctx.fillStyle = "#ffffff";
  for (const [x, y, r] of [[120, 105, 88], [1110, 110, 120], [1060, 425, 108], [260, 420, 112]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  fillRR(60, 40, 1160, 440, 32, "rgba(55, 43, 28, 0.78)");
  strokeRR(60, 40, 1160, 440, 32, "rgba(232, 198, 112, 0.75)", 3);

  const panel = ctx.createLinearGradient(120, 100, 1180, 430);
  panel.addColorStop(0, "rgba(50, 42, 30, 0.96)");
  panel.addColorStop(1, "rgba(38, 33, 26, 0.95)");
  fillRR(120, 80, 1040, 360, 28, panel);
  strokeRR(120, 80, 1040, 360, 28, "rgba(241, 207, 122, 0.65)", 2);

  ctx.save();
  ctx.translate(210, 230);
  ctx.fillStyle = "#dfbf58";
  ctx.beginPath();
  ctx.arc(0, 0, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = "#fff5d9";
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-28, 2);
  ctx.lineTo(-7, 24);
  ctx.lineTo(34, -22);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#fff2ba";
  ctx.font = "bold 54px sans-serif";
  ctx.fillText("Name saved", 320, 165);
  ctx.fillStyle = "#f3d98f";
  ctx.font = "24px sans-serif";
  ctx.fillText(`Waiting for @${username}`, 320, 222);
  ctx.fillStyle = "#f6e2b7";
  ctx.font = "22px sans-serif";
  ctx.fillText("Try again once it matches the handle.", 320, 270);

  ctx.strokeStyle = "rgba(246, 225, 173, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(320, 252);
  ctx.lineTo(560, 252);
  ctx.stroke();

  ctx.save();
  ctx.translate(980, 220);
  ctx.fillStyle = "#5b5146";
  ctx.beginPath();
  ctx.arc(0, 0, 102, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff8e8";
  ctx.beginPath();
  ctx.arc(0, 0, 84, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f0cc7c";
  ctx.beginPath();
  ctx.arc(0, 0, 88, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = "#fffdf5";
  ctx.beginPath();
  ctx.arc(0, 0, 78, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2f2732";
  ctx.beginPath();
  ctx.arc(-28, -7, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(28, -7, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#d7ae4d";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 18, 17, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = "#efd38a";
  ctx.beginPath();
  ctx.arc(-35, 15, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(35, 15, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#7c6e84";
  ctx.font = "20px sans-serif";
  ctx.fillText("Set it to match the handle and tap Set My Name again.", 150, 850);

  return {
    attachment: canvas.toBuffer("image/png"),
    name: "tiktok-pending-card.png"
  };
}

function buildTikTokErrorCardAttachment(reason, enteredName, mode = "generic") {
  const username = String(enteredName || "").replace(/^@+/, "").trim() || "username";
  const message = String(reason || "Something went wrong.").trim() || "Something went wrong.";
  const canvas = createCanvas(1280, 520);
  const ctx = canvas.getContext("2d");

  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const fillRR = (x, y, w, h, r, fill) => {
    ctx.save();
    rr(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  };

  const strokeRR = (x, y, w, h, r, stroke, lw = 2) => {
    ctx.save();
    rr(x, y, w, h, r);
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.restore();
  };

  const isPermission = mode === "permission";
  const bg = ctx.createLinearGradient(0, 0, 1280, 520);
  bg.addColorStop(0, isPermission ? "#fff0df" : "#ffe9ea");
  bg.addColorStop(1, isPermission ? "#f3deb7" : "#f3d4d7");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1280, 520);

  ctx.globalAlpha = 0.2;
  ctx.fillStyle = "#ffffff";
  for (const [x, y, r] of [[110, 110, 90], [1160, 90, 130], [1040, 430, 100], [240, 420, 110]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  fillRR(60, 40, 1160, 440, 32, isPermission ? "rgba(57, 38, 25, 0.8)" : "rgba(55, 30, 34, 0.8)");
  strokeRR(60, 40, 1160, 440, 32, isPermission ? "rgba(240, 194, 111, 0.78)" : "rgba(238, 151, 162, 0.78)", 3);

  const panel = ctx.createLinearGradient(120, 100, 1180, 430);
  panel.addColorStop(0, isPermission ? "rgba(49, 36, 22, 0.97)" : "rgba(42, 27, 30, 0.97)");
  panel.addColorStop(1, isPermission ? "rgba(36, 27, 18, 0.95)" : "rgba(31, 21, 25, 0.95)");
  fillRR(120, 80, 1040, 360, 28, panel);
  strokeRR(120, 80, 1040, 360, 28, isPermission ? "rgba(242, 208, 133, 0.68)" : "rgba(239, 165, 175, 0.68)", 2);

  ctx.save();
  ctx.translate(210, 230);
  ctx.fillStyle = isPermission ? "#e6bf56" : "#f09ea9";
  ctx.beginPath();
  ctx.arc(0, 0, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = isPermission ? "#fff7da" : "#fff1f2";
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-28, 2);
  ctx.lineTo(-7, 24);
  ctx.lineTo(34, -22);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = isPermission ? "#fff0b8" : "#ffd9df";
  ctx.font = "bold 54px sans-serif";
  ctx.fillText(isPermission ? "Needs staff help" : "Try again", 320, 165);
  ctx.fillStyle = isPermission ? "#f1d08a" : "#e9b9bf";
  ctx.font = "24px sans-serif";
  ctx.fillText(message, 320, 222);
  ctx.fillStyle = isPermission ? "#f8e8bf" : "#f0cdd1";
  ctx.font = "22px sans-serif";
  ctx.fillText(isPermission ? `Staff may need to update permissions.` : `We saw @${username} on this try.`, 320, 270);

  ctx.strokeStyle = isPermission ? "rgba(244, 220, 173, 0.4)" : "rgba(244, 198, 205, 0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(320, 252);
  ctx.lineTo(560, 252);
  ctx.stroke();

  ctx.save();
  ctx.translate(980, 220);
  ctx.fillStyle = isPermission ? "#6a5431" : "#5a2d36";
  ctx.beginPath();
  ctx.arc(0, 0, 102, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = isPermission ? "#fff8e4" : "#fff7f8";
  ctx.beginPath();
  ctx.arc(0, 0, 84, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = isPermission ? "#efcf84" : "#f5c4cb";
  ctx.beginPath();
  ctx.arc(0, 0, 88, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = "#fff9fb";
  ctx.beginPath();
  ctx.arc(0, 0, 78, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2f2732";
  ctx.beginPath();
  ctx.arc(-28, -7, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(28, -7, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = isPermission ? "#c89a46" : "#c97b8d";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 18, 17, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = isPermission ? "#f3d88b" : "#f7c6d7";
  ctx.beginPath();
  ctx.arc(-35, 15, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(35, 15, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#7c6e84";
  ctx.font = "20px sans-serif";
  ctx.fillText(
    isPermission
      ? "Ask staff to fix the setup, then try Set My Name again."
      : "Set it to match the handle and tap Set My Name again.",
    150,
    850
  );

  return {
    attachment: canvas.toBuffer("image/png"),
    name: "tiktok-error-card.png"
  };
}

function buildTikTokNameModal() {
  const modal = new ModalBuilder()
    .setCustomId("verify:tiktok-name")
    .setTitle("Set your TikTok name");

  const input = new TextInputBuilder()
    .setCustomId("tiktokName")
    .setLabel("TikTok username")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("@yourname or tiktok.com/@yourname")
    .setMaxLength(100);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function buildTikTokVerifyComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("verify:tiktok-check")
        .setLabel("Set My Name")
        .setEmoji("🌸")
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

function buildAnonymousAffirmationsEmbed() {
  return makeEmbed({
    title: "Anonymous affirmations",
    description: isAnonymousAffirmationsEnabled()
      ? "Got a little sunshine to share? Tap the button below and send a sweet note anonymously."
      : "This little kindness corner is paused for now. Staff can turn it back on in Settings.",
    color: COLORS.pink,
    fields: [
      { name: "How it works", value: "Tap the button, write your message, and I’ll tuck it into the chat anonymously.", inline: false },
      { name: "Tips", value: "Short, kind, and cozy messages work best.", inline: false },
      { name: "Cooldown", value: `${Math.round(getAnonymousAffirmationsCooldownMs() / 1000)} seconds`, inline: true },
      { name: "Status", value: isAnonymousAffirmationsEnabled() ? "Enabled" : "Disabled", inline: true }
    ]
  });
}

function buildAnonymousAffirmationsComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("affirmations:open")
        .setLabel("Send a sweet note")
        .setEmoji("💌")
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

function buildAnonymousAffirmationModal() {
  const modal = new ModalBuilder()
    .setCustomId("affirmations:submit")
    .setTitle("Send a sweet note");

  const input = new TextInputBuilder()
    .setCustomId("affirmation")
    .setLabel("Your sweet note")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder("Write something kind, supportive, or encouraging.")
    .setMaxLength(1500);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

async function postAnonymousAffirmationsPanel(source = "manual") {
  const channelId = getAnonymousAffirmationsChannelId();
  if (!channelId) {
    throw new Error("Set an affirmations channel first.");
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.send) {
    throw new Error("The affirmations channel could not be found or cannot send messages.");
  }

  const message = await channel.send({
    embeds: [buildAnonymousAffirmationsEmbed()],
    components: buildAnonymousAffirmationsComponents()
  });

  recordAuditLog(source, "affirmations-panel-posted", {
    channelId,
    messageId: message.id
  });

  return message;
}

function getVerifiedVisibilityRoots(guild, scope, referenceChannel) {
  const normalizedScope = String(scope || "current").toLowerCase();
  if (normalizedScope === "all") {
    return [...guild.channels.cache.values()].filter(channel => channel?.type === ChannelType.GuildCategory);
  }

  if (referenceChannel?.type === ChannelType.GuildCategory) {
    return [referenceChannel];
  }

  const parent = referenceChannel?.parent;
  if (parent?.type === ChannelType.GuildCategory) {
    return [parent];
  }

  return referenceChannel ? [referenceChannel] : [];
}

async function setVerifiedVisibility(channel, locked) {
  if (!channel?.permissionOverwrites?.edit) return false;

  const verifiedRoleId = getVerificationRoleId();
  const unverifiedRoleId = getUnverifiedRoleId();

  if (locked) {
    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { ViewChannel: false }).catch(() => {});
    await channel.permissionOverwrites.edit(verifiedRoleId, { ViewChannel: true }).catch(() => {});
    if (unverifiedRoleId) {
      await channel.permissionOverwrites.edit(unverifiedRoleId, { ViewChannel: false }).catch(() => {});
    }
    for (const roleId of ALL_ROLES) {
      if (roleId) {
        await channel.permissionOverwrites.edit(roleId, { ViewChannel: false }).catch(() => {});
      }
    }
  } else {
    await channel.permissionOverwrites.delete(channel.guild.roles.everyone).catch(() => {});
    await channel.permissionOverwrites.delete(verifiedRoleId).catch(() => {});
    if (unverifiedRoleId) {
      await channel.permissionOverwrites.delete(unverifiedRoleId).catch(() => {});
    }
    for (const roleId of ALL_ROLES) {
      if (roleId) {
        await channel.permissionOverwrites.delete(roleId).catch(() => {});
      }
    }
  }

  return true;
}

async function setWelcomeVisibility(channel, locked) {
  if (!channel?.permissionOverwrites?.edit) return false;

  const verifiedRoleId = getVerificationRoleId();
  const unverifiedRoleId = getUnverifiedRoleId();

  if (locked) {
    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { ViewChannel: false }).catch(() => {});
    if (verifiedRoleId) {
      await channel.permissionOverwrites.edit(verifiedRoleId, { ViewChannel: false }).catch(() => {});
    }
    if (unverifiedRoleId) {
      await channel.permissionOverwrites.edit(unverifiedRoleId, { ViewChannel: true }).catch(() => {});
    }
    for (const roleId of ALL_ROLES) {
      if (roleId) {
        await channel.permissionOverwrites.edit(roleId, { ViewChannel: false }).catch(() => {});
      }
    }
  } else {
    await channel.permissionOverwrites.delete(channel.guild.roles.everyone).catch(() => {});
    if (verifiedRoleId) {
      await channel.permissionOverwrites.delete(verifiedRoleId).catch(() => {});
    }
    if (unverifiedRoleId) {
      await channel.permissionOverwrites.delete(unverifiedRoleId).catch(() => {});
    }
    for (const roleId of ALL_ROLES) {
      if (roleId) {
        await channel.permissionOverwrites.delete(roleId).catch(() => {});
      }
    }
  }

  return true;
}

async function enforceFlavorRoleVisibility(guild) {
  if (!guild?.channels?.cache) return 0;

  let updated = 0;
  for (const channel of guild.channels.cache.values()) {
    if (!channel?.permissionOverwrites?.edit) continue;

    for (const roleId of ALL_ROLES) {
      if (!roleId) continue;
      try {
        await channel.permissionOverwrites.edit(roleId, { ViewChannel: false });
        updated += 1;
      } catch {
        // Ignore channels the bot cannot edit.
      }
    }
  }

  return updated;
}

async function setVerifyChannelVisibility(channel, locked) {
  if (!channel?.permissionOverwrites?.edit) return false;

  const verifiedRoleId = getVerificationRoleId();
  const unverifiedRoleId = getUnverifiedRoleId();

  if (locked) {
    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { ViewChannel: true }).catch(() => {});
    if (verifiedRoleId) {
      await channel.permissionOverwrites.edit(verifiedRoleId, { ViewChannel: true }).catch(() => {});
    }
    if (unverifiedRoleId) {
      await channel.permissionOverwrites.edit(unverifiedRoleId, { ViewChannel: true }).catch(() => {});
    }
  } else {
    await channel.permissionOverwrites.delete(channel.guild.roles.everyone).catch(() => {});
    if (verifiedRoleId) {
      await channel.permissionOverwrites.delete(verifiedRoleId).catch(() => {});
    }
    if (unverifiedRoleId) {
      await channel.permissionOverwrites.delete(unverifiedRoleId).catch(() => {});
    }
  }

  return true;
}

async function applyVerifiedVisibilityScope(guild, scope, referenceChannel, locked) {
  const verifiedRoleId = getVerificationRoleId();
  if (!verifiedRoleId) {
    throw new Error("Set the verified role first.");
  }

  const roots = getVerifiedVisibilityRoots(guild, scope, referenceChannel);
  if (!roots.length) {
    throw new Error("Pick a category channel or use the all categories option.");
  }

  let updated = 0;
  for (const root of roots) {
    const targets = [
      root,
      ...guild.channels.cache
        .filter(channel => channel.parentId === root.id && !(typeof channel.isThread === "function" && channel.isThread()))
        .values()
    ];

    for (const target of targets) {
      if (await setVerifiedVisibility(target, locked)) {
        updated += 1;
      }
    }
  }

  const welcomeChannelId = getWelcomeChannelId();
  const verifyChannelId = getVerifyChannelId();
  const sharedOnboardingChannelId = welcomeChannelId && verifyChannelId && String(welcomeChannelId) === String(verifyChannelId)
    ? verifyChannelId
    : null;

  if (welcomeChannelId && !sharedOnboardingChannelId) {
    const welcomeChannel = await guild.channels.fetch(welcomeChannelId).catch(() => null);
    if (welcomeChannel) {
      await setWelcomeVisibility(welcomeChannel, locked);
    }
  }

  if (verifyChannelId) {
    const verifyChannel = await guild.channels.fetch(verifyChannelId).catch(() => null);
    if (verifyChannel) {
      await setVerifyChannelVisibility(verifyChannel, locked);
    }
  }

  return updated;
}

async function markAllMembersUnverified(guild) {
  const verifiedRoleId = getVerificationRoleId();
  const unverifiedRoleId = getUnverifiedRoleId();

  if (!verifiedRoleId) {
    throw new Error("Set the verified role first.");
  }

  if (!unverifiedRoleId) {
    throw new Error("Set the unverified role first.");
  }

  const members = await guild.members.fetch().catch(() => null);
  if (!members) {
    throw new Error("The server members could not be loaded.");
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const member of members.values()) {
    if (member.user?.bot) continue;

    const hasVerified = member.roles.cache.has(verifiedRoleId);
    const hasUnverified = member.roles.cache.has(unverifiedRoleId);
    const wantsUnverified = !hasVerified;

    if (hasVerified && hasUnverified) {
      if (!member.manageable) {
        skipped += 1;
        continue;
      }

      try {
        await member.roles.remove(unverifiedRoleId, "Bulk verification sweep: remove unverified from verified members");
        updated += 1;
      } catch {
        failed += 1;
      }
      continue;
    }

    if (wantsUnverified && !hasUnverified) {
      if (!member.manageable) {
        skipped += 1;
        continue;
      }

      try {
        await member.roles.add(unverifiedRoleId, "Bulk verification sweep: mark unverified members");
        updated += 1;
      } catch {
        failed += 1;
      }
    }
  }

  return {
    total: members.size,
    updated,
    skipped,
    failed
  };
}

async function postTikTokVerifyPanel(source = "manual") {
  const setupIssues = getTikTokVerificationSetupIssues();
  if (setupIssues.length) {
    const listed = setupIssues.length === 1
      ? setupIssues[0]
      : `${setupIssues.slice(0, -1).join(", ")} and ${setupIssues[setupIssues.length - 1]}`;
    throw new Error(`Set the ${listed} first.`);
  }

  const verifyChannelId = getVerifyChannelId();

  const verifyChannel = await client.channels.fetch(verifyChannelId).catch(() => null);
  if (!verifyChannel || typeof verifyChannel.send !== "function") {
    throw new Error("The verify channel could not be found.");
  }

  const botMember = verifyChannel.guild?.members?.me || verifyChannel.guild?.members?.cache?.get(client.user.id) || null;
  const requiredPermissions = ["ViewChannel", "SendMessages", "EmbedLinks"];
  if (botMember && typeof verifyChannel.permissionsFor === "function") {
    const permissions = verifyChannel.permissionsFor(botMember);
    const missing = requiredPermissions.filter(permission => !permissions?.has(PermissionFlagsBits[permission]));
    if (missing.length) {
      throw new Error(`I am missing permissions in the verify channel: ${missing.join(", ")}.`);
    }
  }

  const sentMessage = await verifyChannel.send({
    embeds: [buildTikTokVerifyEmbed()],
    components: buildTikTokVerifyComponents()
  });
  config.bonusVerifyMessageId = sentMessage.id;
  saveConfig();

  return {
    channelId: verifyChannelId,
    messageId: sentMessage.id,
    source
  };
}

function buildHelpEmbed() {
  const fields = [
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
      name: "Verification",
      value: "`/verify`, `/setupverify`, `/setuptiktokverify`, `/lockverified`, `/unlockverified`, `/settings`\nMost members should use the rules + button verify flow. CAPTCHA can be enabled for newer or suspicious accounts.",
      inline: false
    },
    {
      name: "Birthdays",
      value: "`/birthday`, `/birthdaypanel`, `/settings birthdayrole`, `/settings birthdaychannel`",
      inline: false
    },
    {
      name: "Runtime",
      value: "`/status`, `/reload`",
      inline: false
    },
    {
      name: "Games",
      value: "`/mochi`, `/mochi-leaderboard`",
      inline: false
    },
    {
      name: "Server Tools",
      value: "`/setupverify`, `/setuptiktokverify`, `/setuprules`, `/announce`, `/purge`, `/lockdown`, `/unlockdown`, `/lockverified`, `/unlockverified`\nAnonymous affirmations: use the button in the affirmations channel after `/settings affirmchannel`.\nVerification: rules + button verify for most users, TikTok matching is optional.",
      inline: false
    },
    {
      name: "Info",
      value: "`/userinfo`, `/serverstats`, `/help`",
      inline: false
    }
  ];

  return makeEmbed({
    title: "Mochi Bot Help",
    description: "Main commands for Mochi Bot.",
    color: COLORS.blue,
    fields
  });
}

function buildStatusEmbed() {
  const uptimeSeconds = Math.floor(startedAt / 1000);
  const verifyChannelId = getVerifyChannelId();
  const rulesChannelId = getRulesChannelId();
  const generalChatChannelId = getGeneralChatChannelId();
  const logChannelId = getLogChannelId();

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
      { name: "General Chat", value: generalChatChannelId ? `<#${generalChatChannelId}>` : "Not set", inline: true },
      { name: "General Chat Rule", value: `Gentle reminder at 53 days, kick at 60 days.`, inline: false },
      { name: "Log Channel", value: logChannelId ? `<#${logChannelId}>` : "Not set", inline: true },
      { name: "AutoMod Log Channel", value: getAutoModLogChannelId() ? `<#${getAutoModLogChannelId()}>` : "Not set", inline: true },
      { name: "TikTok Bonus", value: isTikTokVerificationEnabled() ? `@${getTikTokHandle()}` : "Disabled", inline: true },
      { name: "Verified Role", value: getVerificationRoleId() ? `<@&${getVerificationRoleId()}>` : "Not set", inline: true },
      { name: "Unverified Role", value: getUnverifiedRoleId() ? `<@&${getUnverifiedRoleId()}>` : "Not set", inline: true },
      { name: "Birthday Role", value: getBirthdayRoleId() ? `<@&${getBirthdayRoleId()}>` : "Not set", inline: true },
      { name: "Core Features", value: ENABLE_CORE_BOT ? "Enabled" : "Disabled", inline: true },
      { name: "Verify Panel", value: config.verifyMessageId || "Not cached", inline: false },
      { name: "Bonus Panel", value: config.bonusVerifyMessageId || "Not cached", inline: false },
      { name: "Cases Logged", value: `${config.cases.length}`, inline: true },
      { name: "Banned Words", value: `${getBannedWords().length}`, inline: true },
      { name: "Birthdays Saved", value: `${Object.keys(getBirthdayStore()).length}`, inline: true },
      { name: "Birthday Channel", value: getBirthdayAnnouncementChannelId() ? `<#${getBirthdayAnnouncementChannelId()}>` : "Not set", inline: true }
    ]
  });
}

async function buildReactionRoleHealth() {
  const guild = client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID).catch(() => null);
  const botMember = guild?.members?.me || (guild ? await guild.members.fetchMe().catch(() => null) : null);
  const verifyChannelId = getVerifyChannelId();
  const verifyMessageId = await resolveVerifyMessageId();
  const verifyChannel = verifyChannelId && guild?.channels?.fetch ? await guild.channels.fetch(verifyChannelId).catch(() => null) : null;
  const verifyMessage = verifyChannel && verifyMessageId && verifyChannel.messages?.fetch
    ? await verifyChannel.messages.fetch(verifyMessageId).catch(() => null)
    : null;
  const botManageRoles = Boolean(botMember?.permissions?.has(PermissionFlagsBits.ManageRoles));

  const roles = [];
  for (const [emoji, roleData] of Object.entries(MOCHI_ROLES)) {
    const role = roleData?.id && guild?.roles?.fetch
      ? guild.roles.cache.get(roleData.id) || await guild.roles.fetch(roleData.id).catch(() => null)
      : null;
    const reactionPresent = Boolean(
      verifyMessage?.reactions?.cache?.find(reaction => reaction.emoji?.name === emoji || reaction.emoji?.id === emoji)
    );
    const hierarchyOk = Boolean(botMember && role && botMember.roles.highest.comparePositionTo(role) > 0);

    roles.push({
      emoji,
      label: roleData?.name || emoji,
      roleId: roleData?.id || null,
      roleExists: Boolean(role),
      reactionPresent,
      hierarchyOk,
      manageable: botManageRoles && hierarchyOk
    });
  }

  const issues = [];
  if (!verifyChannelId) issues.push("Verify channel is not set.");
  if (!verifyMessage) issues.push("The verify panel message could not be found.");
  if (!botManageRoles) issues.push("The bot is missing Manage Roles permission.");
  for (const role of roles) {
    if (!role.roleId) issues.push(`${role.label} role is not configured.`);
    if (role.roleId && !role.roleExists) issues.push(`${role.label} role does not exist.`);
    if (role.roleExists && !role.hierarchyOk) issues.push(`${role.label} role is above the bot role.`);
    if (!role.reactionPresent) issues.push(`${role.label} reaction is missing from the panel.`);
  }

  return {
    ready: issues.length === 0,
    verifyChannelId,
    verifyMessageId: verifyMessage?.id || verifyMessageId || null,
    botManageRoles,
    roleHierarchyOk: roles.every(role => role.hierarchyOk),
    panelMessageFound: Boolean(verifyMessage),
    roles,
    issues: [...new Set(issues)]
  };
}

async function buildDashboardEmbed() {
  const allCases = Array.isArray(config.cases) ? config.cases : [];
  const recentCases = allCases.slice(-5).reverse();
  const recentAutomodCases = recentCases.filter(entry => typeof entry?.action === "string" && entry.action.startsWith("automod:"));
  const recentAutomodText = recentAutomodCases.length
    ? recentAutomodCases
        .map(entry => `#${entry.id || "?"} ${entry.action} - ${entry.targetTag || entry.targetId || "Unknown user"}`)
        .join("\n")
        .slice(0, 1024)
    : "No recent automod cases.";
  const reactionRoleHealth = await buildReactionRoleHealth();

  return makeEmbed({
    title: "Moderation dashboard",
    description: "Quick view of your moderation setup and recent activity.",
    color: COLORS.blue,
    fields: [
      { name: "Total cases", value: `${allCases.length}`, inline: true },
      { name: "Warnings saved", value: `${Object.keys(config.warnings || {}).length}`, inline: true },
      { name: "Staff notes", value: `${Object.keys(config.notes || {}).length}`, inline: true },
      { name: "TikTok bonus", value: isTikTokVerificationEnabled() ? `@${getTikTokHandle()}` : "Disabled", inline: true },
      { name: "AutoMod log channel", value: getAutoModLogChannelId() ? `<#${getAutoModLogChannelId()}>` : "Not set", inline: true },
      { name: "Alert-only rules", value: getAlertOnlyRules().join(", ") || "None", inline: false },
      { name: "Nickname filter terms", value: `${getNicknameBlockedTerms().length}`, inline: true },
      { name: "Reaction roles", value: reactionRoleHealth.ready ? "Ready" : `${reactionRoleHealth.issues.length} issue${reactionRoleHealth.issues.length === 1 ? "" : "s"} found`, inline: true },
      { name: "Reaction role panel", value: reactionRoleHealth.panelMessageFound ? "Found" : "Missing", inline: true },
      { name: "Birthdays", value: Object.keys(getBirthdayStore()).length ? `${Object.keys(getBirthdayStore()).length} saved` : "None saved", inline: true },
      { name: "Reaction role issues", value: reactionRoleHealth.issues.slice(0, 6).join("\n") || "None", inline: false },
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

function parseBooleanInput(input, fallback = false) {
  const normalized = String(input || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;
  return fallback;
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

async function getRecentMessagesForUserAcrossGuild(guild, userId, limit = 40) {
  if (!guild?.channels?.cache) return [];

  const entriesById = new Map();
  for (const archived of readMessageArchiveEntries()) {
    if (archived.userId !== userId) continue;
    entriesById.set(archived.id, {
      ...archived,
      channelMention: archived.channelMention || (archived.channelId ? `<#${archived.channelId}>` : "Unknown channel")
    });
  }

  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  const channels = [...guild.channels.cache.values()].filter(channel => {
    if (!channel?.isTextBased?.() || typeof channel.messages?.fetch !== "function") return false;
    if (!botMember || typeof channel.permissionsFor !== "function") return true;
    const permissions = channel.permissionsFor(botMember);
    return Boolean(permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]));
  });

  const entries = [];
  for (const channel of channels) {
    const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (!messages) continue;

    for (const message of messages.values()) {
      if (message.author?.id !== userId || message.author?.bot) continue;
      entriesById.set(message.id, {
        id: message.id,
        channelId: channel.id,
        channelName: channel.name || channel.toString?.() || "Unknown channel",
        channelMention: typeof channel.toString === "function" ? channel.toString() : `#${channel.name || channel.id}`,
        content: (message.content || "").replace(/\n/g, " ").trim().slice(0, 200) || "No text content",
        createdAt: message.createdAt?.toISOString?.() || new Date(message.createdTimestamp || Date.now()).toISOString(),
        url: message.url || `https://discord.com/channels/${channel.guild?.id || guild.id}/${channel.id}/${message.id}`,
        createdTimestamp: message.createdTimestamp || Date.now()
      });
    }
  }

  return [...entriesById.values()]
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
    .slice(0, limit)
    .map(({ createdTimestamp, ...entry }) => entry);
}

async function purgeChannelMessages(channel, amount, deleteAll = false) {
  if (!channel?.messages?.fetch) return 0;

  if (!deleteAll) {
    const deleted = await channel.bulkDelete(amount, true).catch(() => null);
    return deleted?.size || 0;
  }

  let deletedCount = 0;
  let before;
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  while (true) {
    const messages = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {})
    });

    if (!messages.size) break;

    const now = Date.now();
    const recentMessages = [];
    const oldMessages = [];

    messages.forEach(message => {
      if (now - message.createdTimestamp < fourteenDaysMs) {
        recentMessages.push(message);
      } else {
        oldMessages.push(message);
      }
    });

    if (recentMessages.length) {
      const deletedRecent = await channel.bulkDelete(recentMessages, true).catch(() => null);
      deletedCount += deletedRecent?.size || 0;
    }

    if (oldMessages.length) {
      const results = await Promise.allSettled(oldMessages.map(message => message.delete()));
      deletedCount += results.filter(result => result.status === "fulfilled").length;
    }

    const oldestMessage = [...messages.values()].reduce((oldest, message) => {
      if (!oldest) return message;
      return message.createdTimestamp < oldest.createdTimestamp ? message : oldest;
    }, null);

    if (!oldestMessage || messages.size < 100) break;
    before = oldestMessage.id;
  }

  return deletedCount;
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
    description: "Use the selectors below to replace the current exempt channels, roles, and users. Roles on this list bypass AutoMod checks.",
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
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("configmodal", "rule-actions", targetUserId)).setLabel("Rule Actions").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("configmodal", "ai-settings", targetUserId)).setLabel("AI Settings").setStyle(ButtonStyle.Primary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "ai-preset-lenient", targetUserId)).setLabel("Lenient").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "ai-preset-balanced", targetUserId)).setLabel("Balanced").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "ai-preset-strict", targetUserId)).setLabel("Strict").setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("configmodal", "ai-tuning", targetUserId)).setLabel("AI Tuning").setStyle(ButtonStyle.Secondary)
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
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "setuptiktokverify", targetUserId)).setLabel("Post TikTok Bonus").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "repaironboarding", targetUserId)).setLabel("Repair Onboarding").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "setuprules", targetUserId)).setLabel("Post Rules").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "settings-view", targetUserId)).setLabel("View Settings").setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "lockverified-current", targetUserId)).setLabel("Lock Verified Here").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "unlockverified-current", targetUserId)).setLabel("Unlock Verified Here").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "lockverified-all", targetUserId)).setLabel("Lock Verified All").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(buildAdminPanelCustomId("action", "unlockverified-all", targetUserId)).setLabel("Unlock Verified All").setStyle(ButtonStyle.Secondary)
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
        {
          name: "Core Filters",
          value: [
            `Spam: ${config.automod.spam ? "On" : "Off"}`,
            `Invites: ${config.automod.invites ? "On" : "Off"}`,
            `Caps: ${config.automod.caps ? "On" : "Off"}`,
            `Links: ${config.automod.linksEnabled ? "On" : "Off"}`,
            `Words: ${config.automod.bannedWords ? `On (${getBannedWords().length})` : "Off"}`,
            `Word context: ${getBannedWordsContextSensitivity()}`
          ].join("\n"),
          inline: true
        },
        {
          name: "Advanced Filters",
          value: [
            `Scam: ${config.automod.scamFilterEnabled ? `On (${getScamPhrases().length})` : "Off"}`,
            `Evasion: ${config.automod.evasionFilterEnabled ? "On" : "Off"}`,
            `Nicknames: ${config.automod.nicknameFilterEnabled ? `On (${getNicknameBlockedTerms().length})` : "Off"}`,
            `Emoji: ${config.automod.emojiSpamEnabled ? `On (${config.automod.maxEmojiCount})` : "Off"}`,
            `Mentions: ${config.automod.maxMentions}`
          ].join("\n"),
          inline: true
        },
        {
          name: "Attachments And Links",
          value: [
            `Attachments: ${config.automod.attachmentsEnabled ? `On (${config.automod.maxAttachmentSizeMb}MB)` : "Off"}`,
            `Allow-only domains: ${config.automod.allowedDomainsOnly ? "On" : "Off"}`,
            `Allowed domains: ${config.automod.allowedDomains.length}`,
            `Blocked domains: ${config.automod.blockedDomains.length}`
          ].join("\n"),
          inline: true
        },
        {
          name: "Protection",
          value: [
            `Age guard: ${config.automod.ageProtectionEnabled ? "On" : "Off"}`,
            `Anti-raid: ${config.automod.antiRaidEnabled ? `${config.automod.raidAction} @ ${config.automod.raidJoinThreshold}` : "Off"}`,
            `Escalation: ${config.automod.escalationEnabled ? "On" : "Off"}`,
            `Warn threshold: ${config.automod.warnThreshold}`,
            `Timeout threshold: ${config.automod.timeoutThreshold}`
          ].join("\n"),
          inline: true
        },
        {
          name: "Exemptions",
          value: [
            `Channels: ${config.automod.exemptChannelIds.length}`,
            `Roles: ${config.automod.exemptRoleIds.length}`,
            `Users: ${config.automod.exemptUserIds.length}`
          ].join("\n"),
          inline: true
        },
        {
          name: "AI Moderation",
          value: [
            `API key: ${OPENAI_API_KEY ? "Configured" : "Missing"}`,
            `Review: ${config.automod.aiModerationEnabled ? "On" : "Off"}`,
            `Suppress low-confidence: ${config.automod.aiModerationSuppressLowConfidenceReviews ? "On" : "Off"}`,
            `Custom rules: ${config.automod.aiCustomRulesEnabled ? "On" : "Off"}`,
            `Model: ${config.automod.aiModerationModel || "omni-moderation-latest"}`,
            `Threshold: ${config.automod.aiModerationThreshold}%`,
            `Category overrides: ${Object.keys(config.automod.aiModerationCategoryThresholds || {}).length}`,
            `Context: ${config.automod.aiIncludeRecentContext ? `${config.automod.aiContextMessageCount} msgs` : "Off"}`
          ].join("\n"),
          inline: true
        },
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
        {
          name: "Verified Visibility",
          value: getVerificationRoleId()
            ? "Use the buttons below to lock a category so only the verified role can view it."
            : "Set the verified role first to enable visibility locks.",
          inline: false
        }
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

function sendWebJson(res, statusCode, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendWebText(res, statusCode, message) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(message);
}

function getWebBaseUrl(req) {
  if (WEB_BASE_URL) return WEB_BASE_URL;
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${WEB_PORT}`;
  return `${proto}://${host}`;
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function getCookieOptions(req, maxAgeSeconds) {
  const isHttps = String(req.headers["x-forwarded-proto"] || "").includes("https");
  return [
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    ...(isHttps ? ["Secure"] : [])
  ].join("; ");
}

function setWebCookie(req, res, name, value, maxAgeSeconds) {
  res.setHeader("Set-Cookie", `${name}=${encodeURIComponent(value)}; ${getCookieOptions(req, maxAgeSeconds)}`);
}

function clearWebCookie(req, res, name) {
  setWebCookie(req, res, name, "", 0);
}

function cleanupWebAuthState() {
  const now = Date.now();

  for (const [state, entry] of webOauthStates.entries()) {
    if (entry.expiresAt <= now) {
      webOauthStates.delete(state);
    }
  }

  for (const [sessionId, session] of webSessions.entries()) {
    if (session.expiresAt <= now) {
      webSessions.delete(sessionId);
    }
  }
}

function signWebValue(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function createSignedWebValue(value) {
  return `${value}.${signWebValue(value)}`;
}

function verifySignedWebValue(signedValue) {
  const [value, signature] = String(signedValue || "").split(".");
  if (!value || !signature) return null;
  const expected = signWebValue(value);
  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");
  if (expectedBuffer.length !== signatureBuffer.length) return null;
  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer) ? value : null;
}

function createWebSession(user, accessLevel, authMode = "discord") {
  const sessionId = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + WEB_SESSION_TTL_MS;
  webSessions.set(sessionId, {
    user,
    accessLevel,
    authMode,
    expiresAt
  });
  return sessionId;
}

function getWebSession(req) {
  cleanupWebAuthState();
  const sessionId = verifySignedWebValue(parseCookies(req).mochi_session);
  if (!sessionId) return null;
  const session = webSessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    if (sessionId) webSessions.delete(sessionId);
    return null;
  }
  return { sessionId, ...session };
}

function buildMochiBaseUrl() {
  return (WEB_BASE_URL || `http://localhost:${WEB_PORT}`).replace(/\/$/, "");
}

function buildMochiBootstrapPayload() {
  return {
    ok: true,
    activityMode: envFlag(process.env.DISCORD_ACTIVITY_MODE, true),
    discordClientId: CLIENT_ID || null,
    gameTitle: "Mochi Bird",
    publicBaseUrl: buildMochiBaseUrl(),
    mochiPath: MOCHI_PATH,
    sessionTtlMinutes: Math.round(MOCHI_SESSION_TTL_MS / 60000),
    leaderboard: getMochiLeaderboard(10),
    recentRuns: getMochiRecentRuns(8)
  };
}

function normalizeMochiPath(value) {
  let next = String(value || "/mochi").trim();
  if (!next.startsWith("/")) next = `/${next}`;
  next = next.replace(/\/+$/, "");
  return next || "/mochi";
}

function getMochiIndexPath() {
  return `${MOCHI_PATH}/index.html`;
}

function cleanupMochiSessions() {
  const now = Date.now();
  for (const [sessionId, session] of mochiSessions.entries()) {
    if (session.expiresAt <= now) {
      mochiSessions.delete(sessionId);
    }
  }
}

function createMochiSession({ userId, userTag, channelId, guildId }) {
  const sessionId = crypto.randomUUID();
  const createdAt = Date.now();
  const session = {
    id: sessionId,
    userId,
    userTag,
    channelId,
    guildId,
    createdAt,
    expiresAt: createdAt + MOCHI_SESSION_TTL_MS,
    status: "active",
    score: null,
    submittedAt: null
  };

  mochiSessions.set(sessionId, session);
  return session;
}

function getMochiSession(sessionId) {
  cleanupMochiSessions();
  return mochiSessions.get(sessionId) || null;
}

function completeMochiSession(sessionId, payload) {
  cleanupMochiSessions();
  const session = mochiSessions.get(sessionId);
  if (!session) return null;
  if (session.status === "completed") return session;

  session.status = "completed";
  session.score = Number(payload.score) || 0;
  session.submittedAt = Date.now();
  session.lastResult = payload;
  mochiSessions.set(sessionId, session);
  return session;
}

function publicMochiSession(session) {
  if (!session) return null;
  return {
    id: session.id,
    userId: session.userId,
    userTag: session.userTag,
    channelId: session.channelId,
    guildId: session.guildId,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    status: session.status,
    score: session.score,
    submittedAt: session.submittedAt
  };
}

function buildMochiPlayUrl(sessionId) {
  const url = new URL(`${MOCHI_PATH}/`, buildMochiBaseUrl());
  url.searchParams.set("sid", sessionId);
  return url.toString();
}

async function launchMochiActivity(interaction) {
  try {
    await interaction.launchActivity();
    return true;
  } catch (error) {
    log.warn("Mochi Activity launch failed.", error);
    return false;
  }
}

function buildMochiLaunchRow(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mochi:launch:${sessionId}`)
      .setLabel("Launch Mochi Activity")
      .setStyle(ButtonStyle.Primary)
  );
}

function loadMochiLeaderboard() {
  if (mochiLeaderboardCache) return mochiLeaderboardCache;

  try {
    const raw = fs.readFileSync(mochiLeaderboardPath, "utf8");
    const parsed = JSON.parse(raw);
    mochiLeaderboardCache = new Map(parsed.map(entry => [entry.userId, entry]));
  } catch {
    mochiLeaderboardCache = new Map();
  }

  if (!mochiLeaderboardCache.size) {
    const rebuilt = rebuildMochiLeaderboardFromRecentRuns();
    if (rebuilt.size) {
      mochiLeaderboardCache = rebuilt;
      persistMochiLeaderboard();
    }
  }

  return mochiLeaderboardCache;
}

function loadMochiRecentRuns() {
  if (mochiRecentRunsCache) return mochiRecentRunsCache;

  try {
    const raw = fs.readFileSync(mochiRunsPath, "utf8");
    const parsed = JSON.parse(raw);
    mochiRecentRunsCache = Array.isArray(parsed) ? parsed : [];
  } catch {
    mochiRecentRunsCache = [];
  }

  return mochiRecentRunsCache;
}

function rebuildMochiLeaderboardFromRecentRuns() {
  const board = new Map();

  for (const run of loadMochiRecentRuns()) {
    const userId = String(run?.userId || "").trim();
    if (!userId) {
      continue;
    }

    const score = Math.max(0, Math.floor(Number(run?.score) || 0));
    const existing = board.get(userId) || null;
    const bestScore = existing ? Math.max(existing.bestScore, score) : score;
    board.set(userId, {
      userId,
      userTag: String(run?.userTag || existing?.userTag || userId).trim(),
      bestScore,
      lastScore: score,
      updatedAt: typeof run?.updatedAt === "string" ? run.updatedAt : new Date().toISOString()
    });
  }

  return board;
}

function persistMochiLeaderboard() {
  fs.mkdirSync(dataDir, { recursive: true });
  const entries = [...loadMochiLeaderboard().values()].sort((a, b) => b.bestScore - a.bestScore || String(a.userTag).localeCompare(String(b.userTag)));
  fs.writeFileSync(mochiLeaderboardPath, JSON.stringify(entries, null, 2), "utf8");
}

function persistMochiRecentRuns() {
  fs.mkdirSync(dataDir, { recursive: true });
  const entries = loadMochiRecentRuns().slice(0, 50);
  fs.writeFileSync(mochiRunsPath, JSON.stringify(entries, null, 2), "utf8");
}

function recordMochiRun({ userId, userTag, score, durationMs = 0, cans = 0, reason = "game_over" }) {
  const runs = loadMochiRecentRuns();
  const entry = {
    userId,
    userTag,
    score: Math.floor(Number(score) || 0),
    durationMs: Math.max(0, Math.floor(Number(durationMs) || 0)),
    cans: Math.max(0, Math.floor(Number(cans) || 0)),
    reason: String(reason || "game_over"),
    updatedAt: new Date().toISOString()
  };

  runs.unshift(entry);
  if (runs.length > 50) {
    runs.length = 50;
  }

  persistMochiRecentRuns();
  return entry;
}

function recordMochiScore({ userId, userTag, score }) {
  const board = loadMochiLeaderboard();
  const existing = board.get(userId);
  const bestScore = existing ? Math.max(existing.bestScore, score) : score;
  const entry = {
    userId,
    userTag,
    bestScore,
    lastScore: score,
    updatedAt: new Date().toISOString()
  };

  board.set(userId, entry);
  persistMochiLeaderboard();
  return entry;
}

function getMochiRecentRuns(limit = 8) {
  return loadMochiRecentRuns()
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
}

function getMochiLeaderboard(limit = 10) {
  return [...loadMochiLeaderboard().values()]
    .sort((a, b) => b.bestScore - a.bestScore || String(a.userTag).localeCompare(String(b.userTag)))
    .slice(0, limit);
}

function getMochiPersonalBest(userId) {
  return loadMochiLeaderboard().get(userId) || null;
}

function loadMochiProfiles() {
  if (mochiProfilesCache) return mochiProfilesCache;

  try {
    const raw = fs.readFileSync(mochiProfilesPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      mochiProfilesCache = new Map(Object.entries(parsed));
    } else {
      mochiProfilesCache = new Map();
    }
  } catch {
    mochiProfilesCache = new Map();
  }

  return mochiProfilesCache;
}

function persistMochiProfiles() {
  fs.mkdirSync(dataDir, { recursive: true });
  const payload = Object.fromEntries([...loadMochiProfiles().entries()].sort(([a], [b]) => String(a).localeCompare(String(b))));
  fs.writeFileSync(mochiProfilesPath, JSON.stringify(payload, null, 2), "utf8");
}

function loadSupportStore() {
  if (supportStoreCache) return supportStoreCache;

  const defaults = createDefaultSupportStore();
  try {
    if (!fs.existsSync(supportPath)) {
      supportStoreCache = defaults;
      return supportStoreCache;
    }

    const raw = fs.readFileSync(supportPath, "utf8");
    const parsed = JSON.parse(raw);
    supportStoreCache = {
      nextTicketId: Number.isInteger(parsed?.nextTicketId) && parsed.nextTicketId > 0 ? parsed.nextTicketId : defaults.nextTicketId,
      tickets: Array.isArray(parsed?.tickets) ? parsed.tickets : defaults.tickets
    };
  } catch {
    supportStoreCache = defaults;
  }

  return supportStoreCache;
}

function saveSupportStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(supportPath, JSON.stringify(loadSupportStore(), null, 2), "utf8");
}

function getSupportStore() {
  return loadSupportStore();
}

function getSupportNotificationChannelId() {
  return config.reportSettings?.channelId || getLogChannelId() || null;
}

function isSupportStaffAccess(auth) {
  return auth?.accessLevel === "mod" || auth?.accessLevel === "admin";
}

function normalizeSupportText(value, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function createSupportMessage({ authorType, authorId, authorTag, content, anonymous = false }) {
  return {
    id: crypto.randomUUID(),
    authorType,
    authorId,
    authorTag,
    content: normalizeSupportText(content, 4000),
    anonymous: Boolean(anonymous),
    createdAt: new Date().toISOString()
  };
}

function createSupportTicket({ creator, category = "ticket", subject, message, anonymous = false, visibleToStaff = true }) {
  const store = getSupportStore();
  const ticket = {
    id: store.nextTicketId++,
    category: ["ticket", "report", "anonymous-chat"].includes(category) ? category : "ticket",
    subject: normalizeSupportText(subject, 140) || "Support request",
    status: "open",
    anonymous: Boolean(anonymous),
    visibleToStaff: Boolean(visibleToStaff),
    createdByUserId: creator.id,
    createdByTag: creator.tag || creator.username || creator.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastMessageAt: new Date().toISOString(),
    messages: []
  };

  if (message) {
    ticket.messages.push(createSupportMessage({
      authorType: "user",
      authorId: creator.id,
      authorTag: creator.tag || creator.username || creator.id,
      content: message,
      anonymous
    }));
  }

  store.tickets.unshift(ticket);
  saveSupportStore();
  return ticket;
}

function getSupportTicket(ticketId) {
  const store = getSupportStore();
  const id = Number(ticketId);
  if (!Number.isInteger(id)) return null;
  return store.tickets.find(ticket => ticket.id === id) || null;
}

function updateSupportTicket(ticket) {
  ticket.updatedAt = new Date().toISOString();
  saveSupportStore();
  return ticket;
}

function appendSupportTicketMessage(ticket, { authorType, authorId, authorTag, content, anonymous = false }) {
  const message = createSupportMessage({ authorType, authorId, authorTag, content, anonymous });
  ticket.messages.push(message);
  ticket.lastMessageAt = message.createdAt;
  ticket.updatedAt = message.createdAt;
  saveSupportStore();
  return message;
}

function serializeSupportTicket(ticket, auth = null) {
  if (!ticket) return null;
  const admin = auth?.accessLevel === "admin";
  const owner = auth?.user?.id === ticket.createdByUserId;
  const revealOwner = admin || owner || !ticket.anonymous;

  return {
    id: ticket.id,
    category: ticket.category,
    subject: ticket.subject,
    status: ticket.status,
    anonymous: ticket.anonymous,
    visibleToStaff: ticket.visibleToStaff,
    createdBy: revealOwner ? {
      id: ticket.createdByUserId,
      tag: ticket.createdByTag
    } : {
      id: null,
      tag: "Anonymous member"
    },
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    lastMessageAt: ticket.lastMessageAt,
    messageCount: Array.isArray(ticket.messages) ? ticket.messages.length : 0,
    messages: Array.isArray(ticket.messages)
      ? ticket.messages.map(message => ({
          id: message.id,
          authorType: message.authorType,
          authorId: admin || owner || !message.anonymous ? message.authorId : null,
          authorTag: admin || owner || !message.anonymous ? message.authorTag : "Anonymous",
          anonymous: message.anonymous,
          content: message.content,
          createdAt: message.createdAt
        }))
      : []
  };
}

function canViewSupportTicket(auth, ticket) {
  if (!auth || !ticket) return false;
  if (auth.accessLevel === "admin") return true;
  if (auth.user?.id === ticket.createdByUserId) return true;
  return isSupportStaffAccess(auth) && ticket.visibleToStaff !== false;
}

function canReplyToSupportTicket(auth, ticket) {
  if (!auth || !ticket) return false;
  if (auth.user?.id === ticket.createdByUserId) return true;
  return isSupportStaffAccess(auth) && ticket.visibleToStaff !== false;
}

function canExportSupportTranscript(auth, ticket) {
  return canViewSupportTicket(auth, ticket);
}

function formatSupportTranscript(ticket, auth = null) {
  if (!ticket) return "";

  const data = serializeSupportTicket(ticket, auth);
  const lines = [];
  const append = value => lines.push(String(value));
  const admin = auth?.accessLevel === "admin";

  append(`# Support Transcript #${data.id}`);
  append(`Category: ${data.category}`);
  append(`Subject: ${data.subject}`);
  append(`Status: ${data.status}`);
  append(`Anonymous: ${data.anonymous ? "yes" : "no"}`);
  append(`Visible to staff: ${data.visibleToStaff ? "yes" : "no"}`);
  append(`Created by: ${data.createdBy?.tag || "Anonymous member"}`);
  append(`Created at: ${data.createdAt}`);
  append(`Updated at: ${data.updatedAt}`);
  append(`Last message: ${data.lastMessageAt}`);
  append("");
  append("Messages:");

  for (const message of data.messages || []) {
    const label = message.authorType === "staff" ? "Staff" : "Member";
    const identity = admin || !message.anonymous
      ? ` (${message.authorTag || message.authorId || "Unknown"})`
      : "";
    append(`- [${message.createdAt}] ${label}${identity}`);
    for (const paragraph of String(message.content || "").split(/\r?\n/)) {
      append(`  ${paragraph}`);
    }
    append("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

function listSupportTickets(auth = null) {
  const store = getSupportStore();
  if (isSupportStaffAccess(auth)) {
    return store.tickets.map(ticket => serializeSupportTicket(ticket, auth));
  }

  const userId = auth?.user?.id;
  return store.tickets.filter(ticket => ticket.createdByUserId === userId).map(ticket => serializeSupportTicket(ticket, auth));
}

async function notifySupportChannel(embed) {
  const channelId = getSupportNotificationChannelId();
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel?.send) {
      await channel.send({ embeds: [embed] });
    }
  } catch (error) {
    log.error("Support notification error.", error);
  }
}

function buildSupportInboxPayload(auth = null) {
  const tickets = listSupportTickets(auth);
  const openCount = tickets.filter(ticket => ticket.status === "open").length;
  const anonymousCount = tickets.filter(ticket => ticket.anonymous).length;
  const recentTicket = tickets[0] || null;

  return {
    tickets,
    summary: {
      total: tickets.length,
      open: openCount,
      closed: tickets.length - openCount,
      anonymous: anonymousCount,
      recentTicket: recentTicket ? {
        id: recentTicket.id,
        subject: recentTicket.subject,
        status: recentTicket.status,
        updatedAt: recentTicket.updatedAt
      } : null
    }
  };
}

function normalizeMochiCosmeticState(raw) {
  const ownedIds = new Set(["avatar-v3"]);
  const ownedSource = Array.isArray(raw?.ownedIds) ? raw.ownedIds : [];

  for (const id of ownedSource) {
    if (typeof id === "string" && id.trim()) {
      ownedIds.add(id.trim());
    }
  }

  let selectedId = typeof raw?.selectedId === "string" ? raw.selectedId.trim() : "avatar-v3";
  if (!ownedIds.has(selectedId)) {
    selectedId = "avatar-v3";
  }

  return {
    selectedId,
    ownedIds: [...ownedIds]
  };
}

function normalizeMochiProfile(raw, fallbackUserId = "") {
  const profile = raw && typeof raw === "object" ? raw : {};
  const userId = String(profile.userId || fallbackUserId || "").trim();
  const canWallet = Math.max(0, Math.floor(Number(profile.canWallet) || 0));
  const cosmeticState = normalizeMochiCosmeticState(profile.cosmeticState);

  return {
    userId,
    userTag: typeof profile.userTag === "string" ? profile.userTag : "",
    canWallet,
    cosmeticState,
    updatedAt: typeof profile.updatedAt === "string" ? profile.updatedAt : null
  };
}

function getMochiProfile(userId) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return normalizeMochiProfile(null, "");
  }

  return loadMochiProfiles().get(normalizedUserId) || normalizeMochiProfile({ userId: normalizedUserId });
}

function upsertMochiProfile(userId, patch = {}) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return normalizeMochiProfile(null, "");
  }

  const profiles = loadMochiProfiles();
  const current = normalizeMochiProfile(profiles.get(normalizedUserId) || null, normalizedUserId);
  const next = {
    ...current,
    userId: normalizedUserId
  };

  if (typeof patch.userTag === "string" && patch.userTag.trim()) {
    next.userTag = patch.userTag.trim();
  }
  if (patch.canWallet !== undefined) {
    next.canWallet = Math.max(0, Math.floor(Number(patch.canWallet) || 0));
  }
  if (patch.cosmeticState) {
    next.cosmeticState = normalizeMochiCosmeticState({
      selectedId: patch.cosmeticState.selectedId,
      ownedIds: patch.cosmeticState.ownedIds
    });
  }

  next.updatedAt = new Date().toISOString();
  profiles.set(normalizedUserId, next);
  persistMochiProfiles();
  return next;
}

function buildWebUserPayload(session = null) {
  return {
    authenticated: Boolean(session),
    authMode: session?.authMode || null,
    accessLevel: session?.accessLevel || null,
    user: session?.user || null,
    oauthConfigured: Boolean(DISCORD_CLIENT_SECRET && SESSION_SECRET),
    tokenFallbackEnabled: Boolean(WEB_ADMIN_TOKEN),
    localLoginConfigured: getWebAccounts().some(account => account.enabled && account.passwordHash)
  };
}

function isWebTokenAuthorized(req) {
  if (!WEB_ADMIN_TOKEN) return false;
  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const headerToken = req.headers["x-admin-token"] || "";
  return bearerToken === WEB_ADMIN_TOKEN || headerToken === WEB_ADMIN_TOKEN;
}

function getWebAuth(req) {
  const session = getWebSession(req);
  if (session) {
    return session;
  }

  if (isWebTokenAuthorized(req)) {
    return {
      sessionId: null,
      accessLevel: "admin",
      authMode: "token",
      user: {
        id: "token",
        username: "Admin Token",
        tag: "Admin Token"
      },
      expiresAt: null
    };
  }

  return null;
}

function hasWebAccess(auth, level = "mod") {
  if (!auth) return false;
  if (auth.accessLevel === "admin") return true;
  return level === "mod" && auth.accessLevel === "mod";
}

async function fetchDiscordJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.message || `Discord request failed with ${response.status}`);
  }
  return payload;
}

async function getWebDiscordAccessLevel(userId) {
  const linkedAccount = getWebAccountByDiscordId(userId);
  if (linkedAccount?.enabled) {
    return linkedAccount.accessLevel;
  }

  const guild = client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) return null;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return null;
  if (hasStaffAccess(member, "admin")) return "admin";
  if (hasStaffAccess(member, "mod")) return "mod";
  return null;
}

async function getWebSupportAccessLevel(userId) {
  const linkedAccount = getWebAccountByDiscordId(userId);
  if (linkedAccount?.enabled) {
    return linkedAccount.accessLevel;
  }

  const guild = client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) return null;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return null;
  if (hasStaffAccess(member, "admin")) return "admin";
  if (hasStaffAccess(member, "mod")) return "mod";
  return "member";
}

function redirectWeb(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function getWebOAuthRedirectUri(req, purpose = "staff") {
  const override = WEB_OAUTH_REDIRECT_URI
    || (purpose === "support" ? WEB_SUPPORT_OAUTH_REDIRECT_URI : WEB_STAFF_OAUTH_REDIRECT_URI);
  if (override) return override;

  return `${getWebBaseUrl(req)}/auth/callback`;
}

function startWebDiscordLogin(req, res, purpose = "staff") {
  if (!DISCORD_CLIENT_SECRET || !SESSION_SECRET) {
    return sendWebText(res, 503, "Discord OAuth is not configured. Set DISCORD_CLIENT_SECRET and SESSION_SECRET.");
  }

  const state = crypto.randomBytes(24).toString("hex");
  webOauthStates.set(state, {
    purpose,
    expiresAt: Date.now() + 10 * 60 * 1000
  });

  const redirectUri = getWebOAuthRedirectUri(req, purpose);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
    state
  });

  redirectWeb(res, `https://discord.com/oauth2/authorize?${params.toString()}`);
}

function handleWebLogin(req, res) {
  const requestUrl = new URL(req.url, getWebBaseUrl(req));
  const purpose = requestUrl.searchParams.get("purpose") === "support" ? "support" : "staff";
  return startWebDiscordLogin(req, res, purpose);
}

function handleWebSupportLogin(req, res) {
  return startWebDiscordLogin(req, res, "support");
}

async function handleWebCallback(req, res, requestUrl) {
  return handleWebDiscordCallback(req, res, requestUrl, "staff");
}

async function handleWebSupportCallback(req, res, requestUrl) {
  return handleWebDiscordCallback(req, res, requestUrl, "support");
}

async function handleWebDiscordCallback(req, res, requestUrl, fallbackPurpose = "staff") {
  if (!DISCORD_CLIENT_SECRET || !SESSION_SECRET) {
    return sendWebText(res, 503, "Discord OAuth is not configured.");
  }

  cleanupWebAuthState();
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const savedState = state ? webOauthStates.get(state) : null;

  if (!code || !savedState) {
    return sendWebText(res, 400, "OAuth login expired or was cancelled. Try logging in again.");
  }

  const purpose = savedState.purpose || fallbackPurpose;
  webOauthStates.delete(state);

  const redirectUri = getWebOAuthRedirectUri(req, purpose);
  const tokenPayload = await fetchDiscordJson("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });

  const user = await fetchDiscordJson("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` }
  });

  const accessLevel = purpose === "support"
    ? await getWebSupportAccessLevel(user.id)
    : await getWebDiscordAccessLevel(user.id);
  if (!accessLevel) {
    return sendWebText(res, 403, purpose === "support"
      ? "You are not allowed to access the support portal."
      : "You are not allowed to access this moderation panel.");
  }

  const linkedAccount = getWebAccountByDiscordId(user.id);
  if (linkedAccount?.enabled) {
    appendWebAccountLoginAudit(linkedAccount, {
      mode: "discord",
      source: "Discord login",
      note: linkedAccount.accessLevel === accessLevel
        ? "Signed in through Discord."
        : `Signed in through Discord as ${accessLevel}.`
    });
  }

  const sessionId = createWebSession({
    id: user.id,
    username: user.username,
    globalName: user.global_name || null,
    tag: user.discriminator && user.discriminator !== "0"
      ? `${user.username}#${user.discriminator}`
      : user.username,
    avatar: user.avatar || null
  }, accessLevel, "discord");

  setWebCookie(req, res, "mochi_session", createSignedWebValue(sessionId), Math.floor(WEB_SESSION_TTL_MS / 1000));
  redirectWeb(res, purpose === "support" ? "/support" : "/");
}

function handleWebLogout(req, res) {
  const session = getWebSession(req);
  if (session?.sessionId) {
    webSessions.delete(session.sessionId);
  }
  clearWebCookie(req, res, "mochi_session");
  redirectWeb(res, "/");
}

function handleWebSupportLogout(req, res) {
  const session = getWebSession(req);
  if (session?.sessionId) {
    webSessions.delete(session.sessionId);
  }
  clearWebCookie(req, res, "mochi_session");
  redirectWeb(res, "/support");
}

async function handleWebLocalLogin(req, res) {
  if (req.method !== "POST") {
    return sendWebText(res, 405, "Method not allowed.");
  }

  if (!SESSION_SECRET) {
    return sendWebText(res, 503, "Web sessions are not configured.");
  }

  const body = await readWebJsonBody(req);
  const username = normalizeWebLoginUsername(body.username);
  const password = String(body.password || "");
  const account = getWebAccountByUsername(username);

  if (!account || !account.enabled || !account.passwordHash || !verifyWebAccountPassword(password, account.passwordHash)) {
    return sendWebJson(res, 401, { error: "Invalid username or password." });
  }

  appendWebAccountLoginAudit(account, {
    mode: "password",
    source: "Personal login",
    note: "Signed in with username and password."
  });

  const sessionId = createWebSession({
    id: `local:${account.usernameLower}`,
    username: account.username,
    globalName: account.username,
    tag: account.username,
    avatar: null
  }, account.accessLevel, "local");

  setWebCookie(req, res, "mochi_session", createSignedWebValue(sessionId), Math.floor(WEB_SESSION_TTL_MS / 1000));
  return sendWebJson(res, 200, {
    ok: true,
    user: serializeWebAccount(account)
  });
}

function readWebJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function toWebList(value, normalizer = item => String(item || "").trim()) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(normalizer).filter(Boolean))];
  }

  return [...new Set(
    String(value || "")
      .split(/[\n,]/)
      .map(normalizer)
      .filter(Boolean)
  )];
}

function setWebBoolean(target, key, value) {
  if (typeof value === "boolean") {
    target[key] = value;
    return true;
  }

  if (["true", "false"].includes(String(value).toLowerCase())) {
    target[key] = String(value).toLowerCase() === "true";
    return true;
  }

  return false;
}

function setWebInteger(target, key, value, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return false;
  target[key] = number;
  return true;
}

function setWebDuration(target, key, value, allowZero = false) {
  const parsed = allowZero ? parseDurationInputOrZero(value) : parseDuration(value);
  if (parsed === null || (!allowZero && !parsed)) return false;
  target[key] = parsed;
  return true;
}

async function buildWebDashboardPayload() {
  const analytics = getAutoModAnalytics();
  const recentCases = [...(Array.isArray(config.cases) ? config.cases : [])]
    .slice(-25)
    .reverse();
  const reactionRoleHealth = await buildReactionRoleHealth();
  const generalChatRule = await buildGeneralChatRuleStatus(null, 10).catch(() => ({
    enabled: isGeneralChatInactivityEnabled(),
    channelId: getGeneralChatChannelId() || null,
    channelName: null,
    thresholdDays: 60,
    checkedAt: new Date().toISOString(),
    skipped: "unavailable",
    membersAtRisk: [],
    atRiskCount: 0,
    lastRun: null
  }));

  return {
    client: {
      tag: client.user ? client.user.tag : "Not ready",
      ready: Boolean(client.user),
      ping: Math.round(client.ws.ping || 0),
      uptimeSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
    },
    counts: {
      cases: config.cases.length,
      warningUsers: Object.keys(config.warnings || {}).length,
      noteUsers: Object.keys(config.notes || {}).length,
      tempBans: config.tempBans.length,
      birthdays: Object.keys(getBirthdayStore()).length,
      bannedWords: getBannedWords().length,
      nicknameTerms: getNicknameBlockedTerms().length,
      allowedDomains: config.automod.allowedDomains.length,
      blockedDomains: config.automod.blockedDomains.length
    },
    channels: {
      verify: getVerifyChannelId(),
      rules: getRulesChannelId(),
      general: getGeneralChatChannelId(),
      affirmations: getAnonymousAffirmationsChannelId(),
      log: getLogChannelId(),
      automodLog: getAutoModLogChannelId()
    },
    generalChatRule,
    automod: {
      invites: config.automod.invites,
      spam: config.automod.spam,
      caps: config.automod.caps,
      bannedWords: config.automod.bannedWords,
      linksEnabled: config.automod.linksEnabled,
      allowedDomainsOnly: config.automod.allowedDomainsOnly,
      attachmentsEnabled: config.automod.attachmentsEnabled,
      ageProtectionEnabled: config.automod.ageProtectionEnabled,
      antiRaidEnabled: config.automod.antiRaidEnabled,
      nicknameFilterEnabled: config.automod.nicknameFilterEnabled,
      scamFilterEnabled: config.automod.scamFilterEnabled,
      evasionFilterEnabled: config.automod.evasionFilterEnabled,
      aiModerationEnabled: config.automod.aiModerationEnabled,
      aiCustomRulesEnabled: config.automod.aiCustomRulesEnabled,
      aiModerationAction: config.automod.aiModerationAction,
      aiCustomRulesAction: config.automod.aiCustomRulesAction,
      aiIncludeRecentContext: config.automod.aiIncludeRecentContext,
      escalationEnabled: config.automod.escalationEnabled,
      emojiSpamEnabled: config.automod.emojiSpamEnabled
    },
    analytics: {
      totalDetections: analytics.totalDetections || 0,
      ruleCounts: analytics.ruleCounts || {},
      recentViolations: analytics.recentViolations || []
    },
    reactionRoles: reactionRoleHealth,
    panelChanges: getRecentPanelChanges(8),
    recentCases
  };
}

function buildWebConfigPayload() {
  return {
    settings: {
      verifyChannelId: config.settings.verifyChannelId || "",
      rulesChannelId: config.settings.rulesChannelId || "",
      rulesCardTitle: config.settings.rulesCardTitle || "",
      rulesCardDescription: config.settings.rulesCardDescription || "",
      rulesCardRules: Array.isArray(config.settings.rulesCardRules)
        ? config.settings.rulesCardRules.join("\n")
        : config.settings.rulesCardRules || "",
      welcomeChannelId: getWelcomeChannelId() || "",
      generalChatChannelId: getGeneralChatChannelId() || "",
      generalChatInactivityEnabled: isGeneralChatInactivityEnabled(),
      anonymousAffirmationsEnabled: isAnonymousAffirmationsEnabled(),
      anonymousAffirmationsChannelId: getAnonymousAffirmationsChannelId() || "",
      anonymousAffirmationsCooldownMs: getAnonymousAffirmationsCooldownMs(),
      verificationCaptchaEnabled: isVerificationCaptchaEnabled(),
      verificationRequiresApproval: isVerificationApprovalRequired(),
      pendingVerificationsCount: Array.isArray(config.pendingVerifications) ? config.pendingVerifications.length : 0,
      logChannelId: config.settings.logChannelId || "",
      automodLogChannelId: config.settings.automodLogChannelId || "",
      mutedRoleId: config.settings.mutedRoleId || "",
      birthdayRoleId: config.settings.birthdayRoleId || "",
      birthdayAnnouncementChannelId: config.settings.birthdayAnnouncementChannelId || "",
      messageArchiveEnabled: Boolean(config.settings.messageArchiveEnabled),
      messageArchiveRetentionDays: Number(config.settings.messageArchiveRetentionDays || 30),
      tiktokHandle: getTikTokHandle(),
      tiktokNicknameAliases: Array.isArray(config.settings.tiktokNicknameAliases)
        ? config.settings.tiktokNicknameAliases.join(", ")
        : String(config.settings.tiktokNicknameAliases || ""),
      verifiedRoleId: config.settings.verifiedRoleId || "",
      unverifiedRoleId: config.settings.unverifiedRoleId || ""
    },
    birthdays: {
      total: Object.keys(getBirthdayStore()).length,
      upcoming: getUpcomingBirthdays(8).map(entry => ({
        userId: entry.userId,
        month: entry.month,
        day: entry.day,
        public: Boolean(entry.public),
        nextBirthday: entry.nextBirthday.toISOString()
      }))
    },
    automod: {
      ...config.automod,
      offenses: undefined,
      analytics: undefined
    },
    aiReviews: config.aiReviews || {},
    permissions: config.permissions,
    capabilities: {
      aiMemberSummaries: Boolean(OPENAI_API_KEY)
    }
  };
}

function updateWebSettings(auth, payload) {
  const allowed = [
    "verifyChannelId",
    "rulesChannelId",
    "rulesCardTitle",
    "rulesCardDescription",
    "rulesCardRules",
    "welcomeChannelId",
    "generalChatChannelId",
    "generalChatInactivityEnabled",
    "anonymousAffirmationsEnabled",
    "anonymousAffirmationsChannelId",
    "anonymousAffirmationsCooldownMs",
    "verificationCaptchaEnabled",
    "verificationRequiresApproval",
    "logChannelId",
    "automodLogChannelId",
    "mutedRoleId",
    "birthdayRoleId",
    "birthdayAnnouncementChannelId",
    "messageArchiveEnabled",
    "messageArchiveRetentionDays",
    "tiktokHandle",
    "tiktokNicknameAliases",
    "verifiedRoleId",
    "unverifiedRoleId"
  ];

  const nextTikTokHandle = Object.prototype.hasOwnProperty.call(payload, "tiktokHandle")
    ? splitTikTokVerificationInput(payload.tiktokHandle)
    : splitTikTokVerificationInput(config.settings.tiktokHandle || "");
  const nextTikTokAliases = Object.prototype.hasOwnProperty.call(payload, "tiktokNicknameAliases")
    ? splitTikTokVerificationInput(payload.tiktokNicknameAliases)
    : splitTikTokVerificationInput(Array.isArray(config.settings.tiktokNicknameAliases)
      ? config.settings.tiktokNicknameAliases.join(", ")
      : String(config.settings.tiktokNicknameAliases || ""));
  const nextVerifyChannelId = Object.prototype.hasOwnProperty.call(payload, "verifyChannelId")
    ? String(payload.verifyChannelId || "").trim() || null
    : config.settings.verifyChannelId || null;
  const nextRulesCardTitle = Object.prototype.hasOwnProperty.call(payload, "rulesCardTitle")
    ? normalizeRulesCardText(payload.rulesCardTitle, 120) || "Server rules ✿"
    : config.settings.rulesCardTitle || "Server rules ✿";
  const nextRulesCardDescription = Object.prototype.hasOwnProperty.call(payload, "rulesCardDescription")
    ? normalizeRulesCardText(payload.rulesCardDescription, 500) || ""
    : config.settings.rulesCardDescription || "";
  const nextRulesCardRules = Object.prototype.hasOwnProperty.call(payload, "rulesCardRules")
    ? normalizeRulesCardBlock(payload.rulesCardRules, 4000) || ""
    : config.settings.rulesCardRules || "";
  const nextWelcomeChannelId = Object.prototype.hasOwnProperty.call(payload, "welcomeChannelId")
    ? String(payload.welcomeChannelId || "").trim() || null
    : config.settings.welcomeChannelId || null;
  const nextGeneralChatChannelId = Object.prototype.hasOwnProperty.call(payload, "generalChatChannelId")
    ? String(payload.generalChatChannelId || "").trim() || null
    : config.settings.generalChatChannelId || null;
  const nextGeneralChatInactivityEnabled = Object.prototype.hasOwnProperty.call(payload, "generalChatInactivityEnabled")
    ? ["true", "1", "yes", "on"].includes(String(payload.generalChatInactivityEnabled).toLowerCase())
    : isGeneralChatInactivityEnabled();
  const nextAffirmationsEnabled = Object.prototype.hasOwnProperty.call(payload, "anonymousAffirmationsEnabled")
    ? ["true", "1", "yes", "on"].includes(String(payload.anonymousAffirmationsEnabled).toLowerCase())
    : isAnonymousAffirmationsEnabled();
  const nextAffirmationsCooldownMs = Object.prototype.hasOwnProperty.call(payload, "anonymousAffirmationsCooldownMs")
    ? Math.max(5000, Math.min(10 * 60 * 1000, Number(payload.anonymousAffirmationsCooldownMs) || 0))
    : getAnonymousAffirmationsCooldownMs();
  const nextVerificationCaptchaEnabled = Object.prototype.hasOwnProperty.call(payload, "verificationCaptchaEnabled")
    ? ["true", "1", "yes", "on"].includes(String(payload.verificationCaptchaEnabled).toLowerCase())
    : isVerificationCaptchaEnabled();
  const nextMessageArchiveEnabled = Object.prototype.hasOwnProperty.call(payload, "messageArchiveEnabled")
    ? ["true", "1", "yes", "on"].includes(String(payload.messageArchiveEnabled).toLowerCase())
    : Boolean(config.settings.messageArchiveEnabled);
  const nextMessageArchiveRetentionDays = Object.prototype.hasOwnProperty.call(payload, "messageArchiveRetentionDays")
    ? Math.max(1, Math.min(3650, Number(payload.messageArchiveRetentionDays) || 30))
    : Number(config.settings.messageArchiveRetentionDays || 30);
  const before = {
    verifyChannelId: config.settings.verifyChannelId,
    rulesChannelId: config.settings.rulesChannelId,
    rulesCardTitle: config.settings.rulesCardTitle,
    rulesCardDescription: config.settings.rulesCardDescription,
    rulesCardRules: config.settings.rulesCardRules,
    welcomeChannelId: config.settings.welcomeChannelId,
    generalChatChannelId: config.settings.generalChatChannelId,
    generalChatInactivityEnabled: config.settings.generalChatInactivityEnabled,
    anonymousAffirmationsEnabled: config.settings.anonymousAffirmationsEnabled,
    anonymousAffirmationsChannelId: config.settings.anonymousAffirmationsChannelId,
    anonymousAffirmationsCooldownMs: config.settings.anonymousAffirmationsCooldownMs,
    verificationCaptchaEnabled: config.settings.verificationCaptchaEnabled,
    logChannelId: config.settings.logChannelId,
    automodLogChannelId: config.settings.automodLogChannelId,
    mutedRoleId: config.settings.mutedRoleId,
    birthdayRoleId: config.settings.birthdayRoleId,
    birthdayAnnouncementChannelId: config.settings.birthdayAnnouncementChannelId,
    messageArchiveEnabled: config.settings.messageArchiveEnabled,
    messageArchiveRetentionDays: config.settings.messageArchiveRetentionDays,
    tiktokHandle: config.settings.tiktokHandle,
    tiktokNicknameAliases: config.settings.tiktokNicknameAliases,
    verifiedRoleId: config.settings.verifiedRoleId,
    unverifiedRoleId: config.settings.unverifiedRoleId
  };

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      if (key === "tiktokHandle") {
        config.settings[key] = nextTikTokHandle[0] || "";
      } else if (key === "tiktokNicknameAliases") {
        config.settings[key] = [...new Set([...nextTikTokAliases, ...nextTikTokHandle.slice(1)])];
      } else if (key === "anonymousAffirmationsEnabled") {
        config.settings[key] = nextAffirmationsEnabled;
      } else if (key === "anonymousAffirmationsCooldownMs") {
        config.settings[key] = nextAffirmationsCooldownMs;
      } else if (key === "verificationCaptchaEnabled") {
        config.settings[key] = nextVerificationCaptchaEnabled;
      } else if (key === "verificationRequiresApproval") {
        config.settings[key] = Object.prototype.hasOwnProperty.call(payload, "verificationRequiresApproval")
          ? ["true", "1", "yes", "on"].includes(String(payload.verificationRequiresApproval).toLowerCase())
          : isVerificationApprovalRequired();
      } else if (key === "generalChatChannelId") {
        config.settings[key] = nextGeneralChatChannelId;
      } else if (key === "generalChatInactivityEnabled") {
        config.settings[key] = nextGeneralChatInactivityEnabled;
      } else if (key === "messageArchiveEnabled") {
        config.settings[key] = nextMessageArchiveEnabled;
      } else if (key === "messageArchiveRetentionDays") {
        config.settings[key] = nextMessageArchiveRetentionDays;
      } else if (key === "rulesCardTitle") {
        config.settings[key] = nextRulesCardTitle;
      } else if (key === "rulesCardDescription") {
        config.settings[key] = nextRulesCardDescription;
      } else if (key === "rulesCardRules") {
        config.settings[key] = nextRulesCardRules;
      } else {
        config.settings[key] = String(payload[key] || "").trim() || null;
      }
      if (key === "verifyChannelId") {
        config.verifyMessageId = null;
      }
    }
  }

  pruneMessageArchive(true);
  saveConfig();
  if (!config.settings.messageArchiveEnabled && fs.existsSync(messageArchivePath)) {
    fs.writeFileSync(messageArchivePath, "");
  }
  const after = {
    verifyChannelId: config.settings.verifyChannelId,
    rulesChannelId: config.settings.rulesChannelId,
    rulesCardTitle: config.settings.rulesCardTitle,
    rulesCardDescription: config.settings.rulesCardDescription,
    rulesCardRules: config.settings.rulesCardRules,
    welcomeChannelId: config.settings.welcomeChannelId,
    generalChatChannelId: config.settings.generalChatChannelId,
    generalChatInactivityEnabled: config.settings.generalChatInactivityEnabled,
    anonymousAffirmationsEnabled: config.settings.anonymousAffirmationsEnabled,
    anonymousAffirmationsChannelId: config.settings.anonymousAffirmationsChannelId,
    anonymousAffirmationsCooldownMs: config.settings.anonymousAffirmationsCooldownMs,
    verificationCaptchaEnabled: config.settings.verificationCaptchaEnabled,
    logChannelId: config.settings.logChannelId,
    automodLogChannelId: config.settings.automodLogChannelId,
    mutedRoleId: config.settings.mutedRoleId,
    birthdayRoleId: config.settings.birthdayRoleId,
    birthdayAnnouncementChannelId: config.settings.birthdayAnnouncementChannelId,
    messageArchiveEnabled: config.settings.messageArchiveEnabled,
    messageArchiveRetentionDays: config.settings.messageArchiveRetentionDays,
    tiktokHandle: config.settings.tiktokHandle,
    tiktokNicknameAliases: config.settings.tiktokNicknameAliases,
    verifiedRoleId: config.settings.verifiedRoleId,
    unverifiedRoleId: config.settings.unverifiedRoleId
  };
  recordAuditLog(getWebModeratorTag(auth), "settings-updated", {
    changes: buildAuditDiff(before, after, Object.keys(after))
  });
  return buildWebConfigPayload().settings;
}

async function updateWebAutomod(auth, payload) {
  const before = {
    aiModerationEnabled: config.automod.aiModerationEnabled,
    aiModerationThreshold: config.automod.aiModerationThreshold,
    aiModerationAction: config.automod.aiModerationAction,
    aiModerationModel: config.automod.aiModerationModel,
    aiModerationSuppressLowConfidenceReviews: config.automod.aiModerationSuppressLowConfidenceReviews,
    aiModerationCategoryThresholds: JSON.stringify(config.automod.aiModerationCategoryThresholds || {}),
    aiCustomRulesEnabled: config.automod.aiCustomRulesEnabled,
    aiCustomRulesThreshold: config.automod.aiCustomRulesThreshold,
    aiCustomRulesAction: config.automod.aiCustomRulesAction,
    aiCustomRulesModel: config.automod.aiCustomRulesModel,
    aiCustomRulesLength: String(config.automod.aiCustomRules || "").length,
    aiCustomInstructionsLength: String(config.automod.aiCustomInstructions || "").length,
    aiIncludeRecentContext: config.automod.aiIncludeRecentContext,
    bannedWordsContextSensitivity: getBannedWordsContextSensitivity(),
    dryRunEnabled: config.automod.dryRunEnabled,
    escalationEnabled: config.automod.escalationEnabled,
    emojiSpamEnabled: config.automod.emojiSpamEnabled
  };
  const booleanKeys = [
    "invites",
    "spam",
    "caps",
    "bannedWords",
    "linksEnabled",
    "allowedDomainsOnly",
    "attachmentsEnabled",
    "ageProtectionEnabled",
    "antiRaidEnabled",
    "nicknameFilterEnabled",
    "scamFilterEnabled",
    "evasionFilterEnabled",
    "aiModerationEnabled",
    "aiModerationSuppressLowConfidenceReviews",
    "aiCustomRulesEnabled",
    "aiIncludeRecentContext",
    "dryRunEnabled",
    "linkReputationEnabled",
    "languageAwareFiltersEnabled",
    "quietHoursEnabled",
    "escalationEnabled",
    "emojiSpamEnabled",
    "googleBlockListEnabled"
  ];

  const integerRules = {
    maxMentions: [1, 25],
    maxEmojiCount: [3, 100],
    maxAttachmentSizeMb: [1, 100],
    raidJoinThreshold: [2, 100],
    warnThreshold: [1, 20],
    timeoutThreshold: [1, 20],
    aiModerationThreshold: [1, 100],
    aiCustomRulesThreshold: [1, 100],
    aiMinMessageLength: [1, 500],
    aiContextMessageCount: [1, 10],
    bannedWordsContextSensitivity: [0, 100],
    contextMessageCount: [1, 10],
    spamWindowMs: [1000, 60000],
    spamBurstThreshold: [2, 20],
    spamDuplicateThreshold: [2, 10],
    googleBlockListSyncMinutes: [5, 1440]
  };

  const durationRules = [
    "timeoutDurationMs",
    "offenseWindowMs",
    "raidWindowMs",
    "raidAccountAgeLimitMs",
    "minAccountAgeForLinksMs",
    "minMemberAgeForLinksMs",
    "minAccountAgeForAttachmentsMs",
    "minMemberAgeForAttachmentsMs"
  ];

  for (const key of booleanKeys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      setWebBoolean(config.automod, key, payload[key]);
    }
  }

  for (const [key, [min, max]] of Object.entries(integerRules)) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      setWebInteger(config.automod, key, payload[key], min, max);
    }
  }

  for (const key of durationRules) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      setWebDuration(config.automod, key, payload[key], key.startsWith("min") || key === "raidAccountAgeLimitMs");
    }
  }

  const stringKeys = ["aiModerationModel", "aiModerationCategoryThresholds", "aiCustomRulesModel", "aiCustomRules", "aiCustomInstructions", "quietHoursStart", "quietHoursEnd", "quietHoursMode", "googleBlockListUrl"];
  const actionKeys = ["aiModerationAction", "aiCustomRulesAction"];
  for (const key of actionKeys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      const value = String(payload[key] || "").trim().toLowerCase();
      config.automod[key] = ["review", "warn", "timeout", "kick", "ban"].includes(value) ? value : "review";
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "aiModerationCategoryThresholds")) {
    config.automod.aiModerationCategoryThresholds = parseAiModerationCategoryThresholdsInput(payload.aiModerationCategoryThresholds);
  }

  for (const key of stringKeys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      if (key === "aiModerationCategoryThresholds") continue;
      const value = String(payload[key] || "").trim();
      if (key === "quietHoursMode") {
        config.automod[key] = ["strict", "relaxed"].includes(value) ? value : "relaxed";
      } else {
        config.automod[key] = value.slice(0, key === "aiCustomRules" ? 4000 : 2000);
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "bannedWordList")) {
    config.automod.bannedWordList = toWebList(payload.bannedWordList, value => normalizeComparisonText(value));
  }
  if (Object.prototype.hasOwnProperty.call(payload, "nicknameBlockedTerms")) {
    config.automod.nicknameBlockedTerms = toWebList(payload.nicknameBlockedTerms, value => normalizeComparisonText(value));
  }
  if (Object.prototype.hasOwnProperty.call(payload, "scamPhraseList")) {
    config.automod.scamPhraseList = toWebList(payload.scamPhraseList, value => normalizeComparisonText(value));
  }
  if (Object.prototype.hasOwnProperty.call(payload, "googleBlockListTerms")) {
    config.automod.googleBlockListTerms = toWebList(payload.googleBlockListTerms, value => normalizeComparisonText(value));
  }
  if (Object.prototype.hasOwnProperty.call(payload, "allowedDomains")) {
    config.automod.allowedDomains = toWebList(payload.allowedDomains, normalizeDomain);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "blockedDomains")) {
    config.automod.blockedDomains = toWebList(payload.blockedDomains, normalizeDomain);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "allowedAttachmentExtensions")) {
    config.automod.allowedAttachmentExtensions = toWebList(payload.allowedAttachmentExtensions, normalizeExtension);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "blockedAttachmentExtensions")) {
    config.automod.blockedAttachmentExtensions = toWebList(payload.blockedAttachmentExtensions, normalizeExtension);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "exemptChannelIds")) {
    config.automod.exemptChannelIds = toWebList(payload.exemptChannelIds, value => String(value || "").trim().replace(/[<#>]/g, ""));
  }
  if (Object.prototype.hasOwnProperty.call(payload, "exemptRoleIds")) {
    config.automod.exemptRoleIds = toWebList(payload.exemptRoleIds, value => String(value || "").trim().replace(/[<@&>]/g, ""));
  }
  if (Object.prototype.hasOwnProperty.call(payload, "exemptUserIds")) {
    config.automod.exemptUserIds = toWebList(payload.exemptUserIds, value => String(value || "").trim().replace(/[<@>]/g, ""));
  }
  if (Object.prototype.hasOwnProperty.call(payload, "channelRuleOverrides")) {
    const overrides = String(payload.channelRuleOverrides || "").trim();
    config.automod.channelRuleOverrides = {};
    if (overrides) {
      for (const line of overrides.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const [selectorRaw, rulesRaw = ""] = trimmed.split(":");
        const selector = String(selectorRaw || "").trim().replace(/[<#>]/g, "");
        const rules = normalizeProfileRuleList(rulesRaw);
        if (selector && rules.length) {
          config.automod.channelRuleOverrides[selector] = rules;
        }
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, "raidAction")) {
    const raidAction = String(payload.raidAction || "").trim().toLowerCase();
    config.automod.raidAction = ["log", "timeout"].includes(raidAction) ? raidAction : "log";
  }

  saveConfig();
  recordAuditLog(getWebModeratorTag(auth), "automod-updated", {
    enabledRules: Object.entries(config.automod)
      .filter(([key, value]) => typeof value === "boolean" && value)
      .map(([key]) => key)
      .slice(0, 20),
    exemptChannels: config.automod.exemptChannelIds.length,
    exemptRoles: config.automod.exemptRoleIds.length,
    exemptUsers: config.automod.exemptUserIds.length,
    changes: buildAuditDiff(before, {
      aiModerationEnabled: config.automod.aiModerationEnabled,
      aiModerationThreshold: config.automod.aiModerationThreshold,
      aiModerationAction: config.automod.aiModerationAction,
      aiModerationModel: config.automod.aiModerationModel,
      aiModerationSuppressLowConfidenceReviews: config.automod.aiModerationSuppressLowConfidenceReviews,
      aiModerationCategoryThresholds: JSON.stringify(config.automod.aiModerationCategoryThresholds || {}),
      aiCustomRulesEnabled: config.automod.aiCustomRulesEnabled,
      aiCustomRulesThreshold: config.automod.aiCustomRulesThreshold,
      aiCustomRulesAction: config.automod.aiCustomRulesAction,
      aiCustomRulesModel: config.automod.aiCustomRulesModel,
      aiCustomRulesLength: String(config.automod.aiCustomRules || "").length,
      aiCustomInstructionsLength: String(config.automod.aiCustomInstructions || "").length,
      aiIncludeRecentContext: config.automod.aiIncludeRecentContext,
      dryRunEnabled: config.automod.dryRunEnabled,
      escalationEnabled: config.automod.escalationEnabled,
      emojiSpamEnabled: config.automod.emojiSpamEnabled
    }, Object.keys(before))
  });

  if (
    Object.prototype.hasOwnProperty.call(payload, "googleBlockListEnabled") ||
    Object.prototype.hasOwnProperty.call(payload, "googleBlockListUrl") ||
    Object.prototype.hasOwnProperty.call(payload, "googleBlockListSyncMinutes")
  ) {
    await syncGoogleBlockList("web", true);
  }

  return buildWebConfigPayload().automod;
}

function updateWebRuleActions(auth, payload) {
  const ruleActions = {};
  const alertRules = parseRuleKeyList(payload.alertRules || "");
  const warnRules = parseRuleKeyList(payload.warnRules || "");
  const timeoutRules = parseRuleKeyList(payload.timeoutRules || "");
  const raidAction = String(payload.raidAction || "").trim().toLowerCase();

  for (const rule of alertRules) ruleActions[rule] = "alert";
  for (const rule of warnRules) ruleActions[rule] = "warn";
  for (const rule of timeoutRules) ruleActions[rule] = "timeout";

  config.automod.alertOnlyRules = alertRules;
  config.automod.ruleActions = ruleActions;
  if (["log", "timeout"].includes(raidAction)) {
    config.automod.raidAction = raidAction;
  }
  saveConfig();
  recordAuditLog(getWebModeratorTag(auth), "rule-actions-updated", {
    alertRules: alertRules.length,
    warnRules: warnRules.length,
    timeoutRules: timeoutRules.length,
    raidAction: config.automod.raidAction
  });

  return {
    alertOnlyRules: config.automod.alertOnlyRules,
    ruleActions: config.automod.ruleActions,
    raidAction: config.automod.raidAction
  };
}

function updateWebPermissions(auth, payload) {
  config.permissions.modRoleIds = parseIdList(payload.modRoleIds || "");
  config.permissions.adminRoleIds = parseIdList(payload.adminRoleIds || "");
  saveConfig();
  recordAuditLog(getWebModeratorTag(auth), "permissions-updated", {
    modRoleIds: config.permissions.modRoleIds.length,
    adminRoleIds: config.permissions.adminRoleIds.length
  });
  return buildWebConfigPayload().permissions;
}

function parseTemplatesInput(value) {
  if (Array.isArray(value)) return value;
  return String(value || "")
    .split("\n")
    .map(line => {
      const parts = line.split("|").map(part => part.trim());
      if (parts.length < 4) return null;
      const label = parts[0];
      let category = "general";
      let action = "warn";
      let duration = "";
      let reasonParts = [];

      if (parts.length >= 5) {
        [label, category, action, duration, ...reasonParts] = parts;
      } else {
        [label, action, duration, ...reasonParts] = parts;
      }

      const reason = reasonParts.join("|").trim();
      if (!label || !action || !reason) return null;
      return {
        label: label.slice(0, 80),
        category: String(category || "general").trim().toLowerCase().slice(0, 40),
        action: String(action || "warn").trim().toLowerCase().slice(0, 30),
        duration: String(duration || "").trim(),
        reason: reason.slice(0, 500)
      };
    })
    .filter(Boolean)
    .slice(0, 50);
}

function updateWebOpsConfig(auth, payload) {
  config.modTemplates = parseTemplatesInput(payload.modTemplates);
  config.channelProfiles = String(payload.channelProfiles || "").trim().slice(0, 4000);
  config.reportSettings = {
    enabled: envFlag(payload.reportEnabled, false),
    channelId: String(payload.reportChannelId || "").trim().replace(/[<#>]/g, "") || null,
    frequency: ["daily", "weekly"].includes(String(payload.reportFrequency || "").trim().toLowerCase())
      ? String(payload.reportFrequency).trim().toLowerCase()
      : "daily",
    lastSentAt: config.reportSettings?.lastSentAt || null
  };
  const templateCategories = config.modTemplates.reduce((acc, template) => {
    const key = String(template.category || "general").toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  recordAuditLog(getWebModeratorTag(auth), "ops-config-updated", {
    templates: config.modTemplates.length,
    templateCategories,
    reports: config.reportSettings.enabled
  });
  return buildWebOpsPayload(true);
}

function buildWebOpsPayload(includeAdmin = false) {
  const aiReviewStatuses = Object.values(config.aiReviews || {});
  const payload = {
    templates: config.modTemplates || [],
    riskUsers: buildRiskLeaderboard(12),
    falsePositiveCount: aiReviewStatuses.filter(entry => entry.status === "dismissed").length,
    openAiReviews: (config.cases || []).filter(entry => entry.action === "automod:ai-review" && !config.aiReviews?.[String(entry.id)]).length
  };

  if (includeAdmin) {
    payload.appeals = config.appeals || [];
    payload.auditLog = (config.auditLog || []).slice(-100).reverse();
    payload.channelProfiles = config.channelProfiles || "";
    payload.reportSettings = config.reportSettings || {};
  }

  return payload;
}

function buildAutoModPreviewMessage(body) {
  const channelId = String(body.channelId || "").trim().replace(/[<#>]/g, "") || null;
  const content = String(body.content || "").trim().slice(0, 2000);
  const contentMentions = (content.match(/<@/g) || []).length;
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  const createdAt = Date.now() - (Number(body.accountAgeDays) || 60) * 24 * 60 * 60 * 1000;
  const joinedAt = Date.now() - (Number(body.memberAgeHours) || 48) * 60 * 60 * 1000;

  return {
    content,
    guild: client.guilds.cache.get(GUILD_ID) || null,
    channel: {
      id: channelId || "preview",
      name: String(body.channelName || "").trim().toLowerCase(),
      toString() {
        return channelId ? `<#${channelId}>` : "#preview";
      }
    },
    author: {
      id: "preview-user",
      tag: "Preview User#0001",
      bot: false,
      createdTimestamp: createdAt,
      createdAt: new Date(createdAt),
      displayAvatarURL: () => "",
      send: async () => {}
    },
    member: {
      id: "preview-user",
      joinedTimestamp: joinedAt,
      joinedAt: new Date(joinedAt),
      moderatable: false,
      permissions: { has: () => false },
      roles: {
        cache: {
          some: () => false
        },
        highest: {
          comparePositionTo: () => 1
        }
      }
    },
    mentions: {
      users: { size: contentMentions }
    },
    attachments: {
      size: attachments.length,
      values: () => attachments.map(name => ({
        name,
        size: Number(body.attachmentSizeMb || 0) * 1024 * 1024
      }))
    }
  };
}

async function previewAutoMod(body) {
  const previewMessage = buildAutoModPreviewMessage(body);
  const policy = resolveAutoModPolicy(previewMessage);
  const evaluation = await evaluateAutoModMessage(previewMessage, policy, true);

  return {
    channelId: previewMessage.channel.id,
    channelName: previewMessage.channel.name || "",
    content: previewMessage.content,
    profile: policy.profile ? {
      selector: policy.profile.selector,
      preset: policy.profile.preset || "",
      overrides: policy.profile.overrides || {}
    } : null,
    quietHoursActive: policy.quietHoursActive,
    dryRun: Boolean(policy.automod.dryRunEnabled),
    ignoredRules: Array.from(policy.ignoredRules || []),
    match: evaluation.match,
    allMatches: evaluation.allMatches || [],
    contextMessages: evaluation.contextMessages || []
  };
}

function addChannelRuleOverride(channelId, ruleKey, mode = "rule") {
  const cleanChannelId = String(channelId || "").trim().replace(/[<#>]/g, "");
  const cleanMode = String(mode || "rule").trim().toLowerCase();
  const cleanRuleKey = normalizeRuleKey(ruleKey);
  if (!cleanChannelId || (cleanMode !== "channel" && !cleanRuleKey)) {
    throw new Error("A valid channel and rule are required.");
  }

  if (cleanMode === "channel") {
    const exemptChannelIds = new Set(config.automod.exemptChannelIds || []);
    exemptChannelIds.add(cleanChannelId);
    config.automod.exemptChannelIds = Array.from(exemptChannelIds);
    saveConfig();
    recordAuditLog("AutoMod", "channel-exempt-added", { channelId: cleanChannelId });
    return config.automod.channelRuleOverrides;
  }

  const overrides = config.automod.channelRuleOverrides || {};
  const next = new Set(Array.isArray(overrides[cleanChannelId]) ? overrides[cleanChannelId] : []);
  next.add(cleanRuleKey);
  config.automod.channelRuleOverrides = {
    ...overrides,
    [cleanChannelId]: Array.from(next)
  };
  saveConfig();
  recordAuditLog("AutoMod", "channel-rule-override-added", {
    channelId: cleanChannelId,
    ruleKey: cleanRuleKey
  });
  return config.automod.channelRuleOverrides;
}

function createWebAppeal(auth, payload) {
  const userId = String(payload.userId || "").trim().replace(/[<@!>]/g, "");
  const reason = String(payload.reason || "").trim().slice(0, 1000);
  if (!/^\d{15,25}$/.test(userId)) {
    throw new Error("A valid user ID is required for an appeal.");
  }
  if (!reason) {
    throw new Error("An appeal reason is required.");
  }

  const appeal = {
    id: config.nextAppealId || 1,
    userId,
    userTag: String(payload.userTag || userId).trim().slice(0, 100),
    reason,
    status: "open",
    createdBy: getWebModeratorTag(auth),
    createdAt: new Date().toISOString()
  };
  config.nextAppealId = appeal.id + 1;
  config.appeals.push(appeal);
  saveConfig();
  recordAuditLog(getWebModeratorTag(auth), "appeal-created", { appealId: appeal.id, userId });
  return appeal;
}

function updateWebAppealStatus(auth, payload) {
  if (!hasWebAccess(auth, "admin")) {
    throw new Error("Admin web access is required.");
  }

  const appealId = Number(payload.appealId);
  const status = String(payload.status || "").trim().toLowerCase();
  const allowedStatuses = new Set(["open", "reviewed", "approved", "rejected", "closed"]);
  if (!Number.isInteger(appealId)) {
    throw new Error("A valid appeal ID is required.");
  }
  if (!allowedStatuses.has(status)) {
    throw new Error("Unknown appeal status.");
  }

  const appeal = (config.appeals || []).find(entry => entry.id === appealId);
  if (!appeal) {
    throw new Error("Appeal not found.");
  }

  appeal.status = status;
  appeal.reviewedBy = getWebModeratorTag(auth);
  appeal.reviewedAt = new Date().toISOString();
  saveConfig();
  recordAuditLog(getWebModeratorTag(auth), "appeal-status-updated", {
    appealId,
    status,
    userId: appeal.userId
  });
  return appeal;
}

function serializeWebMember(member, user = null) {
  const resolvedUser = user || member?.user || null;
  if (!resolvedUser) return null;

  const cases = getCasesForUser(resolvedUser.id).slice(-20).reverse();
  const warnings = getWarnings(resolvedUser.id).map((warning, index) => ({ ...warning, index })).reverse();
  const notes = getNotes(resolvedUser.id).map((note, index) => ({ ...note, index })).reverse();

  return {
    id: resolvedUser.id,
    tag: resolvedUser.tag || resolvedUser.username,
    username: resolvedUser.username,
    avatarUrl: resolvedUser.displayAvatarURL?.({ dynamic: true }) || null,
    bot: Boolean(resolvedUser.bot),
    inGuild: Boolean(member),
    joinedAt: member?.joinedAt?.toISOString?.() || null,
    createdAt: resolvedUser.createdAt?.toISOString?.() || null,
    topRole: member?.roles?.highest && member.roles.highest.id !== member.guild.id
      ? { id: member.roles.highest.id, name: member.roles.highest.name }
      : null,
    roles: member?.roles?.cache
      ? member.roles.cache
          .filter(role => role.id !== member.guild.id)
          .sort((a, b) => b.position - a.position)
          .map(role => ({ id: role.id, name: role.name }))
          .slice(0, 20)
      : [],
    timeoutUntil: member?.communicationDisabledUntil?.toISOString?.() || null,
    warnings,
    notes,
    cases,
    counts: {
      warnings: warnings.length,
      notes: notes.length,
      cases: getCasesForUser(resolvedUser.id).length
    },
    risk: calculateUserRisk(resolvedUser.id)
  };
}

async function getWebGuild() {
  return client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID);
}

async function resolveWebMember(query) {
  const guild = await getWebGuild();
  const normalized = String(query || "").trim();
  if (!normalized) {
    throw new Error("Enter a member ID, mention, or username.");
  }

  const id = normalized.replace(/[<@!>]/g, "");
  if (/^\d{15,25}$/.test(id)) {
    const member = await guild.members.fetch(id).catch(() => null);
    const user = member?.user || await client.users.fetch(id).catch(() => null);
    if (!member && !user) throw new Error("No Discord user found for that ID.");
    return { guild, member, user };
  }

  const matches = await guild.members.search({ query: normalized, limit: 1 }).catch(() => null);
  const member = matches?.first?.() || null;
  if (!member) {
    throw new Error("No server member matched that search.");
  }

  return { guild, member, user: member.user };
}

async function ensureWebModeratable(auth, guild, targetMember, actionLabel) {
  if (!targetMember) {
    if (["ban", "tempban"].includes(actionLabel)) return;
    throw new Error("That member could not be found in the server.");
  }

  if (auth.user?.id && targetMember.id === auth.user.id) {
    throw new Error(`You cannot ${actionLabel} yourself.`);
  }

  if (targetMember.id === guild.ownerId) {
    throw new Error(`You cannot ${actionLabel} the server owner.`);
  }

  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (botMember && botMember.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0) {
    throw new Error(`My role needs to be higher than that member to ${actionLabel} them.`);
  }

  if (auth.user?.id && auth.user.id !== "token") {
    const moderatorMember = await guild.members.fetch(auth.user.id).catch(() => null);
    if (!moderatorMember || moderatorMember.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0) {
      throw new Error(`You need a higher role than that member to ${actionLabel} them.`);
    }
  }
}

function getWebModeratorTag(auth) {
  return auth.user?.tag || auth.user?.username || "Web Panel";
}

async function handleWebMemberAction(auth, payload) {
  if (!hasWebAccess(auth, "mod")) {
    throw new Error("Moderator web access is required.");
  }

  const action = String(payload.action || "").trim().toLowerCase();
  const targetId = String(payload.userId || "").trim();
  const reason = String(payload.reason || "No reason provided.").trim().slice(0, 1000);
  if (!/^\d{15,25}$/.test(targetId)) {
    throw new Error("A valid target user ID is required.");
  }

  const guild = await getWebGuild();
  const member = await guild.members.fetch(targetId).catch(() => null);
  const user = member?.user || await client.users.fetch(targetId).catch(() => null);
  if (!user) throw new Error("That Discord user could not be found.");

  const moderatorTag = getWebModeratorTag(auth);

  if (action === "warn") {
    const warnings = addWarning(user.id, moderatorTag, reason);
    const entry = addCase({
      action: "warn",
      targetId: user.id,
      targetTag: user.tag,
      moderatorTag,
      reason,
      details: [{ name: "Total warnings", value: `${warnings.length}`, inline: true }]
    });
    await notifyUser(user, makeEmbed({
      title: "Warning received",
      description: `You were warned in **${guild.name}**.`,
      color: COLORS.yellow,
      fields: buildCaseFields(entry)
    }));
    await logEmbed(makeEmbed({ title: `Case #${entry.id}: warning`, description: `${user.tag} received a warning.`, color: COLORS.yellow, fields: buildCaseFields(entry) }));
    return { entry };
  }

  if (action === "note") {
    const notes = addNote(user.id, moderatorTag, reason);
    const entry = addCase({
      action: "note",
      targetId: user.id,
      targetTag: user.tag,
      moderatorTag,
      reason,
      details: [{ name: "Total notes", value: `${notes.length}`, inline: true }]
    });
    await logEmbed(makeEmbed({ title: `Case #${entry.id}: staff note`, description: `A staff note was saved for ${user.tag}.`, color: COLORS.gray, fields: buildCaseFields(entry) }));
    return { entry };
  }

  if (action === "timeout") {
    await ensureWebModeratable(auth, guild, member, "timeout");
    const durationMs = parseDuration(payload.duration);
    if (!durationMs) throw new Error("Use a valid duration like 10m, 2h, or 1d.");
    if (!member?.moderatable) throw new Error("I cannot timeout that member.");
    await member.timeout(durationMs, `${moderatorTag}: ${reason}`);
    const entry = addCase({
      action: "timeout",
      targetId: user.id,
      targetTag: user.tag,
      moderatorTag,
      reason,
      details: [{ name: "Duration", value: formatDuration(durationMs), inline: true }]
    });
    await logEmbed(makeEmbed({ title: `Case #${entry.id}: timeout`, description: `${user.tag} was timed out.`, color: COLORS.red, fields: buildCaseFields(entry) }));
    return { entry };
  }

  if (action === "untimeout") {
    await ensureWebModeratable(auth, guild, member, "untimeout");
    if (!member?.communicationDisabledUntilTimestamp || member.communicationDisabledUntilTimestamp <= Date.now()) {
      throw new Error("That member is not currently timed out.");
    }
    await member.timeout(null, `${moderatorTag}: Timeout removed from web panel.`);
    const entry = addCase({ action: "untimeout", targetId: user.id, targetTag: user.tag, moderatorTag, reason: "Timeout removed from web panel." });
    await logEmbed(makeEmbed({ title: `Case #${entry.id}: timeout removed`, description: `${user.tag}'s timeout was removed.`, color: COLORS.mint, fields: buildCaseFields(entry) }));
    return { entry };
  }

  if (action === "mute") {
    await ensureWebModeratable(auth, guild, member, "mute");
    if (!member?.manageable) throw new Error("I cannot manage that member's roles.");
    const mutedRole = await ensureMutedRole(guild);
    await member.roles.add(mutedRole, `${moderatorTag}: ${reason}`);
    const entry = addCase({
      action: "mute",
      targetId: user.id,
      targetTag: user.tag,
      moderatorTag,
      reason,
      details: [{ name: "Muted role", value: `<@&${mutedRole.id}>`, inline: true }]
    });
    await logEmbed(makeEmbed({ title: `Case #${entry.id}: mute`, description: `${user.tag} was muted.`, color: COLORS.red, fields: buildCaseFields(entry) }));
    return { entry };
  }

  if (action === "unmute") {
    await ensureWebModeratable(auth, guild, member, "unmute");
    const mutedRoleId = getMutedRoleId();
    if (!mutedRoleId || !member.roles.cache.has(mutedRoleId)) throw new Error("That member is not muted.");
    await member.roles.remove(mutedRoleId, `${moderatorTag}: Unmuted from web panel.`);
    const entry = addCase({ action: "unmute", targetId: user.id, targetTag: user.tag, moderatorTag, reason: "Unmuted from web panel." });
    await logEmbed(makeEmbed({ title: `Case #${entry.id}: unmute`, description: `${user.tag} was unmuted.`, color: COLORS.mint, fields: buildCaseFields(entry) }));
    return { entry };
  }

  if (action === "clearwarnings") {
    const count = clearWarnings(user.id);
    const entry = addCase({
      action: "clearwarnings",
      targetId: user.id,
      targetTag: user.tag,
      moderatorTag,
      reason,
      details: [{ name: "Warnings cleared", value: `${count}`, inline: true }]
    });
    await logEmbed(makeEmbed({ title: `Case #${entry.id}: warnings cleared`, description: `${user.tag}'s warnings were cleared.`, color: COLORS.mint, fields: buildCaseFields(entry) }));
    return { entry };
  }

  if (action === "kick") {
    await ensureWebModeratable(auth, guild, member, "kick");
    if (!member?.kickable) throw new Error("I cannot kick that member.");
    const entry = addCase({ action: "kick", targetId: user.id, targetTag: user.tag, moderatorTag, reason });
    await member.kick(`${moderatorTag}: ${reason}`);
    await logEmbed(makeEmbed({ title: `Case #${entry.id}: kick`, description: `${user.tag} was kicked.`, color: COLORS.red, fields: buildCaseFields(entry) }));
    return { entry };
  }

  if (action === "ban") {
    await ensureWebModeratable(auth, guild, member, "ban");
    if (member && !member.bannable) throw new Error("I cannot ban that member.");
    const entry = addCase({ action: "ban", targetId: user.id, targetTag: user.tag, moderatorTag, reason });
    await guild.members.ban(user.id, { reason: `${moderatorTag}: ${reason}` });
    await logEmbed(makeEmbed({ title: `Case #${entry.id}: ban`, description: `${user.tag} was banned.`, color: COLORS.red, fields: buildCaseFields(entry) }));
    return { entry };
  }

  if (action === "tempban") {
    await ensureWebModeratable(auth, guild, member, "tempban");
    if (member && !member.bannable) throw new Error("I cannot ban that member.");
    const durationMs = parseDuration(payload.duration);
    if (!durationMs) throw new Error("Use a valid duration like 1h, 1d, or 7d.");
    const expiresAt = new Date(Date.now() + durationMs).toISOString();
    addTempBan({ userId: user.id, targetTag: user.tag, moderatorTag, reason, expiresAt });
    await guild.members.ban(user.id, { reason: `${moderatorTag}: ${reason}` });
    const entry = addCase({
      action: "tempban",
      targetId: user.id,
      targetTag: user.tag,
      moderatorTag,
      reason,
      details: [
        { name: "Duration", value: formatDuration(durationMs), inline: true },
        { name: "Expires", value: `<t:${Math.floor(new Date(expiresAt).getTime() / 1000)}:F>`, inline: false }
      ]
    });
    await logEmbed(makeEmbed({ title: `Case #${entry.id}: tempban`, description: `${user.tag} was temporarily banned.`, color: COLORS.red, fields: buildCaseFields(entry) }));
    return { entry };
  }

  throw new Error("Unknown moderation action.");
}

async function handleWebAiReviewAction(auth, payload) {
  if (!hasWebAccess(auth, "mod")) {
    throw new Error("Moderator web access is required.");
  }

  const caseId = Number(payload.caseId);
  const reviewAction = String(payload.reviewAction || "").trim().toLowerCase();
  const entry = Number.isInteger(caseId) ? getCaseById(caseId) : null;
  if (!entry || entry.action !== "automod:ai-review") {
    throw new Error("AI review case not found.");
  }

  const moderatorTag = getWebModeratorTag(auth);
  if (reviewAction === "dismiss") {
    const status = setAiReviewStatus(caseId, {
      status: "dismissed",
      moderatorTag,
      note: String(payload.reason || "Dismissed from AI review.").trim().slice(0, 500)
    });
    recordAuditLog(moderatorTag, "ai-review-dismissed", { caseId, note: status.note });
    return { status };
  }

  const actionMap = {
    note: "note",
    warn: "warn",
    timeout: "timeout"
  };
  const memberAction = actionMap[reviewAction];
  if (!memberAction) {
    throw new Error("Unknown AI review action.");
  }

  const reason = String(payload.reason || `AI review case #${caseId}: ${entry.reason || "Needs staff review."}`).trim();
  const result = await handleWebMemberAction(auth, {
    userId: entry.targetId,
    action: memberAction,
    reason,
    duration: payload.duration || "10m"
  });

  const status = setAiReviewStatus(caseId, {
    status: "actioned",
    moderatorTag,
    action: memberAction,
    actionCaseId: result.entry?.id || null
  });
  recordAuditLog(moderatorTag, "ai-review-actioned", { caseId, action: memberAction, actionCaseId: result.entry?.id || null });

  return { status, entry: result.entry };
}

function getResponseOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const message = (payload?.output || []).find(item => item.type === "message");
  const textItem = (message?.content || []).find(item => item.type === "output_text" && typeof item.text === "string");
  return textItem?.text || "";
}

function buildMemberSummaryInput(memberPayload) {
  return {
    member: {
      id: memberPayload.id,
      tag: memberPayload.tag,
      inGuild: memberPayload.inGuild,
      joinedAt: memberPayload.joinedAt,
      createdAt: memberPayload.createdAt,
      timeoutUntil: memberPayload.timeoutUntil,
      counts: memberPayload.counts
    },
    recentCases: (memberPayload.cases || []).slice(0, 15).map(entry => ({
      id: entry.id,
      action: entry.action,
      reason: entry.reason,
      moderatorTag: entry.moderatorTag,
      createdAt: entry.createdAt
    })),
    recentWarnings: (memberPayload.warnings || []).slice(0, 15).map(entry => ({
      reason: entry.reason,
      moderatorTag: entry.moderatorTag,
      createdAt: entry.createdAt
    })),
    recentNotes: (memberPayload.notes || []).slice(0, 10).map(entry => ({
      content: entry.content,
      moderatorTag: entry.moderatorTag,
      createdAt: entry.createdAt
    }))
  };
}

async function buildWebMemberAiSummary(auth, query) {
  if (!hasWebAccess(auth, "mod")) {
    throw new Error("Moderator web access is required.");
  }

  const { member, user } = await resolveWebMember(query);
  const memberPayload = serializeWebMember(member, user);
  if (!OPENAI_API_KEY) {
    return {
      member: memberPayload,
      summary: null,
      disabled: true,
      error: "AI member summaries are unavailable until OPENAI_API_KEY is configured for the web service."
    };
  }

  const input = buildMemberSummaryInput(memberPayload);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_SUMMARY_MODEL,
        input: [
          {
            role: "system",
            content:
              "You assist Discord moderators. Summarize only the provided moderation record. " +
              "Do not invent evidence. Prefer human review for ambiguous or severe decisions."
          },
          {
            role: "user",
            content: `Create a concise moderation risk summary for this member JSON:\n${JSON.stringify(input)}`
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "member_risk_summary",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                riskLevel: { type: "string", enum: ["low", "medium", "high", "critical"] },
                confidence: { type: "integer" },
                summary: { type: "string" },
                patterns: { type: "array", items: { type: "string" } },
                suggestedAction: { type: "string", enum: ["none", "note", "warn", "timeout", "review"] },
                suggestedReason: { type: "string" },
                timeoutDuration: { type: "string" }
              },
              required: [
                "riskLevel",
                "confidence",
                "summary",
                "patterns",
                "suggestedAction",
                "suggestedReason",
                "timeoutDuration"
              ]
            }
          }
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`AI summary request failed (${response.status}): ${errorText.slice(0, 200)}`);
    }

    const payload = await response.json();
    const text = getResponseOutputText(payload);
    if (!text) throw new Error("AI summary returned no text.");

    return {
      member: memberPayload,
      summary: JSON.parse(text)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getWebMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
  }[ext] || "application/octet-stream";
}

function serveWebStatic(req, res, pathname) {
  let requested = pathname;
  if (pathname === "/") {
    requested = "/index.html";
  } else if (pathname === "/support" || pathname === "/support/") {
    requested = "/support.html";
  } else if (pathname === MOCHI_PATH || pathname === `${MOCHI_PATH}/`) {
    requested = getMochiIndexPath();
  }
  const decodedPath = decodeURIComponent(requested);
  const filePath = path.normalize(path.join(webPublicDir, decodedPath));

  if (!filePath.startsWith(webPublicDir)) {
    return sendWebText(res, 403, "Forbidden");
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      return sendWebText(res, 404, "Not found");
    }

    if (filePath === path.join(webPublicDir, getMochiIndexPath())) {
      const mochiBootstrap = buildMochiBootstrapPayload();
      const bootstrapPayload = JSON.stringify(mochiBootstrap).replace(/</g, "\\u003c");
      const bootstrapScript = `<script type="application/json" id="mochi-bootstrap">${bootstrapPayload}</script>`;
      const htmlBodyClass = mochiBootstrap.activityMode ? `<body class="activity-mode">` : `<body>`;
      const html = data.toString("utf8")
        .replace("<body>", htmlBodyClass)
        .replace("</head>", `${bootstrapScript}</head>`);
      res.writeHead(200, {
        "Content-Type": getWebMimeType(filePath),
        "Cache-Control": "no-store"
      });
      res.end(html);
      return;
    }

    if (SUPPORT_PUBLIC_URL && filePath === path.join(webPublicDir, "index.html")) {
      const supportBootstrapScript = `<script>window.__SUPPORT_PUBLIC_URL=${JSON.stringify(SUPPORT_PUBLIC_URL)};</script>`;
      const html = data.toString("utf8").replace("</head>", `${supportBootstrapScript}</head>`);
      res.writeHead(200, {
        "Content-Type": getWebMimeType(filePath),
        "Cache-Control": "no-store"
      });
      res.end(html);
      return;
    }

    res.writeHead(200, {
      "Content-Type": getWebMimeType(filePath),
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

async function handleWebApi(req, res, pathname) {
  const auth = getWebAuth(req);

  if (req.method === "GET" && pathname === "/api/me") {
    return sendWebJson(res, 200, buildWebUserPayload(auth));
  }

  if (req.method === "GET" && pathname === "/api/mochi/config") {
    return sendWebJson(res, 200, {
      ok: true,
      gameTitle: "Mochi Bird",
      publicBaseUrl: buildMochiBaseUrl(),
      mochiPath: MOCHI_PATH,
      sessionTtlMinutes: Math.round(MOCHI_SESSION_TTL_MS / 60000),
      leaderboard: getMochiLeaderboard(10),
      recentRuns: getMochiRecentRuns(8)
    });
  }

  if (req.method === "POST" && pathname === "/api/mochi/activity/session") {
    const body = await readWebJsonBody(req);
    const userId = String(body.userId || "").trim();
    const userTag = String(body.userTag || "").trim();
    const channelId = String(body.channelId || "").trim();
    const guildId = String(body.guildId || "").trim();

    if (!userId || !userTag || !channelId) {
      return sendWebJson(res, 400, { ok: false, error: "Missing activity session fields." });
    }

    const session = createMochiSession({ userId, userTag, channelId, guildId });
    return sendWebJson(res, 200, { ok: true, session: publicMochiSession(session) });
  }

  if (pathname.startsWith("/api/mochi/session/") && pathname.endsWith("/profile")) {
    const sessionId = pathname.split("/").filter(Boolean)[3];
    const session = sessionId ? getMochiSession(sessionId) : null;
    if (!session) {
      return sendWebJson(res, 404, { ok: false, error: "Session not found or expired." });
    }

    if (req.method === "GET") {
      return sendWebJson(res, 200, { ok: true, profile: getMochiProfile(session.userId) });
    }

    if (req.method === "POST") {
      const body = await readWebJsonBody(req);
      const profile = upsertMochiProfile(session.userId, {
        userTag: session.userTag,
        canWallet: body.canWallet,
        cosmeticState: body.cosmeticState
      });
      return sendWebJson(res, 200, { ok: true, profile });
    }
  }

  if (req.method === "GET" && pathname.startsWith("/api/mochi/session/")) {
    const sessionId = pathname.split("/").filter(Boolean)[3];
    const session = sessionId ? getMochiSession(sessionId) : null;
    if (!session) {
      return sendWebJson(res, 404, { ok: false, error: "Session not found or expired." });
    }
    return sendWebJson(res, 200, {
      ok: true,
      session: publicMochiSession(session),
      profile: getMochiProfile(session.userId)
    });
  }

  if (req.method === "GET" && pathname === "/api/mochi/leaderboard") {
    return sendWebJson(res, 200, {
      ok: true,
      leaderboard: getMochiLeaderboard(10),
      recentRuns: getMochiRecentRuns(8)
    });
  }

  if (req.method === "GET" && pathname.startsWith("/api/mochi/leaderboard/")) {
    const userId = pathname.split("/").filter(Boolean)[3];
    const entry = userId ? getMochiPersonalBest(userId) : null;
    if (!entry) {
      return sendWebJson(res, 404, { ok: false, error: "No score yet." });
    }
    return sendWebJson(res, 200, { ok: true, entry });
  }

  if (req.method === "POST" && pathname.startsWith("/api/mochi/session/") && pathname.endsWith("/score")) {
    const sessionId = pathname.split("/").filter(Boolean)[3];
    const session = sessionId ? getMochiSession(sessionId) : null;
    if (!session) {
      return sendWebJson(res, 404, { ok: false, error: "Session not found or expired." });
    }
    if (session.status === "completed") {
      return sendWebJson(res, 409, { ok: false, error: "This score was already submitted.", session: publicMochiSession(session) });
    }

    const body = await readWebJsonBody(req);
    const score = Number(body.score);
    if (!Number.isFinite(score) || score < 0) {
      return sendWebJson(res, 400, { ok: false, error: "Invalid score." });
    }

    const durationMs = Number(body.durationMs) || 0;
    const reason = String(body.reason || "game_over");
    const completedSession = completeMochiSession(sessionId, { score: Math.floor(score), durationMs, reason });
    const personalBest = recordMochiScore({
      userId: completedSession.userId,
      userTag: completedSession.userTag,
      score: Math.floor(score)
    });
    const recentRun = recordMochiRun({
      userId: completedSession.userId,
      userTag: completedSession.userTag,
      score: Math.floor(score),
      durationMs,
      cans: Number(body.cans) || 0,
      reason
    });
    const leaderboard = getMochiLeaderboard(10);
    const recentRuns = getMochiRecentRuns(8);

    if (completedSession.channelId) {
      client.channels.fetch(completedSession.channelId).then(async channel => {
        if (!channel || typeof channel.isTextBased !== "function" || !channel.isTextBased()) return;
        const best = personalBest?.bestScore ?? Math.floor(score);
        const rankText = leaderboard.length ? `Current top score: ${leaderboard[0].bestScore}.` : "No leaderboard entries yet.";
        await channel.send({
          content: `**${completedSession.userTag}** scored **${Math.floor(score)}** in Mochi Bird. Personal best: **${best}**. ${rankText}`
        }).catch(() => {});
      }).catch(() => {});
    }

    return sendWebJson(res, 200, {
      ok: true,
      session: publicMochiSession(completedSession),
      personalBest,
      leaderboard,
      recentRun,
      recentRuns
    });
  }

  if (pathname === "/api/support/me") {
    return sendWebJson(res, 200, buildWebUserPayload(auth));
  }

  if (pathname === "/api/support/inbox" && req.method === "GET") {
    if (!auth || !isSupportStaffAccess(auth)) {
      return sendWebJson(res, 403, { error: "Staff access is required." });
    }

    return sendWebJson(res, 200, buildSupportInboxPayload(auth));
  }

  if (pathname === "/api/support/tickets" && req.method === "GET") {
    if (!auth) {
      return sendWebJson(res, 401, { error: "Login required." });
    }

    return sendWebJson(res, 200, {
      tickets: listSupportTickets(auth)
    });
  }

  if (pathname === "/api/support/tickets" && req.method === "POST") {
    if (!auth) {
      return sendWebJson(res, 401, { error: "Login required." });
    }

    const body = await readWebJsonBody(req);
    const creator = {
      id: auth.user?.id || "unknown",
      tag: auth.user?.tag || auth.user?.username || auth.user?.globalName || auth.user?.id || "Unknown"
    };
    const ticket = createSupportTicket({
      creator,
      category: body.category,
      subject: body.subject,
      message: body.message,
      anonymous: body.anonymous,
      visibleToStaff: true
    });

    await notifySupportChannel(
      makeEmbed({
        title: `Support ticket #${ticket.id}`,
        description: ticket.anonymous
          ? "A new anonymous ticket was created."
          : `${creator.tag} opened a new ticket.`,
        color: COLORS.blue,
        fields: [
          { name: "Category", value: ticket.category, inline: true },
          { name: "Subject", value: ticket.subject, inline: true },
          { name: "Messages", value: `${ticket.messages.length}`, inline: true }
        ]
      })
    );

    recordAuditLog(creator.tag, "support-ticket-created", {
      ticketId: ticket.id,
      category: ticket.category,
      anonymous: ticket.anonymous
    });

    return sendWebJson(res, 200, {
      ok: true,
      ticket: serializeSupportTicket(ticket, auth)
    });
  }

  if (pathname.startsWith("/api/support/tickets/")) {
    if (!auth) {
      return sendWebJson(res, 401, { error: "Login required." });
    }

    const parts = pathname.split("/").filter(Boolean);
    const ticketId = parts[3];
    const action = parts[4] || "";
    const ticket = getSupportTicket(ticketId);
    if (!ticket) {
      return sendWebJson(res, 404, { error: "That ticket was not found." });
    }

    if (!canViewSupportTicket(auth, ticket)) {
      return sendWebJson(res, 403, { error: "You are not allowed to view that ticket." });
    }

    if (req.method === "GET" && !action) {
      return sendWebJson(res, 200, {
        ok: true,
        ticket: serializeSupportTicket(ticket, auth)
      });
    }

    if (req.method === "GET" && action === "transcript") {
      if (!canExportSupportTranscript(auth, ticket)) {
        return sendWebJson(res, 403, { error: "You are not allowed to export that transcript." });
      }

      const requestUrl = new URL(req.url, getWebBaseUrl(req));
      const format = String(requestUrl.searchParams.get("format") || "txt").trim().toLowerCase();
      const transcriptJson = {
        ok: true,
        ticket: serializeSupportTicket(ticket, auth)
      };
      const transcriptText = formatSupportTranscript(ticket, auth);
      const downloadName = `support-ticket-${ticket.id}-transcript.${format === "json" ? "json" : "txt"}`;

      if (format === "json") {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${downloadName}"`,
          "Cache-Control": "no-store"
        });
        res.end(`${JSON.stringify(transcriptJson, null, 2)}\n`);
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${downloadName}"`,
        "Cache-Control": "no-store"
      });
      res.end(transcriptText);
      return;
    }

    if (req.method === "POST" && action === "reply") {
      if (!canReplyToSupportTicket(auth, ticket)) {
        return sendWebJson(res, 403, { error: "You are not allowed to reply to that ticket." });
      }

      const body = await readWebJsonBody(req);
      const content = normalizeSupportText(body.content, 4000);
      if (!content) {
        return sendWebJson(res, 400, { error: "Write a message before replying." });
      }

      const message = appendSupportTicketMessage(ticket, {
        authorType: isSupportStaffAccess(auth) ? "staff" : "user",
        authorId: auth.user?.id || "unknown",
        authorTag: auth.user?.tag || auth.user?.username || auth.user?.id || "Unknown",
        content,
        anonymous: Boolean(ticket.anonymous && !isSupportStaffAccess(auth))
      });

      await notifySupportChannel(
        makeEmbed({
          title: `Support ticket #${ticket.id} reply`,
          description: ticket.anonymous && !isSupportStaffAccess(auth)
            ? "An anonymous member replied."
            : `${auth.user?.tag || auth.user?.username || auth.user?.id || "A user"} replied.`,
          color: COLORS.mint,
          fields: [
            { name: "Subject", value: ticket.subject, inline: true },
            { name: "Status", value: ticket.status, inline: true },
            { name: "Message", value: content.slice(0, 900), inline: false }
          ]
        })
      );

      recordAuditLog(auth.user?.tag || auth.user?.username || "Support", "support-ticket-replied", {
        ticketId: ticket.id,
        anonymous: ticket.anonymous,
        authorType: isSupportStaffAccess(auth) ? "staff" : "user"
      });

      return sendWebJson(res, 200, {
        ok: true,
        message,
        ticket: serializeSupportTicket(ticket, auth)
      });
    }

    if (req.method === "POST" && (action === "close" || action === "reopen")) {
      if (!canReplyToSupportTicket(auth, ticket)) {
        return sendWebJson(res, 403, { error: "You are not allowed to update that ticket." });
      }

      ticket.status = action === "close" ? "closed" : "open";
      updateSupportTicket(ticket);
      recordAuditLog(auth.user?.tag || auth.user?.username || "Support", action === "close" ? "support-ticket-closed" : "support-ticket-reopened", {
        ticketId: ticket.id,
        anonymous: ticket.anonymous
      });

      return sendWebJson(res, 200, {
        ok: true,
        ticket: serializeSupportTicket(ticket, auth)
      });
    }

    return sendWebJson(res, 405, { error: "Method not allowed." });
  }

  if (!auth) {
    return sendWebJson(res, 401, {
      error: DISCORD_CLIENT_SECRET
        ? "Login with Discord to continue."
        : "Discord OAuth is not configured. Use the admin token fallback or set DISCORD_CLIENT_SECRET."
    });
  }

  if (req.method === "GET" && pathname === "/api/dashboard") {
    return sendWebJson(res, 200, await buildWebDashboardPayload());
  }

  if (req.method === "GET" && pathname === "/api/config") {
    return sendWebJson(res, 200, buildWebConfigPayload());
  }

  if (req.method === "GET" && pathname === "/api/general-chat-rule") {
    if (!hasWebAccess(auth, "mod")) {
      return sendWebJson(res, 403, { error: "Moderator web access is required." });
    }

    return sendWebJson(res, 200, {
      rule: await buildGeneralChatRuleStatus(null, 10)
    });
  }

  if (req.method === "GET" && pathname === "/api/web-accounts") {
    if (!hasWebAccess(auth, "admin")) {
      return sendWebJson(res, 403, { error: "Admin web access is required." });
    }

    return sendWebJson(res, 200, { accounts: serializeWebAccounts() });
  }

  if (req.method === "GET" && pathname === "/api/ops") {
    return sendWebJson(res, 200, buildWebOpsPayload(hasWebAccess(auth, "admin")));
  }

  if (req.method === "GET" && pathname === "/api/cases") {
    const cases = [...(config.cases || [])].reverse().slice(0, 200);
    return sendWebJson(res, 200, { cases });
  }

  if (req.method === "GET" && pathname === "/api/warnings") {
    return sendWebJson(res, 200, { warnings: config.warnings || {} });
  }

  if (req.method === "GET" && pathname === "/api/notes") {
    return sendWebJson(res, 200, { notes: config.notes || {} });
  }

  if (req.method === "POST" && pathname === "/api/member-record") {
    if (!hasWebAccess(auth, "mod")) {
      return sendWebJson(res, 403, { error: "Moderator web access is required." });
    }

    const body = await readWebJsonBody(req);
    const userId = String(body.userId || "").trim().replace(/[<@!>]/g, "");
    const kind = String(body.kind || "").trim().toLowerCase();
    const index = Number(body.index);
    const mode = String(body.mode || "update").trim().toLowerCase();

    if (!/^\d{15,25}$/.test(userId)) {
      return sendWebJson(res, 400, { error: "A valid user ID is required." });
    }

    if (!["warning", "note"].includes(kind)) {
      return sendWebJson(res, 400, { error: "Choose warning or note." });
    }

    const records = kind === "warning" ? getWarnings(userId) : getNotes(userId);
    if (!Number.isInteger(index) || index < 0 || index >= records.length) {
      if (mode !== "restore") {
        return sendWebJson(res, 400, { error: "That record could not be found." });
      }
    }

    if (mode === "delete") {
      const removed = records.splice(index, 1)[0] || null;
      if (!removed) {
        return sendWebJson(res, 400, { error: "That record could not be found." });
      }
      body.deletedRecord = removed;
      body.deletedIndex = index;
    } else if (kind === "warning") {
      if (mode === "restore") {
        const restored = body.record && typeof body.record === "object" ? { ...body.record } : null;
        if (!restored) {
          return sendWebJson(res, 400, { error: "A record snapshot is required to restore it." });
        }
        records.splice(Math.max(0, Math.min(index, records.length)), 0, restored);
      } else {
        records[index].reason = String(body.reason || "").trim().slice(0, 1000);
        records[index].editedBy = getWebModeratorTag(auth);
        records[index].editedAt = new Date().toISOString();
      }
    } else {
      if (mode === "restore") {
        const restored = body.record && typeof body.record === "object" ? { ...body.record } : null;
        if (!restored) {
          return sendWebJson(res, 400, { error: "A record snapshot is required to restore it." });
        }
        records.splice(Math.max(0, Math.min(index, records.length)), 0, restored);
      } else {
        records[index].content = String(body.content || "").trim().slice(0, 1000);
        records[index].editedBy = getWebModeratorTag(auth);
        records[index].editedAt = new Date().toISOString();
      }
    }

    if (kind === "warning") {
      config.warnings[userId] = records;
    } else {
      config.notes[userId] = records;
    }
    saveConfig();
    recordAuditLog(getWebModeratorTag(auth), `member-${kind}-${mode === "delete" ? "deleted" : mode === "restore" ? "restored" : "updated"}`, {
      userId,
      index
    });

    const { member, user } = await resolveWebMember(userId);
    return sendWebJson(res, 200, {
      ok: true,
      member: serializeWebMember(member, user),
      deletedRecord: body.deletedRecord || null,
      deletedIndex: body.deletedIndex ?? null
    });
  }

  if (req.method === "POST" && pathname === "/api/general-chat-rule") {
    if (!hasWebAccess(auth, "admin")) {
      return sendWebJson(res, 403, { error: "Admin web access is required." });
    }

    const body = await readWebJsonBody(req);
    const action = String(body.action || "").trim().toLowerCase();

    if (action === "toggle") {
      config.settings.generalChatInactivityEnabled = !isGeneralChatInactivityEnabled();
      saveConfig();
      recordAuditLog(getWebModeratorTag(auth), config.settings.generalChatInactivityEnabled
        ? "general-chat-inactivity-enabled"
        : "general-chat-inactivity-disabled", {
        generalChatChannelId: getGeneralChatChannelId(),
        enabled: config.settings.generalChatInactivityEnabled
      });
      return sendWebJson(res, 200, {
        ok: true,
        rule: await buildGeneralChatRuleStatus(null, 10)
      });
    }

    if (action === "run-now") {
      const result = await enforceGeneralChatActivity(null, { force: true });
      const rule = await buildGeneralChatRuleStatus(null, 10);
      rule.lastRun = {
        ...result,
        ranAt: new Date().toISOString(),
        forced: true
      };
      recordAuditLog(getWebModeratorTag(auth), "general-chat-inactivity-ran", {
        ...result,
        generalChatChannelId: getGeneralChatChannelId(),
        forced: true
      });
      return sendWebJson(res, 200, {
        ok: true,
        result,
        rule
      });
    }

    return sendWebJson(res, 400, { error: "Choose a valid general chat action." });
  }

  if (req.method === "POST" && pathname === "/api/affirmations-panel") {
    if (!hasWebAccess(auth, "admin")) {
      return sendWebJson(res, 403, { error: "Admin web access is required." });
    }

    const result = await postAnonymousAffirmationsPanel("web");
    return sendWebJson(res, 200, {
      ok: true,
      channelId: result.channelId,
      messageId: result.id
    });
  }

  if (req.method === "POST" && pathname === "/api/birthday-panel") {
    if (!hasWebAccess(auth, "admin")) {
      return sendWebJson(res, 403, { error: "Admin web access is required." });
    }

    const result = await postBirthdayPanel("web");
    return sendWebJson(res, 200, {
      ok: true,
      channelId: result.channelId,
      messageId: result.id
    });
  }

  if (req.method === "POST" && pathname === "/api/web-accounts") {
    if (!hasWebAccess(auth, "admin")) {
      return sendWebJson(res, 403, { error: "Admin web access is required." });
    }

    const body = await readWebJsonBody(req);
    const action = String(body.action || "upsert").trim().toLowerCase();

    if (action === "delete") {
      const deleted = deleteWebAccount(body.username);
      if (!deleted) {
        return sendWebJson(res, 404, { error: "That web account was not found." });
      }

      recordAuditLog(getWebModeratorTag(auth), "web-account-deleted", {
        username: String(body.username || "").trim()
      });
      return sendWebJson(res, 200, { ok: true, accounts: serializeWebAccounts() });
    }

    if (action === "toggle-enabled") {
      const account = toggleWebAccountEnabled(body.username, body.enabled);
      if (!account) {
        return sendWebJson(res, 404, { error: "That web account was not found." });
      }

      recordAuditLog(getWebModeratorTag(auth), account.enabled ? "web-account-enabled" : "web-account-disabled", {
        username: account.username
      });
      return sendWebJson(res, 200, { ok: true, account: serializeWebAccount(account), accounts: serializeWebAccounts() });
    }

    if (action === "reset-password") {
      const result = resetWebAccountPassword(body.username, body.password);
      if (!result?.account) {
        return sendWebJson(res, 404, { error: "That web account was not found." });
      }

      recordAuditLog(getWebModeratorTag(auth), "web-account-password-reset", {
        username: result.account.username
      });
      return sendWebJson(res, 200, {
        ok: true,
        account: serializeWebAccount(result.account),
        generatedPassword: String(body.password || "").trim() ? null : result.password,
        accounts: serializeWebAccounts()
      });
    }

    const account = upsertWebAccount({
      username: body.username,
      password: body.password,
      passwordConfirm: body.passwordConfirm,
      accessLevel: body.accessLevel,
      discordUserId: body.discordUserId,
      enabled: body.enabled !== false
    });

    recordAuditLog(getWebModeratorTag(auth), "web-account-upserted", {
      username: account.username,
      accessLevel: account.accessLevel,
      linkedDiscord: Boolean(account.discordUserId)
    });

    return sendWebJson(res, 200, { ok: true, account: serializeWebAccount(account), accounts: serializeWebAccounts() });
  }

  if (req.method === "GET" && pathname === "/api/member") {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const { member, user } = await resolveWebMember(requestUrl.searchParams.get("query"));
    return sendWebJson(res, 200, { member: serializeWebMember(member, user) });
  }

  if (req.method === "GET" && pathname === "/api/member-chat-logs") {
    if (!hasWebAccess(auth, "mod")) {
      return sendWebJson(res, 403, { error: "Moderator web access is required." });
    }

    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const { guild, member, user } = await resolveWebMember(requestUrl.searchParams.get("query"));
    const chatLogs = await getRecentMessagesForUserAcrossGuild(guild, user.id, 40).catch(() => []);
    return sendWebJson(res, 200, {
      member: serializeWebMember(member, user),
      chatLogs,
      archive: {
        enabled: isMessageArchiveEnabled(),
        retentionDays: getMessageArchiveRetentionDays()
      }
    });
  }

  if (req.method === "GET" && pathname === "/api/member-ai-summary") {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const result = await buildWebMemberAiSummary(auth, requestUrl.searchParams.get("query"));
    return sendWebJson(res, 200, result);
  }

  if (req.method === "POST" && pathname === "/api/member-action") {
    const body = await readWebJsonBody(req);
    const result = await handleWebMemberAction(auth, body);
    const { member, user } = await resolveWebMember(body.userId);
    return sendWebJson(res, 200, {
      ok: true,
      ...result,
      member: serializeWebMember(member, user)
    });
  }

  if (req.method === "POST" && pathname === "/api/ai-review-action") {
    const body = await readWebJsonBody(req);
    const result = await handleWebAiReviewAction(auth, body);
    return sendWebJson(res, 200, { ok: true, ...result, aiReviews: config.aiReviews || {} });
  }

    if (req.method === "POST" && pathname === "/api/settings") {
      if (!hasWebAccess(auth, "admin")) {
        return sendWebJson(res, 403, { error: "Admin web access is required." });
      }
      const body = await readWebJsonBody(req);
      return sendWebJson(res, 200, { settings: updateWebSettings(auth, body) });
    }

    if (req.method === "POST" && pathname === "/api/tiktok-verify-setup") {
      if (!hasWebAccess(auth, "admin")) {
        return sendWebJson(res, 403, { error: "Admin web access is required." });
      }
      const body = await readWebJsonBody(req);
      const settings = updateWebSettings(auth, body);
      const posted = await postTikTokVerifyPanel("web");
      recordAuditLog(getWebModeratorTag(auth), "tiktok-verify-posted", {
        channelId: posted.channelId,
        messageId: posted.messageId,
        tiktokHandle: config.settings.tiktokHandle,
        verifiedRoleId: config.settings.verifiedRoleId,
        unverifiedRoleId: config.settings.unverifiedRoleId,
        aliases: config.settings.tiktokNicknameAliases
      });
      return sendWebJson(res, 200, { ok: true, settings, posted });
    }

    if (req.method === "POST" && pathname === "/api/verification-panel") {
      if (!hasWebAccess(auth, "admin")) {
        return sendWebJson(res, 403, { error: "Admin web access is required." });
      }
      await readWebJsonBody(req).catch(() => null);
      const posted = await postRuleVerifyPanel("web");
      recordAuditLog(getWebModeratorTag(auth), "verification-panel-repaired", {
        channelId: posted.channelId,
        messageId: posted.messageId,
        verifiedRoleId: config.settings.verifiedRoleId,
        unverifiedRoleId: config.settings.unverifiedRoleId
      });
      return sendWebJson(res, 200, { ok: true, posted });
    }

    if (req.method === "POST" && pathname === "/api/rules-panel") {
      if (!hasWebAccess(auth, "admin")) {
        return sendWebJson(res, 403, { error: "Admin web access is required." });
      }
      await readWebJsonBody(req).catch(() => null);
      const posted = await postRulesMessage("web");
      recordAuditLog(getWebModeratorTag(auth), "rules-panel-posted", {
        channelId: posted.channelId,
        messageId: posted.messageId
      });
      return sendWebJson(res, 200, { ok: true, posted });
    }

    if (req.method === "POST" && pathname === "/api/onboarding-repair") {
      if (!hasWebAccess(auth, "admin")) {
        return sendWebJson(res, 403, { error: "Admin web access is required." });
      }
      await readWebJsonBody(req).catch(() => null);
      const posted = await postOnboardingRepair("web");
      return sendWebJson(res, 200, { ok: true, posted });
    }

    if (req.method === "POST" && pathname === "/api/reaction-role-panel") {
      if (!hasWebAccess(auth, "admin")) {
        return sendWebJson(res, 403, { error: "Admin web access is required." });
      }
      await readWebJsonBody(req).catch(() => null);
      const posted = await postTikTokVerifyPanel("web");
      recordAuditLog(getWebModeratorTag(auth), "bonus-panel-posted", {
        channelId: posted.channelId,
        messageId: posted.messageId,
        tiktokHandle: config.settings.tiktokHandle,
        verifiedRoleId: config.settings.verifiedRoleId,
        unverifiedRoleId: config.settings.unverifiedRoleId,
        aliases: config.settings.tiktokNicknameAliases
      });
      return sendWebJson(res, 200, { ok: true, posted });
    }

    if (req.method === "POST" && pathname === "/api/verified-visibility") {
      if (!hasWebAccess(auth, "admin")) {
        return sendWebJson(res, 403, { error: "Admin web access is required." });
      }

      const body = await readWebJsonBody(req);
      const scope = String(body.scope || "current").toLowerCase();
      const locked = Boolean(body.locked);
      const verifyChannelId = getVerifyChannelId();
      const verifyChannel = verifyChannelId ? await client.channels.fetch(verifyChannelId).catch(() => null) : null;
      const referenceChannel = verifyChannel?.type === ChannelType.GuildCategory ? verifyChannel : verifyChannel?.parent || verifyChannel;
      const guild = await client.guilds.fetch(GUILD_ID).catch(() => client.guilds.cache.get(GUILD_ID) || null);
      if (!guild) {
        return sendWebJson(res, 500, { error: "The Discord guild could not be loaded." });
      }
      const updated = await applyVerifiedVisibilityScope(guild, scope, referenceChannel, locked);

      recordAuditLog(getWebModeratorTag(auth), locked ? "verified-visibility-locked" : "verified-visibility-unlocked", {
        scope,
        updated,
        verifyChannelId
      });

      return sendWebJson(res, 200, {
        ok: true,
        updated,
        scope,
        locked
      });
    }

    if (req.method === "POST" && pathname === "/api/verification-mark-unverified") {
      if (!hasWebAccess(auth, "admin")) {
        return sendWebJson(res, 403, { error: "Admin web access is required." });
      }

      const guild = await client.guilds.fetch(GUILD_ID).catch(() => client.guilds.cache.get(GUILD_ID) || null);
      if (!guild) {
        return sendWebJson(res, 500, { error: "The Discord guild could not be loaded." });
      }

      const result = await markAllMembersUnverified(guild);
      recordAuditLog(getWebModeratorTag(auth), "verification-mark-unverified", result);

      return sendWebJson(res, 200, {
        ok: true,
        ...result
      });
    }

    if (req.method === "POST" && pathname === "/api/permissions") {
      if (!hasWebAccess(auth, "admin")) {
        return sendWebJson(res, 403, { error: "Admin web access is required." });
      }
    const body = await readWebJsonBody(req);
    return sendWebJson(res, 200, { permissions: updateWebPermissions(auth, body) });
  }

  if (req.method === "POST" && pathname === "/api/automod") {
    if (!hasWebAccess(auth, "admin")) {
      return sendWebJson(res, 403, { error: "Admin web access is required." });
    }
    const body = await readWebJsonBody(req);
    return sendWebJson(res, 200, { automod: await updateWebAutomod(auth, body) });
  }

  if (req.method === "POST" && pathname === "/api/google-block-list-sync") {
    if (!hasWebAccess(auth, "admin")) {
      return sendWebJson(res, 403, { error: "Admin web access is required." });
    }

    const result = await syncGoogleBlockList("web", true);
    return sendWebJson(res, 200, { ok: true, result, automod: buildWebConfigPayload().automod });
  }

  if (req.method === "POST" && pathname === "/api/automod-preview") {
    if (!hasWebAccess(auth, "admin")) {
      return sendWebJson(res, 403, { error: "Admin web access is required." });
    }
    const body = await readWebJsonBody(req);
    const preview = await previewAutoMod(body);
    return sendWebJson(res, 200, { preview });
  }

  if (req.method === "POST" && pathname === "/api/automod-override") {
    if (!hasWebAccess(auth, "admin")) {
      return sendWebJson(res, 403, { error: "Admin web access is required." });
    }
    const body = await readWebJsonBody(req);
    const overrides = addChannelRuleOverride(body.channelId, body.ruleKey, body.mode);
    return sendWebJson(res, 200, { ok: true, channelRuleOverrides: overrides });
  }

  if (req.method === "POST" && pathname === "/api/rule-actions") {
    if (!hasWebAccess(auth, "admin")) {
      return sendWebJson(res, 403, { error: "Admin web access is required." });
    }
    const body = await readWebJsonBody(req);
    return sendWebJson(res, 200, updateWebRuleActions(auth, body));
  }

  if (req.method === "POST" && pathname === "/api/ops") {
    if (!hasWebAccess(auth, "admin")) {
      return sendWebJson(res, 403, { error: "Admin web access is required." });
    }
    const body = await readWebJsonBody(req);
    return sendWebJson(res, 200, updateWebOpsConfig(auth, body));
  }

  if (req.method === "POST" && pathname === "/api/appeals") {
    if (!hasWebAccess(auth, "mod")) {
      return sendWebJson(res, 403, { error: "Moderator web access is required." });
    }
    const body = await readWebJsonBody(req);
    const appeal = createWebAppeal(auth, body);
    return sendWebJson(res, 200, { ok: true, appeal, ops: buildWebOpsPayload(hasWebAccess(auth, "admin")) });
  }

  if (req.method === "POST" && pathname === "/api/appeals/status") {
    if (!hasWebAccess(auth, "admin")) {
      return sendWebJson(res, 403, { error: "Admin web access is required." });
    }
    const body = await readWebJsonBody(req);
    const appeal = updateWebAppealStatus(auth, body);
    return sendWebJson(res, 200, { ok: true, appeal, ops: buildWebOpsPayload(hasWebAccess(auth, "admin")) });
  }

  if (req.method === "GET" && pathname === "/api/backup") {
    if (!hasWebAccess(auth, "admin")) {
      return sendWebJson(res, 403, { error: "Admin web access is required." });
    }
    recordAuditLog(getWebModeratorTag(auth), "backup-downloaded", {});
    return sendWebJson(res, 200, { config });
  }

  if (req.method === "POST" && pathname === "/api/backup-restore") {
    if (!hasWebAccess(auth, "admin")) {
      return sendWebJson(res, 403, { error: "Admin web access is required." });
    }
    const body = await readWebJsonBody(req);
    if (!body.config || typeof body.config !== "object") {
      return sendWebJson(res, 400, { error: "A config object is required." });
    }
    config = {
      ...createDefaultConfig(),
      ...body.config
    };
    saveConfig();
    recordAuditLog(getWebModeratorTag(auth), "backup-restored", {});
    return sendWebJson(res, 200, { ok: true, config: buildWebConfigPayload() });
  }

  if (req.method === "POST" && pathname === "/api/reload-config") {
    if (!hasWebAccess(auth, "admin")) {
      return sendWebJson(res, 403, { error: "Admin web access is required." });
    }
    const previousVerifyMessageId = config.verifyMessageId;
    config = loadConfig();
    if (!config.verifyMessageId && previousVerifyMessageId) {
      config.verifyMessageId = previousVerifyMessageId;
    }
    return sendWebJson(res, 200, { ok: true, config: buildWebConfigPayload() });
  }

  if (req.method === "GET" && pathname === "/api/pending-verifications") {
    if (!hasWebAccess(auth, "admin")) {
      return sendWebJson(res, 403, { error: "Admin web access is required." });
    }
    return sendWebJson(res, 200, {
      pendingVerifications: Array.isArray(config.pendingVerifications) ? config.pendingVerifications : []
    });
  }

  if (req.method === "POST" && pathname.startsWith("/api/pending-verifications/")) {
    if (!hasWebAccess(auth, "admin")) {
      return sendWebJson(res, 403, { error: "Admin web access is required." });
    }
    const parts = pathname.split("/").filter(Boolean);
    const pendingId = parts[2];
    const action = parts[3];
    if (!pendingId || !["approve", "deny"].includes(action)) {
      return sendWebJson(res, 400, { error: "Invalid action." });
    }
    if (action === "approve") {
      const result = await approveVerification(pendingId, getWebModeratorTag(auth));
      if (!result.ok) return sendWebJson(res, 404, { error: result.error });
      return sendWebJson(res, 200, {
        ok: true,
        pendingVerifications: Array.isArray(config.pendingVerifications) ? config.pendingVerifications : []
      });
    }
    if (action === "deny") {
      const body = await readWebJsonBody(req);
      const reason = String(body.reason || "").trim().slice(0, 500);
      const result = await denyVerification(pendingId, reason, getWebModeratorTag(auth));
      if (!result.ok) return sendWebJson(res, 404, { error: result.error });
      return sendWebJson(res, 200, {
        ok: true,
        pendingVerifications: Array.isArray(config.pendingVerifications) ? config.pendingVerifications : []
      });
    }
  }

  return sendWebJson(res, 404, { error: "Unknown API route." });
}

function startWebServer() {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = requestUrl.pathname;

    if (pathname === "/healthz") {
      sendWebJson(res, 200, {
        ok: true,
        status: "healthy",
        port: WEB_PORT
      });
      return;
    }

    if (pathname === "/auth/login") {
      handleWebLogin(req, res);
      return;
    }

    if (pathname === "/support/login") {
      redirectWeb(res, "/auth/login?purpose=support");
      return;
    }

    if (pathname === "/auth/local/login") {
      handleWebLocalLogin(req, res).catch(error => {
        sendWebJson(res, 400, { error: error.message || "Local login failed." });
      });
      return;
    }

    if (pathname === "/auth/callback") {
      handleWebCallback(req, res, requestUrl).catch(error => {
        sendWebText(res, 400, error.message || "Discord OAuth login failed.");
      });
      return;
    }

    if (pathname === "/support/callback") {
      handleWebSupportCallback(req, res, requestUrl).catch(error => {
        sendWebText(res, 400, error.message || "Discord OAuth login failed.");
      });
      return;
    }

    if (pathname === "/auth/logout") {
      handleWebLogout(req, res);
      return;
    }

    if (pathname === "/support/logout") {
      handleWebSupportLogout(req, res);
      return;
    }

    if (pathname === MOCHI_PATH) {
      res.writeHead(302, {
        Location: `${MOCHI_PATH}/${requestUrl.search || ""}`
      });
      res.end();
      return;
    }

    if (pathname.startsWith("/api/")) {
      handleWebApi(req, res, pathname).catch(error => {
        sendWebJson(res, 400, { error: error.message || "Dashboard request failed." });
      });
      return;
    }

    serveWebStatic(req, res, pathname);
  });

  server.listen(WEB_PORT, () => {
    if (!DISCORD_CLIENT_SECRET) {
      log.warn("Discord OAuth is not configured. Set DISCORD_CLIENT_SECRET to enable Discord login.");
    }
    if (!SESSION_SECRET) {
      log.warn("Web sessions are not configured. Set SESSION_SECRET or WEB_ADMIN_TOKEN.");
    }
    if (!WEB_ADMIN_TOKEN) {
      log.warn("Admin token fallback is disabled. Set WEB_ADMIN_TOKEN if you want backup token access.");
    }
    log.info(`Web moderation panel available on port ${WEB_PORT}.`);
  });

  server.on("error", error => {
    log.error("Web moderation panel error.", error);
  });

  webServer = server;
}

async function shutdownProcess(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  log.info(`Received ${signal}; shutting down cleanly.`);

  if (webServer) {
    await new Promise(resolve => {
      webServer.close(() => resolve());
    }).catch(() => {});
  }

  if (client && !client.destroyed) {
    client.destroy();
  }

  if (generalChatSweepInterval) {
    clearInterval(generalChatSweepInterval);
  }

  if (birthdaySweepInterval) {
    clearInterval(birthdaySweepInterval);
  }

  process.exit(0);
}

client.once("clientReady", async () => {
  try {
    log.info(`Logged in as ${client.user.tag}`);
    log.info(`Feature flags -> core: ${ENABLE_CORE_BOT ? "on" : "off"}`);
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands
    });

    log.info("Slash commands registered.");

    if (ENABLE_CORE_BOT) {
      await resolveVerifyMessageId();
      await enforceFlavorRoleVisibility(client.guilds.cache.get(GUILD_ID)).catch(() => null);
      await processExpiredTempBans();
      await processBirthdaySweep("startup").catch(error => {
        log.error("Birthday startup sweep error.", error);
      });
      await enforceGeneralChatActivity().catch(error => {
        log.error("General chat startup sweep error.", error);
      });
      await syncGoogleBlockList("startup").catch(error => {
        log.error("Google block list startup sync error.", error);
      });

      if (tempBanInterval) {
        clearInterval(tempBanInterval);
      }
      tempBanInterval = setInterval(() => {
        processExpiredTempBans().catch(error => {
          log.error("Temp ban processing error.", error);
        });
      }, 60 * 1000);
      if (birthdaySweepInterval) {
        clearInterval(birthdaySweepInterval);
      }
      birthdaySweepInterval = setInterval(() => {
        processBirthdaySweep("interval").catch(error => {
          log.error("Birthday processing error.", error);
        });
      }, 60 * 60 * 1000);
      startScheduledReports();
      startGoogleBlockListSync();
      startGeneralChatSweep();
    }
  } catch (error) {
    log.error("Ready error.", error);
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

    const emojiKey = reaction.emoji?.name || reaction.emoji?.id;
    const roleData = MOCHI_ROLES[emojiKey];
    if (!roleData?.id) return;

    const member = await reaction.message.guild.members.fetch(user.id);
    await member.roles.add(roleData.id, `Reaction role selected: ${roleData.name}`).catch(error => {
      throw new Error(`Failed to add role ${roleData.name}: ${error.message}`);
    });

    for (const roleId of ALL_ROLES) {
      if (roleId === roleData.id) continue;
      await member.roles.remove(roleId, `Reaction role cleanup: ${roleData.name}`).catch(() => {});
    }

    await logEmbed(
      makeEmbed({
        title: "Role selected",
        description: `${user.tag} received ${roleData.name}.`,
        color: COLORS.mint
      })
    );
  } catch (error) {
    log.error("Reaction add error.", error);
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

    const emojiKey = reaction.emoji?.name || reaction.emoji?.id;
    const roleData = MOCHI_ROLES[emojiKey];
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
    log.error("Reaction remove error.", error);
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
    log.error("Channel create mute overwrite error.", error);
  }
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId.startsWith("mochi:launch:")) {
        const sessionId = interaction.customId.split(":")[2];
        const session = getMochiSession(sessionId);
        if (!session) {
          return interaction.reply({
            content: "That Mochi Bird session expired. Run `/mochi` again to get a fresh launch.",
            ephemeral: true
          });
        }

        const launched = await launchMochiActivity(interaction);
        if (launched) {
          return;
        }

        const playUrl = buildMochiPlayUrl(session.id);
        return interaction.reply({
          content: `Discord could not launch the Activity, so here is the browser fallback: ${playUrl}`,
          ephemeral: true
        });
      }

      if (interaction.customId === "birthday:set") {
        if (!ENABLE_CORE_BOT) {
          return interaction.reply({ content: "Birthday signup is disabled on this deployment.", ephemeral: true });
        }

        return interaction.showModal(buildBirthdayModal());
      }

      if (interaction.customId === "verify:rules-check") {
        if (!ENABLE_CORE_BOT) {
          return interaction.reply({ content: "Verification is disabled on this deployment.", ephemeral: true });
        }

        const lastClicked = verificationButtonCooldowns.get(interaction.user.id) || 0;
        const cooldownMs = 10 * 1000;
        const elapsed = Date.now() - lastClicked;
        if (elapsed < cooldownMs) {
          const remainingSeconds = Math.ceil((cooldownMs - elapsed) / 1000);
          return interaction.reply({
            content: `Please wait ${remainingSeconds}s before using the verify button again.`,
            ephemeral: true
          });
        }
        verificationButtonCooldowns.set(interaction.user.id, Date.now());
        const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member) {
          return interaction.reply({
            embeds: [
              makeEmbed({
                title: "Try again",
                description: "I could not find your server membership.",
                color: COLORS.red
              })
            ],
            ephemeral: true
          });
        }

        const captchaDecision = shouldRequireVerificationCaptcha(member);
        if (captchaDecision.required) {
          const code = createVerificationCaptchaChallenge();
          setVerificationCaptchaChallenge(interaction.user.id, code);
          return interaction.showModal(buildVerificationCaptchaModal(code));
        }

        await interaction.deferReply({ ephemeral: true });
        const result = await completeRulesVerification(member);
        return interaction.editReply({ embeds: [result.embed] });
      }

      if (interaction.customId === "verify:tiktok-check") {
        if (!ENABLE_CORE_BOT) {
          return interaction.reply({ content: "Verification is disabled on this deployment.", ephemeral: true });
        }

        const lastClicked = verificationButtonCooldowns.get(interaction.user.id) || 0;
        const cooldownMs = 10 * 1000;
        const elapsed = Date.now() - lastClicked;
        if (elapsed < cooldownMs) {
          const remainingSeconds = Math.ceil((cooldownMs - elapsed) / 1000);
          return interaction.reply({
            content: `Please wait ${remainingSeconds}s before using the bonus verify button again.`,
            ephemeral: true
          });
        }
        verificationButtonCooldowns.set(interaction.user.id, Date.now());

        if (!isTikTokVerificationEnabled()) {
          const setupError = "TikTok verification is not configured yet. Ask staff to set the handle and roles.";
          const setupEmbed = makeEmbed({
            title: "Try again",
            description: setupError,
            color: COLORS.red,
            image: { url: "attachment://tiktok-error-card.png" }
          });
          return interaction.reply({
            embeds: [setupEmbed],
            files: [buildTikTokErrorCardAttachment(setupError, "username", "permission")],
            ephemeral: true
          });
        }

        return interaction.showModal(buildTikTokNameModal());
      }

      if (interaction.customId === "affirmations:open") {
        if (!ENABLE_CORE_BOT) {
          return interaction.reply({ content: "Anonymous affirmations are disabled on this deployment.", ephemeral: true });
        }

        if (!isAnonymousAffirmationsEnabled()) {
          return interaction.reply({ content: "Anonymous affirmations are currently disabled by staff.", ephemeral: true });
        }

        if (!getAnonymousAffirmationsChannelId()) {
          return interaction.reply({ content: "Set an affirmations channel first.", ephemeral: true });
        }

        return interaction.showModal(buildAnonymousAffirmationModal());
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
        ["reload-config", "setupverify", "setuptiktokverify", "repaironboarding", "setuprules", "settings-view", "reset-mod-roles", "reset-admin-roles", "lockverified-current", "lockverified-all", "unlockverified-current", "unlockverified-all"].includes(action)
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

        if (action === "apply-ai-preset") {
          const preset = applyAiModerationPreset(pending.presetName);
          if (!preset) {
            clearPendingPanelAction(interaction.user.id);
            return interaction.update({
              content: "That AI preset expired or is no longer available.",
              embeds: [],
              components: []
            });
          }

          clearPendingPanelAction(interaction.user.id);
          return interaction.update({
            content: `Applied the ${pending.presetName} AI preset and saved it.`,
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
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("bannedWordsContextSensitivity")
                  .setLabel("Banned word context sensitivity 0-100")
                  .setPlaceholder(`${getBannedWordsContextSensitivity()}`)
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setValue(`${getBannedWordsContextSensitivity()}`)
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

        if (action === "ai-settings") {
          const modal = new ModalBuilder()
            .setCustomId(buildAdminPanelCustomId("configsubmit", "ai-settings", targetUserId))
            .setTitle("Set AI Moderation")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("enabled")
                  .setLabel("Enable AI moderation: on/off")
                  .setPlaceholder(config.automod.aiModerationEnabled ? "on" : "off")
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setValue(config.automod.aiModerationEnabled ? "on" : "off")
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("model")
                  .setLabel("Moderation model")
                  .setPlaceholder("omni-moderation-latest")
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setValue(String(config.automod.aiModerationModel || "omni-moderation-latest").slice(0, 100))
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("threshold")
                  .setLabel("Moderation threshold 1-100")
                  .setPlaceholder(`${config.automod.aiModerationThreshold}`)
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setValue(`${config.automod.aiModerationThreshold}`)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("minLength")
                  .setLabel("Minimum message length")
                  .setPlaceholder(`${config.automod.aiMinMessageLength}`)
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setValue(`${config.automod.aiMinMessageLength}`)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("contextCount")
                  .setLabel("Recent context messages")
                  .setPlaceholder(`${config.automod.aiContextMessageCount}`)
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setValue(`${config.automod.aiContextMessageCount}`)
              )
            );
          return interaction.showModal(modal);
        }

        if (action === "ai-tuning") {
          const modal = new ModalBuilder()
            .setCustomId(buildAdminPanelCustomId("configsubmit", "ai-tuning", targetUserId))
            .setTitle("Set AI Tuning")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("suppress")
                  .setLabel("Suppress low-confidence reviews: on/off")
                  .setPlaceholder(config.automod.aiModerationSuppressLowConfidenceReviews ? "on" : "off")
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setValue(config.automod.aiModerationSuppressLowConfidenceReviews ? "on" : "off")
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("categoryThresholds")
                  .setLabel("Category thresholds JSON")
                  .setPlaceholder('{"sexual": 90, "hate": 85}')
                  .setStyle(TextInputStyle.Paragraph)
                  .setRequired(false)
                  .setValue(JSON.stringify(config.automod.aiModerationCategoryThresholds || {}, null, 2).slice(0, 4000))
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
        if (action === "ai-preset-lenient" || action === "ai-preset-balanced" || action === "ai-preset-strict") {
          const presetName = action.replace("ai-preset-", "");
          const previewEmbed = buildAiModerationPresetPreview(presetName, targetUserId);
          if (!previewEmbed) {
            return interaction.reply({ content: "Unknown AI preset.", ephemeral: true });
          }

          setPendingPanelAction(interaction.user.id, {
            action: "apply-ai-preset",
            presetName,
            targetUserId
          });

          return interaction.reply({
            embeds: [previewEmbed],
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(buildAdminPanelCustomId("confirm", "apply-ai-preset", targetUserId)).setLabel("Apply preset").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(buildAdminPanelCustomId("confirm", "cancel", targetUserId)).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
              )
            ],
            ephemeral: true
          });
        }

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
          return interaction.reply({ embeds: [await buildDashboardEmbed()], ephemeral: true });
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

        if (action === "lockverified-current" || action === "lockverified-all") {
          const updated = await applyVerifiedVisibilityScope(
            interaction.guild,
            action === "lockverified-all" ? "all" : "current",
            interaction.channel,
            true
          );
          return interaction.reply({
            content: `Locked verified visibility on ${updated} channel${updated === 1 ? "" : "s"}.`,
            ephemeral: true
          });
        }

        if (action === "unlockverified-current" || action === "unlockverified-all") {
          const updated = await applyVerifiedVisibilityScope(
            interaction.guild,
            action === "unlockverified-all" ? "all" : "current",
            interaction.channel,
            false
          );
          return interaction.reply({
            content: `Removed verified visibility locks from ${updated} channel${updated === 1 ? "" : "s"}.`,
            ephemeral: true
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
          try {
            await postRuleVerifyPanel("adminpanel");
            return interaction.reply({ content: "Verification panel posted.", ephemeral: true });
          } catch (error) {
            return interaction.reply({ content: error.message || "Verification panel could not be posted.", ephemeral: true });
          }
        }

        if (action === "repaironboarding") {
          try {
            await postOnboardingRepair("adminpanel");
            return interaction.reply({ content: "Onboarding repaired.", ephemeral: true });
          } catch (error) {
            return interaction.reply({ content: error.message || "Onboarding could not be repaired.", ephemeral: true });
          }
        }

        if (action === "setuptiktokverify") {
          try {
            await postTikTokVerifyPanel("adminpanel");
            return interaction.reply({ content: "Role panel reposted.", ephemeral: true });
          } catch (error) {
            return interaction.reply({ content: error.message || "Role panel could not be reposted.", ephemeral: true });
          }
        }
        if (action === "setuprules") {
          const rulesChannel = await client.channels.fetch(getRulesChannelId());
          const { attachment, embed } = buildCuteRulesMessage();
          await rulesChannel.send({
            files: [attachment],
            embeds: [embed]
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
      if (interaction.customId === "birthday:set") {
        if (!ENABLE_CORE_BOT) {
          return interaction.reply({ content: "Birthday signup is disabled on this deployment.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        const month = Number(interaction.fields.getTextInputValue("birthdayMonth"));
        const day = Number(interaction.fields.getTextInputValue("birthdayDay"));
        const entry = setBirthdayEntry(interaction.user.id, month, day);

        if (!entry) {
          return interaction.editReply({ content: "Enter a valid birthday month and day like 3 and 14." });
        }

        await processBirthdaySweep("birthday-modal").catch(error => {
          log.error("Birthday modal sweep error.", error);
        });

        return interaction.editReply({
          content: `Yay! I caught your birthday as ${formatBirthdayMonthDay(entry.month, entry.day)}. I’ve got my confetti cannon loaded and I’ll hand you the birthday role when your day pops up.`
        });
      }

      if (interaction.customId === "affirmations:submit") {
        if (!ENABLE_CORE_BOT) {
          return interaction.reply({ content: "Anonymous affirmations are disabled on this deployment.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        const message = interaction.fields.getTextInputValue("affirmation");
        const result = await sendAnonymousAffirmation(interaction.user, message);
        return interaction.editReply({
          content: `Your affirmation was posted anonymously to <#${result.channelId}>.`
        });
      }

      if (interaction.customId === "verify:captcha") {
        if (!ENABLE_CORE_BOT) {
          return interaction.reply({ content: "Verification is disabled on this deployment.", ephemeral: true });
        }

        const challenge = getVerificationCaptchaChallenge(interaction.user.id);
        if (!challenge) {
          return interaction.reply({ content: "That CAPTCHA expired. Click the rules button again to get a fresh one.", ephemeral: true });
        }

        const submitted = normalizeVerificationCaptchaInput(interaction.fields.getTextInputValue("captchaAnswer"));
        if (submitted !== challenge.code) {
          clearVerificationCaptchaChallenge(interaction.user.id);
          return interaction.reply({ content: "That CAPTCHA answer was wrong. Click the rules button again to try a new one.", ephemeral: true });
        }

        clearVerificationCaptchaChallenge(interaction.user.id);
        await interaction.deferReply({ ephemeral: true });

        const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member) {
          return interaction.editReply({
            embeds: [
              makeEmbed({
                title: "Try again",
                description: "I could not find your server membership.",
                color: COLORS.red
              })
            ]
          });
        }

        const result = await completeRulesVerification(member);
        return interaction.editReply({ embeds: [result.embed] });
      }

      if (interaction.customId === "verify:tiktok-name") {
        if (!ENABLE_CORE_BOT) {
          return interaction.reply({ content: "Verification is disabled on this deployment.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member) {
          const errorEmbed = makeEmbed({
            title: "Try again",
            description: "I could not find your server membership.",
            color: COLORS.red,
            image: { url: "attachment://tiktok-error-card.png" }
          });
          return interaction.editReply({
            embeds: [errorEmbed],
            files: [buildTikTokErrorCardAttachment("I could not find your server membership.", "username", "permission")],
            content: ""
          });
        }

        if (!isTikTokVerificationEnabled()) {
          const errorEmbed = makeEmbed({
            title: "Try again",
            description: "TikTok verification is not configured yet. Ask staff to set the handle and roles.",
            color: COLORS.red,
            image: { url: "attachment://tiktok-error-card.png" }
          });
          return interaction.editReply({
            embeds: [errorEmbed],
            files: [buildTikTokErrorCardAttachment("TikTok verification is not configured yet. Ask staff to set the handle and roles.", "username", "permission")],
            content: ""
          });
        }

        const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
        if (!botMember?.permissions?.has(PermissionFlagsBits.ManageNicknames)) {
          const errorEmbed = makeEmbed({
            title: "Try again",
            description: "I need the Manage Nicknames permission before I can update your name.",
            color: COLORS.red,
            image: { url: "attachment://tiktok-error-card.png" }
          });
          return interaction.editReply({
            embeds: [errorEmbed],
            files: [buildTikTokErrorCardAttachment("I need the Manage Nicknames permission before I can update your name.", "username", "permission")],
            content: ""
          });
        }

        const enteredName = splitTikTokVerificationInput(interaction.fields.getTextInputValue("tiktokName"))[0] || "";
        if (!enteredName) {
          const errorEmbed = makeEmbed({
            title: "Try again",
            description: "Please type your TikTok username.",
            color: COLORS.red,
            image: { url: "attachment://tiktok-error-card.png" }
          });
          return interaction.editReply({
            embeds: [errorEmbed],
            files: [buildTikTokErrorCardAttachment("Please type your TikTok username.", "username", "generic")],
            content: ""
          });
        }

        if (enteredName.length > 32) {
          const errorEmbed = makeEmbed({
            title: "Try again",
            description: "That nickname is too long for Discord. Try a shorter TikTok username.",
            color: COLORS.red,
            image: { url: "attachment://tiktok-error-card.png" }
          });
          return interaction.editReply({
            embeds: [errorEmbed],
            files: [buildTikTokErrorCardAttachment("That nickname is too long for Discord. Try a shorter TikTok username.", enteredName, "generic")],
            content: ""
          });
        }

        if (!member.manageable) {
          const errorEmbed = makeEmbed({
            title: "Try again",
            description: "I cannot change your nickname.",
            color: COLORS.red,
            image: { url: "attachment://tiktok-error-card.png" }
          });
          return interaction.editReply({
            embeds: [errorEmbed],
            files: [buildTikTokErrorCardAttachment("I cannot change your nickname.", enteredName, "permission")],
            content: ""
          });
        }

        try {
          await member.setNickname(enteredName, "TikTok name verification");
          const savedAlias = addTikTokNicknameAlias(enteredName);
          const finalNickname = member.displayName || enteredName;
          const result = await syncTikTokVerification(member, "modal");
          const replyEmbed = makeEmbed({
            title: result.matched ? "Nickname updated" : "Name updated",
            description: result.matched
              ? `Your final nickname is @${finalNickname}. Enjoy the garden!${savedAlias ? " I also saved that name to the verified-name list." : ""}`
              : `I set your nickname to @${enteredName}, but it does not match the configured TikTok handle yet.`,
            color: result.matched ? COLORS.mint : COLORS.yellow,
            fields: [
              { name: "🌸 Final nickname", value: `@${finalNickname}`, inline: true },
              { name: "✨ Verification", value: result.matched ? `Verified as @${getTikTokHandle()}` : "Still unverified", inline: true },
              { name: "How it works", value: result.matched ? "You’re all set. Enjoy the garden!" : "Update your TikTok name to match the handle and try again.", inline: false }
            ]
          });

          if (result.matched) {
            replyEmbed.setImage("attachment://tiktok-success-card.png");
            return interaction.editReply({
              embeds: [replyEmbed],
              files: [buildTikTokSuccessCardAttachment(finalNickname)],
              content: ""
            });
          }

          if (!result.matched) {
            replyEmbed.setImage("attachment://tiktok-pending-card.png");
            return interaction.editReply({
              embeds: [replyEmbed],
              files: [buildTikTokPendingCardAttachment(enteredName)],
              content: ""
            });
          }

          return interaction.editReply({ embeds: [replyEmbed], content: "" });
        } catch (error) {
          const reason = error.message || "Verification failed.";
          const errorEmbed = makeEmbed({
            title: "Try again",
            description: reason,
            color: COLORS.red,
            image: { url: "attachment://tiktok-error-card.png" }
          });
          return interaction.editReply({
            embeds: [errorEmbed],
            files: [buildTikTokErrorCardAttachment(reason, enteredName, "generic")],
            content: ""
          });
        }
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
          const contextSensitivity = Number(interaction.fields.getTextInputValue("bannedWordsContextSensitivity"));
          if (!Number.isInteger(contextSensitivity) || contextSensitivity < 0 || contextSensitivity > 100) {
            return interaction.reply({ content: "Banned word context sensitivity must be a whole number from 0 to 100.", ephemeral: true });
          }

          config.automod.bannedWordList = parseCommaSeparatedList(interaction.fields.getTextInputValue("bannedWords"));
          config.automod.nicknameBlockedTerms = parseCommaSeparatedList(interaction.fields.getTextInputValue("nicknameTerms"));
          config.automod.bannedWordsContextSensitivity = contextSensitivity;
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
          const contextSensitivity = Number(interaction.fields.getTextInputValue("bannedWordsContextSensitivity"));
          if (!Number.isInteger(contextSensitivity) || contextSensitivity < 0 || contextSensitivity > 100) {
            return interaction.reply({ content: "Banned word context sensitivity must be a whole number from 0 to 100.", ephemeral: true });
          }

          config.automod.bannedWordList = parseCommaSeparatedList(interaction.fields.getTextInputValue("bannedWords"));
          config.automod.nicknameBlockedTerms = parseCommaSeparatedList(interaction.fields.getTextInputValue("nicknameTerms"));
          config.automod.bannedWordsContextSensitivity = contextSensitivity;
          config.automod.allowedDomains = parseCommaSeparatedList(interaction.fields.getTextInputValue("allowedDomains"), normalizeDomain);
          config.automod.blockedDomains = parseCommaSeparatedList(interaction.fields.getTextInputValue("blockedDomains"), normalizeDomain);
          config.automod.scamPhraseList = parseCommaSeparatedList(interaction.fields.getTextInputValue("scamPhrases"), normalizeComparisonText);
        }

        if (action === "ai-settings") {
          const enabled = parseBooleanInput(interaction.fields.getTextInputValue("enabled"), config.automod.aiModerationEnabled);
          const model = String(interaction.fields.getTextInputValue("model") || "").trim();
          const threshold = Number(interaction.fields.getTextInputValue("threshold"));
          const minLength = Number(interaction.fields.getTextInputValue("minLength"));
          const contextCount = Number(interaction.fields.getTextInputValue("contextCount"));

          if (!model || model.length > 100) {
            return interaction.reply({ content: "AI moderation model must be a non-empty model name up to 100 characters.", ephemeral: true });
          }

          if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) {
            return interaction.reply({ content: "AI moderation threshold must be a whole number from 1 to 100.", ephemeral: true });
          }

          if (!Number.isInteger(minLength) || minLength < 1 || minLength > 500) {
            return interaction.reply({ content: "AI minimum message length must be a whole number from 1 to 500.", ephemeral: true });
          }

          if (!Number.isInteger(contextCount) || contextCount < 0 || contextCount > 10) {
            return interaction.reply({ content: "AI context count must be a whole number from 0 to 10.", ephemeral: true });
          }

          config.automod.aiModerationEnabled = enabled;
          config.automod.aiModerationModel = model;
          config.automod.aiModerationThreshold = threshold;
          config.automod.aiMinMessageLength = minLength;
          config.automod.aiContextMessageCount = contextCount;
          config.automod.aiIncludeRecentContext = contextCount > 0;
        }

        if (action === "ai-tuning") {
          const suppress = parseBooleanInput(interaction.fields.getTextInputValue("suppress"), config.automod.aiModerationSuppressLowConfidenceReviews);
          const categoryThresholds = interaction.fields.getTextInputValue("categoryThresholds");
          config.automod.aiModerationSuppressLowConfidenceReviews = suppress;
          config.automod.aiModerationCategoryThresholds = parseAiModerationCategoryThresholdsInput(categoryThresholds);
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
      "setuptiktokverify",
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

    if (interaction.commandName === "mochi") {
      const session = createMochiSession({
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        channelId: interaction.channelId,
        guildId: interaction.guildId
      });
      const playUrl = buildMochiPlayUrl(session.id);

      return interaction.reply({
        embeds: [
          makeEmbed({
            title: "Mochi Bird",
            description: "Tap the button to launch the Activity inside Discord. If that fails, use the browser fallback.",
            color: COLORS.mint,
            fields: [
              { name: "Player", value: interaction.user.tag, inline: true },
              { name: "Session", value: session.id.slice(0, 8), inline: true }
            ]
          })
        ],
        components: [
          buildMochiLaunchRow(session.id),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel("Browser Fallback")
              .setStyle(ButtonStyle.Link)
              .setURL(playUrl)
          )
        ],
        ephemeral: true
      });
    }

    if (interaction.commandName === "mochi-leaderboard") {
      const leaderboard = getMochiLeaderboard(10);
      const recentRuns = getMochiRecentRuns(5);
      const description = leaderboard.length
        ? leaderboard.map((entry, index) => `${index + 1}. ${entry.userTag} - ${entry.bestScore}`).join("\n")
        : "No scores yet. Be the first to flap.";
      const recentDescription = recentRuns.length
        ? recentRuns.map((entry, index) => `${index + 1}. ${entry.userTag} - ${entry.score}`).join("\n")
        : "No recent runs yet.";

      return interaction.reply({
        embeds: [
          makeEmbed({
            title: "Mochi Bird Leaderboard",
            description,
            color: COLORS.yellow,
            fields: [
              {
                name: "Recent runs",
                value: recentDescription
              }
            ]
          })
        ],
        ephemeral: true
      });
    }

    if (interaction.commandName === "help") {
      return interaction.reply({ embeds: [buildHelpEmbed()], ephemeral: true });
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
      return interaction.reply({ embeds: [await buildDashboardEmbed()], ephemeral: true });
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

      if (target === "config") {
        const previousVerifyMessageId = config.verifyMessageId;
        config = loadConfig();
        if (!config.verifyMessageId && previousVerifyMessageId) {
          config.verifyMessageId = previousVerifyMessageId;
        }
      }

      return interaction.reply({
        content: "Reloaded config from disk.",
        ephemeral: true
      });
    }

    if (interaction.commandName === "verify") {
      if (!ENABLE_CORE_BOT) {
        return interaction.reply({ content: "Verification is disabled on this deployment.", ephemeral: true });
      }

      const verifyChannelId = getVerifyChannelId();
      if (!verifyChannelId) {
        return interaction.reply({
          content: "Ask staff to post the verification panel first.",
          ephemeral: true
        });
      }

      return interaction.reply({
        content: `Head to <#${verifyChannelId}> and click **I Read the Rules** to verify.${isTikTokVerificationEnabled() ? ` TikTok matching is available there as a bonus.` : ""}`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "setupverify") {
      await interaction.deferReply({ ephemeral: true });
      try {
        await postRuleVerifyPanel("slash");
        return interaction.editReply("Verification panel created.");
      } catch (error) {
        return interaction.editReply(error.message || "Verification panel could not be created.");
      }
    }

    if (interaction.commandName === "setuptiktokverify") {
      await interaction.deferReply({ ephemeral: true });
      try {
        await postTikTokVerifyPanel("slash");
        return interaction.editReply("TikTok onboarding panel created.");
      } catch (error) {
        return interaction.editReply(error.message || "TikTok onboarding panel could not be posted.");
      }
    }

    if (interaction.commandName === "setuprules") {
      const rulesChannel = await client.channels.fetch(getRulesChannelId());
      const { attachment, embed } = buildCuteRulesMessage();

      await rulesChannel.send({
        files: [attachment],
        embeds: [embed]
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

    if (interaction.commandName === "lockverified") {
      const scope = interaction.options.getString("scope") || "current";
      const updated = await applyVerifiedVisibilityScope(interaction.guild, scope, interaction.channel, true);
      return interaction.reply({
        content: `Locked verified visibility on ${updated} channel${updated === 1 ? "" : "s"}.`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "unlockverified") {
      const scope = interaction.options.getString("scope") || "current";
      const updated = await applyVerifiedVisibilityScope(interaction.guild, scope, interaction.channel, false);
      return interaction.reply({
        content: `Removed verified visibility locks from ${updated} channel${updated === 1 ? "" : "s"}.`,
        ephemeral: true
      });
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
      const deleteAll = interaction.options.getBoolean("all") || false;
      const targetChannel = interaction.options.getChannel("channel") || channel;
      await interaction.deferReply({ ephemeral: true });

      if (!targetChannel || typeof targetChannel.bulkDelete !== "function") {
        return interaction.editReply({ content: "That channel type cannot be purged." });
      }

      if (!deleteAll && (amount == null || amount < 1 || amount > 100)) {
        return interaction.editReply({ content: "Choose a number from 1 to 100, or turn on `all` to clear the whole channel." });
      }

      const deletedCount = await purgeChannelMessages(targetChannel, amount, deleteAll);
      const channelLabel = targetChannel.id === channel.id ? "this channel" : `<#${targetChannel.id}>`;
      const scopeLabel = deleteAll ? "the whole channel history" : `${deletedCount} message(s)`;
      return interaction.editReply({ content: `Deleted ${scopeLabel} from ${channelLabel}.` });
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

      if (subcommand === "birthdayrole") {
        config.settings.birthdayRoleId = interaction.options.getRole("role").id;
      }

      if (subcommand === "birthdaychannel") {
        config.settings.birthdayAnnouncementChannelId = interaction.options.getChannel("channel").id;
      }

      if (subcommand === "verifychannel") {
        const nextVerifyChannelId = interaction.options.getChannel("channel").id;
        config.settings.verifyChannelId = nextVerifyChannelId;
        config.verifyMessageId = null;
      }

      if (subcommand === "captcha") {
        config.settings.verificationCaptchaEnabled = interaction.options.getBoolean("enabled");
      }

      if (subcommand === "welcomechannel") {
        const nextWelcomeChannelId = interaction.options.getChannel("channel").id;
        config.settings.welcomeChannelId = nextWelcomeChannelId;
      }

      if (subcommand === "affirmchannel") {
        const nextAffirmationsChannelId = interaction.options.getChannel("channel").id;
        config.settings.anonymousAffirmationsChannelId = nextAffirmationsChannelId;
      }

      if (subcommand === "affirmenabled") {
        config.settings.anonymousAffirmationsEnabled = interaction.options.getBoolean("enabled");
      }

      if (subcommand === "affirmcooldown") {
        config.settings.anonymousAffirmationsCooldownMs = Math.max(5000, Math.min(10 * 60 * 1000, parseDuration(interaction.options.getString("duration")) || 0));
      }

      if (subcommand === "tiktokhandle") {
        config.settings.tiktokHandle = splitTikTokVerificationInput(interaction.options.getString("handle"))[0] || "";
      }

      if (subcommand === "tiktokaliases") {
        config.settings.tiktokNicknameAliases = splitTikTokVerificationInput(interaction.options.getString("aliases"));
      }

      if (subcommand === "verifiedrole") {
        config.settings.verifiedRoleId = interaction.options.getRole("role").id;
      }

      if (subcommand === "unverifiedrole") {
        config.settings.unverifiedRoleId = interaction.options.getRole("role").id;
      }

      if (subcommand === "ruleschannel") {
        config.settings.rulesChannelId = interaction.options.getChannel("channel").id;
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

        if (target === "birthdayrole") {
          config.settings.birthdayRoleId = null;
        }

        if (target === "birthdaychannel") {
          config.settings.birthdayAnnouncementChannelId = null;
        }

        if (target === "verifychannel") {
          config.settings.verifyChannelId = null;
          config.verifyMessageId = null;
        }

        if (target === "captcha") {
          config.settings.verificationCaptchaEnabled = false;
        }

        if (target === "welcomechannel") {
          config.settings.welcomeChannelId = null;
        }

        if (target === "affirmchannel") {
          config.settings.anonymousAffirmationsChannelId = null;
        }

        if (target === "affirmenabled") {
          config.settings.anonymousAffirmationsEnabled = true;
        }

        if (target === "affirmcooldown") {
          config.settings.anonymousAffirmationsCooldownMs = 60 * 1000;
        }

        if (target === "tiktokhandle") {
          config.settings.tiktokHandle = "";
        }

        if (target === "tiktokaliases") {
          config.settings.tiktokNicknameAliases = [];
        }

        if (target === "verifiedrole") {
          config.settings.verifiedRoleId = null;
        }

        if (target === "unverifiedrole") {
          config.settings.unverifiedRoleId = null;
        }

        if (target === "ruleschannel") {
          config.settings.rulesChannelId = null;
        }
      }

      saveConfig();

      if (["verifiedrole", "unverifiedrole", "verifychannel", "welcomechannel", "affirmchannel", "reset"].includes(subcommand)) {
        await enforceFlavorRoleVisibility(guild).catch(() => null);
      }

      if (subcommand === "mutedrole") {
        const mutedRole = await guild.roles.fetch(config.settings.mutedRoleId).catch(() => null);
        if (mutedRole) {
          await applyMutedRoleToChannels(guild, mutedRole);
        }
      }

      if (subcommand === "birthdayrole" || subcommand === "birthdaychannel" || (subcommand === "reset" && ["birthdayrole", "birthdaychannel"].includes(interaction.options.getString("target")))) {
        await processBirthdaySweep("settings").catch(error => {
          log.error("Birthday settings update error.", error);
        });
      }

      if (["tiktokhandle", "tiktokaliases", "verifiedrole", "unverifiedrole", "verifychannel", "welcomechannel", "affirmchannel"].includes(subcommand)) {
        await resolveVerifyMessageId().catch(() => null);
      }

      if (subcommand === "affirmchannel") {
        await postAnonymousAffirmationsPanel("settings").catch(error => {
          log.error("Anonymous affirmations panel error.", error);
        });
      }

      return interaction.reply({
        content:
          subcommand === "reset"
            ? `Reset setting: ${interaction.options.getString("target")}.`
            : `Updated setting: ${subcommand}.`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "birthday") {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "set") {
        const month = interaction.options.getInteger("month");
        const day = interaction.options.getInteger("day");
        const entry = setBirthdayEntry(interaction.user.id, month, day);

        if (!entry) {
          return interaction.reply({ content: "Enter a valid month and day.", ephemeral: true });
        }

        await processBirthdaySweep("birthday-set").catch(error => {
          log.error("Birthday set sweep error.", error);
        });

        return interaction.reply({
          content: `Yay! I caught your birthday as ${formatBirthdayMonthDay(entry.month, entry.day)}. I’ve got my confetti cannon loaded and I’ll hand you the birthday role when your day pops up.`,
          ephemeral: true
        });
      }

      if (subcommand === "remove") {
        const removed = removeBirthdayEntry(interaction.user.id);
        return interaction.reply({
          content: removed
            ? "Removed your public birthday."
            : "You did not have a birthday saved.",
          ephemeral: true
        });
      }

      if (subcommand === "view") {
        const user = interaction.options.getUser("user") || interaction.user;
        const entry = getBirthdayEntry(user.id);
        return interaction.reply({
          embeds: [buildBirthdayEmbed(user, entry)],
          allowedMentions: { users: [] }
        });
      }

      if (subcommand === "list") {
        return interaction.reply({
          embeds: [buildBirthdayListEmbed(25)],
          allowedMentions: { users: [] }
        });
      }
    }

    if (interaction.commandName === "birthdaypanel") {
      if (!ENABLE_CORE_BOT) {
        return interaction.reply({ content: "Birthday signup is disabled on this deployment.", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      const posted = await postBirthdayPanel("slash");
      return interaction.editReply({
        content: `Posted the birthday panel in <#${posted.channelId}>.`
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
    log.error("Interaction error.", error);

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
    recordMessageArchive(message);
    const generalChatChannelId = getGeneralChatChannelId();
    if (generalChatChannelId && message.channel.id === generalChatChannelId) {
      generalChatActivityCache.set(message.author.id, message.createdTimestamp || Date.now());
    }
    if (isAutoModExempt(message)) return;
    const policy = resolveAutoModPolicy(message);
    const evaluation = await evaluateAutoModMessage(message, policy, false);
    const match = evaluation.match;

    if (match) {
      await handleAutoModViolation(message, match.reason, match.actionLabel, match.details || [], {
        dryRun: policy.automod.dryRunEnabled,
        policy
      });
      return;
    }

    const aiMatch = await detectAiModerationIssue(message);
    if (aiMatch) {
      await handleAutoModViolation(message, aiMatch.reason, aiMatch.actionLabel, aiMatch.details, {
        dryRun: policy.automod.dryRunEnabled,
        policy
      });
      return;
    }

    const customRuleMatch = await detectAiCustomRuleIssue(message);
    if (customRuleMatch) {
      await handleAutoModViolation(message, customRuleMatch.reason, customRuleMatch.actionLabel, customRuleMatch.details, {
        dryRun: policy.automod.dryRunEnabled,
        policy
      });
    }
  } catch (error) {
    log.error("messageCreate error.", error);
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
    log.error("Delete log error.", error);
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
    log.error("Update log error.", error);
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

        await sendSecurityAlert(
          makeEmbed({
            title: "Suspicious join burst",
            description: `${member.user.tag} joined during a possible raid window.`,
            color: COLORS.red,
            fields: [
              { name: "Recent joins", value: `${joinCount}`, inline: true },
              { name: "Account age", value: formatDuration(accountAgeMs), inline: true },
              { name: "Action", value: config.automod.raidAction, inline: true }
            ]
          })
        );

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
          (isTikTokVerificationEnabled()
            ? `Please head to ${getVerifyChannelMention()} and click **I Read the Rules** to verify. If you want a flavor role, react below. TikTok matching is available there as a bonus.\n\n`
            : `Please head to ${getVerifyChannelMention()} and click **I Read the Rules** to verify and unlock the garden.\n\n`) +
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
      const displayName = normalizeComparisonText(member.nickname || member.user.username || "");
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

        const kickReason = `Nickname matched blocked term "${blockedTerm}" on join.`;
        const kickApplied = member.kickable ? await member.kick(kickReason).then(() => true).catch(() => false) : false;

        await logAutoModEmbed(
          makeEmbed({
            title: `Auto mod case #${entry.id}`,
            description: kickApplied
              ? `${member.user.tag} matched the nickname filter on join and was kicked.`
              : `${member.user.tag} matched the nickname filter on join, but I could not kick them.`,
            color: COLORS.red,
            fields: [
              ...buildCaseFields(entry),
              { name: "Action", value: kickApplied ? "Kicked from server" : "Kick failed", inline: true }
            ]
          })
        );
      }

      if (blockedTerm) return;
    }

    const unverifiedRoleId = getUnverifiedRoleId();
    if (!member.user.bot && unverifiedRoleId) {
      await member.roles.add(unverifiedRoleId, "TikTok verification: join default unverified role").catch(() => {});
    }

    if (getTikTokHandle() && (getVerificationRoleId() || unverifiedRoleId)) {
      const verificationResult = await syncTikTokVerification(member, "join").catch(error => {
        log.error("TikTok verification sync error.", error);
        return null;
      });

      if (verificationResult?.matched) {
        await notifyUser(
          member.user,
          makeEmbed({
            title: "Verified",
            description: `You're verified as @${getTikTokHandle()}. You should now be able to see the server.`,
            color: COLORS.mint
          })
        );
      }
    }

    await processBirthdaySweep("join").catch(error => {
      log.error("Birthday join sweep error.", error);
    });
  } catch (error) {
    log.error("Welcome error.", error);
  }
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    if (!ENABLE_CORE_BOT) return;
    if (isTikTokVerificationEnabled() && oldMember.displayName !== newMember.displayName) {
      const verificationResult = await syncTikTokVerification(newMember, "nickname-change").catch(error => {
        log.error("TikTok verification sync error.", error);
        return null;
      });
      if (verificationResult?.matched && verificationResult?.changed) {
        await logEmbed(
          makeEmbed({
            title: "Member verified",
            description: `${newMember.user.tag} matched the TikTok handle and was verified.`,
            color: COLORS.mint,
            thumbnail: newMember.user.displayAvatarURL({ dynamic: true })
          })
        );
      }
    }

    if (!config.automod.nicknameFilterEnabled) return;

    const previousName = normalizeComparisonText(oldMember.nickname || oldMember.user.username || "");
    const currentName = normalizeComparisonText(newMember.nickname || newMember.user.username || "");
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

    const kickReason = `Nickname matched blocked term "${blockedTerm}".`;
    const kickApplied = newMember.kickable ? await newMember.kick(kickReason).then(() => true).catch(() => false) : false;

    await logAutoModEmbed(
      makeEmbed({
        title: `Auto mod case #${entry.id}`,
        description: kickApplied
          ? `${newMember.user.tag} matched the nickname filter and was kicked.`
          : `${newMember.user.tag} matched the nickname filter, but I could not kick them.`,
        color: COLORS.red,
        fields: [
          ...buildCaseFields(entry),
          { name: "Action", value: kickApplied ? "Kicked from server" : "Kick failed", inline: true }
        ]
      })
    );
  } catch (error) {
    log.error("Nickname filter error.", error);
  }
});

process.on("unhandledRejection", error => {
  log.error("Unhandled promise rejection.", error);
});

process.on("uncaughtException", error => {
  log.error("Uncaught exception.", error);
});

process.on("SIGTERM", () => {
  shutdownProcess("SIGTERM").catch(error => {
    log.error("Shutdown error.", error);
    process.exit(1);
  });
});

process.on("SIGINT", () => {
  shutdownProcess("SIGINT").catch(error => {
    log.error("Shutdown error.", error);
    process.exit(1);
  });
});

try {
  validateEnv();
  startWebServer();
  client.login(TOKEN).catch(error => {
    log.error("Discord login failed.", error);
  });
} catch (error) {
  log.error("Startup error.", error);
  process.exit(1);
}
