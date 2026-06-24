const $ = selector => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function formatDate(value) {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

const state = {
  me: null,
  tickets: [],
  inboxSummary: null,
  selectedTicketId: null,
  selectedTicket: null,
  activeView: "tickets",
  staffFilter: "all",
  ticketSearch: ""
};

function getViewId(viewName) {
  if (viewName === "support-request") return "supportRequestView";
  if (viewName === "anonymous") return "anonymousView";
  return "ticketsView";
}

function getSupportRole() {
  return ["admin", "mod"].includes(state.me?.accessLevel) ? "staff" : "member";
}

function applySupportMode() {
  const isStaff = getSupportRole() === "staff";
  document.body.classList.toggle("support-is-staff", isStaff);
  document.body.classList.toggle("support-is-member", !isStaff);
  $("#appShell")?.classList.toggle("support-staff-shell", isStaff);
  $("#appShell")?.classList.toggle("support-member-shell", !isStaff);
}

function setSidebarOpen(open) {
  const next = Boolean(open);
  document.body.classList.toggle("sidebar-open", next);
  $("#sidebarBackdrop")?.classList.toggle("hidden", !next);
  $("#sidebarToggle")?.setAttribute("aria-expanded", next ? "true" : "false");
}

function closeSidebarIfMobile() {
  if (window.matchMedia("(max-width: 760px)").matches) {
    setSidebarOpen(false);
  }
}

function scrollRequestThreadToBottom() {
  const thread = $("#supportRequestThread");
  if (!thread) return;
  thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
}

function setActiveView(viewName) {
  state.activeView = viewName;
  document.querySelectorAll(".tab[data-view]").forEach(tab => {
    tab.classList.toggle("is-active", tab.dataset.view === viewName);
  });
  document.querySelectorAll(".view").forEach(view => {
    const isActive = view.id === getViewId(viewName);
    view.classList.toggle("is-active", isActive);
    view.classList.toggle("hidden", !isActive);
  });
  renderActiveViewCopy();
  renderRequestDraft();
  closeSidebarIfMobile();
}

function renderActiveViewCopy() {
  const role = getSupportRole();
  const isStaff = role === "staff";

  if (state.activeView === "support-request") {
    $("#viewTitle").textContent = isStaff ? "Quick Note" : "Support Chat";
    $("#topbarCopy").textContent = isStaff
      ? "Leave a short note in a soft, friendly workspace."
      : "Write your request like a chat and send it when you're ready.";
    return;
  }

  if (state.activeView === "anonymous") {
    $("#viewTitle").textContent = "Anonymous Chat";
    $("#topbarCopy").textContent = isStaff
      ? "Read anonymous conversations and keep the staff inbox moving."
      : "Use this when you want to talk to mods without attaching your name.";
    return;
  }

  $("#viewTitle").textContent = isStaff ? "Staff Desk" : "Tickets";
  $("#topbarCopy").textContent = isStaff
    ? "Staff can triage reports, answer anonymous chats, and keep the inbox moving without losing context."
    : "Tell us what you need, open an anonymous chat if you'd like, and keep everything in one cozy place.";
}

function renderRequestDraft() {
  const preview = $("#requestDraftPreview");
  const bubble = $("#requestDraftBubble");
  const message = $("#ticketMessage")?.value?.trim() || "";
  if (!preview || !bubble) return;

  if (!message) {
    bubble.classList.add("hidden");
    preview.textContent = "Start typing your request below.";
    return;
  }

  bubble.classList.remove("hidden");
  preview.innerHTML = escapeHtml(message).replace(/\n/g, "<br>");
  requestAnimationFrame(scrollRequestThreadToBottom);
}

function getVisibleTickets() {
  const isStaff = getSupportRole() === "staff";
  const search = state.ticketSearch.trim().toLowerCase();
  const filter = isStaff ? state.staffFilter : "all";

  return state.tickets.filter(ticket => {
    if (search) {
      const haystack = [
        ticket.id,
        ticket.subject,
        ticket.category,
        ticket.status,
        ticket.createdBy?.tag,
        ticket.priority,
        ticket.assignedTo?.tag,
        ticket.assignedTo?.id,
        ticket.staffNote
      ].map(value => String(value || "").toLowerCase()).join(" ");
      if (!haystack.includes(search)) return false;
    }

    if (filter === "all") return true;
    if (filter === "open") return ticket.status === "open";
    if (filter === "anonymous") return Boolean(ticket.anonymous);
    if (filter === "report") return ticket.category === "report";
    if (filter === "urgent") return ticket.priority === "urgent";
    return true;
  });
}

function syncStaffFilterButtons() {
  document.querySelectorAll("[data-ticket-filter]").forEach(button => {
    button.classList.toggle("is-active", button.dataset.ticketFilter === state.staffFilter);
  });
}

function renderSupportCopy() {
  const role = getSupportRole();
  const isStaff = role === "staff";
  const accessLabel = state.me?.accessLevel || "member";
  const heroTitle = isStaff ? "Pastel staff desk" : "A softer place to ask for help";
  const heroBody = isStaff
    ? "Track open cases, answer anonymous reports, and keep the queue moving without losing context."
    : "Open a ticket, start an anonymous chat, and keep your support thread feeling calm and easy.";
  const summary = state.inboxSummary?.summary || {};
  const openCount = Number.isFinite(summary.open) ? summary.open : state.tickets.filter(ticket => ticket.status === "open").length;
  const anonymousCount = Number.isFinite(summary.anonymous) ? summary.anonymous : state.tickets.filter(ticket => ticket.anonymous).length;
  const reportCount = state.tickets.filter(ticket => ticket.category === "report").length;
  const totalCount = Number.isFinite(summary.total) ? summary.total : state.tickets.length;
  const urgentCount = Number.isFinite(summary.urgent) ? summary.urgent : state.tickets.filter(ticket => ticket.priority === "urgent").length;
  const assignedCount = Number.isFinite(summary.assigned) ? summary.assigned : state.tickets.filter(ticket => ticket.assignedTo?.id).length;

  $("#clientStatus").textContent = isStaff ? "Pastel desk" : "Member helpdesk";
  $("#supportRequestTab").textContent = isStaff ? "Quick note" : "Support Chat";
  $("#newTicketTitle").textContent = isStaff ? "Quick note" : "Chat with Mochi Support";
  $("#ticketListTitle").textContent = isStaff ? "Inbox" : "Your Tickets";
  $("#anonymousTitle").textContent = isStaff ? "Soft tools" : "Anonymous Chat";
  $("#ticketDetailMeta").textContent = isStaff
    ? "Pick a case to review the conversation, reply, and export a transcript."
    : "Pick a ticket to read messages and reply.";
  $("#sidebarNote").textContent = isStaff
    ? "A pastel desk for quick triage, kind replies, and private transcript review."
    : "A friendly place to ask for help, send anonymous reports, and keep conversations tidy.";
  $("#topbarCopy").textContent = isStaff
    ? "Staff can triage reports, answer anonymous chats, and keep the inbox moving without losing context."
    : "Tell us what you need, open an anonymous chat if you'd like, and keep everything in one cozy chat.";
  $("#supportAccent").textContent = isStaff ? "Cozy queue" : "Member support";
  $("#signedInUser").textContent = `${state.me?.user?.tag || state.me?.user?.username || "Signed in"} (${accessLabel})`;
  $("#supportRoleTag").textContent = isStaff ? "Staff" : "Member";
  $("#supportRoleTag").className = isStaff ? "pill support-role-pill support-role-pill-staff" : "pill support-role-pill support-role-pill-member";
  $("#supportHero").innerHTML = isStaff
    ? `
      <div class="support-staff-dashboard">
        <div class="support-hero-copy support-staff-lede">
          <strong>${heroTitle}</strong>
          <p>${heroBody}</p>
        </div>
        <article class="support-staff-metric">
          <span>Open</span>
          <strong>${openCount}</strong>
          <small>Cases awaiting replies</small>
        </article>
        <article class="support-staff-metric">
          <span>Anonymous</span>
          <strong>${anonymousCount}</strong>
          <small>Hidden identity threads</small>
        </article>
        <article class="support-staff-metric">
          <span>Reports</span>
          <strong>${reportCount}</strong>
          <small>Escalation-ready tickets</small>
        </article>
        <article class="support-staff-metric">
          <span>Urgent</span>
          <strong>${urgentCount}</strong>
          <small>Needs attention now</small>
        </article>
        <article class="support-staff-metric">
          <span>Assigned</span>
          <strong>${assignedCount}</strong>
          <small>Claimed cases</small>
        </article>
        <article class="support-staff-metric">
          <span>Total</span>
          <strong>${totalCount}</strong>
          <small>Conversation history loaded</small>
        </article>
      </div>
    `
    : `
      <div class="support-hero-copy">
        <strong>${heroTitle}</strong>
        <p>${heroBody}</p>
      </div>
      <span class="pill support-role-pill support-role-pill-member">Friendly help</span>
    `;
  renderActiveViewCopy();
}

function setAlert(message = "", kind = "info") {
  const el = $("#alert");
  if (!message) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.className = `alert ${kind === "error" ? "alert-error" : ""}`;
  el.textContent = message;
  el.classList.remove("hidden");
}

function setLoginVisible(visible, message = "") {
  $("#loginScreen").classList.toggle("hidden", !visible);
  $("#appShell").classList.toggle("hidden", visible);
  $("#loginStatus").textContent = message || "Checking session";
}

function renderAuth() {
  if (!state.me?.authenticated) {
    setLoginVisible(true, "Login with Discord to access support.");
    $("#signedInUser").textContent = "Not signed in";
    $("#logoutLink").classList.add("hidden");
    document.body.classList.remove("support-is-staff", "support-is-member");
    setSidebarOpen(false);
    return;
  }

  setLoginVisible(false);
  $("#logoutLink").classList.remove("hidden");
  applySupportMode();
  setSidebarOpen(false);
  renderSupportCopy();
  setActiveView(state.activeView);
}

function renderTickets() {
  const list = $("#ticketList");
  const role = getSupportRole();
  const isStaff = role === "staff";
  const visibleTickets = getVisibleTickets();

  if (isStaff) {
    $("#queueSummaryPill").textContent = `${visibleTickets.length}/${state.tickets.length || 0}`;
    syncStaffFilterButtons();
    const searchInput = $("#ticketSearchInput");
    if (searchInput && searchInput.value !== state.ticketSearch) {
      searchInput.value = state.ticketSearch;
    }
  }

  if (!visibleTickets.length) {
    const role = getSupportRole();
    list.innerHTML = `
      <article class="empty-state">
        <strong>${role === "staff" ? "No active cases" : "No tickets yet"}</strong>
        <p>${role === "staff"
          ? "Try a different filter or search term. New reports show up here with the latest conversation at the top."
          : "Open a ticket or start an anonymous chat to get help."}</p>
      </article>
    `;
    return;
  }

  list.innerHTML = visibleTickets.map(ticket => `
    <article class="event" data-ticket-id="${ticket.id}">
      <strong>#${ticket.id} ${escapeHtml(ticket.subject)}</strong>
      <p>
        <span class="badge">${escapeHtml(ticket.category)}</span>
        <span class="badge">${escapeHtml(ticket.status)}</span>
        ${ticket.anonymous ? '<span class="badge">anonymous</span>' : ""}
        ${isStaff ? `<span class="badge">${escapeHtml(ticket.priority || "normal")}</span>` : ""}
        ${isStaff && ticket.assignedTo?.tag ? `<span class="badge">assigned: ${escapeHtml(ticket.assignedTo.tag)}</span>` : ""}
        <br>
        Updated ${escapeHtml(formatDate(ticket.updatedAt))}
      </p>
      <div class="button-row">
        <button class="ghost-button" type="button" data-open-ticket="${ticket.id}">Open</button>
      </div>
    </article>
  `).join("");

  list.querySelectorAll("[data-open-ticket]").forEach(button => {
    button.addEventListener("click", () => selectTicket(Number(button.dataset.openTicket)));
  });
}

function renderTicketDetail() {
  const ticket = state.selectedTicket;
  const isStaff = getSupportRole() === "staff";
  const staffPanel = $("#staffMetaPanel");

  if (!ticket) {
    $("#ticketDetailTitle").textContent = isStaff ? "Select a case" : "Select a ticket";
    $("#ticketDetailMeta").textContent = isStaff
      ? "Pick a case to review the conversation, reply, and export a transcript."
      : "Pick a ticket to read messages and reply.";
    $("#ticketStatusPill").textContent = "Idle";
    $("#ticketMessageList").innerHTML = "";
    if (staffPanel) {
      staffPanel.classList.add("hidden");
    }
    return;
  }

  $("#ticketDetailTitle").textContent = `#${ticket.id} ${ticket.subject}`;
  const metaBits = [
    ticket.category,
    ticket.createdBy?.tag || "Anonymous",
    `Created ${formatDate(ticket.createdAt)}`
  ];
  if (isStaff && ticket.priority) {
    metaBits.unshift(`Priority ${ticket.priority}`);
  }
  $("#ticketDetailMeta").textContent = metaBits.join(" - ");
  $("#ticketStatusPill").textContent = ticket.status;
  if (staffPanel) {
    staffPanel.classList.toggle("hidden", !isStaff);
    if (isStaff) {
      $("#staffPrioritySelect").value = ticket.priority || "normal";
      $("#staffAssigneeInput").value = ticket.assignedTo?.tag || ticket.assignedTo?.id || "";
      $("#staffNoteInput").value = ticket.staffNote || "";
    }
  }

  $("#ticketMessageList").innerHTML = (ticket.messages || []).map(message => `
    <article class="support-message ${message.authorType === "staff" ? "staff" : "user"}">
      <div class="support-meta">
        <strong>${escapeHtml(message.authorTag || message.authorType)}</strong>
        <span>${escapeHtml(message.authorType)}</span>
        <span>${escapeHtml(formatDate(message.createdAt))}</span>
      </div>
      <p>${escapeHtml(message.content)}</p>
    </article>
  `).join("");
}

async function loadSupport() {
  try {
    const me = await api("/api/me");
    state.me = me;
    renderAuth();

    if (!state.me.authenticated) {
      return;
    }

    state.inboxSummary = null;
    const ticketsResult = getSupportRole() === "staff"
      ? await api("/api/support/inbox")
      : await api("/api/support/tickets");
    state.inboxSummary = ticketsResult.summary || null;
    state.tickets = ticketsResult.tickets || [];
    if (state.selectedTicketId) {
      state.selectedTicket = state.tickets.find(ticket => ticket.id === state.selectedTicketId) || null;
    }
    renderSupportCopy();
    renderTickets();
    renderTicketDetail();
    renderAnonymousInfo();
    renderRequestDraft();
    $("#apiState").textContent = "Live";
    $("#apiState").className = "pill";
  } catch (error) {
    $("#apiState").textContent = "Locked";
    $("#apiState").className = "pill";
    setAlert(error.message, "error");
  }
}

async function selectTicket(ticketId) {
  try {
    const result = await api(`/api/support/tickets/${ticketId}`);
    state.selectedTicketId = ticketId;
    state.selectedTicket = result.ticket;
    renderTicketDetail();
  } catch (error) {
    setAlert(error.message, "error");
  }
}

async function createTicket() {
  const payload = {
    category: $("#ticketCategory").value,
    subject: $("#ticketSubject").value,
    message: $("#ticketMessage").value,
    anonymous: $("#ticketAnonymous").checked
  };

  const result = await api("/api/support/tickets", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  $("#ticketSubject").value = "";
  $("#ticketMessage").value = "";
  autosizeRequestMessage();
  state.selectedTicketId = result.ticket.id;
  state.selectedTicket = result.ticket;
  await loadSupport();
  await selectTicket(result.ticket.id);
  renderRequestDraft();
  setAlert(`Ticket #${result.ticket.id} created.`);
}

async function sendReply() {
  if (!state.selectedTicket) {
    setAlert("Pick a ticket first.", "error");
    return;
  }

  const content = $("#replyMessage").value.trim();
  if (!content) {
    setAlert("Write a reply before sending.", "error");
    return;
  }

  const result = await api(`/api/support/tickets/${state.selectedTicket.id}/reply`, {
    method: "POST",
    body: JSON.stringify({ content })
  });

  $("#replyMessage").value = "";
  state.selectedTicket = result.ticket;
  state.tickets = state.tickets.map(ticket => ticket.id === result.ticket.id ? result.ticket : ticket);
  state.inboxSummary = null;
  renderSupportCopy();
  renderTickets();
  renderTicketDetail();
  setAlert("Reply sent.");
}

async function closeCurrentTicket() {
  if (!state.selectedTicket) return;
  const result = await api(`/api/support/tickets/${state.selectedTicket.id}/close`, {
    method: "POST",
    body: JSON.stringify({})
  });
  state.selectedTicket = result.ticket;
  state.tickets = state.tickets.map(ticket => ticket.id === result.ticket.id ? result.ticket : ticket);
  state.inboxSummary = null;
  renderSupportCopy();
  renderTickets();
  renderTicketDetail();
}

async function reopenCurrentTicket() {
  if (!state.selectedTicket) return;
  const result = await api(`/api/support/tickets/${state.selectedTicket.id}/reopen`, {
    method: "POST",
    body: JSON.stringify({})
  });
  state.selectedTicket = result.ticket;
  state.tickets = state.tickets.map(ticket => ticket.id === result.ticket.id ? result.ticket : ticket);
  state.inboxSummary = null;
  renderSupportCopy();
  renderTickets();
  renderTicketDetail();
}

async function saveTicketMeta({ claim = false, clearAssignment = false } = {}) {
  if (!state.selectedTicket || getSupportRole() !== "staff") return;

  const assignedText = $("#staffAssigneeInput").value.trim();
  const payload = {
    priority: $("#staffPrioritySelect").value,
    staffNote: $("#staffNoteInput").value
  };

  if (claim) {
    const tag = state.me?.user?.tag || state.me?.user?.username || "Staff";
    payload.assignedTo = {
      id: state.me?.user?.id || tag,
      tag
    };
  } else if (clearAssignment) {
    payload.assignedTo = null;
  } else if (assignedText) {
    payload.assignedTo = {
      id: assignedText,
      tag: assignedText
    };
  } else {
    payload.assignedTo = null;
  }

  const result = await api(`/api/support/tickets/${state.selectedTicket.id}/meta`, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  state.selectedTicket = result.ticket;
  state.tickets = state.tickets.map(ticket => ticket.id === result.ticket.id ? result.ticket : ticket);
  state.inboxSummary = null;
  renderSupportCopy();
  renderTickets();
  renderTicketDetail();
  setAlert("Staff note saved.");
}

function exportCurrentTicketTranscript() {
  if (!state.selectedTicket) {
    setAlert("Pick a ticket first.", "error");
    return;
  }

  window.open(`/api/support/tickets/${state.selectedTicket.id}/transcript`, "_blank", "noopener,noreferrer");
}

function setupAnonymousQuickStart() {
  setActiveView("support-request");
  $("#ticketCategory").value = "anonymous-chat";
  $("#ticketAnonymous").checked = true;
  $("#ticketSubject").value = "Anonymous chat with mods";
  const message = $("#ticketMessage");
  message.focus();
  message.classList.add("is-expanded");
  renderRequestDraft();
}

function applyRequestPreset(presetName) {
  const presets = {
    help: {
      category: "ticket",
      subject: "Need help with my account",
      message: "Hi Mochi Support, I could use a little help with my account. Here is what happened..."
    },
    report: {
      category: "report",
      subject: "I want to report something",
      message: "Hi Mochi Support, I need to report an issue and wanted to share the details here..."
    },
    anonymous: {
      category: "anonymous-chat",
      subject: "Anonymous chat with mods",
      message: "Hi Mochi Support, I'd like to talk privately about something that's on my mind."
    }
  };
  const preset = presets[presetName];
  if (!preset) return;

  $("#ticketCategory").value = preset.category;
  $("#ticketSubject").value = preset.subject;
  $("#ticketMessage").value = preset.message;
  $("#ticketAnonymous").checked = preset.category === "anonymous-chat" || preset.category === "report";
  autosizeRequestMessage();
  renderRequestDraft();
  $("#ticketMessage").focus();
  $("#ticketMessage").setSelectionRange($("#ticketMessage").value.length, $("#ticketMessage").value.length);
}

function autosizeRequestMessage() {
  const textarea = $("#ticketMessage");
  if (!textarea) return;
  textarea.style.height = "auto";
  const nextHeight = Math.max(140, Math.min(textarea.scrollHeight, 340));
  textarea.style.height = `${nextHeight}px`;
  textarea.classList.toggle("is-expanded", nextHeight > 190);
}

function renderAnonymousInfo() {
  const me = state.me || {};
  const role = getSupportRole();
  const isStaff = role === "staff";
  $("#anonymousChatInfo").innerHTML = `
    <article class="event">
      <strong>${isStaff ? "How anonymous cases appear" : "How anonymity works"}</strong>
      <p>${isStaff
        ? "Anonymous chats arrive in the staff inbox without exposing the member name unless a moderator has permission to reveal it."
        : "Staff can see the ticket, but the portal can hide your identity from most mod replies if the ticket is marked anonymous."}</p>
    </article>
    <article class="event">
      <strong>${isStaff ? "Staff workflow" : "Your access"}</strong>
      <p>${isStaff
        ? "Use the queue to reply fast, keep the tone calm, and export transcripts when a case needs a record."
        : `${escapeHtml(me.accessLevel || "member")} access can open anonymous chats and reports.`}</p>
    </article>
  `;
}

async function init() {
  document.querySelectorAll(".tab[data-view]").forEach(tab => {
    tab.addEventListener("click", () => setActiveView(tab.dataset.view));
  });
  $("#sidebarToggle")?.addEventListener("click", () => {
    setSidebarOpen(!document.body.classList.contains("sidebar-open"));
  });
  $("#sidebarBackdrop")?.addEventListener("click", () => {
    setSidebarOpen(false);
  });
  document.querySelectorAll("[data-ticket-filter]").forEach(button => {
    button.addEventListener("click", () => {
      state.staffFilter = button.dataset.ticketFilter || "all";
      renderTickets();
    });
  });
  $("#createTicketButton").addEventListener("click", () => createTicket().catch(error => setAlert(error.message, "error")));
  $("#sendReplyButton").addEventListener("click", () => sendReply().catch(error => setAlert(error.message, "error")));
  $("#closeTicketButton").addEventListener("click", () => closeCurrentTicket().catch(error => setAlert(error.message, "error")));
  $("#reopenTicketButton").addEventListener("click", () => reopenCurrentTicket().catch(error => setAlert(error.message, "error")));
  $("#exportTranscriptButton").addEventListener("click", exportCurrentTicketTranscript);
  $("#anonymousQuickStart").addEventListener("click", setupAnonymousQuickStart);
  $("#refreshButton").addEventListener("click", () => loadSupport().catch(error => setAlert(error.message, "error")));
  $("#ticketMessage").addEventListener("input", () => {
    autosizeRequestMessage();
    renderRequestDraft();
  });
  $("#ticketMessage").addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      createTicket().catch(error => setAlert(error.message, "error"));
    }
  });
  $("#ticketSearchInput")?.addEventListener("input", event => {
    state.ticketSearch = event.target.value;
    renderTickets();
  });
  document.querySelectorAll("[data-request-preset]").forEach(button => {
    button.addEventListener("click", () => applyRequestPreset(button.dataset.requestPreset || ""));
  });
  $("#saveTicketMetaButton")?.addEventListener("click", () => saveTicketMeta().catch(error => setAlert(error.message, "error")));
  $("#claimTicketButton")?.addEventListener("click", () => saveTicketMeta({ claim: true }).catch(error => setAlert(error.message, "error")));
  $("#clearAssignmentButton")?.addEventListener("click", () => saveTicketMeta({ clearAssignment: true }).catch(error => setAlert(error.message, "error")));
  document.querySelectorAll("[data-reply-template]").forEach(button => {
    button.addEventListener("click", () => {
      $("#replyMessage").value = button.dataset.replyTemplate || "";
      $("#replyMessage").focus();
    });
  });
  window.addEventListener("resize", () => {
    if (!window.matchMedia("(max-width: 760px)").matches) {
      setSidebarOpen(false);
    }
  });

  await loadSupport();
  autosizeRequestMessage();
}

init().catch(error => setAlert(error.message, "error"));
