const fs = require("fs");
const path = require("path");

const NOBILITY_TIERS = [
  { key: "commoner", title: "Commoner", requiredXp: 0 },
  { key: "page", title: "Page", requiredXp: 50 },
  { key: "squire", title: "Squire", requiredXp: 150 },
  { key: "knight", title: "Knight", requiredXp: 300 },
  { key: "baron", title: "Baron", requiredXp: 600 },
  { key: "count", title: "Count", requiredXp: 1000 },
  { key: "duke", title: "Duke", requiredXp: 1600 },
  { key: "archduke", title: "Archduke", requiredXp: 2400 },
  { key: "sovereign", title: "Sovereign", requiredXp: 3600 }
];

function cloneTier(tier) {
  return {
    key: tier.key,
    title: tier.title,
    requiredXp: tier.requiredXp
  };
}

function toNonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function normalizeNobilityTiers(rawTiers) {
  const source = Array.isArray(rawTiers) && rawTiers.length ? rawTiers : NOBILITY_TIERS;
  const result = [];
  let previousXp = 0;

  for (const tier of source) {
    if (!tier || typeof tier !== "object") {
      continue;
    }

    const key = String(tier.key || "").trim().toLowerCase();
    const title = String(tier.title || "").trim();
    if (!key || !title) {
      continue;
    }

    let requiredXp = toNonNegativeInteger(tier.requiredXp, 0);
    if (result.length === 0) {
      requiredXp = 0;
    } else if (requiredXp < previousXp) {
      requiredXp = previousXp;
    }

    result.push({ key, title, requiredXp });
    previousXp = requiredXp;
  }

  if (!result.length) {
    return NOBILITY_TIERS.map(cloneTier);
  }

  if (result[0].requiredXp !== 0) {
    result[0].requiredXp = 0;
  }

  return result;
}

function normalizeProfile(entry, tiers = NOBILITY_TIERS) {
  const ladder = normalizeNobilityTiers(tiers);
  const totalXp = toNonNegativeInteger(entry?.totalXp, 0);
  const current = getNobilityProgress(totalXp, ladder);

  return {
    userId: String(entry?.userId || ""),
    userTag: typeof entry?.userTag === "string" && entry.userTag.trim() ? entry.userTag.trim() : "Unknown",
    guildId: typeof entry?.guildId === "string" && entry.guildId.trim() ? entry.guildId.trim() : null,
    totalXp,
    totalMessages: toNonNegativeInteger(entry?.totalMessages, 0),
    lastXpAt: toNonNegativeInteger(entry?.lastXpAt, 0),
    lastRewardAt: toNonNegativeInteger(entry?.lastRewardAt, 0),
    lastRewardReason: typeof entry?.lastRewardReason === "string" ? entry.lastRewardReason : null,
    lastMessageAt: typeof entry?.lastMessageAt === "string" ? entry.lastMessageAt : null,
    lastDailyAt: toNonNegativeInteger(entry?.lastDailyAt, 0),
    dailyStreak: toNonNegativeInteger(entry?.dailyStreak, 0),
    dailyClaims: toNonNegativeInteger(entry?.dailyClaims, 0),
    currentRankKey: current.current.key,
    currentRankTitle: current.current.title,
    rankLevel: current.level,
    xpIntoLevel: current.xpIntoLevel,
    xpToNext: current.xpToNext,
    tiers: ladder,
    updatedAt: typeof entry?.updatedAt === "string" ? entry.updatedAt : new Date(0).toISOString()
  };
}

function getNobilityProgress(totalXp, tiers = NOBILITY_TIERS) {
  const ladder = normalizeNobilityTiers(tiers);
  const xp = toNonNegativeInteger(totalXp, 0);
  let currentIndex = 0;

  for (let index = 0; index < ladder.length; index += 1) {
    if (xp >= ladder[index].requiredXp) {
      currentIndex = index;
    }
  }

  const current = ladder[currentIndex];
  const next = ladder[currentIndex + 1] || null;

  return {
    totalXp: xp,
    current,
    next,
    level: currentIndex + 1,
    xpIntoLevel: xp - current.requiredXp,
    xpToNext: next ? next.requiredXp - xp : 0,
    isMaxLevel: !next
  };
}

