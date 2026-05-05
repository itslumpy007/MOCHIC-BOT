const state = {
  token: localStorage.getItem("mochiAdminToken") || "",
  me: null,
  dashboard: null,
  config: null,
  ops: null,
  aiReviews: {},
  selectedMember: null,
  memberAiSummary: null,
  automodPreview: null,
  previewChannelId: "",
  previewMessage: "",
  timelineSearch: "",
  cases: [],
  warnings: {},
  notes: {}
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
  caseFilters: "mochiCaseFilters",
  lastMemberSearch: "mochiLastMemberSearch",
  memberAction: "mochiMemberAction",
  memberDuration: "mochiMemberDuration",
  timelineSearch: "mochiTimelineSearch",
  auditFilter: "mochiAuditFilter",
  appealFilter: "mochiAppealFilter"
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
  logChannelId: "Log channel ID",
  automodLogChannelId: "AutoMod log channel ID",
  mutedRoleId: "Muted role ID"
};

const verificationSettingLabels = {
  tiktokHandle: "TikTok handle",
  tiktokNicknameAliases: "Accepted nicknames",
  verifiedRoleId: "Verified role ID",
  unverifiedRoleId: "Unverified role ID"
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
  }
};

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

function setAlert(message, kind = "info") {
  const alert = $("#alert");
  alert.textContent = message;
  alert.classList.toggle("hidden", !message);
  alert.style.borderColor = kind === "error" ? "#ffc7c7" : "#f0cf90";
  alert.style.background = kind === "error" ? "#fff0f0" : "#fff7e8";
  alert.style.color = kind === "error" ? "#8a1f1f" : "#704800";
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

function setActiveView(view) {
  const requestedView = titles[view] ? view : getDefaultView();
  const nextView = isViewAllowed(requestedView) ? requestedView : getDefaultView();
  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.toggle("is-active", tab.dataset.view === nextView);
  });
  document.querySelectorAll(".view").forEach(section => {
    section.classList.toggle("is-active", section.id === `${nextView}View`);
  });
  $("#viewTitle").textContent = titles[nextView];
  localStorage.setItem(storageKeys.activeView, nextView);
}

