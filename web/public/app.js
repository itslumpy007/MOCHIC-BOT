const state = {
  token: localStorage.getItem("mochiAdminToken") || "",
  me: null,
  dashboard: null,
  config: null,
  cases: [],
  warnings: {},
  notes: {}
};

const titles = {
  overview: "Overview",
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
    .map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
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
        <strong>${escapeHtml(item.action)} - ${escapeHtml(item.userTag)}</strong>
        <p>${escapeHtml(item.reason)}</p>
      </article>
    `).join("")
    : `<article class="event"><strong>No detections</strong><p>AutoMod has not recorded recent violations.</p></article>`;
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
  $("#casesTable").innerHTML = (state.cases || []).slice(0, 80).map(entry => `
    <tr>
      <td>${escapeHtml(entry.id || "")}</td>
      <td>${escapeHtml(entry.action || "")}</td>
      <td>${escapeHtml(entry.targetTag || entry.targetId || "")}</td>
      <td>${escapeHtml(entry.moderatorTag || "")}</td>
      <td>${escapeHtml(entry.reason || "")}</td>
    </tr>
  `).join("") || `<tr><td colspan="5">No cases saved.</td></tr>`;

  $("#warningsList").innerHTML = renderRecordMap(state.warnings, "warning");
  $("#notesList").innerHTML = renderRecordMap(state.notes, "note");
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
    : `<article class="event"><strong>No ${label}s</strong><p>No saved ${label} records.</p></article>`;
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