function formatNobilityLadder(tiers = NOBILITY_TIERS) {
  const ladder = normalizeNobilityTiers(tiers);
  return ladder.map((tier) => {
    return tier.requiredXp === 0
      ? `- ${tier.title}: starting title`
      : `- ${tier.title}: ${tier.requiredXp} XP`;
  }).join("\n");
}

function createNobilityStore({ dataDir, log = console }) {
  const filePath = path.join(dataDir, "nobility-profiles.json");
  let cache = null;
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

      cache = new Map(entries.map((entry) => {
        const normalized = normalizeProfile(entry, entry?.tiers || NOBILITY_TIERS);
        return [normalized.userId, normalized];
      }).filter(([userId]) => Boolean(userId)));
    } catch {
      cache = new Map();
    }

    return cache;
  }

  function snapshotSorted(board) {
    return [...board.values()].sort((a, b) => {
      return b.totalXp - a.totalXp || b.totalMessages - a.totalMessages || a.userTag.localeCompare(b.userTag);
    });
  }

  async function persist() {
    fs.mkdirSync(dataDir, { recursive: true });
    const board = await ensureLoaded();
    const entries = snapshotSorted(board);
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), "utf8");
  }

  function enqueuePersist() {
    writeQueue = writeQueue
      .then(() => persist())
      .catch((error) => {
        log.warn?.("Failed to persist nobility profiles.", error);
      });
    return writeQueue;
  }

  async function getProfile(userId) {
    const board = await ensureLoaded();
    return board.get(userId) || null;
  }

  async function getLeaderboard(limit = 10) {
    const board = await ensureLoaded();
    return snapshotSorted(board).slice(0, limit);
  }

  async function recordMessage({
    userId,
    userTag,
    guildId = null,
    xpGain = 5,
    cooldownMs = 60 * 1000,
    now = Date.now(),
    tiers = NOBILITY_TIERS
  }) {
    if (!userId) {
      return null;
    }

    const board = await ensureLoaded();
    const ladder = normalizeNobilityTiers(tiers);
    const existing = board.get(userId) || normalizeProfile({ userId, userTag, guildId }, ladder);
    const lastXpAt = toNonNegativeInteger(existing.lastXpAt, 0);
    const cooldown = toNonNegativeInteger(cooldownMs, 0);

    if (cooldown > 0 && lastXpAt > 0 && now - lastXpAt < cooldown) {
      return {
        profile: existing,
        awarded: false,
        leveledUp: false,
        previousProgress: getNobilityProgress(existing.totalXp, ladder)
      };
    }

    const previousProgress = getNobilityProgress(existing.totalXp, ladder);
    const gain = Math.max(1, Math.floor(Number(xpGain) || 0));
    const totalXp = existing.totalXp + gain;
    const nextProgress = getNobilityProgress(totalXp, ladder);
    const profile = normalizeProfile({
      ...existing,
      userTag,
      guildId,
      totalXp,
      totalMessages: existing.totalMessages + 1,
      lastXpAt: now,
      lastMessageAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString()
    }, ladder);

    board.set(userId, profile);
    await enqueuePersist();

    return {
      profile,
      awarded: true,
      leveledUp: previousProgress.current.key !== nextProgress.current.key,
      previousProgress,
      nextProgress
    };
  }

  async function awardXp({
    userId,
    userTag,
    guildId = null,
    xpGain = 1,
    reason = "bonus",
    now = Date.now(),
    tiers = NOBILITY_TIERS
  }) {
    if (!userId) {
      return null;
    }

    const board = await ensureLoaded();
    const ladder = normalizeNobilityTiers(tiers);
    const existing = board.get(userId) || normalizeProfile({ userId, userTag, guildId }, ladder);
    const previousProgress = getNobilityProgress(existing.totalXp, ladder);
    const gain = Math.max(1, Math.floor(Number(xpGain) || 0));
    const totalXp = existing.totalXp + gain;
    const nextProgress = getNobilityProgress(totalXp, ladder);
    const profile = normalizeProfile({
      ...existing,
      userTag,
      guildId,
      totalXp,
      lastXpAt: now,
      lastRewardAt: now,
      lastRewardReason: String(reason || "bonus"),
      updatedAt: new Date(now).toISOString()
    }, ladder);

    board.set(userId, profile);
    await enqueuePersist();

    return {
      profile,
      awarded: true,
      rewardXp: gain,
      leveledUp: previousProgress.current.key !== nextProgress.current.key,
      previousProgress,
      nextProgress
    };
  }

  async function recordDailyClaim({
    userId,
    userTag,
    guildId = null,
    dailyXp = 25,
    streakBonus = 5,
    cooldownMs = 24 * 60 * 60 * 1000,
    now = Date.now(),
    tiers = NOBILITY_TIERS
  }) {
    if (!userId) {
      return null;
    }

    const board = await ensureLoaded();
    const ladder = normalizeNobilityTiers(tiers);
    const existing = board.get(userId) || normalizeProfile({ userId, userTag, guildId }, ladder);
    const lastDailyAt = toNonNegativeInteger(existing.lastDailyAt, 0);
    const cooldown = Math.max(0, Math.floor(Number(cooldownMs) || 0));

    if (cooldown > 0 && lastDailyAt > 0 && now - lastDailyAt < cooldown) {
      return {
        profile: existing,
        awarded: false,
        remainingMs: cooldown - (now - lastDailyAt),
        rewardXp: 0,
        streak: existing.dailyStreak || 0,
        nextProgress: getNobilityProgress(existing.totalXp, ladder)
      };
    }

    const previousProgress = getNobilityProgress(existing.totalXp, ladder);
    const streak = lastDailyAt > 0 && now - lastDailyAt <= cooldown * 2 ? existing.dailyStreak + 1 : 1;
    const baseReward = Math.max(1, Math.floor(Number(dailyXp) || 0));
    const bonusPerStreak = Math.max(0, Math.floor(Number(streakBonus) || 0));
    const rewardXp = baseReward + bonusPerStreak * Math.max(0, streak - 1);
    const totalXp = existing.totalXp + rewardXp;
    const nextProgress = getNobilityProgress(totalXp, ladder);
    const profile = normalizeProfile({
      ...existing,
      userTag,
      guildId,
      totalXp,
      lastDailyAt: now,
      dailyStreak: streak,
      dailyClaims: existing.dailyClaims + 1,
      updatedAt: new Date(now).toISOString()
    }, ladder);

    board.set(userId, profile);
    await enqueuePersist();

    return {
      profile,
      awarded: true,
      rewardXp,
      baseReward,
      bonusReward: rewardXp - baseReward,
      streak,
      leveledUp: previousProgress.current.key !== nextProgress.current.key,
      previousProgress,
      nextProgress
    };
  }

  async function setProfile(userId, update, tiers = NOBILITY_TIERS) {
    const board = await ensureLoaded();
    const ladder = normalizeNobilityTiers(tiers);
    const existing = board.get(userId) || normalizeProfile({ userId }, ladder);
    const profile = normalizeProfile({ ...existing, ...update, userId }, ladder);
    board.set(userId, profile);
    await enqueuePersist();
    return profile;
  }

  return {
    ensureLoaded,
    getProfile,
    getLeaderboard,
    recordMessage,
    awardXp,
    recordDailyClaim,
    setProfile,
    formatNobilityLadder,
    getNobilityProgress,
    normalizeNobilityTiers,
    NOBILITY_TIERS
  };
}

module.exports = {
  createNobilityStore,
  formatNobilityLadder,
  getNobilityProgress,
  normalizeNobilityTiers,
  NOBILITY_TIERS
};
