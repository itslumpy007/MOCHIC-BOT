const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const dotenv = require("dotenv");
const {
  Client,
  GatewayIntentBits,
  Partials
} = require("discord.js");

dotenv.config();

const SUPPORT_TOKEN = process.env.SUPPORT_TOKEN || process.env.TOKEN || "";
const SUPPORT_CLIENT_ID = process.env.SUPPORT_CLIENT_ID || process.env.CLIENT_ID || "";
const SUPPORT_CLIENT_SECRET = process.env.SUPPORT_DISCORD_CLIENT_SECRET || process.env.SUPPORT_CLIENT_SECRET || process.env.DISCORD_CLIENT_SECRET || "";
const SUPPORT_GUILD_ID = process.env.SUPPORT_GUILD_ID || process.env.GUILD_ID || "";
const SUPPORT_WEB_PORT = Number(process.env.PORT || process.env.SUPPORT_WEB_PORT || 3001);
const SUPPORT_WEB_BASE_URL = (process.env.SUPPORT_WEB_BASE_URL || "").replace(/\/$/, "");
const SUPPORT_OAUTH_REDIRECT_URI = (process.env.SUPPORT_OAUTH_REDIRECT_URI || "").trim();
const SUPPORT_SESSION_SECRET = process.env.SUPPORT_SESSION_SECRET || process.env.SESSION_SECRET || "";
const SUPPORT_SUPPORT_CHANNEL_ID = process.env.SUPPORT_SUPPORT_CHANNEL_ID || process.env.SUPPORT_NOTIFICATION_CHANNEL_ID || "";
const SUPPORT_DATA_DIR = process.env.SUPPORT_DATA_DIR || path.join(__dirname, "..", "..", "data");
const SUPPORT_SUPPORT_MOD_ROLE_IDS = parseIdList(process.env.SUPPORT_MOD_ROLE_IDS || process.env.MOD_ROLE_IDS || "");
const SUPPORT_SUPPORT_ADMIN_ROLE_IDS = parseIdList(process.env.SUPPORT_ADMIN_ROLE_IDS || process.env.ADMIN_ROLE_IDS || "");
const SUPPORT_SESSION_COOKIE = "mochi_support_session";
const SUPPORT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const supportPublicDir = path.join(__dirname, "..", "..", "web", "public");
const supportStorePath = path.join(SUPPORT_DATA_DIR, "support.json");

const supportOauthStates = new Map();
const supportSessions = new Map();
let supportStoreCache = null;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.GuildMember]
});

function envFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function parseIdList(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map(item => item.trim().replace(/[<@#!>]/g, ""))
    .filter(item => /^\d{15,25}$/.test(item));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(`${JSON.stringify(payload)}\n`);
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(message);
}

function getBaseUrl(req) {
  if (SUPPORT_WEB_BASE_URL) return SUPPORT_WEB_BASE_URL;
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${SUPPORT_WEB_PORT}`;
  return `${proto}://${host}`;
}

function getOAuthRedirectUri(req) {
  if (SUPPORT_OAUTH_REDIRECT_URI) return SUPPORT_OAUTH_REDIRECT_URI;
  return `${getBaseUrl(req)}/auth/callback`;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((cookies, pair) => {
    const [rawKey, ...rawValue] = pair.trim().split("=");
    if (!rawKey) return cookies;
    cookies[rawKey] = decodeURIComponent(rawValue.join("=") || "");
    return cookies;
  }, {});
}

function getCookieOptions(req, maxAgeSeconds) {
  const host = req.headers.host || "";
  const isHttps = host.includes("railway.app") || String(req.headers["x-forwarded-proto"] || "").includes("https");
  return [
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    ...(isHttps ? ["Secure"] : [])
  ].join("; ");
}

function setCookie(req, res, name, value, maxAgeSeconds) {
  res.setHeader("Set-Cookie", `${name}=${encodeURIComponent(value)}; ${getCookieOptions(req, maxAgeSeconds)}`);
}

function clearCookie(req, res, name) {
  setCookie(req, res, name, "", 0);
}

function cleanupSupportAuthState() {
  const now = Date.now();
  for (const [state, entry] of supportOauthStates.entries()) {
    if (entry.expiresAt <= now) {
      supportOauthStates.delete(state);
    }
  }
  for (const [sessionId, session] of supportSessions.entries()) {
    if (session.expiresAt <= now) {
      supportSessions.delete(sessionId);
    }
  }
}

function signValue(value) {
  return crypto.createHmac("sha256", SUPPORT_SESSION_SECRET).update(value).digest("hex");
}

function createSignedValue(value) {
  return `${value}.${signValue(value)}`;
}

function verifySignedValue(signedValue) {
  const [value, signature] = String(signedValue || "").split(".");
  if (!value || !signature) return null;
  const expected = signValue(value);
  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");
  if (expectedBuffer.length !== signatureBuffer.length) return null;
  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer) ? value : null;
}

function createSession(user, accessLevel, authMode = "discord") {
  const sessionId = crypto.randomBytes(32).toString("hex");
  supportSessions.set(sessionId, {
    user,
    accessLevel,
    authMode,
    expiresAt: Date.now() + SUPPORT_SESSION_TTL_MS
  });
  return sessionId;
}

function getSession(req) {
  cleanupSupportAuthState();
  const sessionId = verifySignedValue(parseCookies(req)[SUPPORT_SESSION_COOKIE]);
  if (!sessionId) return null;
  const session = supportSessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    if (sessionId) supportSessions.delete(sessionId);
    return null;
  }
  return { sessionId, ...session };
}

function getAuth(req) {
  const session = getSession(req);
  if (session) return session;
  return null;
}

function buildUserPayload(session = null) {
  return {
    authenticated: Boolean(session),
    authMode: session?.authMode || null,
    accessLevel: session?.accessLevel || null,
    user: session?.user || null,
    oauthConfigured: Boolean(SUPPORT_CLIENT_SECRET && SUPPORT_SESSION_SECRET),
    tokenFallbackEnabled: false,
    localLoginConfigured: false
  };
}

function isSupportStaffAccess(auth) {
  return auth?.accessLevel === "mod" || auth?.accessLevel === "admin";
}

async function fetchDiscordJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.message || `Discord request failed with ${response.status}`);
  }
  return payload;
}

