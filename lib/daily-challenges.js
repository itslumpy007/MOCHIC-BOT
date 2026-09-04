const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_TIME_ZONE = "America/New_York";

const DAILY_CHALLENGE_TYPES = [
  {
    key: "message",
    title: "Chatty Noble",
    description: "Send messages in chat",
    unit: "messages",
    minTarget: 8,
    maxTarget: 20,
    rewardBase: 18,
    rewardPerStep: 3
  },
  {
    key: "command",
    title: "Court Scribe",
    description: "Use bot commands",
    unit: "commands",
    minTarget: 2,
    maxTarget: 6,
    rewardBase: 20,
    rewardPerStep: 6
  },
  {
    key: "reaction",
    title: "Signal the Court",
    description: "Add reactions to messages",
    unit: "reactions",
    minTarget: 3,
    maxTarget: 10,
    rewardBase: 16,
    rewardPerStep: 4
  },
  {
    key: "attachment",
    title: "Gallery Keeper",
    description: "Send messages with attachments",
    unit: "attachments",
    minTarget: 1,
    maxTarget: 4,
    rewardBase: 24,
    rewardPerStep: 8
  },
  {
    key: "reply",
    title: "Court Responder",
    description: "Reply to another member",
    unit: "replies",
    minTarget: 2,
    maxTarget: 6,
    rewardBase: 18,
    rewardPerStep: 4
  },
  {
    key: "link_share",
    title: "Herald of Links",
    description: "Share links in chat",
    unit: "links",
    minTarget: 1,
    maxTarget: 4,
    rewardBase: 20,
    rewardPerStep: 6
  },
  {
    key: "voice",
    title: "Voice Court",
    description: "Stay active in a voice channel",
    unit: "minutes",
    minTarget: 5,
    maxTarget: 20,
    rewardBase: 28,
    rewardPerStep: 4,
    requiresGuild: true
  },
  {
    key: "channel_message",
    title: "Featured Chamber",
    description: "Post messages in a specific channel",
    unit: "messages",
    minTarget: 3,
    maxTarget: 10,
    rewardBase: 26,
    rewardPerStep: 5,
    requiresGuild: true,
    needsChannel: true
  }
];

function toPositiveInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function getDateKey(now = Date.now(), timeZone = DEFAULT_TIME_ZONE) {
  const date = new Date(now);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const year = parts.find(part => part.type === "year")?.value || "";
    const month = parts.find(part => part.type === "month")?.value || "";
    const day = parts.find(part => part.type === "day")?.value || "";
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {}

  return date.toISOString().slice(0, 10);
}

function hashSeed(seed) {
  return crypto.createHash("sha256").update(seed).digest();
}

function pickFromRange(byte, min, max) {
  return min + (byte % (max - min + 1));
}

function selectEligibleTypes(seedBuffer, context = {}) {
  const hasGuild = Boolean(context.guildId);
  const eligibleChannelIds = Array.isArray(context.eligibleChannelIds)
    ? [...new Set(context.eligibleChannelIds.map(id => String(id || "").trim()).filter(Boolean))]
    : [];
  const disabledTypeKeys = Array.isArray(context.disabledTypeKeys)
    ? new Set(context.disabledTypeKeys.map(key => String(key || "").trim().toLowerCase()).filter(Boolean))
    : new Set();

  return DAILY_CHALLENGE_TYPES.filter(type => {
    if (disabledTypeKeys.has(type.key)) {
      return false;
    }
    if (type.requiresGuild && !hasGuild) {
      return false;
    }
    if (type.needsChannel && !eligibleChannelIds.length) {
      return false;
    }
    return true;
  });
}

function chooseChannelId(seedBuffer, eligibleChannelIds) {
  if (!eligibleChannelIds.length) {
    return null;
  }
  const sorted = [...eligibleChannelIds].sort();
  return sorted[seedBuffer[2] % sorted.length];
}

