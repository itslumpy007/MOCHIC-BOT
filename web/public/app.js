function createSafeStorage(source) {
  const memory = new Map();
  let backing = null;
  try {
    backing = typeof source === "function" ? source() : source;
  } catch {
    backing = null;
  }

  const hasBacking = Boolean(backing && typeof backing.getItem === "function" && typeof backing.setItem === "function");
  return {
    getItem(key) {
      if (hasBacking) {
        try {
          return backing.getItem(key);
        } catch {
          // Fall through to the in-memory cache.
        }
      }
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      const next = String(value);
      if (hasBacking) {
        try {
          backing.setItem(key, next);
          return;
        } catch {
          // Fall through to the in-memory cache.
        }
      }
      memory.set(key, next);
    },
    removeItem(key) {
      if (hasBacking) {
        try {
          backing.removeItem(key);
        } catch {
          // Fall through to the in-memory cache.
        }
      }
      memory.delete(key);
    }
  };
}

const localStorage = createSafeStorage(() => window.localStorage);
const sessionStorage = createSafeStorage(() => window.sessionStorage);

const state = {
  token: localStorage.getItem("mochiAdminToken") || "",
  me: null,
  dashboard: null,
  config: null,
  ops: null,
  aiReviews: {},
  selectedMember: null,
  memberAiSummary: null,
  memberDrawerOpen: false,
  automodPreview: null,
  previewChannelId: "",
  previewMessage: "",
  timelineSearch: "",
  memberChatSearch: "",
  memberChatChannelFilter: "all",
  memberChatDateRange: "7d",
  memberChatLogs: [],
  cases: [],
  warnings: {},
  notes: {},
  webAccounts: [],
  webAccountEditing: null,
  lastDeletedMemberRecord: null,
  templateEditorDrafts: [],
  templateEditorIndex: 0,
  loading: false,
  refreshIntervalId: null
};

const titles = {
  overview: "Overview",
  members: "Members",
  automod: "AutoMod + AI",
  settings: "Settings",
  staff: "Staff",
  ops: "Ops",
  records: "Records"
};

const storageKeys = {
  activeView: "mochiActiveView",
  advancedToolsVisible: "mochiAdvancedToolsVisible",
  themePreset: "mochiThemePreset",
  sidebarOpen: "mochiSidebarOpen",
  workspacePreset: "mochiWorkspacePreset",
  workspaceAutoApplied: "mochiWorkspaceAutoApplied",
  caseFilters: "mochiCaseFilters",
  savedCaseFilters: "mochiSavedCaseFilters",
  lastMemberSearch: "mochiLastMemberSearch",
  recentMemberSearches: "mochiRecentMemberSearches",
  memberAction: "mochiMemberAction",
  memberDuration: "mochiMemberDuration",
  timelineSearch: "mochiTimelineSearch",
  memberChatSearch: "mochiMemberChatSearch",
  memberChatChannelFilter: "mochiMemberChatChannelFilter",
  memberChatDateRange: "mochiMemberChatDateRange",
  auditFilter: "mochiAuditFilter",
  appealFilter: "mochiAppealFilter",
  recentActions: "mochiRecentActions",
  activityFilters: "mochiActivityFilters",
  settingsDraft: "mochiSettingsDraft",
  automodDraft: "mochiAutomodDraft",
  staffDraft: "mochiStaffDraft",
  opsDraft: "mochiOpsDraft",
  exemptionsDraft: "mochiExemptionsDraft",
  ruleActionsDraft: "mochiRuleActionsDraft",
  previewDraft: "mochiPreviewDraft",
  templateEditorDrafts: "mochiTemplateEditorDrafts",
  templateEditorIndex: "mochiTemplateEditorIndex",
  commandPaletteOpen: "mochiCommandPaletteOpen"
};

const advancedViews = new Set(["automod", "settings", "staff", "ops"]);
const subtabDefaults = {
  overview: "summary",
  members: "profile",
  automod: "rules",
  settings: "general",
  staff: "access",
  ops: "templates",
  records: "cases"
};

const themePresets = {
  pastel: {
    bg: "#f2eee8",
    bgAlt: "#edf3fb",
    surface: "rgba(255, 255, 255, 0.82)",
    surfaceStrong: "rgba(255, 255, 255, 0.96)",
    surfaceSoft: "#f6ecef",
    surfaceWarm: "#f8f3ea",
    line: "rgba(214, 205, 198, 0.96)",
    lineStrong: "rgba(28, 42, 78, 0.18)",
    text: "#1f2430",
    muted: "#66707f",
    mutedSoft: "#8a95a5",
    accent: "#4d67ff",
    accentDark: "#344dd6",
    accentSoft: "#e6ecff",
    mint: "#3fa78f",
    blue: "#5277e6",
    yellow: "#c58a2a",
    red: "#d35f6e",
    shadow: "0 24px 56px rgba(28, 40, 66, 0.11)",
    shadowSoft: "0 12px 30px rgba(28, 40, 66, 0.08)"
  },
  ocean: {
    bg: "#f4fbff",
    bgAlt: "#eef7ff",
    surface: "rgba(255, 255, 255, 0.88)",
    surfaceStrong: "rgba(255, 255, 255, 0.96)",
    surfaceSoft: "#eaf7ff",
    surfaceWarm: "#f3fbff",
    line: "rgba(194, 224, 245, 0.96)",
    lineStrong: "rgba(68, 131, 190, 0.22)",
    text: "#203447",
    muted: "#5d7488",
    mutedSoft: "#8aa3ba",
    accent: "#4c8fc7",
    accentDark: "#2f78b4",
    accentSoft: "#dff2ff",
    mint: "#4db2a3",
    blue: "#3f7ff0",
    yellow: "#c98a2a",
    red: "#d8636f",
    shadow: "0 18px 42px rgba(66, 109, 144, 0.12)",
    shadowSoft: "0 10px 28px rgba(66, 109, 144, 0.08)"
  },
  cherry: {
    bg: "#fff6f6",
    bgAlt: "#fff0f4",
    surface: "rgba(255, 255, 255, 0.9)",
    surfaceStrong: "rgba(255, 255, 255, 0.97)",
    surfaceSoft: "#fff0f3",
    surfaceWarm: "#fff8f6",
    line: "rgba(238, 205, 210, 0.96)",
    lineStrong: "rgba(206, 88, 111, 0.25)",
    text: "#34242a",
    muted: "#7a5b63",
    mutedSoft: "#a78a91",
    accent: "#d65773",
    accentDark: "#ba3f5d",
    accentSoft: "#ffe1e8",
    mint: "#5cae93",
    blue: "#7182f4",
    yellow: "#c98a2a",
    red: "#d8636f",
    shadow: "0 18px 42px rgba(147, 81, 94, 0.12)",
    shadowSoft: "0 10px 28px rgba(147, 81, 94, 0.08)"
  },
  lavender: {
    bg: "#fbf8ff",
    bgAlt: "#f6f3ff",
    surface: "rgba(255, 255, 255, 0.88)",
    surfaceStrong: "rgba(255, 255, 255, 0.96)",
    surfaceSoft: "#f2edff",
    surfaceWarm: "#fcf8ff",
    line: "rgba(225, 215, 244, 0.96)",
    lineStrong: "rgba(143, 112, 224, 0.22)",
    text: "#2f2942",
    muted: "#6f668a",
    mutedSoft: "#9a91b2",
    accent: "#8c6ad9",
    accentDark: "#7151ba",
    accentSoft: "#ece4ff",
    mint: "#5eae9f",
    blue: "#6f85f7",
    yellow: "#c98a2a",
    red: "#d8636f",
    shadow: "0 18px 42px rgba(122, 103, 166, 0.12)",
    shadowSoft: "0 10px 28px rgba(122, 103, 166, 0.08)"
  }
};

const automodSwitchLabels = {
  invites: "Invite links",
  spam: "Spam",
  caps: "Caps",
  bannedWords: "Banned words",
  linksEnabled: "Link filter",
  allowedDomainsOnly: "Allowed domains only",
  attachmentsEnabled: "Attachment filter",
  ageProtectionEnabled: "Age protection",
  antiRaidEnabled: "Anti-raid",
  nicknameFilterEnabled: "Nickname filter",
  scamFilterEnabled: "Scam filter",
  evasionFilterEnabled: "Evasion filter",
  aiModerationEnabled: "AI moderation",
  aiCustomRulesEnabled: "AI custom rules",
  aiIncludeRecentContext: "AI recent context",
  dryRunEnabled: "Dry run",
  linkReputationEnabled: "Link reputation",
  languageAwareFiltersEnabled: "Language-aware",
  quietHoursEnabled: "Quiet hours",
  escalationEnabled: "Escalation",
  emojiSpamEnabled: "Emoji spam"
};

const googleBlockListLabels = {
  googleBlockListEnabled: "Enable doc sync",
  googleBlockListUrl: "Google Doc URL",
  googleBlockListSyncMinutes: "Refresh interval (minutes)"
};

const limitLabels = {
  maxMentions: "Mention limit",
  maxEmojiCount: "Emoji limit",
  maxAttachmentSizeMb: "Attachment MB limit",
  raidJoinThreshold: "Raid threshold",
  warnThreshold: "Warn threshold",
  timeoutThreshold: "Timeout threshold",
  contextMessageCount: "Context window",
  spamWindowMs: "Spam window ms",
  spamBurstThreshold: "Spam burst",
  spamDuplicateThreshold: "Spam duplicates"
};

const aiNumberLabels = {
  aiModerationThreshold: "AI threshold %",
  aiCustomRulesThreshold: "Custom rules threshold %",
  aiMinMessageLength: "Minimum message length",
  aiContextMessageCount: "Recent context count"
};

const aiModerationLabels = {
  aiModerationModel: "AI moderation model",
  aiCustomRulesModel: "Custom rules model"
};

const aiActionLabels = {
  aiModerationAction: "AI moderation action",
  aiCustomRulesAction: "Custom rules action"
};

const aiActionOptions = [
  ["review", "Review only"],
  ["warn", "Warn"],
  ["timeout", "Timeout"],
  ["kick", "Kick"],
  ["ban", "Ban"]
];

const aiTextareaLabels = {
  aiCustomRules: "AI custom server rules",
  aiCustomInstructions: "Extra AI moderator guidance"
};

const modeLabels = {
  quietHoursStart: "Quiet hours start",
  quietHoursEnd: "Quiet hours end",
  quietHoursMode: "Quiet hours mode"
};

const policyTextareaLabels = {
  channelRuleOverrides: "Channel rule overrides"
};

const durationLabels = {
  timeoutDurationMs: "Escalation timeout",
  offenseWindowMs: "Offense window",
  raidWindowMs: "Raid window",
  raidAccountAgeLimitMs: "Raid account age",
  minAccountAgeForLinksMs: "Link account age",
  minMemberAgeForLinksMs: "Link member age",
  minAccountAgeForAttachmentsMs: "Attachment account age",
  minMemberAgeForAttachmentsMs: "Attachment member age"
};

const listLabels = {
  bannedWordList: "Banned words",
  nicknameBlockedTerms: "Nickname terms",
  scamPhraseList: "Extra scam phrases",
  allowedDomains: "Allowed domains",
  blockedDomains: "Blocked domains",
  allowedAttachmentExtensions: "Allowed extensions",
  blockedAttachmentExtensions: "Blocked extensions"
};

const settingLabels = {
  verifyChannelId: "Verify channel ID",
  rulesChannelId: "Rules channel ID",
  welcomeChannelId: "Welcome channel ID",
  generalChatChannelId: "General chat channel ID",
  generalChatInactivityEnabled: "General chat inactivity",
  logChannelId: "Log channel ID",
  automodLogChannelId: "AutoMod log channel ID",
  mutedRoleId: "Muted role ID"
};

const privacySettingLabels = {
  messageArchiveEnabled: "Archive member chat logs",
  messageArchiveRetentionDays: "Archive retention (days)"
};

const affirmationsSettingLabels = {
  anonymousAffirmationsEnabled: "Anonymous affirmations enabled",
  anonymousAffirmationsChannelId: "Anonymous affirmations channel ID",
  anonymousAffirmationsCooldownMs: "Anonymous affirmations cooldown (ms)"
};

const verificationCoreSettingLabels = {
  verificationCaptchaEnabled: "Verification CAPTCHA enabled",
  verifiedRoleId: "Verified role ID",
  unverifiedRoleId: "Unverified role ID"
};

const rulesCardSettingLabels = {
  rulesCardTitle: "Rules card title",
  rulesCardDescription: "Rules card description",
  rulesCardRules: "Rules list"
};

const rulesCardSettingTypes = {
  rulesCardDescription: "textarea",
  rulesCardRules: "textarea"
};

const verificationBonusSettingLabels = {
  tiktokHandle: "TikTok handle",
  tiktokNicknameAliases: "Accepted nicknames"
};

const verificationBonusSettingTypes = {
  tiktokHandle: "input",
  tiktokNicknameAliases: "textarea"
};

const verificationCoreSettingTypes = {
  verificationCaptchaEnabled: "boolean",
  verifiedRoleId: "input",
  unverifiedRoleId: "input"
};

const birthdaySettingLabels = {
  birthdayRoleId: "Birthday role ID",
  birthdayAnnouncementChannelId: "Birthday announcement channel ID"
};

const automodPresets = {
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
    aiModerationEnabled: false,
    aiCustomRulesEnabled: false,
    aiIncludeRecentContext: false,
    dryRunEnabled: false,
    linkReputationEnabled: true,
    languageAwareFiltersEnabled: true,
    quietHoursEnabled: false,
    contextMessageCount: 3,
    spamWindowMs: 10000,
    spamBurstThreshold: 6,
    spamDuplicateThreshold: 4,
    emojiSpamEnabled: false,
    escalationEnabled: true,
    maxMentions: 8,
    raidJoinThreshold: 8,
    warnThreshold: 3,
    timeoutThreshold: 5,
    timeoutDurationMs: "10m",
    offenseWindowMs: "24h",
    raidWindowMs: "1m",
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
    aiModerationEnabled: false,
    aiCustomRulesEnabled: false,
    aiIncludeRecentContext: false,
    dryRunEnabled: false,
    linkReputationEnabled: true,
    languageAwareFiltersEnabled: true,
    quietHoursEnabled: false,
    contextMessageCount: 3,
    spamWindowMs: 8000,
    spamBurstThreshold: 5,
    spamDuplicateThreshold: 3,
    emojiSpamEnabled: true,
    escalationEnabled: true,
    maxMentions: 5,
    maxEmojiCount: 12,
    maxAttachmentSizeMb: 10,
    raidJoinThreshold: 5,
    warnThreshold: 2,
    timeoutThreshold: 4,
    timeoutDurationMs: "10m",
    offenseWindowMs: "24h",
    raidWindowMs: "1m",
    raidAccountAgeLimitMs: "1d",
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
    aiModerationEnabled: true,
    aiCustomRulesEnabled: true,
    aiIncludeRecentContext: true,
    dryRunEnabled: false,
    linkReputationEnabled: true,
    languageAwareFiltersEnabled: true,
    quietHoursEnabled: true,
    contextMessageCount: 4,
    spamWindowMs: 6000,
    spamBurstThreshold: 4,
    spamDuplicateThreshold: 2,
    emojiSpamEnabled: true,
    escalationEnabled: true,
    maxMentions: 4,
    maxEmojiCount: 8,
    maxAttachmentSizeMb: 8,
    raidJoinThreshold: 4,
    warnThreshold: 2,
    timeoutThreshold: 3,
    timeoutDurationMs: "30m",
    offenseWindowMs: "48h",
    raidWindowMs: "1m",
    raidAccountAgeLimitMs: "7d",
    minAccountAgeForLinksMs: "1d",
    minMemberAgeForLinksMs: "10m",
    minAccountAgeForAttachmentsMs: "1d",
    minMemberAgeForAttachmentsMs: "10m",
    raidAction: "timeout"
  }
};

const memberActionPresets = {
  firstOffense: {
    action: "warn",
    duration: "",
    reason: "First offense. Please review the rules and avoid repeating this behavior."
  },
  spamRaid: {
    action: "timeout",
    duration: "10m",
    reason: "Spam or raid behavior. Take a short cooldown and review server rules."
  },
  scamLink: {
    action: "ban",
    duration: "",
    reason: "Suspicious or scam-linked content. Removed for server safety."
  },
  harassment: {
    action: "timeout",
    duration: "1d",
    reason: "Harassment or targeted abuse. Cooldown issued pending review."
  },
  tempban: {
    action: "tempban",
    duration: "7d",
    reason: "Temporary ban issued after review."
  }
};

const memberActionShortcuts = [
  { action: "warn", label: "Warn", preset: "firstOffense" },
  { action: "timeout", label: "Timeout", preset: "spamRaid" },
  { action: "ban", label: "Ban", preset: "scamLink" },
  { action: "tempban", label: "Tempban", preset: "tempban" },
  { action: "clearwarnings", label: "Clear warnings" }
];

const bulkActionPresets = {
  raidCleanup: {
    memberPreset: "spamRaid",
    caseFilterAction: "automod",
    timelineSearch: "raid"
  },
  spamWave: {
    memberPreset: "spamRaid",
    caseFilterAction: "spam",
    timelineSearch: "spam"
  }
};

const quickActions = [
  {
    id: "open-members",
    title: "Find a member",
    description: "Jump to search and moderation actions.",
    view: "members"
  },
  {
    id: "open-records",
    title: "Review records",
    description: "Open cases, warnings, and the timeline.",
    view: "records"
  },
  {
    id: "preset-first",
    title: "First offense",
    description: "Load the warn preset with a clean reason.",
    preset: "firstOffense"
  },
  {
    id: "preset-spam",
    title: "Spam raid",
    description: "Load a short timeout preset for raid cleanup.",
    preset: "spamRaid"
  },
  {
    id: "preset-scam",
    title: "Scam link",
    description: "Load the ban preset for suspicious links.",
    preset: "scamLink"
  },
  {
    id: "preset-harassment",
    title: "Harassment",
    description: "Load the longer timeout preset for abuse.",
    preset: "harassment"
  },
  {
    id: "bulk-raid",
    title: "Raid cleanup",
    description: "Load the raid cleanup preset and relevant filters.",
    bulkPreset: "raidCleanup"
  },
  {
    id: "bulk-spam-wave",
    title: "Spam wave",
    description: "Load a faster cleanup flow for repeated spam bursts.",
    bulkPreset: "spamWave"
  },
  {
    id: "bulk-appeals",
    title: "Appeal review",
    description: "Jump to appeals and the workflow queue.",
    view: "ops",
    subtab: "workflow",
    adminOnly: true
  },
  {
    id: "open-automod",
    title: "Open AutoMod",
    description: "Switch to the policy and rule controls.",
    view: "automod",
    advanced: true
  },
  {
    id: "open-settings",
    title: "Open settings",
    description: "Edit channels, roles, and verification.",
    view: "settings",
    advanced: true,
    adminOnly: true
  }
];

const templateCategories = [
  { value: "general", label: "General" },
  { value: "spam", label: "Spam" },
  { value: "scam", label: "Scam" },
  { value: "harassment", label: "Harassment" },
  { value: "raid", label: "Raid" },
  { value: "other", label: "Other" }
];

const commandPaletteEntries = [
  { kind: "view", label: "Overview", value: "overview" },
  { kind: "view", label: "Members", value: "members" },
  { kind: "view", label: "Records", value: "records" },
  { kind: "view", label: "AutoMod", value: "automod", advanced: true },
  { kind: "view", label: "Settings", value: "settings", advanced: true, adminOnly: true },
  { kind: "view", label: "Staff", value: "staff", advanced: true, adminOnly: true },
  { kind: "view", label: "Ops", value: "ops", advanced: true, adminOnly: true },
  { kind: "action", label: "Raid cleanup", value: "bulk:raidCleanup" },
  { kind: "action", label: "Spam wave", value: "bulk:spamWave" },
  { kind: "action", label: "Appeal review", value: "view:ops:workflow", advanced: true, adminOnly: true },
  { kind: "action", label: "Open member drawer", value: "open-member-drawer" },
  { kind: "action", label: "Search member", value: "search-member:prompt" },
  { kind: "action", label: "Copy member ID", value: "copy-member-id" },
  { kind: "action", label: "Undo last delete", value: "undo-last-member-delete" },
  { kind: "action", label: "New template", value: "new-template", advanced: true, adminOnly: true },
  { kind: "action", label: "Save filter", value: "save-filter" },
  { kind: "action", label: "Clear recent actions", value: "clear-recent-actions" },
  { kind: "action", label: "Open quick action: First offense", value: "preset:firstOffense" },
  { kind: "action", label: "Open quick action: Spam raid", value: "preset:spamRaid" },
  { kind: "action", label: "Open quick action: Scam link", value: "preset:scamLink" }
];

const automodTestSamples = {
  spam: "Join my server now join my server now join my server now",
  invite: "discord.gg/example",
  scam: "Free nitro here: https://discord-gift.click claim now",
  caps: "THIS IS AN ALL CAPS MESSAGE THAT SHOULD TRIP CAPS RULES"
};

function $(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readStoredArray(key, fallback = []) {
  const value = readStoredJson(key, fallback);
  return Array.isArray(value) ? value : fallback;
}

function writeStoredArray(key, items) {
  writeStoredJson(key, Array.isArray(items) ? items : []);
}

function getElementValue(element) {
  if (!element) return "";
  if (element.type === "checkbox") return element.checked;
  return element.value;
}

function setElementValue(element, value) {
  if (!element) return;
  if (element.type === "checkbox") {
    element.checked = Boolean(value);
    return;
  }
  element.value = value ?? "";
}

function getScopedElements(selectors) {
  return selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)));
}

function getElementDraftSelector(element) {
  if (!element) return null;
  if (element.id) return `#${CSS.escape(element.id)}`;
  if (element.dataset.setting) return `[data-setting="${CSS.escape(element.dataset.setting)}"]`;
  if (element.dataset.automodBool) return `[data-automod-bool="${CSS.escape(element.dataset.automodBool)}"]`;
  if (element.dataset.automodNumber) return `[data-automod-number="${CSS.escape(element.dataset.automodNumber)}"]`;
  if (element.dataset.automodList) return `[data-automod-list="${CSS.escape(element.dataset.automodList)}"]`;
  if (element.dataset.automodDuration) return `[data-automod-duration="${CSS.escape(element.dataset.automodDuration)}"]`;
  if (element.dataset.automodString) return `[data-automod-string="${CSS.escape(element.dataset.automodString)}"]`;
  return null;
}