async function getDiscordAccessLevel(userId) {
  if (!SUPPORT_GUILD_ID || !client.isReady()) return "member";

  const guild = client.guilds.cache.get(SUPPORT_GUILD_ID) || await client.guilds.fetch(SUPPORT_GUILD_ID).catch(() => null);
  if (!guild) return "member";

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return "member";

  const roleIds = new Set(member.roles.cache.map(role => role.id));
  if (SUPPORT_SUPPORT_ADMIN_ROLE_IDS.some(id => roleIds.has(id))) return "admin";
  if (SUPPORT_SUPPORT_MOD_ROLE_IDS.some(id => roleIds.has(id))) return "mod";
  return "member";
}

function createDefaultSupportStore() {
  return {
    nextTicketId: 1,
    tickets: []
  };
}

function loadSupportStore() {
  if (supportStoreCache) return supportStoreCache;

  const defaults = createDefaultSupportStore();
  try {
    if (!fs.existsSync(supportStorePath)) {
      supportStoreCache = defaults;
      return supportStoreCache;
    }

    const raw = fs.readFileSync(supportStorePath, "utf8");
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
  fs.mkdirSync(SUPPORT_DATA_DIR, { recursive: true });
  fs.writeFileSync(supportStorePath, JSON.stringify(loadSupportStore(), null, 2), "utf8");
}

function getSupportStore() {
  return loadSupportStore();
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
  if (!SUPPORT_SUPPORT_CHANNEL_ID || !client.isReady()) return;
  try {
    const channel = await client.channels.fetch(SUPPORT_SUPPORT_CHANNEL_ID).catch(() => null);
    if (channel?.send) {
      await channel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error("Support notification error:", error.message);
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

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function cleanupSupportOAuthState() {
  const now = Date.now();
  for (const [state, entry] of supportOauthStates.entries()) {
    if (entry.expiresAt <= now) {
      supportOauthStates.delete(state);
    }
  }
}

function startOAuthLogin(req, res) {
  if (!SUPPORT_CLIENT_SECRET || !SUPPORT_SESSION_SECRET) {
    return sendText(res, 503, "Discord OAuth is not configured. Set SUPPORT_DISCORD_CLIENT_SECRET and SUPPORT_SESSION_SECRET.");
  }

  const state = crypto.randomBytes(24).toString("hex");
  supportOauthStates.set(state, {
    expiresAt: Date.now() + 10 * 60 * 1000
  });

  const redirectUri = getOAuthRedirectUri(req);
  const params = new URLSearchParams({
    client_id: SUPPORT_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
    state
  });

  redirect(res, `https://discord.com/oauth2/authorize?${params.toString()}`);
}

async function handleOAuthCallback(req, res, requestUrl) {
  if (!SUPPORT_CLIENT_SECRET || !SUPPORT_SESSION_SECRET) {
    return sendText(res, 503, "Discord OAuth is not configured.");
  }

  cleanupSupportOAuthState();
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const savedState = state ? supportOauthStates.get(state) : null;

  if (!code || !savedState) {
    return sendText(res, 400, "OAuth login expired or was cancelled. Try logging in again.");
  }

  supportOauthStates.delete(state);

  const redirectUri = getOAuthRedirectUri(req);
  const tokenPayload = await fetchDiscordJson("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: SUPPORT_CLIENT_ID,
      client_secret: SUPPORT_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });

  const user = await fetchDiscordJson("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` }
  });

  const accessLevel = await getDiscordAccessLevel(user.id);
  const sessionId = createSession({
    id: user.id,
    username: user.username,
    globalName: user.global_name || user.globalName || user.username,
    avatar: user.avatar,
    tag: user.discriminator && user.discriminator !== "0"
      ? `${user.username}#${user.discriminator}`
      : (user.global_name || user.username)
  }, accessLevel, "discord");

  setCookie(req, res, SUPPORT_SESSION_COOKIE, createSignedValue(sessionId), SUPPORT_SESSION_TTL_MS / 1000);
  redirect(res, "/");
}

function handleLogout(req, res) {
  const session = getSession(req);
  if (session?.sessionId) {
    supportSessions.delete(session.sessionId);
  }
  clearCookie(req, res, SUPPORT_SESSION_COOKIE);
  redirect(res, "/");
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

function serveStatic(req, res, pathname) {
  let requested = pathname;
  if (pathname === "/" || pathname === "/support" || pathname === "/support/") {
    requested = "/support.html";
  } else if (pathname === "/auth/login") {
    requested = "/support.html";
  } else if (pathname === "/support/login") {
    redirect(res, "/auth/login");
    return;
  } else if (pathname === "/support/callback") {
    redirect(res, "/auth/callback");
    return;
  } else if (pathname === "/support/logout") {
    redirect(res, "/auth/logout");
    return;
  }

  const decodedPath = decodeURIComponent(requested);
  const filePath = path.normalize(path.join(supportPublicDir, decodedPath));

  if (!filePath.startsWith(supportPublicDir)) {
    return sendText(res, 403, "Forbidden");
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      return sendText(res, 404, "Not found");
    }

    res.writeHead(200, {
      "Content-Type": getWebMimeType(filePath),
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

async function handleApi(req, res, pathname, requestUrl) {
  const auth = getAuth(req);

  if (req.method === "GET" && pathname === "/healthz") {
    return sendJson(res, 200, {
      ok: true,
      status: "healthy",
      service: "support",
      port: SUPPORT_WEB_PORT
    });
  }

  if (req.method === "GET" && (pathname === "/api/me" || pathname === "/api/support/me")) {
    return sendJson(res, 200, buildUserPayload(auth));
  }

  if (req.method === "GET" && pathname === "/api/support/inbox") {
    if (!auth || !isSupportStaffAccess(auth)) {
      return sendJson(res, 403, { error: "Staff access is required." });
    }
    return sendJson(res, 200, buildSupportInboxPayload(auth));
  }

  if (req.method === "GET" && pathname === "/api/support/tickets") {
    if (!auth) return sendJson(res, 401, { error: "Login required." });
    return sendJson(res, 200, { tickets: listSupportTickets(auth) });
  }

  if (req.method === "POST" && pathname === "/api/support/tickets") {
    if (!auth) return sendJson(res, 401, { error: "Login required." });
    const body = await readJsonBody(req);
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

    await notifySupportChannel({
      title: `Support ticket #${ticket.id}`,
      description: ticket.anonymous
        ? "A new anonymous ticket was created."
        : `${creator.tag} opened a new ticket.`,
      color: 0x5277e6,
      fields: [
        { name: "Category", value: ticket.category, inline: true },
        { name: "Subject", value: ticket.subject, inline: true },
        { name: "Messages", value: `${ticket.messages.length}`, inline: true }
      ]
    });

    return sendJson(res, 200, {
      ok: true,
      ticket: serializeSupportTicket(ticket, auth)
    });
  }

  if (pathname.startsWith("/api/support/tickets/")) {
    if (!auth) return sendJson(res, 401, { error: "Login required." });

    const parts = pathname.split("/").filter(Boolean);
    const ticketId = parts[3];
    const action = parts[4] || "";
    const ticket = getSupportTicket(ticketId);
    if (!ticket) {
      return sendJson(res, 404, { error: "That ticket was not found." });
    }

    if (!canViewSupportTicket(auth, ticket)) {
      return sendJson(res, 403, { error: "You are not allowed to view that ticket." });
    }

    if (req.method === "GET" && !action) {
      return sendJson(res, 200, { ok: true, ticket: serializeSupportTicket(ticket, auth) });
    }

    if (req.method === "GET" && action === "transcript") {
      const format = String(requestUrl.searchParams.get("format") || "txt").trim().toLowerCase();
      const transcriptJson = { ok: true, ticket: serializeSupportTicket(ticket, auth) };
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
        return sendJson(res, 403, { error: "You are not allowed to reply to that ticket." });
      }

      const body = await readJsonBody(req);
      const content = normalizeSupportText(body.content, 4000);
      if (!content) {
        return sendJson(res, 400, { error: "Write a message before replying." });
      }

      const message = appendSupportTicketMessage(ticket, {
        authorType: isSupportStaffAccess(auth) ? "staff" : "user",
        authorId: auth.user?.id || "unknown",
        authorTag: auth.user?.tag || auth.user?.username || auth.user?.id || "Unknown",
        content,
        anonymous: Boolean(ticket.anonymous && !isSupportStaffAccess(auth))
      });

      await notifySupportChannel({
        title: `Support ticket #${ticket.id} reply`,
        description: ticket.anonymous && !isSupportStaffAccess(auth)
          ? "An anonymous member replied."
          : `${auth.user?.tag || auth.user?.username || auth.user?.id || "A user"} replied.`,
        color: 0x3fa78f,
        fields: [
          { name: "Subject", value: ticket.subject, inline: true },
          { name: "Status", value: ticket.status, inline: true },
          { name: "Message", value: content.slice(0, 900), inline: false }
        ]
      });

      return sendJson(res, 200, {
        ok: true,
        message,
        ticket: serializeSupportTicket(ticket, auth)
      });
    }

    if (req.method === "POST" && (action === "close" || action === "reopen")) {
      if (!canReplyToSupportTicket(auth, ticket)) {
        return sendJson(res, 403, { error: "You are not allowed to update that ticket." });
      }

      ticket.status = action === "close" ? "closed" : "open";
      updateSupportTicket(ticket);

      return sendJson(res, 200, {
        ok: true,
        ticket: serializeSupportTicket(ticket, auth)
      });
    }

    return sendJson(res, 405, { error: "Method not allowed." });
  }

  if (!auth) {
    return sendJson(res, 401, {
      error: SUPPORT_CLIENT_SECRET
        ? "Login with Discord to continue."
        : "Discord OAuth is not configured. Set SUPPORT_DISCORD_CLIENT_SECRET and SUPPORT_SESSION_SECRET."
    });
  }

  return sendJson(res, 404, { error: "Unknown API route." });
}

function startServer() {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = requestUrl.pathname;

    if (pathname === "/healthz") {
      return sendJson(res, 200, {
        ok: true,
        status: "healthy",
        service: "support",
        port: SUPPORT_WEB_PORT
      });
    }

    if (pathname === "/auth/login") {
      startOAuthLogin(req, res);
      return;
    }

    if (pathname === "/auth/callback") {
      handleOAuthCallback(req, res, requestUrl).catch(error => {
        sendText(res, 400, error.message || "Discord OAuth login failed.");
      });
      return;
    }

    if (pathname === "/auth/logout") {
      handleLogout(req, res);
      return;
    }

    if (pathname === "/support/login") {
      redirect(res, "/auth/login");
      return;
    }

    if (pathname === "/support/callback") {
      handleOAuthCallback(req, res, requestUrl).catch(error => {
        sendText(res, 400, error.message || "Discord OAuth login failed.");
      });
      return;
    }

    if (pathname === "/support/logout") {
      redirect(res, "/auth/logout");
      return;
    }

    if (pathname.startsWith("/api/")) {
      handleApi(req, res, pathname, requestUrl).catch(error => {
        sendJson(res, 400, { error: error.message || "Support request failed." });
      });
      return;
    }

    serveStatic(req, res, pathname);
  });

  server.listen(SUPPORT_WEB_PORT, () => {
    console.log(`Support service available on port ${SUPPORT_WEB_PORT}.`);
    if (SUPPORT_TOKEN) {
      client.login(SUPPORT_TOKEN).catch(error => {
        console.error("Support Discord login failed:", error.message);
      });
    } else {
      console.warn("Support Discord token is not configured. Staff access will be limited.");
    }
  });

  server.on("error", error => {
    console.error("Support service error:", error.message);
  });
}

startServer();