function buildChallengeType(seedBuffer, context = {}) {
  const eligibleChannelIds = Array.isArray(context.eligibleChannelIds)
    ? [...new Set(context.eligibleChannelIds.map(id => String(id || "").trim()).filter(Boolean))]
    : [];
  const availableTypes = selectEligibleTypes(seedBuffer, context);
  const fallbackTypes = DAILY_CHALLENGE_TYPES.filter(type => {
    if (type.requiresGuild && !context.guildId) {
      return false;
    }
    if (type.needsChannel && !eligibleChannelIds.length) {
      return false;
    }
    return true;
  });
  const sourceTypes = availableTypes.length ? availableTypes : fallbackTypes.length ? fallbackTypes : DAILY_CHALLENGE_TYPES;
  const typeIndex = seedBuffer[0] % sourceTypes.length;
  const type = sourceTypes[typeIndex];
  const target = pickFromRange(seedBuffer[1], type.minTarget, type.maxTarget);
  const rewardXp = type.rewardBase + target * type.rewardPerStep;

  return {
    key: type.key,
    title: type.title,
    description: type.description,
    unit: type.unit,
    target,
    rewardXp,
    targetChannelId: type.needsChannel ? chooseChannelId(seedBuffer, eligibleChannelIds) : null
  };
}

function normalizeChallengeRecord(entry, timeZone = DEFAULT_TIME_ZONE) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const type = DAILY_CHALLENGE_TYPES.find(item => item.key === entry.type) || null;
  if (!type) {
    return null;
  }

  const target = Math.max(1, Math.floor(Number(entry.target) || 0));
  const rewardXp = Math.max(1, Math.floor(Number(entry.rewardXp) || 0));
  const progress = Math.max(0, Math.floor(Number(entry.progress) || 0));
  const dateKey = String(entry.dateKey || "").trim();
  const userId = String(entry.userId || "").trim();
  const guildId = typeof entry.guildId === "string" && entry.guildId.trim() ? entry.guildId.trim() : null;
  const targetChannelId = typeof entry.targetChannelId === "string" && entry.targetChannelId.trim() ? entry.targetChannelId.trim() : null;

  if (!dateKey || !userId) {
    return null;
  }

  return {
    key: `${guildId || "dm"}:${userId}:${dateKey}`,
    userId,
    guildId,
    dateKey,
    type: type.key,
    title: String(entry.title || type.title),
    description: String(entry.description || type.description),
    unit: String(entry.unit || type.unit),
    target,
    rewardXp,
    targetChannelId: type.needsChannel ? targetChannelId : null,
    progress: Math.min(progress, target),
    claimedAt: typeof entry.claimedAt === "string" ? entry.claimedAt : null,
    completedAt: typeof entry.completedAt === "string" ? entry.completedAt : null,
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date(0).toISOString(),
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : new Date(0).toISOString()
  };
}

function formatChallengeProgress(challenge) {
  if (!challenge) {
    return "No challenge available.";
  }

  return `${challenge.progress}/${challenge.target} ${challenge.unit}`;
}

function formatChallengeSummary(challenge) {
  if (!challenge) {
    return "No challenge available.";
  }

  const state = challenge.claimedAt
    ? "Claimed"
    : challenge.progress >= challenge.target
      ? "Ready to claim"
      : "In progress";

  return [
    `Challenge: **${challenge.title}**`,
    `Goal: ${challenge.description}`,
    challenge.targetChannelId ? `Channel: <#${challenge.targetChannelId}>` : null,
    `Progress: **${formatChallengeProgress(challenge)}**`,
    `Reward: **${challenge.rewardXp} XP**`,
    `State: ${state}`
  ].filter(Boolean).join("\n");
}

