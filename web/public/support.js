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
  selectedTicketId: null,
  selectedTicket: null
};

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
    return;
  }

  setLoginVisible(false);
  const user = state.me.user || {};
  $("#signedInUser").textContent = `${user.tag || user.username || "Signed in"} (${state.me.accessLevel || "member"})`;
  $("#logoutLink").classList.remove("hidden");
}

function renderTickets() {
  const list = $("#ticketList");
  if (!state.tickets.length) {
    list.innerHTML = `
      <article class="empty-state">
        <strong>No tickets yet</strong>
        <p>Open a ticket or start an anonymous chat to get help.</p>
      </article>
    `;
    return;
  }

  list.innerHTML = state.tickets.map(ticket => `
    <article class="event" data-ticket-id="${ticket.id}">
      <strong>#${ticket.id} ${escapeHtml(ticket.subject)}</strong>
      <p>
        <span class="badge">${escapeHtml(ticket.category)}</span>
        <span class="badge">${escapeHtml(ticket.status)}</span>
        ${ticket.anonymous ? '<span class="badge">anonymous</span>' : ""}
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
  if (!ticket) {
    $("#ticketDetailTitle").textContent = "Select a ticket";
    $("#ticketDetailMeta").textContent = "Pick a ticket to read messages and reply.";
    $("#ticketStatusPill").textContent = "Idle";
    $("#ticketMessageList").innerHTML = "";
    return;
  }

  $("#ticketDetailTitle").textContent = `#${ticket.id} ${ticket.subject}`;
  $("#ticketDetailMeta").textContent = `${ticket.category} • ${ticket.createdBy?.tag || "Anonymous"} • Created ${formatDate(ticket.createdAt)}`;
  $("#ticketStatusPill").textContent = ticket.status;

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

    const ticketsResult = await api("/api/support/tickets");
    state.tickets = ticketsResult.tickets || [];
    if (state.selectedTicketId) {
      state.selectedTicket = state.tickets.find(ticket => ticket.id === state.selectedTicketId) || null;
    }
    renderTickets();
    renderTicketDetail();
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
  state.selectedTicketId = result.ticket.id;
  state.selectedTicket = result.ticket;
  await loadSupport();
  await selectTicket(result.ticket.id);
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
  renderTickets();
  renderTicketDetail();
}

function setupAnonymousQuickStart() {
  $("#ticketCategory").value = "anonymous-chat";
  $("#ticketAnonymous").checked = true;
  $("#ticketSubject").value = "Anonymous chat with mods";
  $("#ticketMessage").focus();
}

function renderAnonymousInfo() {
  const me = state.me || {};
  $("#anonymousChatInfo").innerHTML = `
    <article class="event">
      <strong>How anonymity works</strong>
      <p>Staff can see the ticket, but the portal can hide your identity from most mod replies if the ticket is marked anonymous.</p>
    </article>
    <article class="event">
      <strong>Your access</strong>
      <p>${escapeHtml(me.accessLevel || "member")} access can open anonymous chats and reports.</p>
    </article>
  `;
}

async function init() {
  $("#createTicketButton").addEventListener("click", () => createTicket().catch(error => setAlert(error.message, "error")));
  $("#sendReplyButton").addEventListener("click", () => sendReply().catch(error => setAlert(error.message, "error")));
  $("#closeTicketButton").addEventListener("click", () => closeCurrentTicket().catch(error => setAlert(error.message, "error")));
  $("#reopenTicketButton").addEventListener("click", () => reopenCurrentTicket().catch(error => setAlert(error.message, "error")));
  $("#anonymousQuickStart").addEventListener("click", setupAnonymousQuickStart);
  $("#refreshButton").addEventListener("click", () => loadSupport().catch(error => setAlert(error.message, "error")));

  await loadSupport();
  if (state.me?.authenticated) {
    renderAnonymousInfo();
  }
}

init().catch(error => setAlert(error.message, "error"));