function readScopedDraft(selectors) {
  return getScopedElements(selectors).map(element => ({
    selector: getElementDraftSelector(element),
    value: getElementValue(element)
  })).filter(item => item.selector);
}

function restoreScopedDraft(selectors, draft) {
  if (!Array.isArray(draft) || !draft.length) return;
  draft.forEach(item => {
    if (!item?.selector) return;
    const element = document.querySelector(item.selector);
    if (element) setElementValue(element, item.value);
  });
}

function updateSaveButton(buttonId, mode = "idle") {
  const button = document.getElementById(buttonId);
  if (!button) return;
  if (!button.dataset.baseLabel) {
    button.dataset.baseLabel = button.textContent.trim();
  }
  if (mode === "saving") {
    button.textContent = "Saving...";
    button.classList.add("is-saving");
    button.classList.remove("is-saved");
  } else if (mode === "saved") {
    button.textContent = "Saved";
    button.classList.remove("is-saving");
    button.classList.add("is-saved");
  } else {
    button.textContent = button.dataset.baseLabel || button.textContent;
    button.classList.remove("is-saving", "is-saved");
  }
}

function setPanelBusy(busy) {
  state.loading = busy;
  document.body.classList.toggle("is-loading", busy);
  const refreshButton = $("#refreshButton");
  if (refreshButton) {
    refreshButton.disabled = busy;
    refreshButton.textContent = busy ? "Refreshing..." : "Refresh";
  }
}

function ensureAutoRefresh() {
  if (!state.me?.authenticated) {
    if (state.refreshIntervalId) {
      clearInterval(state.refreshIntervalId);
      state.refreshIntervalId = null;
    }
    return;
  }

  if (state.refreshIntervalId) return;
  state.refreshIntervalId = window.setInterval(() => {
    if (document.hidden || state.loading) return;
    loadAll().catch(() => {});
  }, 5 * 60 * 1000);
}

const autosaveTimers = new Map();
const autosaveInFlight = new Map();
const debounceTimers = new Map();
const autosaveScopes = {
  settings: {
    key: storageKeys.settingsDraft,
    selectors: () => ["[data-setting]"],
    save: () => saveSettings({ auto: true })
  },
  automod: {
    key: storageKeys.automodDraft,
    selectors: () => [
      "[data-automod-bool]",
      "[data-automod-number]",
      "[data-automod-list]",
      "[data-automod-duration]",
      "[data-automod-string]"
    ],
    save: () => saveAutomod({ auto: true })
  },
  staff: {
    key: storageKeys.staffDraft,
    selectors: () => ["#modRoleIds", "#adminRoleIds"],
    save: () => saveStaff({ auto: true })
  },
  ops: {
    key: storageKeys.opsDraft,
    selectors: () => ["#modTemplates", "#channelProfiles", "#reportEnabled", "#reportChannelId", "#reportFrequency"],
    save: () => saveOps({ auto: true })
  },
  exemptions: {
    key: storageKeys.exemptionsDraft,
    selectors: () => ["#exemptChannelIds", "#exemptRoleIds", "#exemptUserIds"],
    save: () => saveExemptions({ auto: true })
  },
  ruleActions: {
    key: storageKeys.ruleActionsDraft,
    selectors: () => ["#alertRules", "#warnRules", "#timeoutRules", "#raidAction"],
    save: () => saveRuleActions({ auto: true })
  },
  preview: {
    key: storageKeys.previewDraft,
    selectors: () => ["#previewChannelId", "#previewMessage"],
    save: null
  }
};

function persistAutosaveDraft(scope) {
  const config = autosaveScopes[scope];
  if (!config) return;
  const selectors = config.selectors();
  const draft = readScopedDraft(selectors);
  if (!draft.length) {
    localStorage.removeItem(config.key);
    return;
  }
  writeStoredJson(config.key, draft);
}

function restoreAutosaveDraft(scope) {
  const config = autosaveScopes[scope];
  if (!config) return;
  const draft = readStoredJson(config.key, []);
  restoreScopedDraft(config.selectors(), draft);
  if (scope === "preview") {
    state.previewChannelId = $("#previewChannelId")?.value || state.previewChannelId;
    state.previewMessage = $("#previewMessage")?.value || state.previewMessage;
  }
}

function clearAutosaveDraft(scope) {
  const config = autosaveScopes[scope];
  if (!config) return;
  localStorage.removeItem(config.key);
}

function hasAutosaveDraft(scope) {
  const config = autosaveScopes[scope];
  if (!config) return false;
  const draft = readStoredJson(config.key, []);
  if (Array.isArray(draft) && draft.length > 0) return true;
  if (scope === "ops") {
    const templateDrafts = readStoredJson(storageKeys.templateEditorDrafts, []);
    return Array.isArray(templateDrafts) && templateDrafts.length > 0;
  }
  return false;
}

function renderDirtyBadge(scope, label) {
  return hasAutosaveDraft(scope) ? `<span class="badge dirty-badge">${escapeHtml(label || "Unsaved")}</span>` : "";
}

function updateDirtyIndicators() {
  const mapping = {
    automodDirtyStatus: ["automod", "Unsaved"],
    automodRuleDirtyStatus: ["automod", "Unsaved"],
    settingsDirtyStatus: ["settings", "Unsaved"],
    affirmationsDirtyStatus: ["settings", "Unsaved"],
    verificationDirtyStatus: ["settings", "Unsaved"],
    birthdaysDirtyStatus: ["settings", "Unsaved"],
    exemptionsDirtyStatus: ["exemptions", "Unsaved"],
    privacyDirtyStatus: ["settings", "Unsaved"],
    staffDirtyStatus: ["staff", "Unsaved"],
    opsDirtyStatus: ["ops", "Unsaved"]
  };

  Object.entries(mapping).forEach(([id, [scope, label]]) => {
    const element = document.getElementById(id);
    if (!element) return;
    element.innerHTML = hasAutosaveDraft(scope) ? `<span class="badge dirty-badge">${escapeHtml(label)}</span>` : "";
  });
}

function renderSkeletonCards(count = 4) {
  return Array.from({ length: count }, (_, index) => `
    <article class="skeleton-card" aria-hidden="true">
      <span class="skeleton-line short"></span>
      <span class="skeleton-line"></span>
      <span class="skeleton-line"></span>
    </article>
  `).join("");
}

function renderSkeletonList(count = 3) {
  return Array.from({ length: count }, () => `
    <article class="event skeleton-event" aria-hidden="true">
      <span class="skeleton-line short"></span>
      <span class="skeleton-line"></span>
      <span class="skeleton-line"></span>
    </article>
  `).join("");
}

function revealStyle(index = 0) {
  return `style="--reveal-index:${Math.max(0, Number(index) || 0)}"`;
}

function debounce(key, fn, delay = 180) {
  clearTimeout(debounceTimers.get(key));
  debounceTimers.set(key, setTimeout(fn, delay));
}