function createDailyChallengeStore({ dataDir, log = console, timeZone = DEFAULT_TIME_ZONE }) {
  const filePath = path.join(dataDir, "daily-challenges.json");
  const statsFilePath = path.join(dataDir, "daily-challenge-stats.json");
  const overridesFilePath = path.join(dataDir, "daily-challenge-overrides.json");
  let cache = null;
  let statsCache = null;
  let overridesCache = null;
  let writeQueue = Promise.resolve();

  async function ensureLoaded() {
    if (cache) {
      return cache;
    }

    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      const entries = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object"
          ? Object.values(parsed)
          : [];

      cache = new Map(
        entries
          .map(entry => normalizeChallengeRecord(entry, timeZone))
          .filter(Boolean)
          .map(entry => [entry.key, entry])
      );
    } catch {
      cache = new Map();
    }

    return cache;
  }

  async function ensureStatsLoaded() {
    if (statsCache) {
      return statsCache;
    }

    try {
      const raw = fs.readFileSync(statsFilePath, "utf8");
      const parsed = JSON.parse(raw);
      const entries = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object"
          ? Object.values(parsed)
          : [];

      statsCache = new Map(
        entries
          .map(entry => normalizeStatsRecord(entry))
          .filter(Boolean)
          .map(entry => [entry.userId, entry])
      );
    } catch {
      statsCache = new Map();
    }

    return statsCache;
  }

  async function ensureOverridesLoaded() {
    if (overridesCache) {
      return overridesCache;
    }

    try {
      const raw = fs.readFileSync(overridesFilePath, "utf8");
      const parsed = JSON.parse(raw);
      const entries = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object"
          ? Object.values(parsed)
          : [];

      overridesCache = new Map(
        entries
          .map(entry => normalizeOverrideRecord(entry))
          .filter(Boolean)
          .map(entry => [entry.key, entry])
      );
    } catch {
      overridesCache = new Map();
    }

    return overridesCache;
  }

  function getKey(userId, guildId, dateKey) {
    return `${guildId || "dm"}:${userId}:${dateKey}`;
  }

  function buildChallenge({ userId, guildId = null, now = Date.now(), context = {} }) {
    const dateKey = getDateKey(now, timeZone);
    const seed = hashSeed(`${dateKey}:${guildId || "dm"}:${userId}:${String(context.override?.salt || "")}`);
    const challengeType = buildChallengeType(seed, { ...context, guildId });
    const createdAt = new Date(now).toISOString();

    return {
      key: getKey(userId, guildId, dateKey),
      userId,
      guildId,
      dateKey,
      type: challengeType.key,
      title: challengeType.title,
      description: challengeType.description,
      unit: challengeType.unit,
      target: challengeType.target,
      rewardXp: challengeType.rewardXp,
      targetChannelId: challengeType.targetChannelId,
      progress: 0,
      claimedAt: null,
      completedAt: null,
      createdAt,
      updatedAt: createdAt
    };
  }

  async function persist() {
    fs.mkdirSync(dataDir, { recursive: true });
    const board = await ensureLoaded();
    const entries = [...board.values()].sort((a, b) => {
      return a.dateKey.localeCompare(b.dateKey) || a.userId.localeCompare(b.userId);
    });
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), "utf8");
  }

  async function persistStats() {
    fs.mkdirSync(dataDir, { recursive: true });
    const board = await ensureStatsLoaded();
    const entries = [...board.values()].sort((a, b) => {
      return b.totalCompletions - a.totalCompletions || b.totalRewardXp - a.totalRewardXp || a.userTag.localeCompare(b.userTag);
    });
    fs.writeFileSync(statsFilePath, JSON.stringify(entries, null, 2), "utf8");
  }

  async function persistOverrides() {
    fs.mkdirSync(dataDir, { recursive: true });
    const board = await ensureOverridesLoaded();
    const entries = [...board.values()].sort((a, b) => a.key.localeCompare(b.key));
    fs.writeFileSync(overridesFilePath, JSON.stringify(entries, null, 2), "utf8");
  }

  function enqueuePersist() {
    writeQueue = writeQueue
      .then(() => persist())
      .catch(error => {
        log.warn?.("Failed to persist daily challenges.", error);
      });
    return writeQueue;
  }

  async function getChallenge({ userId, guildId = null, now = Date.now(), context = {} }) {
    if (!userId) {
      return null;
    }

    const board = await ensureLoaded();
    const key = getKey(userId, guildId, getDateKey(now, timeZone));
    const existing = board.get(key);
    if (existing) {
      return existing;
    }

    const overrides = await ensureOverridesLoaded();
    const override = overrides.get(key) || null;
    return buildChallenge({ userId, guildId, now, context: { ...context, override } });
  }

  async function recordProgress({ userId, guildId = null, kind, amount = 1, now = Date.now(), channelId = null, context = {} }) {
    if (!userId || !kind) {
      return null;
    }

    const board = await ensureLoaded();
    const key = getKey(userId, guildId, getDateKey(now, timeZone));
    const overrides = await ensureOverridesLoaded();
    const override = overrides.get(key) || null;
    const existing = board.get(key) || buildChallenge({ userId, guildId, now, context: { ...context, override } });
    if (existing.claimedAt) {
      return {
        challenge: existing,
        recorded: false,
        progressBefore: existing.progress,
        progressAfter: existing.progress,
        completed: existing.progress >= existing.target
      };
    }

    const matchesType =
      existing.type === kind ||
      (kind === "message" && existing.type === "channel_message");

    if (!matchesType) {
      return {
        challenge: existing,
        recorded: false,
        progressBefore: existing.progress,
        progressAfter: existing.progress,
        completed: existing.progress >= existing.target
      };
    }

    if (existing.type === "channel_message" && existing.targetChannelId && channelId && existing.targetChannelId !== channelId) {
      return {
        challenge: existing,
        recorded: false,
        progressBefore: existing.progress,
        progressAfter: existing.progress,
        completed: existing.progress >= existing.target
      };
    }

    const progressBefore = existing.progress;
    const progressAfter = Math.min(existing.target, progressBefore + Math.max(1, Math.floor(Number(amount) || 0)));
    const completed = progressAfter >= existing.target;
    const challenge = normalizeChallengeRecord({
      ...existing,
      progress: progressAfter,
      completedAt: completed && !existing.completedAt ? new Date(now).toISOString() : existing.completedAt,
      updatedAt: new Date(now).toISOString()
    }, timeZone);

    board.set(key, challenge);
    await enqueuePersist();

    return {
      challenge,
      recorded: true,
      progressBefore,
      progressAfter,
      completed
    };
  }

  async function claimChallenge({ userId, guildId = null, now = Date.now(), context = {} }) {
    if (!userId) {
      return null;
    }

    const board = await ensureLoaded();
    const key = getKey(userId, guildId, getDateKey(now, timeZone));
    const overrides = await ensureOverridesLoaded();
    const override = overrides.get(key) || null;
    const existing = board.get(key) || buildChallenge({ userId, guildId, now, context: { ...context, override } });

    if (existing.claimedAt) {
      return {
        challenge: existing,
        claimed: false,
        alreadyClaimed: true
      };
    }

    if (existing.progress < existing.target) {
      return {
        challenge: existing,
        claimed: false,
        notComplete: true
      };
    }

    const challenge = normalizeChallengeRecord({
      ...existing,
      claimedAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString()
    }, timeZone);

    board.set(key, challenge);
    await enqueuePersist();

    return {
      challenge,
      claimed: true
    };
  }

  async function unclaimChallenge({ userId, guildId = null, now = Date.now(), context = {} }) {
    if (!userId) {
      return null;
    }

    const board = await ensureLoaded();
    const key = getKey(userId, guildId, getDateKey(now, timeZone));
    const existing = board.get(key);
    if (!existing || !existing.claimedAt) {
      return existing || null;
    }

    const challenge = normalizeChallengeRecord({
      ...existing,
      claimedAt: null,
      updatedAt: new Date(now).toISOString()
    }, timeZone);

    board.set(key, challenge);
    await enqueuePersist();

    return challenge;
  }

  function normalizeOverrideRecord(entry) {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const key = String(entry.key || "").trim();
    const salt = String(entry.salt || "").trim();
    if (!key || !salt) {
      return null;
    }

    return {
      key,
      salt,
      forcedBy: typeof entry.forcedBy === "string" ? entry.forcedBy : null,
      forcedAt: typeof entry.forcedAt === "string" ? entry.forcedAt : new Date(0).toISOString(),
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : new Date(0).toISOString()
    };
  }

  async function forceRollChallenge({ userId, guildId = null, now = Date.now(), forcedBy = null, context = {} }) {
    if (!userId) {
      return null;
    }

    const dateKey = getDateKey(now, timeZone);
    const key = getKey(userId, guildId, dateKey);
    const board = await ensureLoaded();
    const overrides = await ensureOverridesLoaded();
    const previous = board.get(key) || null;
    const previousType = previous?.type || null;

    let challenge = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const salt = crypto.randomBytes(8).toString("hex");
      const override = normalizeOverrideRecord({
        key,
        salt,
        forcedBy,
        forcedAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString()
      });
      overrides.set(key, override);
      challenge = buildChallenge({ userId, guildId, now, context: { ...context, override } });
      if (!previousType || challenge.type !== previousType) {
        break;
      }
    }

    board.delete(key);
    await persistOverrides();
    await enqueuePersist();

    return {
      challenge,
      previous
    };
  }

  function normalizeStatsRecord(entry) {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const userId = String(entry.userId || "").trim();
    if (!userId) {
      return null;
    }

    return {
      userId,
      userTag: typeof entry.userTag === "string" && entry.userTag.trim() ? entry.userTag.trim() : "Unknown",
      guildId: typeof entry.guildId === "string" && entry.guildId.trim() ? entry.guildId.trim() : null,
      totalCompletions: Math.max(0, Math.floor(Number(entry.totalCompletions) || 0)),
      totalRewardXp: Math.max(0, Math.floor(Number(entry.totalRewardXp) || 0)),
      byType: entry.byType && typeof entry.byType === "object" ? entry.byType : {},
      lastClaimAt: typeof entry.lastClaimAt === "string" ? entry.lastClaimAt : null,
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : new Date(0).toISOString()
    };
  }

  async function recordClaim({ userId, userTag, guildId = null, rewardXp = 0, challengeType = "unknown", now = Date.now() }) {
    if (!userId) {
      return null;
    }

    const board = await ensureStatsLoaded();
    const existing = board.get(userId) || normalizeStatsRecord({ userId, userTag, guildId });
    const updated = normalizeStatsRecord({
      ...existing,
      userTag,
      guildId,
      totalCompletions: existing.totalCompletions + 1,
      totalRewardXp: existing.totalRewardXp + Math.max(0, Math.floor(Number(rewardXp) || 0)),
      byType: {
        ...(existing.byType || {}),
        [challengeType]: (Number(existing.byType?.[challengeType]) || 0) + 1
      },
      lastClaimAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString()
    });

    board.set(userId, updated);
    await persistStats();
    return updated;
  }

  async function getLeaderboard(limit = 10) {
    const board = await ensureStatsLoaded();
    return [...board.values()]
      .sort((a, b) => b.totalCompletions - a.totalCompletions || b.totalRewardXp - a.totalRewardXp || a.userTag.localeCompare(b.userTag))
      .slice(0, limit);
  }

  async function getTypeStats(limit = 10) {
    const board = await ensureStatsLoaded();
    const aggregate = new Map();

    for (const entry of board.values()) {
      const byType = entry.byType && typeof entry.byType === "object" ? entry.byType : {};
      for (const [typeKey, rawCount] of Object.entries(byType)) {
        const count = Math.max(0, Math.floor(Number(rawCount) || 0));
        if (!count) continue;
        const current = aggregate.get(typeKey) || {
          type: typeKey,
          title: DAILY_CHALLENGE_TYPES.find(type => type.key === typeKey)?.title || typeKey,
          completions: 0
        };
        current.completions += count;
        aggregate.set(typeKey, current);
      }
    }

    return [...aggregate.values()]
      .sort((a, b) => b.completions - a.completions || a.title.localeCompare(b.title))
      .slice(0, limit);
  }

  return {
    ensureLoaded,
    getChallenge,
    recordProgress,
    claimChallenge,
    unclaimChallenge,
    forceRollChallenge,
    buildChallenge,
    getDateKey: now => getDateKey(now, timeZone),
    formatChallengeProgress,
    formatChallengeSummary,
    recordClaim,
    getLeaderboard,
    getTypeStats,
    DAILY_CHALLENGE_TYPES
  };
}

module.exports = {
  createDailyChallengeStore,
  formatChallengeProgress,
  formatChallengeSummary,
  getDateKey,
  DAILY_CHALLENGE_TYPES,
  DEFAULT_TIME_ZONE
};
