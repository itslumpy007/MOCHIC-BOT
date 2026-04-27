const state = {
  token: localStorage.getItem("mochiAdminToken") || "",
  me: null,
  dashboard: null,
  config: null,
  selectedMember: null,
  cases: [],
  warnings: {},
  notes: {}
};

const titles = {
  overview: "Overview",
  members: "Members",
  automod: "AutoMod",
  settings: "Settings",
  records: "Records"
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
  escalationEnabled: "Escalation",
  emojiSpamEnabled: "Emoji spam"
};

const limitLabels = {
  maxMentions: "Mention limit",
  maxEmojiCount: "Emoji limit",
  maxAttachmentSizeMb: "Attachment MB limit",
  raidJoinThreshold: "Raid threshold",
  warnThreshold: "Warn threshold",
  timeoutThreshold: "Timeout threshold"
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

function updateApiState(label, kind = "") {
  const apiState = $("#apiState");
  apiState.textContent = label;
  apiState.className = `pill ${kind}`.trim();
}

function updateAuthPanel() {
  const me = state.me || {};
  const user = me.user;
  const signedInUser = $("#signedInUser");
  const logoutLink = $("#logoutLink");

  if (me.authenticated && user) {
    signedInUser.textContent = `${user.tag || user.username} - ${me.accessLevel} access`;
    logoutLink.classList.remove("hidden");
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

  const ruleActions = automod.ruleActions || {};
  const grouped = Object.entries(ruleActions).reduce((acc, [rule, mode]) => {
    acc[mode] = [...(acc[mode] || []), rule];
    return acc;
  }, {});

  $("#alertRules").value = (automod.alertOnlyRules || grouped.alert || []).join(", ");
  $("#warnRules").value = (grouped.warn || []).join(", ");
  $("#timeoutRules").value = (grouped.timeout || []).join(", ");
}

function renderSettings() {
  const settings = state.config?.settings || {};
  const automod = state.config?.automod || {};

  $("#settingsFields").innerHTML = Object.entries(settingLabels)
    .map(([key, label]) => `
      <label>${label}
        <input data-setting="${key}" value="${escapeHtml(settings[key] || "")}">
      </label>
    `).join("");

  $("#exemptChannelIds").value = (automod.exemptChannelIds || []).join(", ");
  $("#exemptRoleIds").value = (automod.exemptRoleIds || []).join(", ");
  $("#exemptUserIds").value = (automod.exemptUserIds || []).join(", ");
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
    $("#memberCases").innerHTML = "";
    $("#memberSignals").innerHTML = "";
    return;
  }

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
      </dl>
      <div class="badge-row">
        <span class="badge">${member.counts.warnings} warnings</span>
        <span class="badge">${member.counts.notes} notes</span>
        <span class="badge">${member.counts.cases} cases</span>
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
}

async function searchMember() {
  const query = $("#memberSearchInput").value.trim();
  if (!query) {
    setAlert("Enter a Discord ID, mention, or username.", "error");
    return;
  }

  const payload = await api(`/api/member?query=${encodeURIComponent(query)}`);
  state.selectedMember = payload.member;
  renderMemberProfile();
  setAlert("");
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
  renderSettings();
  renderRecords();
}

async function loadAll() {
  try {
    updateApiState("Loading");
    state.me = await api("/api/me");
    updateAuthPanel();

    if (!state.me.authenticated && !state.token) {
      updateApiState("Login required");
      setAlert(state.me.oauthConfigured ? "Login with Discord to load the dashboard." : "Enter the backup admin token to load the dashboard.");
      return;
    }

    const [dashboard, config, casesPayload, warningsPayload, notesPayload] = await Promise.all([
      api("/api/dashboard"),
      api("/api/config"),
      api("/api/cases"),
      api("/api/warnings"),
      api("/api/notes")
    ]);

    state.dashboard = dashboard;
    state.config = config;
    state.cases = casesPayload.cases || [];
    state.warnings = warningsPayload.warnings || {};
    state.notes = notesPayload.notes || {};
    renderAll();
    updateApiState("Live", "ok");
    setAlert("");
  } catch (error) {
    updateApiState("Locked", "error");
    setAlert(error.message, "error");
  }
}

async function saveAutomod() {
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

  const result = await api("/api/automod", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  state.config.automod = result.automod;
  await loadAll();
}

async function saveSettings() {
  const payload = {};
  document.querySelectorAll("[data-setting]").forEach(input => {
    payload[input.dataset.setting] = input.value;
  });

  const result = await api("/api/settings", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  state.config.settings = result.settings;
  await loadAll();
}

async function saveExemptions() {
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
  await api("/api/rule-actions", {
    method: "POST",
    body: JSON.stringify({
      alertRules: $("#alertRules").value,
      warnRules: $("#warnRules").value,
      timeoutRules: $("#timeoutRules").value
    })
  });
  await loadAll();
}

function bindEvents() {
  $("#tokenInput").value = state.token;
  updateAuthPanel();

  $("#saveToken").addEventListener("click", () => {
    state.token = $("#tokenInput").value.trim();
    localStorage.setItem("mochiAdminToken", state.token);
    loadAll();
  });

  $("#refreshButton").addEventListener("click", loadAll);
  $("#saveAutomod").addEventListener("click", () => saveAutomod().catch(error => setAlert(error.message, "error")));
  $("#saveSettings").addEventListener("click", () => saveSettings().catch(error => setAlert(error.message, "error")));
  $("#saveExemptions").addEventListener("click", () => saveExemptions().catch(error => setAlert(error.message, "error")));
  $("#saveRuleActions").addEventListener("click", () => saveRuleActions().catch(error => setAlert(error.message, "error")));
  $("#memberSearchButton").addEventListener("click", () => searchMember().catch(error => setAlert(error.message, "error")));
  $("#memberActionButton").addEventListener("click", () => applyMemberAction().catch(error => setAlert(error.message, "error")));
  $("#memberSearchInput").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchMember().catch(error => setAlert(error.message, "error"));
    }
  });
  ["#caseFilterUser", "#caseFilterAction", "#caseFilterModerator"].forEach(selector => {
    $(selector).addEventListener("input", renderRecords);
  });
  $("#resetCaseFilters").addEventListener("click", () => {
    $("#caseFilterUser").value = "";
    $("#caseFilterAction").value = "";
    $("#caseFilterModerator").value = "";
    renderRecords();
  });

  document.querySelectorAll(".tab").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("is-active"));
      document.querySelectorAll(".view").forEach(view => view.classList.remove("is-active"));
      button.classList.add("is-active");
      $(`#${button.dataset.view}View`).classList.add("is-active");
      $("#viewTitle").textContent = titles[button.dataset.view];
    });
  });
}

bindEvents();
loadAll();