async function copyToClipboard(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function getAutosaveScopeForElement(element) {
  if (!element) return null;
  return Object.entries(autosaveScopes).find(([, config]) => {
    if (!config.save && config.key !== storageKeys.previewDraft) return false;
    return config.selectors().some(selector => element.matches(selector));
  })?.[0] || null;
}

function handleAutosaveInput(event) {
  const element = event.target?.closest?.("input, textarea, select");
  if (!element) return;
  const scope = getAutosaveScopeForElement(element);
  if (!scope) return;
  persistAutosaveDraft(scope);
  if (scope === "preview") {
    state.previewChannelId = $("#previewChannelId")?.value || "";
    state.previewMessage = $("#previewMessage")?.value || "";
  }
  if (scope === "preview") return;
  queueAutosave(scope);
}

function queueAutosave(scope) {
  const config = autosaveScopes[scope];
  if (!config?.save) return;
  persistAutosaveDraft(scope);
  clearTimeout(autosaveTimers.get(scope));
  autosaveTimers.set(scope, setTimeout(() => {
    performAutosave(scope).catch(error => setAlert(error.message, "error"));
  }, 900));
}

async function performAutosave(scope) {
  const config = autosaveScopes[scope];
  if (!config?.save) return;
  if (autosaveInFlight.get(scope)) return autosaveInFlight.get(scope);

  const promise = (async () => {
    const buttonId = config.buttonId || ({
      settings: "saveSettings",
      automod: "saveAutomod",
      staff: "saveStaff",
      ops: "saveOps",
      exemptions: "saveExemptions",
      ruleActions: "saveRuleActions"
    })[scope];
    if (buttonId) updateSaveButton(buttonId, "saving");
    try {
      const result = await config.save({ auto: true });
      clearAutosaveDraft(scope);
      if (buttonId) updateSaveButton(buttonId, "saved");
      window.setTimeout(() => {
        if (buttonId) updateSaveButton(buttonId, "idle");
      }, 700);
      return result;
    } finally {
      autosaveInFlight.delete(scope);
    }
  })();

  autosaveInFlight.set(scope, promise);
  return promise;
}

function restoreAutosaveDrafts() {
  Object.keys(autosaveScopes).forEach(scope => restoreAutosaveDraft(scope));
}

function clearAutosaveDrafts() {
  Object.keys(autosaveScopes).forEach(scope => clearAutosaveDraft(scope));
}

function addRecentMemberSearch(query) {
  const normalized = String(query || "").trim();
  if (!normalized) return;
  const next = [normalized, ...readStoredArray(storageKeys.recentMemberSearches)]
    .filter((item, index, array) => array.indexOf(item) === index)
    .slice(0, 8);
  writeStoredArray(storageKeys.recentMemberSearches, next);
  renderRecentMemberSearches();
}

function renderRecentMemberSearches() {
  const list = $("#recentMemberSearches");
  if (!list) return;
  const searches = readStoredArray(storageKeys.recentMemberSearches);
  list.innerHTML = searches.length
    ? searches.map(search => `
      <button class="filter-chip" type="button" data-member-search="${escapeHtml(search)}">
        <strong>${escapeHtml(search)}</strong>
        <span>Recent member search</span>
      </button>
    `).join("")
    : renderEmptyState("No recent searches", "Searches will appear here for quick reuse.");
}

function getActivityFilters() {
  const filters = readStoredArray(storageKeys.activityFilters, []);
  return filters.length ? new Set(filters) : new Set(["all"]);
}

function setActivityFilters(filters) {
  const next = Array.from(filters || []).filter(Boolean);
  writeStoredArray(storageKeys.activityFilters, next.length ? next : ["all"]);
  renderActivityFilters();
  renderActivityStream();
}

function toggleActivityFilter(filter) {
  const active = getActivityFilters();
  if (filter === "all") {
    setActivityFilters(new Set(["all"]));
    return;
  }
  active.delete("all");
  if (active.has(filter)) {
    active.delete(filter);
  } else {
    active.add(filter);
  }
  if (!active.size) active.add("all");
  setActivityFilters(active);
}

function renderActivityFilters() {
  const filters = getActivityFilters();
  const options = [
    ["all", "All"],
    ["panel", "Panel edits"],
    ["moderation", "Moderation"],
    ["automod", "AutoMod"],
    ["appeal", "Appeals"]
  ];

  const list = $("#activityFilters");
  if (!list) return;
  list.innerHTML = options.map(([value, label]) => `
    <button class="filter-chip ${filters.has(value) || (value === "all" && filters.has("all")) ? "is-active" : ""}" type="button" data-activity-filter="${value}">
      <strong>${escapeHtml(label)}</strong>
      <span>${filters.has(value) || (value === "all" && filters.has("all")) ? "Showing" : "Hidden"}</span>
    </button>
  `).join("");
}

function applyThemePreset(theme) {
  const selected = themePresets[theme] ? theme : "pastel";
  const preset = themePresets[selected];
  document.body.dataset.theme = selected;
  Object.entries(preset).forEach(([key, value]) => {
    const cssKey = `--${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
    document.documentElement.style.setProperty(cssKey, value);
  });
  localStorage.setItem(storageKeys.themePreset, selected);
  const themeSelect = $("#themeSelect");
  if (themeSelect && themeSelect.value !== selected) {
    themeSelect.value = selected;
  }
}

function setSidebarOpen(open) {
  const next = Boolean(open);
  document.body.classList.toggle("sidebar-open", next);
  localStorage.setItem(storageKeys.sidebarOpen, next ? "true" : "false");
  const toggle = $("#sidebarToggle");
  if (toggle) {
    toggle.setAttribute("aria-expanded", next ? "true" : "false");
  }
}

function syncWorkspacePreset(preset) {
  const selected = preset || "auto";
  localStorage.setItem(storageKeys.workspacePreset, selected);
  const workspaceSelect = $("#workspaceSelect");
  if (workspaceSelect && workspaceSelect.value !== selected) {
    workspaceSelect.value = selected;
  }

  if (selected === "home") {
    setActiveView("overview");
    setActiveSubtab("overview", "summary");
  } else if (selected === "moderation") {
    setActiveView("members");
    setActiveSubtab("members", "moderation");
  } else if (selected === "admin") {
    setActiveView("settings");
    setActiveSubtab("settings", "accounts");
  } else if (selected === "audit") {
    setActiveView("ops");
    setActiveSubtab("ops", "audit");
  }
}

function applyRoleAwareWorkspace() {
  const userKey = state.me?.user?.id || state.me?.user?.username || "guest";
  const accessLevel = state.me?.accessLevel || "mod";
  const autoKey = `${userKey}:${accessLevel}`;
  if (sessionStorage.getItem(storageKeys.workspaceAutoApplied) === autoKey) return;
  const workspacePreset = localStorage.getItem(storageKeys.workspacePreset) || "auto";
  if (workspacePreset !== "auto") return;

  const next = accessLevel === "admin" ? "admin" : "moderation";
  sessionStorage.setItem(storageKeys.workspaceAutoApplied, autoKey);
  const workspaceSelect = $("#workspaceSelect");
  if (workspaceSelect) {
    workspaceSelect.value = "auto";
  }
  if (next === "admin") {
    setActiveView("settings");
    setActiveSubtab("settings", "accounts");
  } else {
    setActiveView("members");
    setActiveSubtab("members", "profile");
  }
}

function setAlert(message, kind = "info") {
  const alert = $("#alert");
  alert.textContent = message;
  alert.classList.toggle("hidden", !message);
  alert.style.borderColor = kind === "error" ? "#ffc7c7" : "#f0cf90";
  alert.style.background = kind === "error" ? "#fff0f0" : "#fff7e8";
  alert.style.color = kind === "error" ? "#8a1f1f" : "#704800";
}

function confirmDangerousAction(action, target, details = "") {
  return window.confirm([action, target, details].filter(Boolean).join("\n"));
}

function parseTemplateLine(line) {
  const parts = String(line || "").split("|").map(part => part.trim());
  if (parts.length < 4) return null;
  let label = "";
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
    action: action.toLowerCase().slice(0, 30),
    duration: duration || "",
    reason: reason.slice(0, 500)
  };
}

function serializeTemplates(templates = []) {
  return templates
    .map(template => `${template.label || ""} | ${template.category || "general"} | ${template.action || "warn"} | ${template.duration || ""} | ${template.reason || ""}`)
    .join("\n");
}

function normalizeTemplates(templates = []) {
  return templates
    .map(template => ({
      label: String(template.label || "").trim().slice(0, 80),
      category: String(template.category || "general").trim().toLowerCase().slice(0, 40),
      action: String(template.action || "warn").trim().toLowerCase().slice(0, 30),
      duration: String(template.duration || "").trim(),
      reason: String(template.reason || "").trim().slice(0, 500)
    }))
    .filter(template => template.label && template.action && template.reason);
}

function getRecentActions() {
  return readStoredJson(storageKeys.recentActions, []);
}

function setRecentActions(items) {
  writeStoredJson(storageKeys.recentActions, items.slice(0, 8));
}

function recordRecentAction(action) {
  const next = [
    {
      ...action,
      createdAt: action.createdAt || new Date().toISOString()
    },
    ...getRecentActions().filter(item => {
      return !(
        item.action === action.action &&
        item.userId === action.userId &&
        item.reason === action.reason &&
        item.duration === action.duration
      );
    })
  ].slice(0, 8);
  setRecentActions(next);
  renderRecentActions();
  renderWorkloadSummary();
}

function readStoredJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "") || fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getAccessLevel() {
  if (state.token) return "admin";
  return state.me?.accessLevel || null;
}

function hasPanelAccess(level = "mod") {
  const access = getAccessLevel();
  if (access === "admin") return true;
  return level === "mod" && access === "mod";
}

function getDefaultView() {
  return hasPanelAccess("admin") ? "overview" : "members";
}

function isViewAllowed(view) {
  if (["settings", "staff", "ops"].includes(view)) {
    return hasPanelAccess("admin");
  }
  return hasPanelAccess("mod");
}

function isAdvancedToolsVisible() {
  return localStorage.getItem(storageKeys.advancedToolsVisible) === "true";
}

function setAdvancedToolsVisible(visible) {
  localStorage.setItem(storageKeys.advancedToolsVisible, visible ? "true" : "false");
  updateAdvancedToolsVisibility();

  if (!visible && advancedViews.has(localStorage.getItem(storageKeys.activeView))) {
    setActiveView(getDefaultView());
  }
}

function updateAdvancedToolsVisibility() {
  const visible = isAdvancedToolsVisible();
  const toggle = $("#advancedToggle");
  const advancedTabs = $("#advancedTabs");
  if (toggle) {
    toggle.textContent = visible ? "Hide advanced tools" : "Show advanced tools";
    toggle.setAttribute("aria-expanded", visible ? "true" : "false");
  }
  if (advancedTabs) advancedTabs.classList.toggle("hidden", !visible);
}

function setActiveView(view) {
  const requestedView = titles[view] ? view : getDefaultView();
  const advancedVisible = isAdvancedToolsVisible();
  const nextView = isViewAllowed(requestedView) && (!advancedViews.has(requestedView) || advancedVisible)
    ? requestedView
    : getDefaultView();
  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.toggle("is-active", tab.dataset.view === nextView);
  });
  document.querySelectorAll(".view").forEach(section => {
    section.classList.toggle("is-active", section.id === `${nextView}View`);
  });
  $("#viewTitle").textContent = titles[nextView];
  localStorage.setItem(storageKeys.activeView, nextView);
  updateViewSubtabs(nextView);
  if (window.matchMedia("(max-width: 980px)").matches) {
    setSidebarOpen(false);
  }
}

function getSubtabStorageKey(view) {
  return `mochiSubtab:${view}`;
}

function getAvailableSubtabs(view) {
  return [...document.querySelectorAll(`[data-subtab-view="${view}"]`)]
    .filter(button => !button.classList.contains("hidden") && !button.disabled)
    .map(button => button.dataset.subtab)
    .filter(Boolean);
}

function getActiveSubtab(view) {
  const available = getAvailableSubtabs(view);
  const stored = localStorage.getItem(getSubtabStorageKey(view));
  if (stored && available.includes(stored)) return stored;
  return available.includes(subtabDefaults[view]) ? subtabDefaults[view] : available[0] || "";
}

function setActiveSubtab(view, subtab) {
  localStorage.setItem(getSubtabStorageKey(view), subtab);
  updateViewSubtabs(view);
}

function updateViewSubtabs(view = localStorage.getItem(storageKeys.activeView) || getDefaultView()) {
  const activeSubtab = getActiveSubtab(view);
  const available = getAvailableSubtabs(view);
  const nextSubtab = available.includes(activeSubtab) ? activeSubtab : available[0] || "";

  if (nextSubtab && nextSubtab !== activeSubtab) {
    localStorage.setItem(getSubtabStorageKey(view), nextSubtab);
  }

  document.querySelectorAll(`[data-subtab-view="${view}"]`).forEach(button => {
    const isActive = button.dataset.subtab === (nextSubtab || activeSubtab);
    button.classList.toggle("is-active", isActive);
  });

  document.querySelectorAll(`[data-view-subtab-group="${view}"]`).forEach(group => {
    const shouldShow = group.dataset.subtab === (nextSubtab || activeSubtab);
    group.classList.toggle("hidden", !shouldShow);
  });
}

function applyAccessRestrictions() {
  const isAdmin = hasPanelAccess("admin");
  const isMod = hasPanelAccess("mod");
  const advancedVisible = isAdvancedToolsVisible();

  document.querySelectorAll("[data-required-access]").forEach(element => {
    const allowed = hasPanelAccess(element.dataset.requiredAccess);
    element.classList.toggle("hidden", !allowed);
    element.querySelectorAll("input, textarea, select, button").forEach(control => {
      control.disabled = !allowed;
    });
  });

  document.querySelectorAll(".tab").forEach(tab => {
    const advancedAllowed = tab.dataset.advanced !== "true" || advancedVisible;
    const allowed = (tab.dataset.requiredAccess ? hasPanelAccess(tab.dataset.requiredAccess) : isMod) && advancedAllowed;
    tab.classList.toggle("hidden", !allowed);
    tab.disabled = !allowed;
  });

  updateAdvancedToolsVisibility();

  if (!isAdmin && ["settings", "staff", "ops"].includes(localStorage.getItem(storageKeys.activeView))) {
    localStorage.setItem(storageKeys.activeView, getDefaultView());
  }

  if (!advancedVisible && advancedViews.has(localStorage.getItem(storageKeys.activeView))) {
    localStorage.setItem(storageKeys.activeView, getDefaultView());
  }

  updateViewSubtabs(localStorage.getItem(storageKeys.activeView) || getDefaultView());
}

function restorePanelMemory() {
  const filters = readStoredJson(storageKeys.caseFilters, {});
  $("#caseFilterUser").value = filters.user || "";
  $("#caseFilterAction").value = filters.action || "";
  $("#caseFilterModerator").value = filters.moderator || "";
  $("#memberSearchInput").value = localStorage.getItem(storageKeys.lastMemberSearch) || "";
  $("#memberAction").value = localStorage.getItem(storageKeys.memberAction) || "warn";
  $("#memberActionDuration").value = localStorage.getItem(storageKeys.memberDuration) || "";
  $("#timelineSearchInput").value = localStorage.getItem(storageKeys.timelineSearch) || "";
  $("#memberChatSearchInput").value = localStorage.getItem(storageKeys.memberChatSearch) || "";
  $("#memberChatChannelFilter").value = localStorage.getItem(storageKeys.memberChatChannelFilter) || "all";
  $("#memberChatDateRange").value = localStorage.getItem(storageKeys.memberChatDateRange) || "7d";
  applyThemePreset(localStorage.getItem(storageKeys.themePreset) || "pastel");
  setSidebarOpen(localStorage.getItem(storageKeys.sidebarOpen) === "true");
  updateAdvancedToolsVisibility();
  const workspacePreset = localStorage.getItem(storageKeys.workspacePreset) || "auto";
  if (workspacePreset && workspacePreset !== "auto") {
    syncWorkspacePreset(workspacePreset);
  } else {
    setActiveView(localStorage.getItem(storageKeys.activeView) || "overview");
  }
}

function persistCaseFilters() {
  writeStoredJson(storageKeys.caseFilters, {
    user: $("#caseFilterUser").value,
    action: $("#caseFilterAction").value,
    moderator: $("#caseFilterModerator").value
  });
}

function updateApiState(label, kind = "") {
  const apiState = $("#apiState");
  apiState.textContent = label;
  apiState.className = `pill ${kind}`.trim();
}

function setLoginVisible(visible, message = "") {
  $("#loginScreen").classList.toggle("hidden", !visible);
  $("#appShell").classList.toggle("hidden", visible);
  if (message) $("#loginStatus").textContent = message;
}

function setLoginBusy(busy) {
  $("#loginScreen").dataset.busy = busy ? "true" : "false";
  $("#loginSaveToken").disabled = busy;
  $("#localLoginButton").disabled = busy;
  $("#loginTokenInput").disabled = busy;
  $("#localUsernameInput").disabled = busy;
  $("#localPasswordInput").disabled = busy;
}

function fillWebAccountForm(account = null) {
  state.webAccountEditing = account ? account.username : null;
  $("#webAccountUsername").value = account?.username || "";
  $("#webAccountAccessLevel").value = account?.accessLevel || "mod";
  $("#webAccountEnabled").value = String(account?.enabled !== false);
  $("#webAccountDiscordUserId").value = account?.discordUserId || "";
  $("#webAccountPassword").value = "";
  $("#webAccountPasswordConfirm").value = "";
  $("#deleteWebAccountButton").disabled = !account;
  $("#resetWebAccountPasswordButton").disabled = !account;
  $("#toggleWebAccountEnabledButton").disabled = !account;
  $("#toggleWebAccountEnabledButton").textContent = account?.enabled === false ? "Enable" : "Disable";
  renderWebAccountAudit(account);
}

function updateAuthPanel() {
  const me = state.me || {};
  const user = me.user;
  const signedInUser = $("#signedInUser");
  const logoutLink = $("#logoutLink");

  if (me.authenticated && user) {
    const methodLabel = me.authMode === "local" ? "personal login" : me.authMode === "token" ? "backup token" : "Discord";
    signedInUser.textContent = `${user.tag || user.username} - ${me.accessLevel} access via ${methodLabel}`;
    logoutLink.classList.remove("hidden");
  } else if (state.token) {
    signedInUser.textContent = "Token access active";
    logoutLink.classList.add("hidden");
  } else if (me.oauthConfigured || me.localLoginConfigured) {
    signedInUser.textContent = me.oauthConfigured && me.localLoginConfigured
      ? "Use Discord or your personal login."
      : me.oauthConfigured
        ? "Use Discord login for staff access."
        : "Use your personal login for staff access.";
    logoutLink.classList.add("hidden");
  } else {
    signedInUser.textContent = "Login options are not configured yet.";
    logoutLink.classList.add("hidden");
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.token}`,
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

function renderMetrics() {
  if (state.loading && !state.dashboard) {
    $("#metricGrid").innerHTML = renderSkeletonCards(8);
    return;
  }
  const counts = state.dashboard?.counts || {};
  const metrics = [
    ["Cases", counts.cases || 0],
    ["Warning Users", counts.warningUsers || 0],
    ["Staff Notes", counts.noteUsers || 0],
    ["AutoMod Hits", state.dashboard?.analytics?.totalDetections || 0],
    ["Birthdays", counts.birthdays || 0],
    ["Banned Words", counts.bannedWords || 0],
    ["Blocked Domains", counts.blockedDomains || 0],
    ["Allowed Domains", counts.allowedDomains || 0],
    ["Temp Bans", counts.tempBans || 0]
  ];

  $("#metricGrid").innerHTML = metrics
    .map(([label, value], index) => `<article class="metric" ${revealStyle(index)}><span>${label}</span><strong>${value}</strong><small>${getMetricHint(label)}</small></article>`)
    .join("");
}

function getMetricHint(label) {
  return {
    Cases: "all recorded actions",
    "Warning Users": "members with warnings",
    "Staff Notes": "members with notes",
    "AutoMod Hits": "detected events",
    Birthdays: "public month/day entries",
    "Banned Words": "filtered terms",
    "Blocked Domains": "denied domains",
    "Allowed Domains": "approved domains",
    "Temp Bans": "scheduled unbans"
  }[label] || "";
}

function renderRuntime() {
  const client = state.dashboard?.client || {};
  const channels = state.dashboard?.channels || {};
  const rows = [
    ["Client", client.tag || "Not ready"],
    ["Ready", client.ready ? "Yes" : "No"],
    ["Ping", `${client.ping || 0}ms`],
    ["Uptime", `${Math.floor((client.uptimeSeconds || 0) / 60)} minutes`],
    ["Verify Channel", channels.verify || "Not set"],
    ["Rules Channel", channels.rules || "Not set"],
    ["General Chat", channels.general || "Not set"],
    ["Affirmations Channel", channels.affirmations || "Not set"],
    ["Log Channel", channels.log || "Not set"],
    ["AutoMod Log", channels.automodLog || "Not set"]
  ];

  $("#runtimeList").innerHTML = rows
    .map(([label, value]) => `<dt>${label}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");

  $("#clientStatus").textContent = client.ready ? client.tag : "Bot not ready";
}

function renderReactionRoleHealth() {
  const health = state.dashboard?.reactionRoles || {};
  const roles = Array.isArray(health.roles) ? health.roles : [];
  const issues = Array.isArray(health.issues) ? health.issues : [];

  $("#reactionRoleHealth").innerHTML = [
    ["Status", health.ready ? "Ready" : "Needs attention"],
    ["Panel", health.panelMessageFound ? "Found" : "Missing"],
    ["Manage Roles", health.botManageRoles ? "Yes" : "No"],
    ["Hierarchy", health.roleHierarchyOk ? "Good" : "Bad"],
    ["Roles Configured", roles.filter(role => role.roleId).length],
    ["Roles Present", roles.filter(role => role.roleExists).length]
  ].map(([label, value], index) => `<article class="summary-item" ${revealStyle(index)}><span>${label}</span><strong>${escapeHtml(value)}</strong></article>`).join("");

  $("#reactionRoleIssues").innerHTML = roles.length
    ? roles.map((role, index) => {
        const warnings = [
          role.roleId ? null : "No role ID",
          role.roleExists ? null : "Role missing",
          role.hierarchyOk ? null : "Role above bot",
          role.reactionPresent ? null : "Reaction missing"
        ].filter(Boolean);

        return `
          <article class="event" ${revealStyle(index)}>
            <strong>${escapeHtml(role.label)} <span class="badge">${escapeHtml(role.emoji)}</span></strong>
            <p>
              Role: ${role.roleId ? escapeHtml(role.roleId) : "Not set"}<br>
              Reaction: ${role.reactionPresent ? "Present" : "Missing"}<br>
              Manageable: ${role.manageable ? "Yes" : "No"}<br>
              ${warnings.length ? `Issues: ${escapeHtml(warnings.join(", "))}` : "Looks good"}
            </p>
          </article>
        `;
      }).join("")
    : renderEmptyState("No reaction roles", "The reaction role mapping is empty.");

  if (!roles.length && issues.length) {
    $("#reactionRoleIssues").innerHTML = issues.map((issue, index) => `
      <article class="event" ${revealStyle(index)}>
        <strong>Setup issue</strong>
        <p>${escapeHtml(issue)}</p>
      </article>
    `).join("");
  } else if (issues.length) {
    $("#reactionRoleIssues").innerHTML += issues.slice(0, 5).map((issue, index) => `
      <article class="event" ${revealStyle(index + roles.length)}>
        <strong>Setup issue</strong>
        <p>${escapeHtml(issue)}</p>
      </article>
    `).join("");
  }
}

function renderRecentViolations() {
  const items = state.dashboard?.analytics?.recentViolations || [];
  if (state.loading && !items.length) {
    $("#recentViolations").innerHTML = renderSkeletonList(4);
    return;
  }
  $("#recentViolations").innerHTML = items.length
    ? items.slice(0, 8).map((item, index) => `
      <article class="event" ${revealStyle(index)}>
        <strong><span class="status-dot red"></span>${escapeHtml(item.action)} - ${escapeHtml(item.userTag)}</strong>
        <p>${escapeHtml(item.reason)}</p>
      </article>
    `).join("")
    : renderEmptyState("No detections", "AutoMod has not recorded recent violations.");
}

function renderQuickActions() {
  const visibleActions = quickActions.filter(action => {
    if (action.adminOnly && !hasPanelAccess("admin")) return false;
    if (action.advanced && !isAdvancedToolsVisible()) return false;
    return true;
  });

  $("#quickActions").innerHTML = visibleActions.map((action, index) => `
    <button class="quick-action" type="button" data-quick-action="${escapeHtml(action.id)}" ${revealStyle(index)}>
      <strong>${escapeHtml(action.title)}</strong>
      <span>${escapeHtml(action.description)}</span>
    </button>
  `).join("");
}

function renderPanelChanges() {
  const panelChanges = state.dashboard?.panelChanges || [];
  $("#panelChangesList").innerHTML = panelChanges.length
    ? panelChanges.map((entry, index) => `
      <article class="event" ${revealStyle(index)}>
        <strong>${escapeHtml(entry.action)} <span class="badge">${escapeHtml(entry.actorTag || "System")}</span></strong>
        <p>${escapeHtml(formatDate(entry.createdAt))}<br>${escapeHtml(JSON.stringify(entry.details || {}))}</p>
      </article>
    `).join("")
    : renderEmptyState("No panel changes", "Recent web panel edits will appear here.");
}

function renderActivityStream() {
  const activeFilters = getActivityFilters();
  const recentActions = getRecentActions().map(item => ({
    kind: "moderation",
    title: item.action || "Moderation action",
    detail: [item.userTag || item.userId || "Unknown", item.reason || "No reason"].filter(Boolean).join(" - "),
    createdAt: item.createdAt || null
  }));
  const panelChanges = (state.dashboard?.panelChanges || []).map(item => ({
    kind: "panel",
    title: item.action || "Panel change",
    detail: JSON.stringify(item.details || {}),
    createdAt: item.createdAt || null,
    actorTag: item.actorTag || "System"
  }));
  const recentViolations = (state.dashboard?.analytics?.recentViolations || []).map(item => ({
    kind: "automod",
    title: item.action || "AutoMod",
    detail: item.reason || "No reason",
    createdAt: item.createdAt || null,
    actorTag: item.userTag || ""
  }));
  const appeals = (state.ops?.appeals || []).slice(-5).reverse().map(item => ({
    kind: "appeal",
    title: `Appeal ${item.status || "open"}`,
    detail: `${item.userTag || item.userId || "Unknown"} - ${item.reason || "No reason"}`,
    createdAt: item.createdAt || null,
    actorTag: item.createdBy || ""
  }));

  const items = [...panelChanges, ...recentViolations, ...recentActions, ...appeals]
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .filter(item => activeFilters.has("all") || activeFilters.has(item.kind))
    .slice(0, 12);

  $("#activityStream").innerHTML = items.length
    ? items.map((item, index) => `
      <article class="event" ${revealStyle(index)}>
        <strong>${escapeHtml(item.title)} <span class="badge">${escapeHtml(item.kind)}</span></strong>
        <p>${escapeHtml(item.actorTag || formatDate(item.createdAt) || "Recent")}<br>${escapeHtml(item.detail || "")}</p>
      </article>
    `).join("")
    : renderEmptyState("No recent activity", "Panel changes, moderation actions, and alerts will appear here.");
}

function renderAttentionBoard() {
  const alerts = [];
  const reactionRoles = state.dashboard?.reactionRoles || {};
  const googleError = state.config?.automod?.googleBlockListLastError;
  const automationIssues = Array.isArray(reactionRoles.issues) ? reactionRoles.issues : [];
  const generalChatChannelId = state.config?.settings?.generalChatChannelId || "";
  const generalRuleEnabled = state.config?.settings?.generalChatInactivityEnabled !== false;

  if (!generalChatChannelId) {
    alerts.push({
      title: "General chat activity check",
      detail: "Set a General chat channel ID in Settings so the two-month inactivity kick rule can run."
    });
  } else if (!generalRuleEnabled) {
    alerts.push({
      title: "General chat inactivity rule paused",
      detail: "The inactivity kick rule is temporarily disabled. Re-enable it when you're ready."
    });
  }

  if (!reactionRoles.ready || !reactionRoles.botManageRoles || !reactionRoles.roleHierarchyOk) {
    alerts.push({
      title: "Reaction roles need attention",
      detail: [
        reactionRoles.panelMessageFound ? "Panel found" : "Panel missing",
        reactionRoles.botManageRoles ? "Manage Roles ok" : "Manage Roles missing",
        reactionRoles.roleHierarchyOk ? "Role hierarchy ok" : "Role hierarchy problem"
      ].join(" - ")
    });
  }

  if (googleError) {
    alerts.push({
      title: "Google block list issue",
      detail: googleError
    });
  }

  if (!state.me?.oauthConfigured && !state.me?.localLoginConfigured && !state.token) {
    alerts.push({
      title: "Login setup incomplete",
      detail: "No personal login options are ready yet."
    });
  }

  if (automationIssues.length) {
    alerts.push({
      title: "Setup items",
      detail: automationIssues.slice(0, 2).join(" - ")
    });
  }

  const pulse = [
    ["Moderation actions", getRecentActions().length],
    ["Recent violations", (state.dashboard?.analytics?.recentViolations || []).length],
    ["Open appeals", (state.ops?.appeals || []).filter(appeal => ["open", "reviewed"].includes(String(appeal.status || "open").toLowerCase())).length],
    ["Saved searches", readStoredArray(storageKeys.recentMemberSearches).length]
  ];

  $("#attentionBoard").innerHTML = `
    <div class="summary-grid">
      ${pulse.map(([label, value], index) => `<article class="summary-item" ${revealStyle(index)}><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("")}
    </div>
    <div class="event-list">
      ${alerts.length
        ? alerts.map((alert, index) => `
          <article class="event" ${revealStyle(index)}>
            <strong>${escapeHtml(alert.title)}</strong>
            <p>${escapeHtml(alert.detail)}</p>
          </article>
        `).join("")
        : renderEmptyState("All calm", "No active attention cards right now.")}
    </div>
  `;
}

function renderGeneralChatRulePanel() {
  const rule = state.dashboard?.generalChatRule || {};
  const enabled = rule.enabled !== false;
  const channelLabel = rule.channelId ? (rule.channelName ? `#${rule.channelName}` : rule.channelId) : "Not set";
  const membersAtRisk = Array.isArray(rule.membersAtRisk) ? rule.membersAtRisk : [];

  $("#generalChatRuleSummary").innerHTML = [
    ["Status", enabled ? "Enabled" : "Disabled"],
    ["Channel", channelLabel],
    ["Notice", `Gentle reminder at ${rule.warningDays || 53} days, kick at ${rule.thresholdDays || 60} days`],
    ["At Risk", rule.atRiskCount ?? membersAtRisk.length ?? 0],
    ["Warnings Due", rule.warningDueCount ?? membersAtRisk.filter(member => member.warningDue).length ?? 0],
    ["Warnings Sent", rule.warningSentCount ?? membersAtRisk.filter(member => member.warningSent).length ?? 0],
    ["Threshold", `${rule.thresholdDays || 60} days`],
    ["Gentle Reminder", `${rule.warningDays || 53} days`],
    ["Last Checked", rule.checkedAt ? formatDate(rule.checkedAt) : "Never"],
    ["Last Run", rule.lastRun?.ranAt ? formatDate(rule.lastRun.ranAt) : "Not yet"]
  ].map(([label, value], index) => `<article class="summary-item" ${revealStyle(index)}><span>${label}</span><strong>${escapeHtml(value)}</strong></article>`).join("");

  $("#toggleGeneralChatRule").textContent = enabled ? "Disable Rule Temporarily" : "Enable Rule";
  $("#runGeneralChatCheck").disabled = !rule.channelId;
  $("#refreshGeneralChatWatchlist").disabled = false;

  if (!rule.channelId) {
    $("#generalChatRiskList").innerHTML = renderEmptyState("No general chat channel", "Set the channel first to see the at-risk list and run the inactivity check.");
    return;
  }

  if (!enabled) {
    $("#generalChatRiskList").innerHTML = renderEmptyState("Rule paused", "Turn the inactivity rule back on to refresh the watchlist and resume kicking inactive members.");
    return;
  }

  if (!membersAtRisk.length) {
    $("#generalChatRiskList").innerHTML = renderEmptyState("All caught up", "Nobody is currently past the two-month activity threshold.");
    return;
  }

  $("#generalChatRiskList").innerHTML = membersAtRisk.map((member, index) => `
    <article class="event" ${revealStyle(index)}>
      <strong>${escapeHtml(member.tag)} <span class="badge">${escapeHtml(member.daysInactive)}d inactive</span>${member.warningSent ? ' <span class="badge">Warning sent</span>' : ''}${member.warningDue ? ' <span class="badge">Warning due</span>' : ''}${member.kickable ? "" : ' <span class="badge">Not kickable</span>'}</strong>
      <p>${escapeHtml(member.lastActiveText || "No activity found")}<br>${escapeHtml(member.userId)}</p>
    </article>
  `).join("");
}

function renderWorkloadSummary() {
  const openAiReviews = (state.cases || []).filter(entry => entry.action === "automod:ai-review" && !state.aiReviews[String(entry.id)]).length;
  const openAppeals = (state.ops?.appeals || []).filter(appeal => ["open", "reviewed"].includes(String(appeal.status || "open").toLowerCase())).length;
  const recentActions = getRecentActions().length;
  const savedFilters = readStoredJson(storageKeys.savedCaseFilters, []).length;
  const panelChanges = state.dashboard?.panelChanges?.length || 0;

  $("#workloadSummary").innerHTML = [
    ["Open AI Reviews", openAiReviews],
    ["Open Appeals", openAppeals],
    ["Recent Actions", recentActions],
    ["Saved Filters", savedFilters],
    ["Panel Changes", panelChanges],
    ["Selected Member", state.selectedMember ? state.selectedMember.tag : "None"],
    ["Quick Templates", (state.ops?.templates || []).length],
    ["Recent Searches", readStoredArray(storageKeys.recentMemberSearches).length]
  ]
    .map(([label, value], index) => `<article class="summary-item" ${revealStyle(index)}><span>${label}</span><strong>${escapeHtml(value)}</strong></article>`)
    .join("");
}

function renderSavedCaseFilters() {
  const filters = readStoredJson(storageKeys.savedCaseFilters, []);
  $("#savedCaseFilters").innerHTML = filters.length
    ? filters.map((filter, index) => `
      <button class="filter-chip" type="button" data-saved-filter-index="${index}">
        <strong>${escapeHtml(filter.name || `Filter ${index + 1}`)}</strong>
        <span>${escapeHtml([filter.user || "", filter.action || "", filter.moderator || ""].filter(Boolean).join(" - ") || "Saved filter")}</span>
      </button>
    `).join("")
    : renderEmptyState("No saved filters", "Save a records filter to reopen it later.");
}

function saveCurrentCaseFilter() {
  const current = {
    name: window.prompt("Name this filter", "Current filter"),
    user: $("#caseFilterUser").value.trim(),
    action: $("#caseFilterAction").value.trim(),
    moderator: $("#caseFilterModerator").value.trim()
  };
  if (!current.name) return;

  const filters = readStoredJson(storageKeys.savedCaseFilters, []);
  const next = [current, ...filters.filter(filter => filter.name !== current.name)].slice(0, 8);
  writeStoredJson(storageKeys.savedCaseFilters, next);
  renderSavedCaseFilters();
  renderWorkloadSummary();
}

function applySavedCaseFilter(index) {
  const filters = readStoredJson(storageKeys.savedCaseFilters, []);
  const filter = filters[index];
  if (!filter) return;
  $("#caseFilterUser").value = filter.user || "";
  $("#caseFilterAction").value = filter.action || "";
  $("#caseFilterModerator").value = filter.moderator || "";
  persistCaseFilters();
  renderRecords();
  setActiveView("records");
}

function renderCommandPaletteList(query = "") {
  const term = query.trim().toLowerCase();
  const searchAction = query.trim()
    ? [{
        kind: "action",
        label: `Search member: ${query.trim()}`,
        value: `search-member:${query.trim()}`
      }]
    : [];
  const templates = (state.ops?.templates || []).map((template, index) => ({
    kind: "template",
    label: `Template: ${template.label || `Template ${index + 1}`}`,
    value: `template:${index}`,
    advanced: true,
    adminOnly: true
  }));
  const savedFilters = readStoredJson(storageKeys.savedCaseFilters, []).map((filter, index) => ({
    kind: "filter",
    label: `Saved filter: ${filter.name || `Filter ${index + 1}`}`,
    value: `filter:${index}`
  }));
  const recentMemberSearches = readStoredArray(storageKeys.recentMemberSearches).slice(0, 5).map(search => ({
    kind: "member-search",
    label: `Recent search: ${search}`,
    value: `search-member:${search}`
  }));
  const recentActions = getRecentActions().slice(0, 5).map((action, index) => ({
    kind: "recent",
    label: `Recent action: ${action.action} ${action.userTag || action.userId || ""}`.trim(),
    value: `recent:${index}`
  }));

  const items = [...searchAction, ...commandPaletteEntries, ...templates, ...savedFilters, ...recentMemberSearches, ...recentActions].filter(entry => {
    if (entry.adminOnly && !hasPanelAccess("admin")) return false;
    if (entry.advanced && !isAdvancedToolsVisible()) return false;
    if (!term) return true;
    return [entry.label, entry.kind, entry.value].join(" ").toLowerCase().includes(term);
  });

  const groups = [
    ["Navigate", items.filter(entry => entry.kind === "view")],
    ["Actions", items.filter(entry => entry.kind !== "view" && !["template", "filter", "member-search", "recent"].includes(entry.kind))],
    ["Templates", items.filter(entry => entry.kind === "template")],
    ["Saved Filters", items.filter(entry => entry.kind === "filter")],
    ["Recent Searches", items.filter(entry => entry.kind === "member-search")],
    ["Recent Actions", items.filter(entry => entry.kind === "recent")]
  ].filter(([, groupItems]) => groupItems.length);

  $("#commandPaletteList").innerHTML = groups.length
    ? groups.map(([label, groupItems]) => `
      <section class="command-group">
        <div class="command-group-head">
          <strong>${escapeHtml(label)}</strong>
          <span class="badge">${escapeHtml(groupItems.length)}</span>
        </div>
        <div class="command-group-items">
          ${groupItems.map(entry => `
            <button class="command-item" type="button" data-command-kind="${escapeHtml(entry.kind)}" data-command-value="${escapeHtml(entry.value)}">
              <strong>${escapeHtml(entry.label)}</strong>
              <span>${escapeHtml(entry.kind === "view" ? "Navigate" : entry.kind === "template" ? "Template" : entry.kind === "filter" ? "Saved filter" : entry.kind === "member-search" ? "Recent search" : entry.kind === "recent" ? "Recent action" : "Action")}</span>
            </button>
          `).join("")}
        </div>
      </section>
    `).join("")
    : renderEmptyState("No matches", "Try a different search.");
}

function openCommandPalette(initialQuery = "") {
  $("#commandPalette").classList.remove("hidden");
  const input = $("#commandPaletteInput");
  input.value = initialQuery;
  renderCommandPaletteList(initialQuery);
  input.focus();
}

function closeCommandPalette() {
  $("#commandPalette").classList.add("hidden");
}

function runPaletteCommand(kind, value) {
  if (kind === "view") {
    const [view, subtab] = String(value || "").split(":");
    setActiveView(view);
    if (subtab) {
      setActiveSubtab(view, subtab);
    }
  } else if (value === "search-member:prompt") {
    const query = window.prompt("Search member by tag, username, mention, or ID");
    if (!query) {
      closeCommandPalette();
      return;
    }
    setActiveView("members");
    $("#memberSearchInput").value = query;
    closeCommandPalette();
    searchMember().catch(error => setAlert(error.message, "error"));
  } else if (value.startsWith("search-member:")) {
    const query = value.slice("search-member:".length).trim();
    if (!query) {
      closeCommandPalette();
      return;
    }
    setActiveView("members");
    $("#memberSearchInput").value = query;
    closeCommandPalette();
    searchMember().catch(error => setAlert(error.message, "error"));
  } else if (value === "new-template") {
    setActiveView("ops");
    if (!state.templateEditorDrafts.length) addTemplateDraft();
  } else if (value === "save-filter") {
    saveCurrentCaseFilter();
    setActiveView("records");
  } else if (value === "clear-recent-actions") {
    clearRecentActions();
  } else if (value.startsWith("preset:")) {
    setActiveView("members");
    applyMemberPreset(value.split(":")[1]);
  } else if (value.startsWith("bulk:")) {
    applyBulkPreset(value.split(":")[1]);
  } else if (value.startsWith("template:")) {
    setActiveView("ops");
    selectTemplateEditorIndex(Number(value.split(":")[1]));
  } else if (value.startsWith("filter:")) {
    setActiveView("records");
    applySavedCaseFilter(Number(value.split(":")[1]));
  } else if (value.startsWith("recent:")) {
    const action = getRecentActions()[Number(value.split(":")[1])];
    if (!action) return closeCommandPalette();
    setActiveView("members");
    $("#memberAction").value = action.action || "warn";
    $("#memberActionReason").value = action.reason || "";
    $("#memberActionDuration").value = action.duration || "";
    localStorage.setItem(storageKeys.memberAction, $("#memberAction").value);
    localStorage.setItem(storageKeys.memberDuration, $("#memberActionDuration").value);
  } else if (value === "open-member-drawer") {
    state.memberDrawerOpen = true;
    renderMemberDrawer();
  } else if (value === "copy-member-id") {
    const memberId = state.selectedMember?.id || window.prompt("Enter a member ID to copy");
    if (memberId) {
      copyToClipboard(memberId).then(copied => {
        setAlert(copied ? "Member ID copied." : "Copy failed.", copied ? "info" : "error");
      });
    }
  } else if (value === "undo-last-member-delete") {
    restoreLastDeletedMemberRecord().catch(error => setAlert(error.message, "error"));
  }
  closeCommandPalette();
}

function renderAutomod() {
  const automod = state.config?.automod || {};

  $("#automodSwitches").innerHTML = Object.entries(automodSwitchLabels)
    .map(([key, label]) => `
      <label class="switch">
        <span>${label}</span>
        <input type="checkbox" data-automod-bool="${key}" ${automod[key] ? "checked" : ""}>
      </label>
    `).join("");

  $("#limitFields").innerHTML = Object.entries(limitLabels)
    .map(([key, label]) => `
      <label>${label}
        <input type="number" data-automod-number="${key}" value="${escapeHtml(automod[key] ?? "")}">
      </label>
    `).join("");

  $("#aiFields").innerHTML = Object.entries(aiModerationLabels)
    .map(([key, label]) => `
      <label>${label}
        <input data-automod-string="${key}" value="${escapeHtml(automod[key] || "")}" placeholder="omni-moderation-latest">
      </label>
    `).join("");

  $("#aiActionFields").innerHTML = Object.entries(aiActionLabels)
    .map(([key, label]) => `
      <label>${label}
        <select data-automod-string="${key}">
          ${aiActionOptions.map(([value, optionLabel]) => `
            <option value="${escapeHtml(value)}" ${String(automod[key] || "review") === value ? "selected" : ""}>${escapeHtml(optionLabel)}</option>
          `).join("")}
        </select>
      </label>
    `).join("");

  $("#aiAdvancedFields").innerHTML = Object.entries(aiNumberLabels)
    .map(([key, label]) => `
      <label>${label}
        <input type="number" data-automod-number="${key}" value="${escapeHtml(automod[key] ?? "")}">
      </label>
    `).join("");

  $("#aiInstructionFields").innerHTML = Object.entries(aiTextareaLabels)
    .map(([key, label]) => `
      <label>${label}
        <textarea data-automod-string="${key}" rows="${key === "aiCustomRules" ? "8" : "5"}">${escapeHtml(automod[key] || "")}</textarea>
      </label>
    `).join("");

  $("#modeFields").innerHTML = Object.entries(modeLabels)
    .map(([key, label]) => {
      if (key === "quietHoursMode") {
        return `
          <label>${label}
            <select data-automod-string="${key}">
              <option value="relaxed" ${String(automod[key] || "relaxed") === "relaxed" ? "selected" : ""}>Relaxed</option>
              <option value="strict" ${String(automod[key] || "relaxed") === "strict" ? "selected" : ""}>Strict</option>
            </select>
          </label>
        `;
      }

      return `
        <label>${label}
          <input data-automod-string="${key}" value="${escapeHtml(automod[key] || "")}" placeholder="22:00">
        </label>
      `;
    }).join("");

  $("#policyFields").innerHTML = Object.entries(policyTextareaLabels)
    .map(([key, label]) => `
      <label>${label}
        <textarea data-automod-string="${key}" rows="6">${escapeHtml(key === "channelRuleOverrides" ? formatChannelRuleOverrides(automod[key]) : (automod[key] || ""))}</textarea>
      </label>
    `).join("");

  $("#listFields").innerHTML = Object.entries(listLabels)
    .map(([key, label]) => `
      <label>${label}
        <textarea data-automod-list="${key}" rows="4">${escapeHtml((automod[key] || []).join(", "))}</textarea>
      </label>
    `).join("");

  $("#durationFields").innerHTML = Object.entries(durationLabels)
    .map(([key, label]) => `
      <label>${label}
        <input data-automod-duration="${key}" value="${escapeHtml(formatDurationInput(automod[key] || 0))}" placeholder="0, 10m, 1h, 7d">
      </label>
    `).join("");

  $("#raidAction").value = automod.raidAction || "log";
  renderAutomodSummary(automod);
  renderGoogleBlockListCard();

  const ruleActions = automod.ruleActions || {};
  const grouped = Object.entries(ruleActions).reduce((acc, [rule, mode]) => {
    acc[mode] = [...(acc[mode] || []), rule];
    return acc;
  }, {});

  $("#alertRules").value = (automod.alertOnlyRules || grouped.alert || []).join(", ");
  $("#warnRules").value = (grouped.warn || []).join(", ");
  $("#timeoutRules").value = (grouped.timeout || []).join(", ");

  $("#previewChannelId").value = state.previewChannelId || "";
  $("#previewMessage").value = state.previewMessage || "";
  renderAutomodPreview();
}

function renderAutomodSummary(automod) {
  const enabledRules = Object.keys(automodSwitchLabels).filter(key => automod[key]).length;
  const totalRules = Object.keys(automodSwitchLabels).length;
  const analytics = state.dashboard?.analytics || {};
  const topRule = Object.entries(analytics.ruleCounts || {}).sort((a, b) => b[1] - a[1])[0];
  const overrideCount = Object.values(automod.channelRuleOverrides || {}).reduce((sum, rules) => sum + (rules || []).length, 0);
  const googleSyncCount = Number(automod.googleBlockListLastCount || 0);
  const summary = [
    ["Enabled", `${enabledRules}/${totalRules}`],
    ["Detections", analytics.totalDetections || 0],
    ["Top Rule", topRule ? `${topRule[0]} (${topRule[1]})` : "None"],
    ["Raid Action", automod.raidAction || "log"],
    ["AI", automod.aiModerationEnabled ? `${automod.aiModerationThreshold || 70}% / ${automod.aiModerationAction || "review"}` : "Off"],
    ["Custom AI", automod.aiCustomRulesEnabled ? `${automod.aiCustomRulesThreshold || 75}% / ${automod.aiCustomRulesAction || "review"}` : "Off"],
    ["Dry Run", automod.dryRunEnabled ? "On" : "Off"],
    ["Profiles", (state.ops?.channelProfiles || "").split("\n").filter(Boolean).length || 0],
    ["Overrides", overrideCount],
    ["Doc Terms", googleSyncCount]
  ];

  $("#automodSummary").innerHTML = summary
    .map(([label, value]) => `<article class="summary-item"><span>${label}</span><strong>${escapeHtml(value)}</strong></article>`)
    .join("");
}

function renderGoogleBlockListCard() {
  const automod = state.config?.automod || {};
  $("#googleBlockListSettingsFields").innerHTML = Object.entries(googleBlockListLabels)
    .map(([key, label]) => {
      if (key === "googleBlockListEnabled") {
        return `
          <label class="switch">
            <span>${label}</span>
            <input type="checkbox" data-automod-bool="${key}" ${automod[key] ? "checked" : ""}>
          </label>
        `;
      }

      if (key === "googleBlockListSyncMinutes") {
        return `
          <label>${label}
            <input type="number" min="5" max="1440" step="5" data-automod-number="${key}" value="${escapeHtml(automod[key] ?? 15)}" placeholder="15">
          </label>
        `;
      }

      return `
        <label>${label}
          <input data-automod-string="${key}" value="${escapeHtml(automod[key] || "")}" placeholder="https://docs.google.com/document/d/...">
        </label>
      `;
    }).join("");

  const lastSyncedAt = automod.googleBlockListLastSyncedAt ? formatDate(automod.googleBlockListLastSyncedAt) : "Never";
  const lastError = automod.googleBlockListLastError ? automod.googleBlockListLastError : "None";
  const count = Number(automod.googleBlockListLastCount || 0);

  $("#googleBlockListStatus").innerHTML = [
    ["Enabled", automod.googleBlockListEnabled ? "Yes" : "No"],
    ["Terms", count],
    ["Last Sync", lastSyncedAt],
    ["Last Error", lastError]
  ].map(([label, value]) => `<article class="summary-item"><span>${label}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
}

function formatChannelRuleOverrides(overrides) {
  if (!overrides || typeof overrides !== "object") return "";
  return Object.entries(overrides)
    .map(([channelId, rules]) => `${channelId}: ${(rules || []).join(", ")}`)
    .join("\n");
}

function renderAutomodPreview() {
  const preview = state.automodPreview;
  if (!preview) {
    $("#automodPreviewResult").innerHTML = renderEmptyState("No preview", "Enter a sample message and run a preview.");
    return;
  }

  const match = preview.match || {};
  const rule = match.actionLabel || "none";
  const rules = (preview.allMatches || []).map(item => item.actionLabel).filter(Boolean);
  $("#automodPreviewResult").innerHTML = `
    <article class="event">
      <strong>${escapeHtml(preview.profile?.selector || preview.channelName || preview.channelId || "Preview")}</strong>
      <p>
        Match: ${escapeHtml(rule)}<br>
        Reason: ${escapeHtml(match.reason || "No trigger")}<br>
        Quiet hours: ${preview.quietHoursActive ? "Yes" : "No"}<br>
        Dry run: ${preview.dryRun ? "Yes" : "No"}<br>
        Ignored rules: ${escapeHtml((preview.ignoredRules || []).join(", ") || "None")}<br>
        All matches: ${escapeHtml(rules.join(", ") || "None")}
      </p>
      ${match.actionLabel ? `
        <div class="button-row">
          <button class="ghost-button" type="button" data-preview-override="rule" data-rule-key="${escapeHtml(match.actionLabel)}">Ignore rule in channel</button>
          <button class="ghost-button" type="button" data-preview-override="channel">Allow channel</button>
        </div>
      ` : ""}
    </article>
  `;
}

function renderSettings() {
  const settings = state.config?.settings || {};
  const automod = state.config?.automod || {};

  $("#generalSettingsFields").innerHTML = Object.entries(settingLabels)
    .map(([key, label]) => {
      if (key === "generalChatInactivityEnabled") {
        return `
          <label>${label}
            <select data-setting="${key}">
              <option value="true" ${String(settings[key] ?? true) === "true" ? "selected" : ""}>On</option>
              <option value="false" ${String(settings[key] ?? true) === "false" ? "selected" : ""}>Off</option>
            </select>
          </label>
        `;
      }

      return `
        <label>${label}
          <input data-setting="${key}" value="${escapeHtml(settings[key] || "")}" placeholder="${key === "tiktokHandle" ? "Paste @yourhandle or tiktok.com/@yourhandle" : (key === "welcomeChannelId" || key === "generalChatChannelId" || key === "anonymousAffirmationsChannelId" ? "Channel ID" : "")}">
        </label>
      `;
    }).join("");

  $("#affirmationsSettingsFields").innerHTML = Object.entries(affirmationsSettingLabels)
    .map(([key, label]) => {
      if (key === "anonymousAffirmationsEnabled") {
        return `
          <label>${label}
            <select data-setting="${key}">
              <option value="true" ${String(settings[key] ?? true) === "true" ? "selected" : ""}>On</option>
              <option value="false" ${String(settings[key] ?? true) === "false" ? "selected" : ""}>Off</option>
            </select>
          </label>
        `;
      }

      const placeholder = key === "anonymousAffirmationsCooldownMs" ? "60000" : "Channel ID";
      const type = key === "anonymousAffirmationsCooldownMs" ? 'type="number" min="5000" step="1000"' : "";
      return `
        <label>${label}
          <input data-setting="${key}" ${type} value="${escapeHtml(settings[key] || "")}" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="${placeholder}">
        </label>
      `;
    }).join("");

  renderSettingFields("#verificationCoreFields", verificationCoreSettingLabels, verificationCoreSettingTypes);
  renderSettingFields("#rulesCardFields", rulesCardSettingLabels, rulesCardSettingTypes);
  renderSettingFields("#verificationBonusFields", verificationBonusSettingLabels, verificationBonusSettingTypes);

  $("#birthdaySettingsFields").innerHTML = Object.entries(birthdaySettingLabels)
    .map(([key, label]) => `
      <label>${label}
        <input data-setting="${key}" value="${escapeHtml(settings[key] || "")}" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="Role or channel ID">
      </label>
    `).join("");

  const birthdayUpcoming = Array.isArray(state.config?.birthdays?.upcoming) ? state.config.birthdays.upcoming : [];
  $("#birthdayUpcomingList").innerHTML = birthdayUpcoming.length
    ? birthdayUpcoming.map((entry, index) => `
      <article class="event" ${revealStyle(index)}>
        <strong><span class="badge">${escapeHtml(formatDate(entry.nextBirthday))}</span> <span class="badge">${escapeHtml(formatBirthdayMonthDay(entry.month, entry.day))}</span></strong>
        <p>
          User: <code>${escapeHtml(entry.userId)}</code><br>
          Public: ${entry.public ? "Yes" : "No"}
        </p>
      </article>
    `).join("")
    : renderEmptyState("No birthdays saved", "Use the birthday panel button or /birthday to add a public birthday.");

  $("#privacySettingsFields").innerHTML = Object.entries(privacySettingLabels)
    .map(([key, label]) => {
      if (key === "messageArchiveEnabled") {
        return `
          <label>${label}
            <select data-setting="${key}">
              <option value="true" ${String(settings[key] ?? true) === "true" ? "selected" : ""}>On</option>
              <option value="false" ${String(settings[key] ?? true) === "false" ? "selected" : ""}>Off</option>
            </select>
          </label>
        `;
      }

      return `
        <label>${label}
          <input type="number" min="1" max="3650" step="1" data-setting="${key}" value="${escapeHtml(settings[key] ?? 30)}" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="30">
        </label>
      `;
    }).join("");

  $("#exemptChannelIds").value = (automod.exemptChannelIds || []).join(", ");
  $("#exemptRoleIds").value = (automod.exemptRoleIds || []).join(", ");
  $("#exemptUserIds").value = (automod.exemptUserIds || []).join(", ");
  renderWebAccounts();
}

function renderWebAccounts() {
  const accounts = Array.isArray(state.webAccounts) ? state.webAccounts : [];
  const list = $("#webAccountsList");
  if (!list) return;

  if (!hasPanelAccess("admin")) {
    list.innerHTML = renderEmptyState("Admins only", "Web accounts are visible to admins.");
    return;
  }

  if (!accounts.length) {
    list.innerHTML = renderEmptyState("No web accounts", "Create the first personal login above.");
    return;
  }

  list.innerHTML = accounts
    .map(account => `
      <article class="event">
        <strong>${escapeHtml(account.username)} <span class="badge">${escapeHtml(account.accessLevel)}</span>${account.enabled ? "" : ' <span class="badge">Disabled</span>'}</strong>
        <p>
          Discord: ${account.discordUserId ? escapeHtml(account.discordUserId) : "Not linked"}<br>
          Password: ${account.hasPassword ? "Set" : "Missing"}<br>
          Audit trail: ${escapeHtml(account.loginAuditCount || 0)} entries<br>
          Last login: ${account.lastLoginAt ? escapeHtml(formatDate(account.lastLoginAt)) : "Never"}<br>
          Login method: ${account.lastLoginMode || "None"}
        </p>
        <div class="button-row">
          <button class="ghost-button" type="button" data-web-account-edit="${escapeHtml(account.username)}">Edit</button>
          <button class="ghost-button" type="button" data-web-account-toggle="${escapeHtml(account.username)}" data-web-account-enabled="${account.enabled ? "false" : "true"}">${account.enabled ? "Disable" : "Enable"}</button>
          <button class="ghost-button" type="button" data-web-account-reset="${escapeHtml(account.username)}">Reset Password</button>
        </div>
      </article>
    `)
    .join("");

  if (state.webAccountEditing) {
    const account = accounts.find(item => item.username === state.webAccountEditing) || null;
    if (account) {
      renderWebAccountAudit(account);
    }
  }
}

function renderWebAccountAudit(account = null) {
  const list = $("#webAccountAuditList");
  if (!list) return;

  if (!hasPanelAccess("admin")) {
    list.innerHTML = renderEmptyState("Admins only", "Login audits are visible to admins.");
    return;
  }

  if (!account) {
    list.innerHTML = renderEmptyState("No account selected", "Pick an account to see its login history.");
    return;
  }

  const auditEntries = Array.isArray(account.loginAudit) ? [...account.loginAudit].reverse() : [];
  if (!auditEntries.length) {
    list.innerHTML = renderEmptyState("No login history", "This account has not signed in yet.");
    return;
  }

  list.innerHTML = auditEntries.map(entry => {
    const label = entry.mode === "discord"
      ? "Discord login"
      : entry.mode === "password"
        ? "Personal login"
        : entry.mode === "token"
          ? "Backup token"
          : "Login";
    return `
      <article class="event">
        <strong>${escapeHtml(label)} <span class="badge">${escapeHtml(formatDate(entry.createdAt))}</span></strong>
        <p>
          Source: ${escapeHtml(entry.source || "Account login")}<br>
          ${entry.note ? `Note: ${escapeHtml(entry.note)}` : "No note"}
        </p>
      </article>
    `;
  }).join("");
}

function collectSettingsPayload(allowedKeys = null) {
  const payload = {};
  document.querySelectorAll("[data-setting]").forEach(input => {
    if (!allowedKeys || allowedKeys.includes(input.dataset.setting)) {
      payload[input.dataset.setting] = input.value;
    }
  });
  return payload;
}

function renderSettingFields(targetSelector, entries, types = {}) {
  const target = $(targetSelector);
  if (!target) return;
  target.innerHTML = Object.entries(entries)
    .map(([key, label]) => `
      <label>${label}
        ${types[key] === "boolean"
          ? `<select data-setting="${key}">
              <option value="true" ${(state.config?.settings?.[key] ?? false) === true || String(state.config?.settings?.[key]) === "true" ? "selected" : ""}>On</option>
              <option value="false" ${(state.config?.settings?.[key] ?? false) === false || String(state.config?.settings?.[key]) === "false" ? "selected" : ""}>Off</option>
            </select>`
          : types[key] === "textarea"
          ? `<textarea data-setting="${key}" rows="4" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="${key === "tiktokNicknameAliases" ? "Paste @name, tiktok.com/@name, or multiple names separated by commas or new lines" : ""}">${escapeHtml(Array.isArray(state.config?.settings?.[key]) ? state.config.settings[key].join(", ") : (state.config?.settings?.[key] || ""))}</textarea>`
          : `<input data-setting="${key}" value="${escapeHtml(Array.isArray(state.config?.settings?.[key]) ? state.config.settings[key].join(", ") : (state.config?.settings?.[key] || ""))}" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="${key === "tiktokHandle" ? "Paste @yourhandle or tiktok.com/@yourhandle" : ""}">`}
      </label>
    `).join("");
}

function renderStaff() {
  const permissions = state.config?.permissions || {};
  const modRoleIds = permissions.modRoleIds || [];
  const adminRoleIds = permissions.adminRoleIds || [];
  $("#modRoleIds").value = modRoleIds.join(", ");
  $("#adminRoleIds").value = adminRoleIds.join(", ");

  const items = [
    ["Moderator Roles", modRoleIds.length ? modRoleIds.length : "Default permissions"],
    ["Admin Roles", adminRoleIds.length ? adminRoleIds.length : "Administrator"],
    ["Signed In", state.me?.accessLevel || "Locked"],
    ["Token Fallback", state.me?.tokenFallbackEnabled ? "Enabled" : "Off"]
  ];

  $("#staffSummary").innerHTML = items
    .map(([label, value]) => `<article class="summary-item"><span>${label}</span><strong>${escapeHtml(value)}</strong></article>`)
    .join("");
}

function renderOps() {
  const ops = state.ops || {};
  const templates = ops.templates || [];
  const storedTemplateDrafts = readStoredJson(storageKeys.templateEditorDrafts, null);
  state.templateEditorDrafts = Array.isArray(storedTemplateDrafts) && storedTemplateDrafts.length
    ? normalizeTemplates(storedTemplateDrafts)
    : normalizeTemplates(templates);
  state.templateEditorIndex = Math.min(
    Number(localStorage.getItem(storageKeys.templateEditorIndex) || 0),
    Math.max(0, state.templateEditorDrafts.length - 1)
  );
  syncTemplateEditorTextarea();
  renderTemplateEditor();
  $("#channelProfiles").value = ops.channelProfiles || "";
  $("#reportEnabled").value = ops.reportSettings?.enabled ? "true" : "false";
  $("#reportChannelId").value = ops.reportSettings?.channelId || "";
  $("#reportFrequency").value = ops.reportSettings?.frequency || "daily";
  $("#appealStatusFilter").value = localStorage.getItem(storageKeys.appealFilter) || "open";
  $("#auditFilterInput").value = localStorage.getItem(storageKeys.auditFilter) || "";

  $("#riskLeaderboard").innerHTML = (ops.riskUsers || []).length
    ? ops.riskUsers.map(user => `
      <article class="event risk-${escapeHtml(user.level || "clear")}">
        <strong>${escapeHtml(user.tag)} <span class="badge">${escapeHtml(user.level)}</span> <span class="badge">${escapeHtml(user.score)}</span></strong>
        <p>Strikes: ${escapeHtml(user.strikes)}<br>Warnings: ${escapeHtml(user.warnings)} | Cases: ${escapeHtml(user.cases)} | AI flags: ${escapeHtml(user.aiFlags)}</p>
      </article>
    `).join("")
    : renderEmptyState("No risk signals", "No members have risk signals yet.");

  const appealFilter = ($("#appealStatusFilter").value || "open").trim().toLowerCase();
  const appeals = (ops.appeals || []).filter(appeal => {
    if (appealFilter === "all") return true;
    return String(appeal.status || "open").toLowerCase() === appealFilter;
  });

  $("#appealsList").innerHTML = appeals.length
    ? appeals.slice().reverse().map(appeal => `
      <article class="event">
        <strong>#${escapeHtml(appeal.id)} ${escapeHtml(appeal.userTag || appeal.userId)} <span class="badge">${escapeHtml(appeal.status || "open")}</span></strong>
        <p>${escapeHtml(appeal.reason || "No appeal reason")}<br>${escapeHtml(formatDate(appeal.createdAt))}<br>Created by ${escapeHtml(appeal.createdBy || "Unknown")}</p>
        <div class="button-row">
          <button class="ghost-button" type="button" data-appeal-status="reviewed" data-appeal-id="${escapeHtml(appeal.id)}">Review</button>
          <button class="ghost-button" type="button" data-appeal-status="approved" data-appeal-id="${escapeHtml(appeal.id)}">Approve</button>
          <button class="ghost-button" type="button" data-appeal-status="rejected" data-appeal-id="${escapeHtml(appeal.id)}">Reject</button>
          <button class="save-button" type="button" data-appeal-status="closed" data-appeal-id="${escapeHtml(appeal.id)}">Close</button>
        </div>
      </article>
    `).join("")
    : renderEmptyState("No appeals", "No appeal records match this filter.");

  const auditFilter = ($("#auditFilterInput").value || "").trim().toLowerCase();
  const auditEntries = (ops.auditLog || []).filter(entry => {
    if (!auditFilter) return true;
    const haystack = [entry.action, entry.actorTag, JSON.stringify(entry.details || {})].join(" ").toLowerCase();
    return haystack.includes(auditFilter);
  });

  $("#auditLogList").innerHTML = auditEntries.length
    ? auditEntries.slice(0, 80).map(entry => `
      <article class="event">
        <strong>${escapeHtml(entry.action)} <span class="badge">${escapeHtml(entry.actorTag || "System")}</span></strong>
        <p>${escapeHtml(formatDate(entry.createdAt))}<br>${escapeHtml(JSON.stringify(entry.details || {}))}</p>
      </article>
    `).join("")
    : renderEmptyState("No audit events", "No audit events match this filter.");
}

function syncTemplateEditorTextarea() {
  $("#modTemplates").value = serializeTemplates(state.templateEditorDrafts);
}

function persistTemplateEditorDrafts() {
  writeStoredJson(storageKeys.templateEditorDrafts, state.templateEditorDrafts);
  localStorage.setItem(storageKeys.templateEditorIndex, String(state.templateEditorIndex));
}

function clearTemplateEditorDrafts() {
  localStorage.removeItem(storageKeys.templateEditorDrafts);
}

function getSelectedTemplateDraft() {
  return state.templateEditorDrafts[state.templateEditorIndex] || null;
}

function updateSelectedTemplateDraft(field, value) {
  const template = getSelectedTemplateDraft();
  if (!template) return;
  template[field] = value;
  state.templateEditorDrafts = [...state.templateEditorDrafts];
  syncTemplateEditorTextarea();
  persistTemplateEditorDrafts();
}

function selectTemplateEditorIndex(index) {
  state.templateEditorIndex = Math.max(0, Math.min(index, Math.max(0, state.templateEditorDrafts.length - 1)));
  localStorage.setItem(storageKeys.templateEditorIndex, String(state.templateEditorIndex));
  persistTemplateEditorDrafts();
  renderTemplateEditor();
}

function addTemplateDraft() {
  state.templateEditorDrafts = [
    ...state.templateEditorDrafts,
    { label: "New template", category: "general", action: "warn", duration: "", reason: "" }
  ];
  selectTemplateEditorIndex(state.templateEditorDrafts.length - 1);
  syncTemplateEditorTextarea();
  persistTemplateEditorDrafts();
}

function deleteTemplateDraft() {
  if (!state.templateEditorDrafts.length) return;
  state.templateEditorDrafts = state.templateEditorDrafts.filter((_, index) => index !== state.templateEditorIndex);
  state.templateEditorIndex = Math.max(0, Math.min(state.templateEditorIndex, state.templateEditorDrafts.length - 1));
  localStorage.setItem(storageKeys.templateEditorIndex, String(state.templateEditorIndex));
  syncTemplateEditorTextarea();
  persistTemplateEditorDrafts();
  renderTemplateEditor();
}

function duplicateTemplateDraft() {
  const template = getSelectedTemplateDraft();
  if (!template) return;
  state.templateEditorDrafts = [
    ...state.templateEditorDrafts,
    { ...template, label: `${template.label || "Template"} copy` }
  ];
  selectTemplateEditorIndex(state.templateEditorDrafts.length - 1);
  syncTemplateEditorTextarea();
  persistTemplateEditorDrafts();
}

function renderTemplateEditor() {
  const templates = state.templateEditorDrafts || [];
  $("#templateList").innerHTML = templates.length
    ? templates.map((template, index) => `
      <button class="template-item ${index === state.templateEditorIndex ? "is-active" : ""}" type="button" data-template-edit-index="${index}">
        <strong>${escapeHtml(template.label || `Template ${index + 1}`)}</strong>
        <span>${escapeHtml(template.category || "general")} - ${escapeHtml(template.action || "warn")} ${escapeHtml(template.duration || "")}</span>
      </button>
    `).join("")
    : renderEmptyState("No templates", "Add one to create a reusable moderation shortcut.");

  const template = getSelectedTemplateDraft();
  $("#templateEditorFields").innerHTML = template ? `
    <div class="template-fields">
      <label>Label
        <input data-template-field="label" value="${escapeHtml(template.label || "")}" placeholder="Spam raid">
      </label>
      <label>Category
        <select data-template-field="category">
          ${templateCategories.map(category => `<option value="${category.value}" ${template.category === category.value ? "selected" : ""}>${escapeHtml(category.label)}</option>`).join("")}
        </select>
      </label>
      <label>Action
        <select data-template-field="action">
          <option value="warn" ${template.action === "warn" ? "selected" : ""}>Warn</option>
          <option value="note" ${template.action === "note" ? "selected" : ""}>Note</option>
          <option value="timeout" ${template.action === "timeout" ? "selected" : ""}>Timeout</option>
          <option value="mute" ${template.action === "mute" ? "selected" : ""}>Mute</option>
          <option value="kick" ${template.action === "kick" ? "selected" : ""}>Kick</option>
          <option value="ban" ${template.action === "ban" ? "selected" : ""}>Ban</option>
          <option value="tempban" ${template.action === "tempban" ? "selected" : ""}>Tempban</option>
        </select>
      </label>
      <label>Duration
        <input data-template-field="duration" value="${escapeHtml(template.duration || "")}" placeholder="10m, 2h, 1d">
      </label>
      <label>Reason
        <textarea data-template-field="reason" rows="5" placeholder="Moderation reason">${escapeHtml(template.reason || "")}</textarea>
      </label>
      <div class="button-row">
        <button class="ghost-button" type="button" data-template-action="duplicate">Duplicate</button>
      </div>
      <p class="panel-note">Changes save into the operations template list when you click Save.</p>
    </div>
  ` : renderEmptyState("Select a template", "Pick one from the list or add a new template.");
}

function renderRecentActions() {
  const actions = getRecentActions();
  $("#recentActionsList").innerHTML = actions.length
    ? actions.map(action => `
      <article class="event">
        <strong>${escapeHtml(action.action)} <span class="badge">${escapeHtml(action.userTag || action.userId || "Unknown")}</span></strong>
        <p>${escapeHtml(action.reason || "No reason")}<br>${escapeHtml(action.duration || "No duration")}<br>${escapeHtml(formatDate(action.createdAt))}</p>
        <div class="button-row">
          <button class="ghost-button" type="button" data-recent-action-load="${escapeHtml(action.action)}" data-recent-action-id="${escapeHtml(action.userId || "")}" data-recent-action-reason="${escapeHtml(action.reason || "")}" data-recent-action-duration="${escapeHtml(action.duration || "")}">Load</button>
        </div>
      </article>
    `).join("")
    : renderEmptyState("No recent actions", "Applied moderation actions will appear here for quick reuse.");
}

function renderEditableMemberRecords(kind, entries) {
  const label = kind === "warning" ? "Warning" : "Note";
  return entries.length
    ? entries.map(entry => `
      <article class="event" data-member-record-kind="${kind}" data-member-record-index="${escapeHtml(entry.index)}">
        <strong>${escapeHtml(label)} <span class="badge">${escapeHtml(entry.moderatorTag || "System")}</span></strong>
        <textarea data-member-record-text="${kind}" rows="3">${escapeHtml(kind === "warning" ? entry.reason || "" : entry.content || "")}</textarea>
        <p class="recent-action-meta">${escapeHtml(formatDate(entry.createdAt))}${entry.editedBy ? `<br>Edited by ${escapeHtml(entry.editedBy)}${entry.editedAt ? ` - ${escapeHtml(formatDate(entry.editedAt))}` : ""}` : ""}</p>
        <div class="button-row">
          <button class="ghost-button" type="button" data-member-record-save="${kind}" data-member-record-index="${escapeHtml(entry.index)}">Save</button>
          <button class="ghost-button" type="button" data-member-record-delete="${kind}" data-member-record-index="${escapeHtml(entry.index)}">Delete</button>
        </div>
      </article>
    `).join("")
    : renderEmptyState(`No ${label.toLowerCase()}s`, `This member has no saved ${label.toLowerCase()} records.`);
}

async function saveMemberRecord(kind, index, mode = "update") {
  if (!state.selectedMember) {
    setAlert("Search for a member first.", "error");
    return;
  }

  const textarea = document.querySelector(`[data-member-record-kind="${kind}"][data-member-record-index="${index}"] [data-member-record-text="${kind}"]`);
  const content = textarea?.value.trim() || "";
  const body = {
    userId: state.selectedMember.id,
    kind,
    index,
    mode
  };

  if (mode !== "delete" && !content) {
    setAlert(`Enter text before saving that ${kind}.`, "error");
    return;
  }

  if (kind === "warning") {
    body.reason = content;
  } else {
    body.content = content;
  }

  if (mode === "delete" && !confirmDangerousAction(`Delete this ${kind}?`, state.selectedMember.tag)) {
    return;
  }

  const result = await api("/api/member-record", {
    method: "POST",
    body: JSON.stringify(body)
  });

  if (mode === "delete" && result.deletedRecord) {
    state.lastDeletedMemberRecord = {
      userId: state.selectedMember.id,
      kind,
      index: result.deletedIndex ?? index,
      record: result.deletedRecord
    };
  }

  state.selectedMember = result.member;
  await loadAll();
  setAlert(`${kind === "warning" ? "Warning" : "Note"} ${mode === "delete" ? "deleted" : "saved"}.`);
}

async function restoreLastDeletedMemberRecord() {
  const snapshot = state.lastDeletedMemberRecord;
  if (!snapshot || !state.selectedMember || snapshot.userId !== state.selectedMember.id) {
    setAlert("There is no deleted record to restore for this member.", "error");
    return;
  }

  const result = await api("/api/member-record", {
    method: "POST",
    body: JSON.stringify({
      userId: snapshot.userId,
      kind: snapshot.kind,
      index: snapshot.index,
      mode: "restore",
      record: snapshot.record
    })
  });

  state.lastDeletedMemberRecord = null;
  state.selectedMember = result.member;
  await loadAll();
  setAlert(`Restored the deleted ${snapshot.kind}.`);
}

function clearRecentActions() {
  localStorage.removeItem(storageKeys.recentActions);
  renderRecentActions();
  renderWorkloadSummary();
}

function renderTemplates() {
  const templates = state.ops?.templates || [];
  $("#memberTemplate").innerHTML = `<option value="">No template</option>` + templates.map((item, index) =>
    `<option value="${index}">${escapeHtml(item.label || `Template ${index + 1}`)}${item.category ? ` (${escapeHtml(item.category)})` : ""}</option>`
  ).join("");
}

function renderRecords() {
  const filteredCases = getFilteredCases();
  const warningUsers = Object.keys(state.warnings || {}).length;
  const noteUsers = Object.keys(state.notes || {}).length;
  const totalCases = (state.cases || []).length;
  $("#recordsSummary").innerHTML = [
    ["Cases", totalCases],
    ["Warnings", warningUsers],
    ["Notes", noteUsers],
    ["Visible", filteredCases.length]
  ].map(([label, value], index) => `<article class="summary-item" ${revealStyle(index)}><span>${label}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  $("#casesTable").innerHTML = filteredCases.slice(0, 120).map(entry => `
    <tr>
      <td>${escapeHtml(entry.id || "")}</td>
      <td>${escapeHtml(entry.action || "")}</td>
      <td>${escapeHtml(entry.targetTag || entry.targetId || "")}</td>
      <td>${escapeHtml(entry.moderatorTag || "")}</td>
      <td>${escapeHtml(entry.reason || "")}</td>
    </tr>
  `).join("") || `<tr><td colspan="5">No cases saved.</td></tr>`;

  $("#warningsList").innerHTML = renderRecordMap(state.warnings, "warning");
  $("#timelineList").innerHTML = renderTimeline(filteredCases);
}

function getCaseDetail(entry, name) {
  return (entry.details || []).find(detail => detail.name === name)?.value || "";
}

function renderAiReview() {
  const statuses = state.aiReviews || {};
  const aiCases = (state.cases || [])
    .filter(entry => entry.action === "automod:ai-review" && !statuses[String(entry.id)])
    .slice(0, 80);

  $("#aiReviewList").innerHTML = aiCases.length
    ? aiCases.map(entry => {
        const category = getCaseDetail(entry, "AI Category");
        const confidence = getCaseDetail(entry, "AI Confidence");
        const channel = getCaseDetail(entry, "Channel");
        const message = getCaseDetail(entry, "Message");
        return `
          <article class="event ai-review-card" data-ai-case-id="${escapeHtml(entry.id)}">
            <strong>#${escapeHtml(entry.id)} ${escapeHtml(entry.targetTag || entry.targetId)} <span class="badge">${escapeHtml(category || "AI")}</span> <span class="badge">${escapeHtml(confidence || "")}</span></strong>
            <p>${escapeHtml(formatDate(entry.createdAt))}<br>${escapeHtml(entry.reason || "No reason")}<br>${escapeHtml(channel)}</p>
            <p>${escapeHtml(message || "No message text")}</p>
            <div class="ai-review-actions">
              <input data-ai-reason="${escapeHtml(entry.id)}" placeholder="Reason or note">
              <input data-ai-duration="${escapeHtml(entry.id)}" placeholder="Timeout duration" value="10m">
              <button class="ghost-button" type="button" data-ai-action="dismiss" data-case-id="${escapeHtml(entry.id)}">Dismiss</button>
              <button class="ghost-button" type="button" data-ai-action="note" data-case-id="${escapeHtml(entry.id)}">Note</button>
              <button class="ghost-button" type="button" data-ai-action="warn" data-case-id="${escapeHtml(entry.id)}">Warn</button>
              <button class="save-button" type="button" data-ai-action="timeout" data-case-id="${escapeHtml(entry.id)}">Timeout</button>
            </div>
          </article>
        `;
      }).join("")
    : renderEmptyState("No AI reviews", "AI moderation has not flagged any messages.");
}

async function applyAiReviewAction(caseId, reviewAction) {
  const reason = document.querySelector(`[data-ai-reason="${caseId}"]`)?.value.trim() || "";
  const duration = document.querySelector(`[data-ai-duration="${caseId}"]`)?.value.trim() || "10m";
  const actionLabel = reviewAction === "dismiss" ? "dismiss" : reviewAction;

  if (["warn", "timeout"].includes(reviewAction) && !reason) {
    setAlert("Enter a reason before applying that AI review action.", "error");
    return;
  }

  if (reviewAction === "timeout" && !duration) {
    setAlert("Enter a timeout duration like 10m, 2h, or 1d.", "error");
    return;
  }

  if (["warn", "timeout"].includes(reviewAction) && !window.confirm(`Apply ${actionLabel} from AI review case #${caseId}?`)) {
    return;
  }

  const result = await api("/api/ai-review-action", {
    method: "POST",
    body: JSON.stringify({ caseId, reviewAction, reason, duration })
  });

  state.aiReviews = result.aiReviews || state.aiReviews;
  await loadAll();
  setAlert(`AI review case #${caseId} marked ${reviewAction}.`);
}

function formatDate(value) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString();
}

function formatBirthdayMonthDay(month, day) {
  const nextMonth = Number(month);
  const nextDay = Number(day);
  if (!Number.isFinite(nextMonth) || !Number.isFinite(nextDay)) return "Unknown";
  return `${String(nextMonth).padStart(2, "0")}/${String(nextDay).padStart(2, "0")}`;
}

function formatDurationInput(milliseconds) {
  const value = Number(milliseconds || 0);
  if (!value) return "0";
  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  const minute = 60 * 1000;
  if (value % day === 0) return `${value / day}d`;
  if (value % hour === 0) return `${value / hour}h`;
  if (value % minute === 0) return `${value / minute}m`;
  return `${Math.floor(value / 1000)}s`;
}

function getFilteredCases() {
  const userFilter = ($("#caseFilterUser")?.value || "").trim().toLowerCase();
  const actionFilter = ($("#caseFilterAction")?.value || "").trim().toLowerCase();
  const moderatorFilter = ($("#caseFilterModerator")?.value || "").trim().toLowerCase();

  return (state.cases || []).filter(entry => {
    const targetText = `${entry.targetTag || ""} ${entry.targetId || ""}`.toLowerCase();
    const actionText = String(entry.action || "").toLowerCase();
    const moderatorText = String(entry.moderatorTag || "").toLowerCase();
    return (!userFilter || targetText.includes(userFilter)) &&
      (!actionFilter || actionText.includes(actionFilter)) &&
      (!moderatorFilter || moderatorText.includes(moderatorFilter));
  });
}

function renderTimeline(filteredCases) {
  const timelineFilter = ($("#timelineSearchInput")?.value || "").trim().toLowerCase();
  const warningEvents = Object.entries(state.warnings || {}).flatMap(([userId, entries]) =>
    (entries || []).map(entry => ({
      type: "warning",
      createdAt: entry.createdAt,
      title: `Warning - ${userId}`,
      text: entry.reason,
      moderatorTag: entry.moderatorTag
    }))
  );
  const noteEvents = Object.entries(state.notes || {}).flatMap(([userId, entries]) =>
    (entries || []).map(entry => ({
      type: "note",
      createdAt: entry.createdAt,
      title: `Note - ${userId}`,
      text: entry.content,
      moderatorTag: entry.moderatorTag
    }))
  );
  const caseEvents = filteredCases.map(entry => ({
    type: "case",
    createdAt: entry.createdAt,
    title: `#${entry.id} ${entry.action} - ${entry.targetTag || entry.targetId}`,
    text: entry.reason,
    moderatorTag: entry.moderatorTag
  }));

  const events = [...caseEvents, ...warningEvents, ...noteEvents]
    .filter(entry => {
      if (!timelineFilter) return true;
      const haystack = [
        entry.title,
        entry.text,
        entry.moderatorTag,
        entry.type
      ].join(" ").toLowerCase();
      return haystack.includes(timelineFilter);
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 80);

  return events.length
    ? events.map(entry => `
      <article class="event timeline-${escapeHtml(entry.type)}">
        <strong>${escapeHtml(entry.title)}</strong>
        <p>${escapeHtml(formatDate(entry.createdAt))}<br>${escapeHtml(entry.text || "No details")}<br>${escapeHtml(entry.moderatorTag || "")}</p>
      </article>
    `).join("")
    : renderEmptyState("No timeline events", "No matching records found.");
}

function renderMemberProfile() {
  const member = state.selectedMember;
  if (!member) {
    $("#memberProfile").innerHTML = state.loading
      ? `<div class="profile-card">${renderSkeletonCards(1)}</div>`
      : "Search for a member to load their moderation profile.";
    $("#memberAiSummary").innerHTML = "";
    $("#memberAiSummaryButton").disabled = true;
    $("#memberAiSummaryButton").textContent = "AI Summary";
    $("#memberTimeline").innerHTML = "";
    $("#memberChatLogs").innerHTML = "";
    state.memberChatLogs = [];
    $("#memberCases").innerHTML = "";
    $("#memberSignals").innerHTML = "";
    return;
  }

  const aiSummariesEnabled = Boolean(state.config?.capabilities?.aiMemberSummaries);
  $("#memberAiSummaryButton").disabled = !aiSummariesEnabled;
  $("#memberAiSummaryButton").textContent = aiSummariesEnabled ? "AI Summary" : "AI Summary (disabled)";
  const exemptUsers = new Set(state.config?.automod?.exemptUserIds || []);
  const isExempt = exemptUsers.has(member.id);
  const risk = member.risk || {};
  const riskScore = Number(risk.score || 0);
  const riskWidth = Math.max(4, Math.min(100, riskScore));
  const templates = (state.ops?.templates || []).slice(0, 6);

  $("#memberProfile").innerHTML = `
    <article class="profile-card">
      <div class="profile-title">
        ${member.avatarUrl ? `<img src="${member.avatarUrl}" alt="">` : ""}
        <div>
          <strong>${escapeHtml(member.tag)}</strong>
          <span>${escapeHtml(member.id)}</span>
        </div>
        <div class="profile-tools">
          <button class="ghost-button" type="button" data-copy-id="${escapeHtml(member.id)}">Copy ID</button>
        </div>
      </div>
      <dl class="detail-list">
        <dt>In Server</dt><dd>${member.inGuild ? "Yes" : "No"}</dd>
        <dt>Joined</dt><dd>${escapeHtml(formatDate(member.joinedAt))}</dd>
        <dt>Created</dt><dd>${escapeHtml(formatDate(member.createdAt))}</dd>
        <dt>Top Role</dt><dd>${escapeHtml(member.topRole?.name || "None")}</dd>
        <dt>Timeout</dt><dd>${escapeHtml(member.timeoutUntil ? formatDate(member.timeoutUntil) : "No active timeout")}</dd>
        <dt>Risk</dt><dd>${escapeHtml(member.risk ? `${member.risk.level} (${member.risk.score}) - ${member.risk.strikes} strikes` : "Clear")}</dd>
        <dt>Exempt</dt><dd>${isExempt ? "AutoMod exempt" : "Not exempt"}</dd>
      </dl>
      <div class="badge-row">
        <span class="badge">${member.counts.warnings} warnings</span>
        <span class="badge">${member.counts.notes} notes</span>
        <span class="badge">${member.counts.cases} cases</span>
        <span class="badge">Risk ${riskScore}</span>
      </div>
      <div class="button-row profile-actions">
        <button class="ghost-button" type="button" id="openMemberDrawerButton">Open Drawer</button>
      </div>
      ${state.lastDeletedMemberRecord && state.lastDeletedMemberRecord.userId === member.id ? `
        <div class="undo-banner">
          <div>
            <strong>Last deleted ${escapeHtml(state.lastDeletedMemberRecord.kind)}</strong>
            <p>Restore the most recently deleted record for this member.</p>
          </div>
          <button class="ghost-button" type="button" data-undo-member-record-delete>Undo delete</button>
        </div>
      ` : ""}
      <div class="action-shortcuts">
        ${memberActionShortcuts.map(shortcut => `
          <button class="ghost-button" type="button" data-member-shortcut="${escapeHtml(shortcut.action)}">${escapeHtml(shortcut.label)}</button>
        `).join("")}
      </div>
      <div class="template-strip">
        <div class="template-strip-head">
          <strong>Saved templates</strong>
          <span>${templates.length ? `${templates.length} ready` : "None saved"}</span>
        </div>
        <div class="template-shortcuts">
          ${templates.length ? templates.map((item, index) => `
            <button class="quick-action template-action" type="button" data-template-index="${escapeHtml(index)}">
              <strong>${escapeHtml(item.label || `Template ${index + 1}`)}</strong>
              <span>${escapeHtml(item.category || "general")} - ${escapeHtml(item.action || "warn")} ${escapeHtml(item.duration || "")}</span>
            </button>
          `).join("") : `<span class="badge">Use Ops to add templates.</span>`}
        </div>
      </div>
      <div class="risk-meter" title="Member risk score">
        <span style="width: ${riskWidth}%"></span>
      </div>
      <div class="badge-row">
        ${(member.roles || []).slice(0, 10).map(role => `<span class="badge">${escapeHtml(role.name)}</span>`).join("") || `<span class="badge">No roles</span>`}
      </div>
    </article>
  `;

  $("#memberCases").innerHTML = member.cases.length
    ? member.cases.map(entry => `
      <article class="event">
        <strong>#${escapeHtml(entry.id)} ${escapeHtml(entry.action)}</strong>
        <p>${escapeHtml(entry.reason || "No reason")}<br>${escapeHtml(entry.moderatorTag || "")}</p>
      </article>
    `).join("")
    : renderEmptyState("No cases", "No moderation cases for this member.");

  const warnings = member.warnings || [];
  const notes = member.notes || [];

  $("#memberSignals").innerHTML = `
    <div class="split">
      <section class="panel">
        <div class="panel-header"><h3>Warnings</h3></div>
        <div class="event-list">${renderEditableMemberRecords("warning", warnings.slice(0, 10))}</div>
      </section>
      <section class="panel">
        <div class="panel-header"><h3>Notes</h3></div>
        <div class="event-list">${renderEditableMemberRecords("note", notes.slice(0, 10))}</div>
      </section>
    </div>
  `;

  renderMemberAiSummary();
  renderMemberTimeline();
  renderMemberChatLogs();
  renderMemberDrawer();
}

function renderMemberDrawer() {
  const drawer = $("#memberDrawer");
  if (!drawer) return;

  const member = state.selectedMember;
  if (!member || !state.memberDrawerOpen) {
    drawer.innerHTML = "";
    drawer.classList.add("hidden");
    document.body.classList.remove("drawer-open");
    return;
  }

  const recentSearches = readStoredArray(storageKeys.recentMemberSearches);
  drawer.classList.remove("hidden");
  document.body.classList.add("drawer-open");
  drawer.innerHTML = `
    <div class="drawer-panel">
      <div class="panel-header">
        <h3>Member Drawer</h3>
        <div class="button-row">
          <button class="ghost-button" type="button" data-copy-id="${escapeHtml(member.id)}">Copy ID</button>
          <button class="ghost-button" type="button" id="closeMemberDrawerButton">Close</button>
        </div>
      </div>
      <article class="profile-card compact">
        <div class="profile-title">
          ${member.avatarUrl ? `<img src="${member.avatarUrl}" alt="">` : ""}
          <div>
            <strong>${escapeHtml(member.tag)}</strong>
            <span>${escapeHtml(member.id)}</span>
          </div>
        </div>
        <div class="badge-row">
          <span class="badge">${member.counts.warnings} warnings</span>
          <span class="badge">${member.counts.notes} notes</span>
          <span class="badge">${member.counts.cases} cases</span>
        </div>
        <div class="action-shortcuts">
          ${memberActionShortcuts.map(shortcut => `
            <button class="ghost-button" type="button" data-member-shortcut="${escapeHtml(shortcut.action)}">${escapeHtml(shortcut.label)}</button>
          `).join("")}
        </div>
      </article>
      <section class="panel">
        <div class="panel-header"><h3>Recent Searches</h3></div>
        <div class="filter-chip-row">
          ${recentSearches.length
            ? recentSearches.map(search => `<button class="filter-chip" type="button" data-member-search="${escapeHtml(search)}"><strong>${escapeHtml(search)}</strong><span>Search again</span></button>`).join("")
            : renderEmptyState("No recent searches", "Searches will show here.")}
        </div>
      </section>
    </div>
  `;
}

function renderMemberAiSummary() {
  const summary = state.memberAiSummary;
  if (!summary) {
    $("#memberAiSummary").innerHTML = "";
    return;
  }

  const canUseSuggestion = ["note", "warn", "timeout"].includes(summary.suggestedAction);
  $("#memberAiSummary").innerHTML = `
    <article class="event ai-summary-card">
      <strong>AI Risk: ${escapeHtml(summary.riskLevel)} <span class="badge">${escapeHtml(summary.confidence)}%</span></strong>
      <p>${escapeHtml(summary.summary)}</p>
      <p>${(summary.patterns || []).map(item => escapeHtml(item)).join("<br>") || "No clear pattern."}</p>
      <p>Suggested: ${escapeHtml(summary.suggestedAction)}<br>${escapeHtml(summary.suggestedReason || "")}</p>
      ${canUseSuggestion ? `<button id="useAiSuggestionButton" class="ghost-button" type="button">Use Suggestion</button>` : ""}
    </article>
  `;

  $("#useAiSuggestionButton")?.addEventListener("click", () => {
    $("#memberAction").value = summary.suggestedAction;
    $("#memberActionReason").value = summary.suggestedReason || "";
    if (summary.suggestedAction === "timeout") {
      $("#memberActionDuration").value = summary.timeoutDuration || "10m";
    }
    localStorage.setItem(storageKeys.memberAction, $("#memberAction").value);
    setAlert("AI suggestion loaded into the moderation form. Review it before applying.");
  });
}

function buildMemberTimelineEntries(member) {
  if (!member) return [];
  const warnings = (member.warnings || []).map(entry => ({
    type: "Warning",
    createdAt: entry.createdAt,
    title: "Warning",
    text: entry.reason,
    moderatorTag: entry.moderatorTag,
    details: `Warning issued`
  }));
  const notes = (member.notes || []).map(entry => ({
    type: "Note",
    createdAt: entry.createdAt,
    title: "Note",
    text: entry.content,
    moderatorTag: entry.moderatorTag,
    details: "Staff note added"
  }));
  const cases = (member.cases || []).map(entry => ({
    type: "Case",
    createdAt: entry.createdAt,
    title: `#${entry.id} ${entry.action}`,
    text: entry.reason,
    moderatorTag: entry.moderatorTag,
    details: entry.details || []
  }));
  const chatLogs = (state.memberChatLogs || []).map(entry => ({
    type: "Chat",
    createdAt: entry.createdAt,
    title: `${entry.channelName || "Chat"} message`,
    text: entry.content,
    moderatorTag: entry.channelMention || "",
    details: entry.url ? [`Open message: ${entry.url}`] : []
  }));

  return [...cases, ...warnings, ...notes, ...chatLogs]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function renderMemberTimeline() {
  const member = state.selectedMember;
  const container = $("#memberTimeline");
  if (!container) return;
  if (!member) {
    container.innerHTML = renderEmptyState("No member selected", "Search for a member to load a unified history.");
    return;
  }

  const query = ($("#timelineSearchInput")?.value || "").trim().toLowerCase();
  const events = buildMemberTimelineEntries(member).filter(entry => {
    if (!query) return true;
    const haystack = [
      entry.title,
      entry.text,
      entry.moderatorTag,
      JSON.stringify(entry.details || "")
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  container.innerHTML = events.length
    ? events.slice(0, 30).map(entry => `
      <article class="event">
        <strong>${escapeHtml(entry.title)} <span class="badge">${escapeHtml(entry.type)}</span></strong>
        <p>${escapeHtml(formatDate(entry.createdAt))}<br>${escapeHtml(entry.text || "No details")}<br>${escapeHtml(entry.moderatorTag || "")}</p>
        ${Array.isArray(entry.details) && entry.details.length ? `<p>${entry.details.map(detail => escapeHtml(detail)).join("<br>")}</p>` : ""}
      </article>
    `).join("")
    : renderEmptyState("No matching history", "Try a different member history search.");
}

function getMemberChatRangeMs(range) {
  switch (String(range || "7d")) {
    case "24h":
      return 24 * 60 * 60 * 1000;
    case "7d":
      return 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return 30 * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

function renderMemberChatLogs() {
  const member = state.selectedMember;
  const container = $("#memberChatLogs");
  if (!container) return;

  if (!member) {
    container.innerHTML = renderEmptyState("No member selected", "Search for a member to load recent chat logs.");
    return;
  }

  const query = ($("#memberChatSearchInput")?.value || "").trim().toLowerCase();
  const channelFilter = $("#memberChatChannelFilter")?.value || "all";
  const rangeFilter = $("#memberChatDateRange")?.value || "7d";
  const rangeMs = getMemberChatRangeMs(rangeFilter);
  const cutoff = rangeMs ? Date.now() - rangeMs : 0;
  const logs = Array.isArray(state.memberChatLogs) ? state.memberChatLogs : [];

  const filtered = logs.filter(entry => {
    if (channelFilter !== "all" && entry.channelId !== channelFilter) return false;
    if (rangeMs && new Date(entry.createdAt).getTime() < cutoff) return false;
    if (!query) return true;
    const haystack = [
      entry.channelName,
      entry.content,
      entry.channelId,
      entry.createdAt
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  if ($("#memberChatChannelFilter")) {
    const uniqueChannels = new Map();
    for (const entry of logs) {
      if (!entry.channelId) continue;
      if (!uniqueChannels.has(entry.channelId)) {
        uniqueChannels.set(entry.channelId, entry.channelName || entry.channelMention || entry.channelId);
      }
    }
    const currentValue = $("#memberChatChannelFilter").value || "all";
    $("#memberChatChannelFilter").innerHTML = [
      `<option value="all">All channels</option>`,
      ...[...uniqueChannels.entries()].map(([id, label]) => `<option value="${escapeHtml(id)}" ${currentValue === id ? "selected" : ""}>${escapeHtml(label)}</option>`)
    ].join("");
    $("#memberChatChannelFilter").value = currentValue;
  }

  container.innerHTML = filtered.length
    ? filtered.slice(0, 40).map(entry => `
      <article class="event">
        <strong>${escapeHtml(entry.channelName || "Unknown channel")} <span class="badge">${escapeHtml(formatDate(entry.createdAt))}</span></strong>
        <p>${escapeHtml(entry.content || "No text content")}</p>
        <p>
          <a href="${escapeHtml(entry.url || "#")}" target="_blank" rel="noreferrer">Open message</a>
          ${entry.channelMention ? ` | ${escapeHtml(entry.channelMention)}` : ""}
        </p>
      </article>
    `).join("")
    : renderEmptyState("No chat logs", "No recent messages matched this member.");
}

function exportMemberChatLogs() {
  const member = state.selectedMember;
  if (!member) {
    setAlert("Search for a member first.", "error");
    return;
  }

  const query = ($("#memberChatSearchInput")?.value || "").trim().toLowerCase();
  const channelFilter = $("#memberChatChannelFilter")?.value || "all";
  const rangeFilter = $("#memberChatDateRange")?.value || "7d";
  const rangeMs = getMemberChatRangeMs(rangeFilter);
  const cutoff = rangeMs ? Date.now() - rangeMs : 0;
  const logs = Array.isArray(state.memberChatLogs) ? state.memberChatLogs : [];
  const filtered = logs.filter(entry => {
    if (channelFilter !== "all" && entry.channelId !== channelFilter) return false;
    if (rangeMs && new Date(entry.createdAt).getTime() < cutoff) return false;
    if (!query) return true;
    const haystack = [
      entry.channelName,
      entry.content,
      entry.channelId,
      entry.createdAt
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  const payload = {
    member: {
      id: member.id,
      tag: member.tag,
      username: member.username
    },
    filters: {
      query: $("#memberChatSearchInput")?.value || "",
      channelId: channelFilter,
      dateRange: rangeFilter
    },
    exportedAt: new Date().toISOString(),
    logs: filtered
  };

  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `member-chat-logs-${member.id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setAlert(`Exported ${filtered.length} chat logs.`);
}

async function loadMemberAiSummary() {
  if (!state.selectedMember) {
    setAlert("Search for a member first.", "error");
    return;
  }

  if (!state.config?.capabilities?.aiMemberSummaries) {
    setAlert("AI member summaries are disabled until OPENAI_API_KEY is configured for the web service.", "error");
    return;
  }

  $("#memberAiSummary").innerHTML = renderEmptyState("Building summary", "Reviewing this member's moderation history.");
  const payload = await api(`/api/member-ai-summary?query=${encodeURIComponent(state.selectedMember.id)}`);
  state.selectedMember = payload.member || state.selectedMember;
  if (payload.disabled) {
    state.memberAiSummary = null;
    $("#memberAiSummary").innerHTML = renderEmptyState("AI summaries unavailable", payload.error || "AI member summaries are disabled for this deployment.");
    setAlert(payload.error || "AI member summaries are disabled for this deployment.", "error");
    return;
  }
  state.memberAiSummary = payload.summary;
  renderMemberAiSummary();
  setAlert("");
}

async function searchMember() {
  const query = $("#memberSearchInput").value.trim();
  if (!query) {
    setAlert("Enter a Discord ID, mention, or username.", "error");
    return;
  }

  localStorage.setItem(storageKeys.lastMemberSearch, query);
  addRecentMemberSearch(query);
  const [memberPayload, chatLogsPayload] = await Promise.all([
    api(`/api/member?query=${encodeURIComponent(query)}`),
    api(`/api/member-chat-logs?query=${encodeURIComponent(query)}`).catch(() => ({ chatLogs: [] }))
  ]);
  state.selectedMember = memberPayload.member;
  state.memberChatLogs = chatLogsPayload.chatLogs || [];
  state.memberAiSummary = null;
  state.memberDrawerOpen = true;
  renderMemberProfile();
  setAlert("");
}

function applyMemberPreset(name) {
  const preset = memberActionPresets[name];
  if (!preset) return;
  $("#memberAction").value = preset.action || "warn";
  $("#memberActionDuration").value = preset.duration || "";
  $("#memberActionReason").value = preset.reason || "";
  localStorage.setItem(storageKeys.memberAction, $("#memberAction").value);
  localStorage.setItem(storageKeys.memberDuration, $("#memberActionDuration").value);
  setAlert(`Loaded ${name} moderation preset. Review it before applying.`);
}

function applyBulkPreset(name) {
  const preset = bulkActionPresets[name];
  if (!preset) return;

  if (preset.memberPreset) {
    setActiveView("members");
    applyMemberPreset(preset.memberPreset);
  }

  if (typeof preset.caseFilterAction === "string") {
    $("#caseFilterAction").value = preset.caseFilterAction;
    persistCaseFilters();
  }

  if (typeof preset.timelineSearch === "string") {
    $("#timelineSearchInput").value = preset.timelineSearch;
    localStorage.setItem(storageKeys.timelineSearch, preset.timelineSearch);
  }

  renderRecords();
  setAlert(`Loaded ${name} bulk cleanup preset.`);
}

function applyMemberShortcut(action) {
  const shortcut = memberActionShortcuts.find(item => item.action === action);
  if (!shortcut) return;
  $("#memberAction").value = shortcut.action;
  localStorage.setItem(storageKeys.memberAction, $("#memberAction").value);

  if (shortcut.preset) {
    const preset = memberActionPresets[shortcut.preset];
    if (preset) {
      $("#memberActionDuration").value = preset.duration || "";
      $("#memberActionReason").value = preset.reason || "";
      localStorage.setItem(storageKeys.memberDuration, $("#memberActionDuration").value);
    }
  } else if (shortcut.action === "clearwarnings") {
    $("#memberActionDuration").value = "";
    $("#memberActionReason").value = "";
    localStorage.setItem(storageKeys.memberDuration, "");
  }

  setAlert(`Loaded ${shortcut.label.toLowerCase()} shortcut. Review it before applying.`);
}

async function saveCurrentView() {
  const view = localStorage.getItem(storageKeys.activeView) || getDefaultView();
  const subtab = getActiveSubtab(view);

  if (view === "automod") {
    await saveAutomod();
    return;
  }

  if (view === "staff") {
    await saveStaff();
    return;
  }

  if (view === "ops") {
    await saveOps();
    return;
  }

  if (view === "settings") {
    if (subtab === "verification") {
      await saveVerificationSettings();
    } else if (subtab === "birthdays") {
      await saveBirthdaySettings();
    } else if (subtab === "safety") {
      await savePrivacySettings();
    } else if (subtab === "accounts") {
      if (state.webAccountEditing || $("#webAccountUsername").value.trim()) {
        await saveWebAccount();
      } else {
        await saveSettings();
      }
    } else {
      await saveSettings();
    }
  }
}

async function toggleSelectedMemberExemption(enabled) {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change exemptions.", "error");
    return;
  }
  if (!state.selectedMember) {
    setAlert("Search for a member first.", "error");
    return;
  }

  const exemptUserIds = new Set(state.config?.automod?.exemptUserIds || []);
  if (enabled) {
    exemptUserIds.add(state.selectedMember.id);
  } else {
    exemptUserIds.delete(state.selectedMember.id);
  }

  const result = await api("/api/automod", {
    method: "POST",
    body: JSON.stringify({
      exemptUserIds: Array.from(exemptUserIds)
    })
  });

  state.config.automod = result.automod;
  await loadAll();
  setAlert(enabled ? "Member added to AutoMod exemptions." : "Member removed from AutoMod exemptions.");
}

async function applyMemberAction() {
  if (!state.selectedMember) {
    setAlert("Search for a member first.", "error");
    return;
  }

  const action = $("#memberAction").value;
  const reason = $("#memberActionReason").value.trim();
  const duration = $("#memberActionDuration").value.trim();
  const risky = ["clearwarnings", "kick", "ban", "tempban"].includes(action);

  if (["warn", "note", "timeout", "mute", "kick", "ban", "tempban"].includes(action) && !reason) {
    setAlert("Enter a reason before applying that action.", "error");
    return;
  }

  if (["timeout", "tempban"].includes(action) && !duration) {
    setAlert("Enter a duration like 10m, 2h, or 1d.", "error");
    return;
  }

  const confirmTarget = `${state.selectedMember.tag} (${state.selectedMember.id})`;
  const confirmDetails = [
    reason ? `Reason: ${reason}` : "",
    duration ? `Duration: ${duration}` : ""
  ].filter(Boolean).join("\n");

  if (risky && !confirmDangerousAction(`Apply ${action}?`, confirmTarget, confirmDetails)) {
    return;
  }

  const payload = await api("/api/member-action", {
    method: "POST",
    body: JSON.stringify({
      userId: state.selectedMember.id,
      action,
      reason,
      duration
    })
  });

  state.selectedMember = payload.member;
  renderMemberProfile();
  $("#memberActionReason").value = "";
  await loadAll();
  recordRecentAction({
    action,
    userId: state.selectedMember.id,
    userTag: state.selectedMember.tag,
    reason,
    duration
  });
  setAlert(`Applied ${action} to ${state.selectedMember.tag}.`);
}

function renderRecordMap(records, label) {
  const entries = Object.entries(records || {}).flatMap(([userId, items]) =>
    (items || []).slice(-5).reverse().map(item => ({ userId, ...item }))
  ).slice(0, 40);

  return entries.length
    ? entries.map(entry => `
      <article class="event">
        <strong>${escapeHtml(entry.userId)} - ${label}</strong>
        <p>${escapeHtml(entry.reason || entry.content || "No details")}<br>${escapeHtml(entry.moderatorTag || "")}</p>
      </article>
    `).join("")
    : renderEmptyState(`No ${label}s`, `No saved ${label} records.`);
}

function renderEmptyState(title, description) {
  return `
    <article class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(description)}</p>
    </article>
  `;
}

async function updateGeneralChatRule(action) {
  const response = await api("/api/general-chat-rule", {
    method: "POST",
    body: JSON.stringify({ action })
  });
  state.dashboard = state.dashboard || {};
  state.dashboard.generalChatRule = response.rule || state.dashboard.generalChatRule;
  renderAll();
  return response;
}

function renderAll() {
  renderMetrics();
  renderQuickActions();
  renderAttentionBoard();
  renderGeneralChatRulePanel();
  renderWorkloadSummary();
  renderActivityFilters();
  renderActivityStream();
  renderPanelChanges();
  renderRuntime();
  renderReactionRoleHealth();
  renderRecentViolations();
  renderAutomod();
  renderAiReview();
  renderSettings();
  renderStaff();
  renderOps();
  renderTemplates();
  renderSavedCaseFilters();
  renderRecentMemberSearches();
  renderRecords();
  renderRecentActions();
  if (state.selectedMember) renderMemberProfile();
  else renderMemberDrawer();
  updateDirtyIndicators();
  restoreAutosaveDrafts();
}

async function loadAll() {
  try {
    setPanelBusy(true);
    updateApiState("Loading", "loading");
    state.me = await api("/api/me");
    updateAuthPanel();

    if (!state.me.authenticated) {
      if (state.token) {
        state.token = "";
        localStorage.removeItem("mochiAdminToken");
      }
      updateApiState("Login required");
      const loginMessage = state.me.oauthConfigured && state.me.localLoginConfigured
        ? "Login with Discord, your personal account, or the backup admin token."
        : state.me.oauthConfigured
          ? "Login with Discord or use the backup admin token."
          : state.me.localLoginConfigured
            ? "Use your personal login or the backup admin token."
            : "Enter the backup admin token to load the dashboard.";
      setLoginVisible(true, loginMessage);
      setLoginBusy(false);
      ensureAutoRefresh();
      return;
    }

    if (state.me.authenticated) {
      setLoginVisible(false);
      setLoginBusy(true);
      updateApiState("Loading", "loading");
    }

    const requests = [
      api("/api/dashboard"),
      api("/api/config"),
      api("/api/cases"),
      api("/api/warnings"),
      api("/api/notes"),
      api("/api/ops")
    ];
    const wantsAdminData = hasPanelAccess("admin");
    if (wantsAdminData) {
      requests.push(api("/api/web-accounts"));
    }

    const results = await Promise.all(requests);
    const [dashboard, config, casesPayload, warningsPayload, notesPayload, opsPayload, webAccountsPayload] = results;

    state.dashboard = dashboard;
    state.config = config;
    state.aiReviews = config.aiReviews || {};
    state.cases = casesPayload.cases || [];
    state.warnings = warningsPayload.warnings || {};
    state.notes = notesPayload.notes || {};
    state.ops = opsPayload;
    state.webAccounts = webAccountsPayload?.accounts || [];
    applyAccessRestrictions();
    applyRoleAwareWorkspace();
    renderAll();
    applyAccessRestrictions();
    ensureAutoRefresh();
    setLoginBusy(false);
    setLoginVisible(false);
    updateApiState("Live", "ok");
    setAlert("");
  } catch (error) {
    updateApiState("Locked", "error");
    setLoginBusy(false);
    setLoginVisible(!state.me?.authenticated, error.message);
    setAlert(error.message, "error");
  } finally {
    setPanelBusy(false);
  }
}

async function saveAutomod(options = {}) {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change AutoMod settings.", "error");
    return;
  }
  const auto = Boolean(options.auto);
  const payload = {};
  document.querySelectorAll("[data-automod-bool]").forEach(input => {
    payload[input.dataset.automodBool] = input.checked;
  });
  document.querySelectorAll("[data-automod-number]").forEach(input => {
    payload[input.dataset.automodNumber] = Number(input.value);
  });
  document.querySelectorAll("[data-automod-list]").forEach(input => {
    payload[input.dataset.automodList] = input.value;
  });
  document.querySelectorAll("[data-automod-duration]").forEach(input => {
    payload[input.dataset.automodDuration] = input.value;
  });
  document.querySelectorAll("[data-automod-string]").forEach(input => {
    payload[input.dataset.automodString] = input.value;
  });

  const result = await api("/api/automod", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  state.config.automod = result.automod;
  state.automodPreview = null;
  clearAutosaveDraft("automod");
  renderAll();
  if (!auto) {
    updateSaveButton("saveAutomod", "saved");
    window.setTimeout(() => updateSaveButton("saveAutomod", "idle"), 700);
    setAlert("AutoMod settings saved.");
  }
}

async function syncGoogleBlockList() {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to sync the Google block list.", "error");
    return;
  }

  const result = await api("/api/google-block-list-sync", {
    method: "POST",
    body: JSON.stringify({})
  });

  state.config.automod = result.automod || state.config.automod;
  await loadAll();
  if (result.result?.error) {
    setAlert(result.result.error, "error");
    return;
  }
  setAlert(`Synced ${result.result?.count || 0} Google block list terms.`);
}

async function runAutomodPreview() {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to preview AutoMod.", "error");
    return;
  }

  const payload = await api("/api/automod-preview", {
    method: "POST",
    body: JSON.stringify({
      channelId: $("#previewChannelId").value,
      content: $("#previewMessage").value
    })
  });

  state.automodPreview = payload.preview || null;
  renderAutomodPreview();
  setAlert("AutoMod preview updated.");
}

async function applyAutomodPreviewOverride(mode, ruleKey = "") {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change AutoMod overrides.", "error");
    return;
  }

  const channelId = ($("#previewChannelId").value || "").trim();
  if (!channelId) {
    setAlert("Enter a channel ID first.", "error");
    return;
  }

  if (mode === "rule" && !ruleKey) {
    setAlert("No rule was selected for that override.", "error");
    return;
  }

  const result = await api("/api/automod-override", {
    method: "POST",
    body: JSON.stringify({
      channelId,
      ruleKey: mode === "rule" ? ruleKey : "",
      mode: mode === "rule" ? "rule" : "channel"
    })
  });

  state.config.automod.channelRuleOverrides = result.channelRuleOverrides || {};
  renderAll();
  setAlert(mode === "rule" ? `Ignored ${ruleKey} in that channel.` : "Channel override saved.");
}

async function saveStaff(options = {}) {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change staff access.", "error");
    return;
  }
  const auto = Boolean(options.auto);
  const result = await api("/api/permissions", {
    method: "POST",
    body: JSON.stringify({
      modRoleIds: $("#modRoleIds").value,
      adminRoleIds: $("#adminRoleIds").value
    })
  });
  state.config.permissions = result.permissions;
  clearAutosaveDraft("staff");
  renderAll();
  if (!auto) {
    updateSaveButton("saveStaff", "saved");
    window.setTimeout(() => updateSaveButton("saveStaff", "idle"), 700);
    setAlert("Staff access saved.");
  }
}

function applyAutomodPreset(name) {
  if (!hasPanelAccess("admin")) return;
  const preset = automodPresets[name];
  if (!preset) return;

  Object.entries(preset).forEach(([key, value]) => {
    const checkbox = document.querySelector(`[data-automod-bool="${key}"]`);
    const number = document.querySelector(`[data-automod-number="${key}"]`);
    const duration = document.querySelector(`[data-automod-duration="${key}"]`);
    const string = document.querySelector(`[data-automod-string="${key}"]`);

    if (checkbox) checkbox.checked = Boolean(value);
    if (number) number.value = value;
    if (duration) duration.value = value;
    if (string) string.value = value;
  });

  setAlert(`${name[0].toUpperCase()}${name.slice(1)} AutoMod mode is ready. Save to apply it.`);
}

async function saveSettings(options = {}) {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change server settings.", "error");
    return;
  }
  const auto = Boolean(options.auto);
  const allowedKeys = Array.isArray(options.allowedKeys) ? options.allowedKeys : null;
  const nextPayload = allowedKeys ? collectSettingsPayload(allowedKeys) : collectSettingsPayload();

  const result = await api("/api/settings", {
    method: "POST",
    body: JSON.stringify(nextPayload)
  });
  state.config.settings = result.settings;
  clearAutosaveDraft("settings");
  renderAll();
  if (!auto && !allowedKeys) {
    updateSaveButton("saveSettings", "saved");
    window.setTimeout(() => updateSaveButton("saveSettings", "idle"), 700);
    setAlert("Server settings saved.");
  }
}

async function savePrivacySettings(options = {}) {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change privacy settings.", "error");
    return;
  }
  const auto = Boolean(options.auto);

  const payload = collectSettingsPayload([
    "messageArchiveEnabled",
    "messageArchiveRetentionDays"
  ]);

  const result = await api("/api/settings", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  state.config.settings = result.settings;
  clearAutosaveDraft("settings");
  renderAll();
  if (!auto) {
    updateSaveButton("savePrivacySettings", "saved");
    window.setTimeout(() => updateSaveButton("savePrivacySettings", "idle"), 700);
    setAlert("Archive settings saved.");
  }
}

async function saveAllSettings(options = {}) {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change server settings.", "error");
    return;
  }
  const auto = Boolean(options.auto);

  const settingsPayload = collectSettingsPayload();
  const settingsResult = await api("/api/settings", {
    method: "POST",
    body: JSON.stringify(settingsPayload)
  });

  const automodResult = await api("/api/automod", {
    method: "POST",
    body: JSON.stringify({
      exemptChannelIds: $("#exemptChannelIds").value,
      exemptRoleIds: $("#exemptRoleIds").value,
      exemptUserIds: $("#exemptUserIds").value
    })
  });

  state.config.settings = settingsResult.settings;
  state.config.automod = automodResult.automod;
  clearAutosaveDraft("settings");
  clearAutosaveDraft("automod");
  clearAutosaveDraft("exemptions");
  renderAll();
  if (!auto) {
    updateSaveButton("saveAllSettings", "saved");
    window.setTimeout(() => updateSaveButton("saveAllSettings", "idle"), 700);
    setAlert("All settings saved.");
  }
}

function generateWebPassword(length = 18) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*?";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => alphabet[value % alphabet.length]).join("");
}

async function loginLocalAccount() {
  const username = $("#localUsernameInput").value.trim();
  const password = $("#localPasswordInput").value;

  if (!username || !password) {
    setAlert("Enter your username and password.", "error");
    return;
  }

  await api("/auth/local/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });

  $("#localPasswordInput").value = "";
  setLoginBusy(true);
  await loadAll();
}

async function saveWebAccount() {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to manage web accounts.", "error");
    return;
  }

  const username = $("#webAccountUsername").value.trim();
  const password = $("#webAccountPassword").value;
  const passwordConfirm = $("#webAccountPasswordConfirm").value;

  if (password && password !== passwordConfirm) {
    setAlert("The password and confirmation do not match.", "error");
    return;
  }

  if (!password && !state.webAccountEditing) {
    setAlert("Set a password before creating a new web account.", "error");
    return;
  }

  const payload = {
    action: "upsert",
    originalUsername: state.webAccountEditing || "",
    username,
    accessLevel: $("#webAccountAccessLevel").value,
    enabled: $("#webAccountEnabled").value === "true",
    discordUserId: $("#webAccountDiscordUserId").value.trim(),
    password,
    passwordConfirm
  };

  const result = await api("/api/web-accounts", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  state.webAccounts = result.accounts || state.webAccounts;
  fillWebAccountForm(result.account || null);
  renderWebAccounts();
  renderWebAccountAudit(result.account || null);
  setAlert(`Saved web account for ${username}.`);
}

async function deleteWebAccount() {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to manage web accounts.", "error");
    return;
  }

  const username = $("#webAccountUsername").value.trim() || state.webAccountEditing;
  if (!username) {
    setAlert("Choose a web account first.", "error");
    return;
  }

  if (!confirmDangerousAction("Delete web account?", `This removes ${username}'s personal login.`)) {
    return;
  }

  const result = await api("/api/web-accounts", {
    method: "POST",
    body: JSON.stringify({ action: "delete", username })
  });

  state.webAccounts = result.accounts || state.webAccounts;
  fillWebAccountForm(null);
  renderWebAccounts();
  renderWebAccountAudit(null);
  setAlert(`Deleted web account ${username}.`);
}

async function toggleWebAccountEnabled(username = state.webAccountEditing) {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to manage web accounts.", "error");
    return;
  }

  const account = (state.webAccounts || []).find(item => item.username === username);
  if (!account) {
    setAlert("Choose a web account first.", "error");
    return;
  }

  const result = await api("/api/web-accounts", {
    method: "POST",
    body: JSON.stringify({
      action: "toggle-enabled",
      username: account.username,
      enabled: !account.enabled
    })
  });

  state.webAccounts = result.accounts || state.webAccounts;
  const updated = (state.webAccounts || []).find(item => item.username === account.username) || null;
  fillWebAccountForm(updated);
  renderWebAccounts();
  renderWebAccountAudit(updated);
  setAlert(`${updated?.enabled ? "Enabled" : "Disabled"} ${account.username}.`);
}

async function resetWebAccountPassword(username = state.webAccountEditing) {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to manage web accounts.", "error");
    return;
  }

  const account = (state.webAccounts || []).find(item => item.username === username);
  if (!account) {
    setAlert("Choose a web account first.", "error");
    return;
  }

  if (!confirmDangerousAction("Reset password?", `This generates a new password for ${account.username}.`)) {
    return;
  }

  const result = await api("/api/web-accounts", {
    method: "POST",
    body: JSON.stringify({
      action: "reset-password",
      username: account.username
    })
  });

  state.webAccounts = result.accounts || state.webAccounts;
  const updated = (state.webAccounts || []).find(item => item.username === account.username) || null;
  fillWebAccountForm(updated);
  $("#webAccountPassword").value = result.generatedPassword || $("#webAccountPassword").value;
  if (result.generatedPassword) {
    $("#webAccountPassword").select();
    try {
      await navigator.clipboard.writeText(result.generatedPassword);
      setAlert(`Password reset for ${account.username} and copied to clipboard.`);
    } catch {
      setAlert(`Password reset for ${account.username}.`);
    }
  } else {
    setAlert(`Password reset for ${account.username}.`);
  }
  renderWebAccounts();
  renderWebAccountAudit(updated);
}

async function postAffirmationsPanel() {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to post the affirmations panel.", "error");
    return;
  }

  await api("/api/affirmations-panel", {
    method: "POST",
    body: JSON.stringify({})
  });
  await loadAll();
  setAlert("Anonymous affirmations panel posted.");
}

async function repostRulesPanel() {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to post the rules panel.", "error");
    return;
  }

  await saveVerificationSettings({ auto: true });
  const response = await api("/api/rules-panel", {
    method: "POST",
    body: JSON.stringify({})
  });
  await loadAll();
  setAlert(`Rules panel reposted in ${response.posted?.channelId ? `<#${response.posted.channelId}>` : "the configured channel"}.`);
}

async function saveVerificationSettings(options = {}) {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change server settings.", "error");
    return;
  }
  const auto = Boolean(options.auto);

  const payload = collectSettingsPayload([
    "rulesCardTitle",
    "rulesCardDescription",
    "rulesCardRules",
    "verificationCaptchaEnabled",
    "tiktokHandle",
    "tiktokNicknameAliases",
    "verifiedRoleId",
    "unverifiedRoleId"
  ]);
  const result = await api("/api/settings", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  state.config.settings = result.settings;
  clearAutosaveDraft("settings");
  renderAll();
  if (!auto) {
    updateSaveButton("saveVerificationSettings", "saved");
    window.setTimeout(() => updateSaveButton("saveVerificationSettings", "idle"), 700);
    setAlert("Verification settings saved.");
  }
}

async function saveBirthdaySettings(options = {}) {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change server settings.", "error");
    return;
  }
  const auto = Boolean(options.auto);

  const payload = collectSettingsPayload([
    "birthdayRoleId",
    "birthdayAnnouncementChannelId"
  ]);
  const result = await api("/api/settings", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  state.config.settings = result.settings;
  clearAutosaveDraft("settings");
  renderAll();
  if (!auto) {
    updateSaveButton("saveBirthdaySettings", "saved");
    window.setTimeout(() => updateSaveButton("saveBirthdaySettings", "idle"), 700);
    setAlert("Birthday settings saved.");
  }
}

async function postBirthdayPanel() {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to post the birthday panel.", "error");
    return;
  }

  const result = await api("/api/birthday-panel", {
    method: "POST",
    body: JSON.stringify({})
  });

  await loadAll();
  setAlert(`Birthday panel posted in ${result.channelId ? `<#${result.channelId}>` : "the configured channel"}.`);
}

async function repostRolePanel() {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change server settings.", "error");
    return;
  }

  await api("/api/reaction-role-panel", {
    method: "POST",
    body: JSON.stringify({})
  });

  await loadAll();
  setAlert("Bonus panel reposted.");
}

async function repairVerifyPanel() {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to repair the verify panel.", "error");
    return;
  }

  await api("/api/verification-panel", {
    method: "POST",
    body: JSON.stringify({})
  });

  await loadAll();
  setAlert("Verify panel repaired.");
}

async function repairOnboarding() {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to repair onboarding.", "error");
    return;
  }

  await api("/api/onboarding-repair", {
    method: "POST",
    body: JSON.stringify({})
  });

  await loadAll();
  setAlert("Onboarding repaired.");
}

async function repairRolePanel() {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to repair the bonus panel.", "error");
    return;
  }

  await repostRolePanel();
  setAlert("Bonus panel repaired.");
}

async function setVerifiedVisibility(locked, scope) {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change verified visibility.", "error");
    return;
  }

  const result = await api("/api/verified-visibility", {
    method: "POST",
    body: JSON.stringify({ locked, scope })
  });

  await loadAll();
  setAlert(result.locked
    ? `Locked verified visibility on ${result.updated} channel${result.updated === 1 ? "" : "s"}.`
    : `Removed verified visibility locks from ${result.updated} channel${result.updated === 1 ? "" : "s"}.`);
}

async function markAllUnverified() {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to bulk sync verification.", "error");
    return;
  }

  if (!confirmDangerousAction("Mark all unverified?", "This will update the verified status for many members.", "This may take a moment.")) {
    return;
  }

  const result = await api("/api/verification-mark-unverified", {
    method: "POST",
    body: JSON.stringify({})
  });

  await loadAll();
  setAlert(`Marked ${result.updated} member${result.updated === 1 ? "" : "s"} as unverified. Skipped ${result.skipped}, failed ${result.failed}.`);
}

async function saveExemptions(options = {}) {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change exemptions.", "error");
    return;
  }
  const auto = Boolean(options.auto);
  const result = await api("/api/automod", {
    method: "POST",
    body: JSON.stringify({
      exemptChannelIds: $("#exemptChannelIds").value,
      exemptRoleIds: $("#exemptRoleIds").value,
      exemptUserIds: $("#exemptUserIds").value
    })
  });
  state.config.automod = result.automod;
  clearAutosaveDraft("exemptions");
  renderAll();
  if (!auto) {
    updateSaveButton("saveExemptions", "saved");
    window.setTimeout(() => updateSaveButton("saveExemptions", "idle"), 700);
    setAlert("Exemptions saved.");
  }
}

async function saveRuleActions(options = {}) {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change rule actions.", "error");
    return;
  }
  const auto = Boolean(options.auto);
  await api("/api/rule-actions", {
    method: "POST",
    body: JSON.stringify({
      alertRules: $("#alertRules").value,
      warnRules: $("#warnRules").value,
      timeoutRules: $("#timeoutRules").value,
      raidAction: $("#raidAction").value
    })
  });
  clearAutosaveDraft("ruleActions");
  renderAll();
  if (!auto) {
    updateSaveButton("saveRuleActions", "saved");
    window.setTimeout(() => updateSaveButton("saveRuleActions", "idle"), 700);
    setAlert("Rule actions saved.");
  }
}

async function saveOps(options = {}) {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change operations settings.", "error");
    return;
  }
  const auto = Boolean(options.auto);
  syncTemplateEditorTextarea();
  state.ops = await api("/api/ops", {
    method: "POST",
    body: JSON.stringify({
      modTemplates: $("#modTemplates").value,
      channelProfiles: $("#channelProfiles").value,
      reportEnabled: $("#reportEnabled").value,
      reportChannelId: $("#reportChannelId").value,
      reportFrequency: $("#reportFrequency").value
    })
  });
  state.automodPreview = null;
  clearAutosaveDraft("ops");
  clearTemplateEditorDrafts();
  localStorage.removeItem(storageKeys.templateEditorIndex);
  renderAll();
  if (!auto) {
    updateSaveButton("saveOps", "saved");
    window.setTimeout(() => updateSaveButton("saveOps", "idle"), 700);
    setAlert("Operations settings saved.");
  }
}

async function updateAppealStatus(appealId, status) {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to review appeals.", "error");
    return;
  }

  const result = await api("/api/appeals/status", {
    method: "POST",
    body: JSON.stringify({ appealId, status })
  });

  state.ops = result.ops || state.ops;
  renderOps();
  setAlert(`Appeal #${appealId} marked ${status}.`);
}

async function downloadBackup() {
  const payload = await api("/api/backup");
  $("#restoreConfig").value = JSON.stringify(payload.config, null, 2);
  setAlert("Backup loaded into the restore box.");
}

async function restoreBackup() {
  if (!confirmDangerousAction("Restore backup?", "This replaces live panel settings.")) return;
  const config = JSON.parse($("#restoreConfig").value);
  await api("/api/backup-restore", {
    method: "POST",
    body: JSON.stringify({ config })
  });
  state.automodPreview = null;
  await loadAll();
  setAlert("Backup restored.");
}

async function createAppeal() {
  const payload = await api("/api/appeals", {
    method: "POST",
    body: JSON.stringify({
      userId: $("#appealUserId").value,
      userTag: $("#appealUserTag").value,
      reason: $("#appealReason").value
    })
  });
  state.ops = payload.ops || state.ops;
  $("#appealUserId").value = "";
  $("#appealUserTag").value = "";
  $("#appealReason").value = "";
  renderOps();
  setAlert("Appeal created.");
}

function bindEvents() {
  $("#loginTokenInput").value = state.token;
  updateAuthPanel();
  restorePanelMemory();
  document.addEventListener("input", handleAutosaveInput, true);
  document.addEventListener("change", handleAutosaveInput, true);

  $("#loginSaveToken").addEventListener("click", () => {
    state.token = $("#loginTokenInput").value.trim();
    localStorage.setItem("mochiAdminToken", state.token);
    $("#loginStatus").textContent = "Unlocking...";
    setLoginVisible(true);
    setLoginBusy(true);
    loadAll().catch(error => {
      setLoginBusy(false);
      setLoginVisible(true, error.message);
      setAlert(error.message, "error");
    });
  });
  $("#themeSelect").addEventListener("change", () => {
    applyThemePreset($("#themeSelect").value);
  });
  $("#workspaceSelect").addEventListener("change", () => {
    const value = $("#workspaceSelect").value;
    syncWorkspacePreset(value);
  });
  $("#sidebarToggle").addEventListener("click", () => {
    setSidebarOpen(!document.body.classList.contains("sidebar-open"));
  });
  $("#sidebarBackdrop").addEventListener("click", () => {
    setSidebarOpen(false);
    state.memberDrawerOpen = false;
    renderMemberDrawer();
  });
  $("#globalSearchInput").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      openCommandPalette($("#globalSearchInput").value.trim());
    }
  });
  $("#globalSearchInput").addEventListener("focus", () => {
    if (window.matchMedia("(max-width: 980px)").matches) {
      openCommandPalette($("#globalSearchInput").value.trim());
    }
  });
  $("#localLoginButton").addEventListener("click", () => loginLocalAccount().catch(error => setAlert(error.message, "error")));
  $("#loginTokenInput").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      $("#loginSaveToken").click();
    }
  });
  $("#localUsernameInput").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      $("#localLoginButton").click();
    }
  });
  $("#localPasswordInput").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      $("#localLoginButton").click();
    }
  });

  $("#refreshButton").addEventListener("click", loadAll);
  $("#saveAutomod").addEventListener("click", () => saveAutomod().catch(error => setAlert(error.message, "error")));
  $("#syncGoogleBlockListButton").addEventListener("click", () => syncGoogleBlockList().catch(error => setAlert(error.message, "error")));
  $("#saveAllSettings").addEventListener("click", () => saveAllSettings().catch(error => setAlert(error.message, "error")));
  $("#saveSettings").addEventListener("click", () => saveSettings().catch(error => setAlert(error.message, "error")));
  $("#savePrivacySettings").addEventListener("click", () => savePrivacySettings().catch(error => setAlert(error.message, "error")));
  $("#saveWebAccountButton").addEventListener("click", () => saveWebAccount().catch(error => setAlert(error.message, "error")));
  $("#deleteWebAccountButton").addEventListener("click", () => deleteWebAccount().catch(error => setAlert(error.message, "error")));
  $("#resetWebAccountPasswordButton").addEventListener("click", () => resetWebAccountPassword().catch(error => setAlert(error.message, "error")));
  $("#toggleWebAccountEnabledButton").addEventListener("click", () => toggleWebAccountEnabled().catch(error => setAlert(error.message, "error")));
  $("#generateWebPasswordButton").addEventListener("click", () => {
    const generated = generateWebPassword();
    $("#webAccountPassword").value = generated;
    $("#webAccountPasswordConfirm").value = generated;
    $("#webAccountPassword").focus();
  });
  $("#clearWebAccountForm").addEventListener("click", () => fillWebAccountForm(null));
  $("#webAccountsList").addEventListener("click", event => {
    const editButton = event.target.closest("[data-web-account-edit]");
    if (editButton) {
      const account = (state.webAccounts || []).find(item => item.username === editButton.dataset.webAccountEdit);
      if (account) {
        fillWebAccountForm(account);
      }
      return;
    }

    const toggleButton = event.target.closest("[data-web-account-toggle]");
    if (toggleButton) {
      toggleWebAccountEnabled(toggleButton.dataset.webAccountToggle).catch(error => setAlert(error.message, "error"));
      return;
    }

    const resetButton = event.target.closest("[data-web-account-reset]");
    if (resetButton) {
      resetWebAccountPassword(resetButton.dataset.webAccountReset).catch(error => setAlert(error.message, "error"));
    }
  });
  $("#postAffirmationsPanel").addEventListener("click", () => postAffirmationsPanel().catch(error => setAlert(error.message, "error")));
  $("#saveVerificationSettings").addEventListener("click", () => saveVerificationSettings().catch(error => setAlert(error.message, "error")));
  $("#repostRulesPanel").addEventListener("click", () => repostRulesPanel().catch(error => setAlert(error.message, "error")));
  $("#saveBirthdaySettings").addEventListener("click", () => saveBirthdaySettings().catch(error => setAlert(error.message, "error")));
  $("#repairOnboardingButton").addEventListener("click", () => repairOnboarding().catch(error => setAlert(error.message, "error")));
  $("#postBirthdayPanel").addEventListener("click", () => postBirthdayPanel().catch(error => setAlert(error.message, "error")));
  $("#repostRolePanel").addEventListener("click", () => repostRolePanel().catch(error => setAlert(error.message, "error")));
  $("#repairVerifyPanel").addEventListener("click", () => repairVerifyPanel().catch(error => setAlert(error.message, "error")));
  $("#repairRolePanel").addEventListener("click", () => repairRolePanel().catch(error => setAlert(error.message, "error")));
  $("#runGeneralChatCheck").addEventListener("click", () => updateGeneralChatRule("run-now").catch(error => setAlert(error.message, "error")));
  $("#toggleGeneralChatRule").addEventListener("click", () => updateGeneralChatRule("toggle").catch(error => setAlert(error.message, "error")));
  $("#refreshGeneralChatWatchlist").addEventListener("click", () => loadAll().catch(error => setAlert(error.message, "error")));
  $("#lockVerifiedCurrent").addEventListener("click", () => setVerifiedVisibility(true, "current").catch(error => setAlert(error.message, "error")));
  $("#unlockVerifiedCurrent").addEventListener("click", () => setVerifiedVisibility(false, "current").catch(error => setAlert(error.message, "error")));
  $("#lockVerifiedAll").addEventListener("click", () => setVerifiedVisibility(true, "all").catch(error => setAlert(error.message, "error")));
  $("#unlockVerifiedAll").addEventListener("click", () => setVerifiedVisibility(false, "all").catch(error => setAlert(error.message, "error")));
  $("#markAllUnverified").addEventListener("click", () => markAllUnverified().catch(error => setAlert(error.message, "error")));
  $("#saveStaff").addEventListener("click", () => saveStaff().catch(error => setAlert(error.message, "error")));
  $("#saveExemptions").addEventListener("click", () => saveExemptions().catch(error => setAlert(error.message, "error")));
  $("#saveRuleActions").addEventListener("click", () => saveRuleActions().catch(error => setAlert(error.message, "error")));
  $("#saveOps").addEventListener("click", () => saveOps().catch(error => setAlert(error.message, "error")));
  $("#addTemplateButton").addEventListener("click", () => addTemplateDraft());
  $("#deleteTemplateButton").addEventListener("click", () => deleteTemplateDraft());
  $("#saveCaseFilterButton").addEventListener("click", () => saveCurrentCaseFilter());
  $("#runPreview").addEventListener("click", () => runAutomodPreview().catch(error => setAlert(error.message, "error")));
  $("#downloadBackup").addEventListener("click", () => downloadBackup().catch(error => setAlert(error.message, "error")));
  $("#restoreBackup").addEventListener("click", () => restoreBackup().catch(error => setAlert(error.message, "error")));
  $("#createAppeal").addEventListener("click", () => createAppeal().catch(error => setAlert(error.message, "error")));
  $("#savedCaseFilters").addEventListener("click", event => {
    const button = event.target.closest("[data-saved-filter-index]");
    if (!button) return;
    applySavedCaseFilter(Number(button.dataset.savedFilterIndex));
  });
  $("#activityFilters").addEventListener("click", event => {
    const button = event.target.closest("[data-activity-filter]");
    if (!button) return;
    toggleActivityFilter(button.dataset.activityFilter);
  });
  $("#previewChannelId").addEventListener("input", () => {
    state.previewChannelId = $("#previewChannelId").value;
  });
  $("#previewMessage").addEventListener("input", () => {
    state.previewMessage = $("#previewMessage").value;
  });
  $("#automodPreviewResult").addEventListener("click", event => {
    const button = event.target.closest("[data-preview-override]");
    if (!button) return;
    applyAutomodPreviewOverride(button.dataset.previewOverride, button.dataset.ruleKey || "").catch(error => setAlert(error.message, "error"));
  });
  document.querySelectorAll("[data-automod-preset]").forEach(button => {
    button.addEventListener("click", () => applyAutomodPreset(button.dataset.automodPreset));
  });
  document.querySelectorAll("[data-automod-sample]").forEach(button => {
    button.addEventListener("click", () => {
      $("#previewMessage").value = automodTestSamples[button.dataset.automodSample] || "";
      state.previewMessage = $("#previewMessage").value;
      runAutomodPreview().catch(error => setAlert(error.message, "error"));
    });
  });
  $("#memberSearchButton").addEventListener("click", () => searchMember().catch(error => setAlert(error.message, "error")));
  $("#memberAiSummaryButton").addEventListener("click", () => loadMemberAiSummary().catch(error => setAlert(error.message, "error")));
  $("#memberActionButton").addEventListener("click", () => applyMemberAction().catch(error => setAlert(error.message, "error")));
  $("#memberSearchInput").addEventListener("input", () => {
    const query = $("#memberSearchInput").value.trim();
    localStorage.setItem(storageKeys.lastMemberSearch, $("#memberSearchInput").value);
    debounce("memberSearch", () => {
      if ($("#memberSearchInput").value.trim().length < 2) return;
      searchMember().catch(error => setAlert(error.message, "error"));
    }, 350);
  });
  $("#recentMemberSearches").addEventListener("click", event => {
    const button = event.target.closest("[data-member-search]");
    if (!button) return;
    $("#memberSearchInput").value = button.dataset.memberSearch || "";
    searchMember().catch(error => setAlert(error.message, "error"));
  });
  $("#memberProfile").addEventListener("click", event => {
    const drawerButton = event.target.closest("#openMemberDrawerButton");
    if (drawerButton) {
      state.memberDrawerOpen = true;
      renderMemberDrawer();
      return;
    }

    const copyButton = event.target.closest("[data-copy-id]");
    if (copyButton) {
      copyToClipboard(copyButton.dataset.copyId).then(copied => {
        setAlert(copied ? "Member ID copied." : "Copy failed.", copied ? "info" : "error");
      });
      return;
    }

    const undoButton = event.target.closest("[data-undo-member-record-delete]");
    if (undoButton) {
      restoreLastDeletedMemberRecord().catch(error => setAlert(error.message, "error"));
      return;
    }

    const shortcutButton = event.target.closest("[data-member-shortcut]");
    if (shortcutButton) {
      applyMemberShortcut(shortcutButton.dataset.memberShortcut);
      return;
    }

    const templateButton = event.target.closest("[data-template-index]");
    if (!templateButton) return;
    const template = (state.ops?.templates || [])[Number(templateButton.dataset.templateIndex)];
    if (!template) return;
    $("#memberAction").value = template.action || "warn";
    $("#memberActionReason").value = template.reason || "";
    $("#memberActionDuration").value = template.duration || "";
    localStorage.setItem(storageKeys.memberAction, $("#memberAction").value);
    localStorage.setItem(storageKeys.memberDuration, $("#memberActionDuration").value);
    setAlert(`Loaded ${template.label || "template"} into the moderation form.`);
  });
  $("#memberSignals").addEventListener("click", event => {
    const saveButton = event.target.closest("[data-member-record-save]");
    if (saveButton) {
      saveMemberRecord(saveButton.dataset.memberRecordSave, Number(saveButton.dataset.memberRecordIndex), "update")
        .catch(error => setAlert(error.message, "error"));
      return;
    }

    const deleteButton = event.target.closest("[data-member-record-delete]");
    if (deleteButton) {
      saveMemberRecord(deleteButton.dataset.memberRecordDelete, Number(deleteButton.dataset.memberRecordIndex), "delete")
        .catch(error => setAlert(error.message, "error"));
    }
  });
  document.querySelectorAll("[data-member-preset]").forEach(button => {
    button.addEventListener("click", () => applyMemberPreset(button.dataset.memberPreset));
  });
  $("#recentActionsList").addEventListener("click", event => {
    const button = event.target.closest("[data-recent-action-load]");
    if (!button) return;
    $("#memberAction").value = button.dataset.recentActionLoad || "warn";
    $("#memberActionReason").value = button.dataset.recentActionReason || "";
    $("#memberActionDuration").value = button.dataset.recentActionDuration || "";
    localStorage.setItem(storageKeys.memberAction, $("#memberAction").value);
    localStorage.setItem(storageKeys.memberDuration, $("#memberActionDuration").value);
    setActiveView("members");
    setAlert("Loaded recent action into the moderation form.");
  });
  $("#memberDrawer").addEventListener("click", event => {
    if (event.target.closest("#closeMemberDrawerButton")) {
      state.memberDrawerOpen = false;
      renderMemberDrawer();
      return;
    }
    const copyButton = event.target.closest("[data-copy-id]");
    if (copyButton) {
      copyToClipboard(copyButton.dataset.copyId).then(copied => {
        setAlert(copied ? "Member ID copied." : "Copy failed.", copied ? "info" : "error");
      });
      return;
    }
    const shortcutButton = event.target.closest("[data-member-shortcut]");
    if (shortcutButton) {
      applyMemberShortcut(shortcutButton.dataset.memberShortcut);
      return;
    }
    const searchButton = event.target.closest("[data-member-search]");
    if (searchButton) {
      $("#memberSearchInput").value = searchButton.dataset.memberSearch || "";
      searchMember().catch(error => setAlert(error.message, "error"));
    }
  });
  $("#clearRecentActions").addEventListener("click", clearRecentActions);
  $("#toggleMemberExemption").addEventListener("click", () => toggleSelectedMemberExemption(true).catch(error => setAlert(error.message, "error")));
  $("#removeMemberExemption").addEventListener("click", () => toggleSelectedMemberExemption(false).catch(error => setAlert(error.message, "error")));
  $("#memberAction").addEventListener("change", () => {
    localStorage.setItem(storageKeys.memberAction, $("#memberAction").value);
  });
  $("#memberTemplate").addEventListener("change", () => {
    const template = (state.ops?.templates || [])[Number($("#memberTemplate").value)];
    if (!template) return;
    $("#memberAction").value = template.action || "warn";
    $("#memberActionReason").value = template.reason || "";
    $("#memberActionDuration").value = template.duration || "";
    localStorage.setItem(storageKeys.memberAction, $("#memberAction").value);
  });
  $("#memberActionDuration").addEventListener("input", () => {
    localStorage.setItem(storageKeys.memberDuration, $("#memberActionDuration").value);
  });
  $("#templateList").addEventListener("click", event => {
    const button = event.target.closest("[data-template-edit-index]");
    if (!button) return;
    selectTemplateEditorIndex(Number(button.dataset.templateEditIndex));
  });
  $("#templateEditorFields").addEventListener("input", event => {
    const field = event.target.closest("[data-template-field]");
    if (!field) return;
    updateSelectedTemplateDraft(field.dataset.templateField, field.value);
  });
  $("#templateEditorFields").addEventListener("change", event => {
    const field = event.target.closest("[data-template-field]");
    if (!field) return;
    updateSelectedTemplateDraft(field.dataset.templateField, field.value);
    renderTemplateEditor();
  });
  $("#templateEditorFields").addEventListener("click", event => {
    const button = event.target.closest("[data-template-action]");
    if (!button) return;
    if (button.dataset.templateAction === "duplicate") duplicateTemplateDraft();
  });
  $("#timelineSearchInput").addEventListener("input", () => {
    localStorage.setItem(storageKeys.timelineSearch, $("#timelineSearchInput").value);
    renderMemberTimeline();
    renderRecords();
  });
  $("#memberChatSearchInput").addEventListener("input", () => {
    localStorage.setItem(storageKeys.memberChatSearch, $("#memberChatSearchInput").value);
    debounce("memberChatSearch", () => renderMemberChatLogs(), 180);
  });
  $("#memberChatChannelFilter").addEventListener("change", () => {
    localStorage.setItem(storageKeys.memberChatChannelFilter, $("#memberChatChannelFilter").value);
    renderMemberChatLogs();
  });
  $("#memberChatDateRange").addEventListener("change", () => {
    localStorage.setItem(storageKeys.memberChatDateRange, $("#memberChatDateRange").value);
    renderMemberChatLogs();
  });
  $("#exportMemberChatLogs").addEventListener("click", exportMemberChatLogs);
  $("#memberSearchInput").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchMember().catch(error => setAlert(error.message, "error"));
    }
  });
  $("#auditFilterInput").addEventListener("input", () => {
    localStorage.setItem(storageKeys.auditFilter, $("#auditFilterInput").value);
    debounce("auditFilter", () => renderOps(), 140);
  });
  $("#appealStatusFilter").addEventListener("change", () => {
    localStorage.setItem(storageKeys.appealFilter, $("#appealStatusFilter").value);
    renderOps();
  });
  ["#caseFilterUser", "#caseFilterAction", "#caseFilterModerator"].forEach(selector => {
    $(selector).addEventListener("input", () => {
      persistCaseFilters();
      debounce("caseFilters", () => renderRecords(), 120);
    });
  });
  $("#resetCaseFilters").addEventListener("click", () => {
    $("#caseFilterUser").value = "";
    $("#caseFilterAction").value = "";
    $("#caseFilterModerator").value = "";
    localStorage.removeItem(storageKeys.caseFilters);
    renderRecords();
  });
  $("#aiReviewList").addEventListener("click", event => {
    const button = event.target.closest("[data-ai-action]");
    if (!button) return;
    applyAiReviewAction(button.dataset.caseId, button.dataset.aiAction).catch(error => setAlert(error.message, "error"));
  });
  $("#appealsList").addEventListener("click", event => {
    const button = event.target.closest("[data-appeal-status]");
    if (!button) return;
    updateAppealStatus(button.dataset.appealId, button.dataset.appealStatus).catch(error => setAlert(error.message, "error"));
  });
  $("#commandPalette").addEventListener("click", event => {
    if (event.target.closest("[data-close-palette]")) closeCommandPalette();
  });
  $("#commandPaletteInput").addEventListener("input", () => {
    renderCommandPaletteList($("#commandPaletteInput").value);
  });
  $("#commandPaletteInput").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      const firstCommand = $("#commandPaletteList [data-command-kind]");
      if (firstCommand) {
        runPaletteCommand(firstCommand.dataset.commandKind, firstCommand.dataset.commandValue);
      }
    }
  });
  $("#commandPaletteList").addEventListener("click", event => {
    const button = event.target.closest("[data-command-kind]");
    if (!button) return;
    runPaletteCommand(button.dataset.commandKind, button.dataset.commandValue);
  });
  $("#commandPaletteButton").addEventListener("click", () => openCommandPalette($("#globalSearchInput").value.trim()));
  $("#advancedToggle").addEventListener("click", () => {
    setAdvancedToolsVisible(!isAdvancedToolsVisible());
  });
  document.querySelectorAll("[data-subtab-view]").forEach(button => {
    button.addEventListener("click", () => {
      setActiveSubtab(button.dataset.subtabView, button.dataset.subtab);
    });
  });
  $("#quickActions").addEventListener("click", event => {
    const button = event.target.closest("[data-quick-action]");
    if (!button) return;

    const action = quickActions.find(item => item.id === button.dataset.quickAction);
    if (!action) return;

    if (action.view) {
      setActiveView(action.view);
      if (action.subtab) {
        setActiveSubtab(action.view, action.subtab);
      }
      return;
    }

    if (action.preset) {
      setActiveView("members");
      applyMemberPreset(action.preset);
    }

    if (action.bulkPreset) {
      applyBulkPreset(action.bulkPreset);
    }
  });

  document.querySelectorAll(".tab").forEach(button => {
    button.addEventListener("click", () => setActiveView(button.dataset.view));
  });

  document.addEventListener("keydown", event => {
    const target = event.target;
    const editable = target && (target.closest?.("input, textarea, select") || target.isContentEditable);

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if ($("#commandPalette").classList.contains("hidden")) {
        openCommandPalette();
      } else {
        closeCommandPalette();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveCurrentView().catch(error => setAlert(error.message, "error"));
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z" && state.lastDeletedMemberRecord && state.selectedMember && !editable) {
      event.preventDefault();
      restoreLastDeletedMemberRecord().catch(error => setAlert(error.message, "error"));
      return;
    }

    if (event.key === "Escape" && !$("#commandPalette").classList.contains("hidden")) {
      closeCommandPalette();
      return;
    }

    if (event.key === "Escape" && state.memberDrawerOpen) {
      state.memberDrawerOpen = false;
      renderMemberDrawer();
    }
  });
}

bindEvents();
loadAll();