function applyAccessRestrictions() {
  const isAdmin = hasPanelAccess("admin");
  const isMod = hasPanelAccess("mod");

  document.querySelectorAll("[data-required-access]").forEach(element => {
    const allowed = hasPanelAccess(element.dataset.requiredAccess);
    element.classList.toggle("hidden", !allowed);
    element.querySelectorAll("input, textarea, select, button").forEach(control => {
      control.disabled = !allowed;
    });
  });

  document.querySelectorAll(".tab").forEach(tab => {
    const allowed = tab.dataset.requiredAccess ? hasPanelAccess(tab.dataset.requiredAccess) : isMod;
    tab.classList.toggle("hidden", !allowed);
    tab.disabled = !allowed;
  });

  if (!isAdmin && ["settings", "staff", "ops"].includes(localStorage.getItem(storageKeys.activeView))) {
    localStorage.setItem(storageKeys.activeView, getDefaultView());
  }
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
  setActiveView(localStorage.getItem(storageKeys.activeView) || "overview");
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

function updateAuthPanel() {
  const me = state.me || {};
  const user = me.user;
  const signedInUser = $("#signedInUser");
  const logoutLink = $("#logoutLink");

  if (me.authenticated && user) {
    signedInUser.textContent = `${user.tag || user.username} - ${me.accessLevel} access`;
    logoutLink.classList.remove("hidden");
  } else if (state.token) {
    signedInUser.textContent = "Token access active";
    logoutLink.classList.add("hidden");
  } else if (me.oauthConfigured) {
    signedInUser.textContent = "Use Discord login for staff access.";
    logoutLink.classList.add("hidden");
  } else {
    signedInUser.textContent = "Discord login is not configured yet.";
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
  const counts = state.dashboard?.counts || {};
  const metrics = [
    ["Cases", counts.cases || 0],
    ["Warning Users", counts.warningUsers || 0],
    ["Staff Notes", counts.noteUsers || 0],
    ["AutoMod Hits", state.dashboard?.analytics?.totalDetections || 0],
    ["Banned Words", counts.bannedWords || 0],
    ["Blocked Domains", counts.blockedDomains || 0],
    ["Allowed Domains", counts.allowedDomains || 0],
    ["Temp Bans", counts.tempBans || 0]
  ];

  $("#metricGrid").innerHTML = metrics
    .map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong><small>${getMetricHint(label)}</small></article>`)
    .join("");
}

function getMetricHint(label) {
  return {
    Cases: "all recorded actions",
    "Warning Users": "members with warnings",
    "Staff Notes": "members with notes",
    "AutoMod Hits": "detected events",
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
    ["Log Channel", channels.log || "Not set"],
    ["AutoMod Log", channels.automodLog || "Not set"]
  ];

  $("#runtimeList").innerHTML = rows
    .map(([label, value]) => `<dt>${label}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");

  $("#clientStatus").textContent = client.ready ? client.tag : "Bot not ready";
}

function renderRecentViolations() {
  const items = state.dashboard?.analytics?.recentViolations || [];
  $("#recentViolations").innerHTML = items.length
    ? items.slice(0, 8).map(item => `
      <article class="event">
        <strong><span class="status-dot red"></span>${escapeHtml(item.action)} - ${escapeHtml(item.userTag)}</strong>
        <p>${escapeHtml(item.reason)}</p>
      </article>
    `).join("")
    : renderEmptyState("No detections", "AutoMod has not recorded recent violations.");
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
  const summary = [
    ["Enabled", `${enabledRules}/${totalRules}`],
    ["Detections", analytics.totalDetections || 0],
    ["Top Rule", topRule ? `${topRule[0]} (${topRule[1]})` : "None"],
    ["Raid Action", automod.raidAction || "log"],
    ["AI", automod.aiModerationEnabled ? `${automod.aiModerationThreshold || 70}%` : "Off"],
    ["Custom AI", automod.aiCustomRulesEnabled ? `${automod.aiCustomRulesThreshold || 75}%` : "Off"],
    ["Dry Run", automod.dryRunEnabled ? "On" : "Off"],
    ["Profiles", (state.ops?.channelProfiles || "").split("\n").filter(Boolean).length || 0],
    ["Overrides", overrideCount]
  ];

  $("#automodSummary").innerHTML = summary
    .map(([label, value]) => `<article class="summary-item"><span>${label}</span><strong>${escapeHtml(value)}</strong></article>`)
    .join("");
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
    .map(([key, label]) => `
      <label>${label}
        <input data-setting="${key}" value="${escapeHtml(settings[key] || "")}">
      </label>
    `).join("");

  $("#verificationSettingsFields").innerHTML = Object.entries(verificationSettingLabels)
    .map(([key, label]) => `
      <label>${label}
        <textarea data-setting="${key}" rows="${key === "tiktokNicknameAliases" ? "4" : "2"}" placeholder="${key === "tiktokNicknameAliases" ? "Name 1, Name 2, Name 3" : ""}">${escapeHtml(Array.isArray(settings[key]) ? settings[key].join(", ") : (settings[key] || ""))}</textarea>
      </label>
    `).join("");

  $("#exemptChannelIds").value = (automod.exemptChannelIds || []).join(", ");
  $("#exemptRoleIds").value = (automod.exemptRoleIds || []).join(", ");
  $("#exemptUserIds").value = (automod.exemptUserIds || []).join(", ");
}

function collectSettingsPayload() {
  const payload = {};
  document.querySelectorAll("[data-setting]").forEach(input => {
    payload[input.dataset.setting] = input.value;
  });
  return payload;
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
  $("#modTemplates").value = templates.map(item =>
    `${item.label || ""} | ${item.action || "warn"} | ${item.duration || ""} | ${item.reason || ""}`
  ).join("\n");
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

function renderTemplates() {
  const templates = state.ops?.templates || [];
  $("#memberTemplate").innerHTML = `<option value="">No template</option>` + templates.map((item, index) =>
    `<option value="${index}">${escapeHtml(item.label || `Template ${index + 1}`)}</option>`
  ).join("");
}

function renderRecords() {
  const filteredCases = getFilteredCases();
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
    $("#memberProfile").innerHTML = "Search for a member to load their moderation profile.";
    $("#memberAiSummary").innerHTML = "";
    $("#memberAiSummaryButton").disabled = true;
    $("#memberAiSummaryButton").textContent = "AI Summary";
    $("#memberTimeline").innerHTML = "";
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

  $("#memberProfile").innerHTML = `
    <article class="profile-card">
      <div class="profile-title">
        ${member.avatarUrl ? `<img src="${member.avatarUrl}" alt="">` : ""}
        <div>
          <strong>${escapeHtml(member.tag)}</strong>
          <span>${escapeHtml(member.id)}</span>
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

  const signals = [
    ...(member.warnings || []).map(entry => ({ type: "Warning", text: entry.reason, moderatorTag: entry.moderatorTag })),
    ...(member.notes || []).map(entry => ({ type: "Note", text: entry.content, moderatorTag: entry.moderatorTag }))
  ];

  $("#memberSignals").innerHTML = signals.length
    ? signals.slice(0, 20).map(entry => `
      <article class="event">
        <strong>${escapeHtml(entry.type)}</strong>
        <p>${escapeHtml(entry.text || "No details")}<br>${escapeHtml(entry.moderatorTag || "")}</p>
      </article>
    `).join("")
    : renderEmptyState("No warnings or notes", "This member has no saved signals.");

  renderMemberAiSummary();
  renderMemberTimeline();
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

  return [...cases, ...warnings, ...notes]
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
      </article>
    `).join("")
    : renderEmptyState("No matching history", "Try a different member history search.");
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
  const payload = await api(`/api/member?query=${encodeURIComponent(query)}`);
  state.selectedMember = payload.member;
  state.memberAiSummary = null;
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

  if (risky && !window.confirm(`Apply ${action} to ${state.selectedMember.tag}?`)) {
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

function renderAll() {
  renderMetrics();
  renderRuntime();
  renderRecentViolations();
  renderAutomod();
  renderAiReview();
  renderSettings();
  renderStaff();
  renderOps();
  renderTemplates();
  renderRecords();
  if (state.selectedMember) renderMemberProfile();
}

async function loadAll() {
  try {
    updateApiState("Loading");
    state.me = await api("/api/me");
    updateAuthPanel();

    if (!state.me.authenticated && !state.token) {
      updateApiState("Login required");
      setLoginVisible(true, state.me.oauthConfigured ? "Login with Discord or use the backup admin token." : "Enter the backup admin token to load the dashboard.");
      return;
    }

    const [dashboard, config, casesPayload, warningsPayload, notesPayload, opsPayload] = await Promise.all([
      api("/api/dashboard"),
      api("/api/config"),
      api("/api/cases"),
      api("/api/warnings"),
      api("/api/notes"),
      api("/api/ops")
    ]);

    state.dashboard = dashboard;
    state.config = config;
    state.aiReviews = config.aiReviews || {};
    state.cases = casesPayload.cases || [];
    state.warnings = warningsPayload.warnings || {};
    state.notes = notesPayload.notes || {};
    state.ops = opsPayload;
    applyAccessRestrictions();
    renderAll();
    applyAccessRestrictions();
    setLoginVisible(false);
    updateApiState("Live", "ok");
    setAlert("");
  } catch (error) {
    updateApiState("Locked", "error");
    setLoginVisible(!state.me?.authenticated, error.message);
    setAlert(error.message, "error");
  }
}

async function saveAutomod() {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change AutoMod settings.", "error");
    return;
  }
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
  await loadAll();
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
  await loadAll();
  setAlert(mode === "rule" ? `Ignored ${ruleKey} in that channel.` : "Channel override saved.");
}

async function saveStaff() {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change staff access.", "error");
    return;
  }
  const result = await api("/api/permissions", {
    method: "POST",
    body: JSON.stringify({
      modRoleIds: $("#modRoleIds").value,
      adminRoleIds: $("#adminRoleIds").value
    })
  });
  state.config.permissions = result.permissions;
  await loadAll();
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

async function saveSettings() {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change server settings.", "error");
    return;
  }
  const payload = collectSettingsPayload();

  const result = await api("/api/settings", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  state.config.settings = result.settings;
  await loadAll();
}

async function saveAndPostTikTokVerify() {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change server settings.", "error");
    return;
  }

  const payload = collectSettingsPayload();
  const result = await api("/api/tiktok-verify-setup", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  state.config.settings = result.settings;
  await loadAll();
  setAlert("TikTok verify panel saved and posted.");
}

async function saveExemptions() {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change exemptions.", "error");
    return;
  }
  const result = await api("/api/automod", {
    method: "POST",
    body: JSON.stringify({
      exemptChannelIds: $("#exemptChannelIds").value,
      exemptRoleIds: $("#exemptRoleIds").value,
      exemptUserIds: $("#exemptUserIds").value
    })
  });
  state.config.automod = result.automod;
  await loadAll();
}

async function saveRuleActions() {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change rule actions.", "error");
    return;
  }
  await api("/api/rule-actions", {
    method: "POST",
    body: JSON.stringify({
      alertRules: $("#alertRules").value,
      warnRules: $("#warnRules").value,
      timeoutRules: $("#timeoutRules").value,
      raidAction: $("#raidAction").value
    })
  });
  await loadAll();
}

async function saveOps() {
  if (!hasPanelAccess("admin")) {
    setAlert("Admin web access is required to change operations settings.", "error");
    return;
  }
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
  renderOps();
  setAlert("Operations settings saved.");
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
  await loadAll();
  setAlert(`Appeal #${appealId} marked ${status}.`);
}

async function downloadBackup() {
  const payload = await api("/api/backup");
  $("#restoreConfig").value = JSON.stringify(payload.config, null, 2);
  setAlert("Backup loaded into the restore box.");
}

async function restoreBackup() {
  if (!window.confirm("Restore this config backup? This replaces live panel settings.")) return;
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

  $("#loginSaveToken").addEventListener("click", () => {
    state.token = $("#loginTokenInput").value.trim();
    localStorage.setItem("mochiAdminToken", state.token);
    loadAll();
  });
  $("#loginTokenInput").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      $("#loginSaveToken").click();
    }
  });

  $("#refreshButton").addEventListener("click", loadAll);
  $("#saveAutomod").addEventListener("click", () => saveAutomod().catch(error => setAlert(error.message, "error")));
  $("#saveSettings").addEventListener("click", () => saveSettings().catch(error => setAlert(error.message, "error")));
  $("#saveAndPostTikTokVerify").addEventListener("click", () => saveAndPostTikTokVerify().catch(error => setAlert(error.message, "error")));
  $("#saveStaff").addEventListener("click", () => saveStaff().catch(error => setAlert(error.message, "error")));
  $("#saveExemptions").addEventListener("click", () => saveExemptions().catch(error => setAlert(error.message, "error")));
  $("#saveRuleActions").addEventListener("click", () => saveRuleActions().catch(error => setAlert(error.message, "error")));
  $("#saveOps").addEventListener("click", () => saveOps().catch(error => setAlert(error.message, "error")));
  $("#runPreview").addEventListener("click", () => runAutomodPreview().catch(error => setAlert(error.message, "error")));
  $("#downloadBackup").addEventListener("click", () => downloadBackup().catch(error => setAlert(error.message, "error")));
  $("#restoreBackup").addEventListener("click", () => restoreBackup().catch(error => setAlert(error.message, "error")));
  $("#createAppeal").addEventListener("click", () => createAppeal().catch(error => setAlert(error.message, "error")));
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
  document.querySelectorAll("[data-member-preset]").forEach(button => {
    button.addEventListener("click", () => applyMemberPreset(button.dataset.memberPreset));
  });
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
  $("#timelineSearchInput").addEventListener("input", () => {
    localStorage.setItem(storageKeys.timelineSearch, $("#timelineSearchInput").value);
    renderMemberTimeline();
    renderRecords();
  });
  $("#memberSearchInput").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchMember().catch(error => setAlert(error.message, "error"));
    }
  });
  $("#auditFilterInput").addEventListener("input", () => {
    localStorage.setItem(storageKeys.auditFilter, $("#auditFilterInput").value);
    renderOps();
  });
  $("#appealStatusFilter").addEventListener("change", () => {
    localStorage.setItem(storageKeys.appealFilter, $("#appealStatusFilter").value);
    renderOps();
  });
  ["#caseFilterUser", "#caseFilterAction", "#caseFilterModerator"].forEach(selector => {
    $(selector).addEventListener("input", () => {
      persistCaseFilters();
      renderRecords();
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

  document.querySelectorAll(".tab").forEach(button => {
    button.addEventListener("click", () => setActiveView(button.dataset.view));
  });
}

bindEvents();
loadAll();
