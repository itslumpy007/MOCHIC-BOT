const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('bestScore');
const statusEl = document.getElementById('status');
const overlayEl = document.getElementById('overlay');
const overlayTitleEl = document.getElementById('overlayTitle');
const overlayTextEl = document.getElementById('overlayText');
const sessionNoteEl = document.getElementById('sessionNote');
const mobileTapLayerEl = document.getElementById('mobileTapLayer');
const introSplashEl = document.getElementById('introSplash');
const mainPlayButton = document.getElementById('mainPlayButton');
const mainLeaderboardButton = document.getElementById('mainLeaderboardButton');
const mainLeaderboardButtonInline = document.getElementById('mainLeaderboardButtonInline');
const mainSettingsButton = document.getElementById('mainSettingsButton');
const mainMuteButton = document.getElementById('mainMuteButton');
const startRunButton = document.getElementById('startRunButton');
const startBackButton = document.getElementById('startBackButton');
const leaderboardBackButton = document.getElementById('leaderboardBackButton');
const settingsBackButton = document.getElementById('settingsBackButton');
const audioStateEl = document.getElementById('audioState');
const reducedMotionStateEl = document.getElementById('reducedMotionState');
const hardModeStateEl = document.getElementById('hardModeState');
const leaderboardSummaryEl = document.getElementById('leaderboardSummary');
const leaderboardPodiumEl = document.getElementById('leaderboardPodium');
const mainMenuLeaderboardPodiumEl = document.getElementById('mainMenuLeaderboardPodium');
const leaderboardListEl = document.getElementById('leaderboardList');
const leaderboardUpdatedEl = document.getElementById('leaderboardUpdated');
const startMenuTextEl = document.getElementById('startMenuText');
const runSummaryStateEl = document.getElementById('runSummaryState');
const runSummaryScoreEl = document.getElementById('runSummaryScore');
const runSummaryBestEl = document.getElementById('runSummaryBest');
const runSummaryCansEl = document.getElementById('runSummaryCans');
const runSummaryTimeEl = document.getElementById('runSummaryTime');
const runSummaryTextEl = document.getElementById('runSummaryText');
const modeLabelEl = document.getElementById('modeLabel');
const menuTabs = Array.from(document.querySelectorAll('[data-menu-tab]'));
const menuPanels = Array.from(document.querySelectorAll('[data-menu-panel]'));
const mainMenuStageEl = document.querySelector('.main-menu-stage');
const ASSET_VERSION = 'mobile-activity13';
const DISCORD_SDK_MODULE_URL = `./vendor/discord-sdk/index.mjs?v=${ASSET_VERSION}`;
const SETTINGS_KEY = 'discord-mochi-bird-settings';
const LEADERBOARD_CACHE_KEY = 'discord-mochi-bird-leaderboard-cache';

const params = new URLSearchParams(window.location.search);
function readMochiBootstrap() {
  const node = document.getElementById('mochi-bootstrap');
  if (!node) {
    return {};
  }

  try {
    return JSON.parse(node.textContent || '{}');
  } catch {
    return {};
  }
}

const mochiBootstrap = readMochiBootstrap();
const mobileViewportQuery = window.matchMedia('(max-width: 720px)');
let sessionId = params.get('sid');
let isPracticeMode = !sessionId;

let bestScoreKey = 'discord-mochi-bird-best-practice';
let activityMode = Boolean(mochiBootstrap.activityMode);
let discordClientId = mochiBootstrap.discordClientId || null;
let discordSdk = null;
let menuView = 'main';
let leaderboardEntries = Array.isArray(mochiBootstrap.leaderboard) ? mochiBootstrap.leaderboard : [];
let leaderboardLoading = false;
let leaderboardLoaded = Array.isArray(mochiBootstrap.leaderboard);
let leaderboardRefreshTimer = null;
let leaderboardRefreshLabelTimer = null;
let leaderboardLastRefreshAt = Array.isArray(mochiBootstrap.leaderboard) ? Date.now() : 0;
const BIRD_RENDER_SCALE = 3.05;
const BIRD_MENU_SCALE = 200;
const BIRD_HITBOX_SCALE = 1.55;
let menuTransitionTimer = null;
let activityAutoStartTimer = null;
let settings = {
  audioEnabled: true,
  reducedMotion: false,
  hardMode: false
};
let startRunMode = 'start';

let session = null;
let activityBootstrapPromise = null;
const logoSprite = new Image();
logoSprite.src = `./assets/mochi-logo.svg?v=${ASSET_VERSION}`;
const birdSprite = new Image();
birdSprite.src = `./assets/avatar-v3.png?v=${ASSET_VERSION}`;
const canSprite = new Image();
canSprite.src = `./assets/dr-pepper-can-v3.png?v=${ASSET_VERSION}`;

let width = 360;
let height = 640;
let devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
let animationFrame = 0;
let lastTime = 0;
let started = false;
let gameOver = false;
let submitted = false;
let scoreSubmissionInFlight = false;
let score = 0;
let bestScore = 0;
let elapsedMs = 0;
let cansCollected = 0;
let paused = false;
let gameOverReason = '';
let latestRunSnapshot = null;
let particles = [];
let trailPoints = [];
let shakeTime = 0;
let shakeStrength = 0;
let bird = null;
let pipes = [];
let spawnTimer = 0;
let backgroundOffset = 0;
let clouds = [];
let stars = [];
let collectibles = [];
let gameState = 'menu';

let PIPE_SPEED = 170;
let PIPE_GAP = 166;
let PIPE_INTERVAL = 1.35;
let collectibleChance = 0.7;
const GRAVITY = 1100;
const FLAP_VELOCITY = -340;
const PIPE_WIDTH = 72;
const GROUND_HEIGHT = 90;

let audioContext = null;
let audioMasterGain = null;
let musicTimer = null;
let audioUnlocked = false;
let lastInputAt = 0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function formatDiscordUser(user) {
  const username = user?.username || 'Player';
  const discriminator = user?.discriminator && user.discriminator !== '0' ? `#${user.discriminator}` : '';
  const globalName = user?.global_name ? ` (${user.global_name})` : '';
  return `${username}${discriminator}${globalName}`;
}

function hydrateBestScore() {
  bestScore = Number(localStorage.getItem(bestScoreKey) || 0);
  bestScoreEl.textContent = String(bestScore);
}

function hydrateLeaderboardCache() {
  try {
    const cached = localStorage.getItem(LEADERBOARD_CACHE_KEY);
    if (!cached) {
      return;
    }

    const parsed = JSON.parse(cached);
    if (!Array.isArray(parsed) || !parsed.length) {
      return;
    }

    leaderboardEntries = parsed;
    leaderboardLoaded = true;
    leaderboardLastRefreshAt = Number(localStorage.getItem(`${LEADERBOARD_CACHE_KEY}:ts`) || 0) || leaderboardLastRefreshAt;
  } catch {
    // Ignore malformed cache.
  }
}

function persistLeaderboardCache(entries = leaderboardEntries) {
  try {
    localStorage.setItem(LEADERBOARD_CACHE_KEY, JSON.stringify(Array.isArray(entries) ? entries : []));
    localStorage.setItem(`${LEADERBOARD_CACHE_KEY}:ts`, String(leaderboardLastRefreshAt || Date.now()));
  } catch {
    // Cache writes are best-effort.
  }
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.floor(width * devicePixelRatio);
  canvas.height = Math.floor(height * devicePixelRatio);
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}

function resetBoard() {
  bird = {
    x: width * 0.28,
    y: height * 0.42,
    radius: 14,
    velocity: 0
  };
  pipes = [];
  spawnTimer = 0.65;
  backgroundOffset = 0;
  clouds = Array.from({ length: 5 }, (_, index) => ({
    x: width * (0.2 + index * 0.22),
    y: height * (0.12 + (index % 2) * 0.08),
    speed: 8 + index * 2,
    size: 0.8 + index * 0.16
  }));
  stars = Array.from({ length: 28 }, (_, index) => ({
    x: (index * 97) % width,
    y: (index * 71) % (height * 0.45),
    r: 0.8 + (index % 3) * 0.5,
    twinkle: 0.3 + (index % 5) * 0.11
  }));
  collectibles = [];
}

function loadSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) {
      return;
    }
    const parsed = JSON.parse(stored);
    settings.audioEnabled = parsed.audioEnabled !== false;
    settings.reducedMotion = Boolean(parsed.reducedMotion);
    settings.hardMode = Boolean(parsed.hardMode);
  } catch {
    // Ignore bad settings payloads.
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function refreshGameplaySettings() {
  if (settings.hardMode) {
    PIPE_SPEED = 205;
    PIPE_GAP = 138;
    PIPE_INTERVAL = 1.15;
    collectibleChance = 0.55;
  } else {
    PIPE_SPEED = 170;
    PIPE_GAP = 166;
    PIPE_INTERVAL = 1.35;
    collectibleChance = 0.7;
  }
}

function formatRunTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function updateMainMuteButton() {
  if (!mainMuteButton) {
    return;
  }
  mainMuteButton.textContent = settings.audioEnabled ? 'Mute' : 'Sound';
  mainMuteButton.setAttribute('aria-pressed', String(!settings.audioEnabled));
}

function syncRunSummary(snapshot = latestRunSnapshot) {
  if (!snapshot) {
    runSummaryStateEl.textContent = 'Ready';
    runSummaryScoreEl.textContent = '0';
    runSummaryBestEl.textContent = String(bestScore || 0);
    runSummaryCansEl.textContent = '0';
    runSummaryTimeEl.textContent = '0:00';
    runSummaryTextEl.textContent = 'Your latest run stats will appear here after you play.';
    return;
  }

  runSummaryStateEl.textContent = snapshot.state;
  runSummaryScoreEl.textContent = String(snapshot.score);
  runSummaryBestEl.textContent = String(snapshot.bestScore);
  runSummaryCansEl.textContent = String(snapshot.cansCollected);
  runSummaryTimeEl.textContent = formatRunTime(snapshot.durationMs);
  runSummaryTextEl.textContent = snapshot.text;
}

function recordRunSnapshot(state, text) {
  latestRunSnapshot = {
    state,
    text,
    score,
    bestScore,
    cansCollected,
    durationMs: elapsedMs,
    reason: gameOverReason
  };
  syncRunSummary();
}

function triggerShake(strength = 5, durationMs = 180) {
  shakeStrength = Math.max(shakeStrength, strength);
  shakeTime = Math.max(shakeTime, durationMs);
}

function spawnParticles(x, y, colors, count = 6, speed = 120, life = 380) {
  const palette = Array.isArray(colors) && colors.length ? colors : ['#ffffff'];
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const burstSpeed = speed * (0.4 + Math.random() * 0.8);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * burstSpeed,
      vy: Math.sin(angle) * burstSpeed - 40,
      life,
      maxLife: life,
      size: 2 + Math.random() * 4,
      color: palette[i % palette.length]
    });
  }
}

function addTrailPoint(x, y, size = 1, color = '#ffd66f') {
  trailPoints.push({
    x,
    y,
    size,
    color,
    life: 240,
    maxLife: 240
  });
}

function ensureAudioContext() {
  if (!audioContext) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }
    audioContext = new AudioContextCtor();
    audioMasterGain = audioContext.createGain();
    audioMasterGain.gain.value = 0.08;
    audioMasterGain.connect(audioContext.destination);
  }
  return audioContext;
}

async function unlockAudio() {
  if (!settings.audioEnabled) {
    return false;
  }

  const ctx = ensureAudioContext();
  if (!ctx) {
    return false;
  }

  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // Ignore resume errors; the page can still run silently.
    }
  }

  audioUnlocked = ctx.state === 'running';
  if (audioUnlocked) {
    startMusicLoop();
  }

  return audioUnlocked;
}

async function readResponseJson(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(text.trim() || `Unexpected response (${response.status})`);
  }

  return response.json();
}

async function readResponsePayload(response) {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return { __text: trimmed };
  }
}

function formatLeaderboardUpdatedAt(value) {
  if (!value) {
    return 'Updated when the panel opens.';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Updated when the panel opens.';
  }

  return `Updated ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
}

function formatRelativeTime(ms) {
  if (!ms || ms < 1000) {
    return 'just now';
  }

  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

function updateLeaderboardUpdatedLabel() {
  if (!leaderboardUpdatedEl) {
    return;
  }

  if (!leaderboardLastRefreshAt) {
    leaderboardUpdatedEl.textContent = 'Last updated just now.';
    return;
  }

  const elapsed = Date.now() - leaderboardLastRefreshAt;
  leaderboardUpdatedEl.textContent = `Last updated ${formatRelativeTime(elapsed)} ago.`;
}

function markLeaderboardRefreshed() {
  leaderboardLastRefreshAt = Date.now();
  persistLeaderboardCache();
  updateLeaderboardUpdatedLabel();
}

function renderLeaderboardPodium(container, rows, sessionUserId) {
  if (!container) {
    return;
  }

  const podiumEntries = (Array.isArray(rows) ? rows : []).slice(0, 3);
  if (!podiumEntries.length) {
    container.innerHTML = '<div class="podium-empty">No scores yet.</div>';
    return;
  }

  const podiumSlots = [
    { key: 'second', entry: podiumEntries[1], label: '#2', title: 'Runner-up' },
    { key: 'first', entry: podiumEntries[0], label: '#1', title: 'Champion' },
    { key: 'third', entry: podiumEntries[2], label: '#3', title: 'Third place' }
  ];

  container.innerHTML = podiumSlots.map((slot) => {
    if (!slot.entry) {
      return `<div class="podium-slot podium-${slot.key} empty"><span class="podium-rank">${slot.label}</span><span class="podium-name">Open spot</span><span class="podium-score">--</span></div>`;
    }

    const isSelf = sessionUserId && slot.entry.userId === sessionUserId;
    return `
      <div class="podium-slot podium-${slot.key}${isSelf ? ' self' : ''}">
        <span class="podium-rank">${slot.label}</span>
        <span class="podium-crown">${slot.title}</span>
        <strong class="podium-name">${escapeHtml(slot.entry.userTag || 'Unknown player')}</strong>
        <span class="podium-score">${Number(slot.entry.bestScore) || 0}</span>
      </div>
    `;
  }).join('');
}

function renderLeaderboard(entries = leaderboardEntries) {
  if (!leaderboardListEl) {
    return;
  }

  const rows = Array.isArray(entries) ? entries : [];
  const sessionUserId = session?.userId || null;
  const remainder = rows.slice(3);

  renderLeaderboardPodium(leaderboardPodiumEl, rows, sessionUserId);
  renderLeaderboardPodium(mainMenuLeaderboardPodiumEl, rows, sessionUserId);

  if (!rows.length) {
    leaderboardListEl.innerHTML = '<li class="leaderboard-empty">No scores yet. Be the first to set one.</li>';
    if (leaderboardSummaryEl) {
      leaderboardSummaryEl.textContent = 'No leaderboard entries yet.';
    }
    markLeaderboardRefreshed();
    return;
  }

  leaderboardListEl.innerHTML = remainder.length
    ? remainder.map((entry, index) => {
      const rankIndex = index + 4;
      const isSelf = sessionUserId && entry.userId === sessionUserId;
      const rankLabel = `#${rankIndex}`;
      const tag = escapeHtml(entry.userTag || 'Unknown player');
      const bestScoreValue = Number(entry.bestScore) || 0;
      const lastScoreValue = Number(entry.lastScore) || bestScoreValue;
      return `
        <li class="leaderboard-entry${isSelf ? ' self' : ''}">
          <span class="leaderboard-rank">${rankLabel}</span>
          <span class="leaderboard-name">
            <strong>${tag}</strong>
            ${isSelf ? '<em>You</em>' : `<em>Last run ${lastScoreValue}</em>`}
          </span>
          <span class="leaderboard-score">${bestScoreValue}</span>
        </li>
      `;
    }).join('')
    : '<li class="leaderboard-empty">Only podium finishers so far.</li>';

  const leader = rows[0];
  if (leaderboardSummaryEl) {
    leaderboardSummaryEl.textContent = rows.length === 1
      ? `${leader.userTag || 'The current leader'} is sitting on ${leader.bestScore} points.`
      : `${leader.userTag || 'The current leader'} leads with ${leader.bestScore} points across ${rows.length} entries.`;
  }
  markLeaderboardRefreshed();
}

function startLeaderboardAutoRefresh() {
  if (leaderboardRefreshTimer) {
    return;
  }

  leaderboardRefreshTimer = window.setInterval(() => {
    if (document.hidden) {
      return;
    }
    void loadLeaderboard(true);
  }, 10000);

  if (!leaderboardRefreshLabelTimer) {
    leaderboardRefreshLabelTimer = window.setInterval(() => {
      if (!leaderboardLoaded) {
        return;
      }
      updateLeaderboardUpdatedLabel();
    }, 1000);
  }
}

function stopLeaderboardAutoRefresh() {
  if (leaderboardRefreshTimer) {
    clearInterval(leaderboardRefreshTimer);
    leaderboardRefreshTimer = null;
  }
  if (leaderboardRefreshLabelTimer) {
    clearInterval(leaderboardRefreshLabelTimer);
    leaderboardRefreshLabelTimer = null;
  }
}

function showReadyMenuForCurrentState() {
  if (activityMode) {
    updateStatus(session ? `Ready for ${session.userTag}` : 'Ready to play');
    sessionNoteEl.textContent = session
      ? `Running inside Discord as an Activity for ${session.userTag}.`
      : 'Running inside Discord as an Activity. Discord connects in the background.';
    if (!started && !gameOver) {
      void launchRun();
    }
    return;
  }

  showMenu('main', {
    title: session ? `Ready for ${session.userTag}` : 'Main Menu',
    text: activityMode
      ? `Running inside Discord as an Activity${session ? ` for ${session.userTag}.` : ' while we connect in the background.'}`
      : 'Practice mode: this run is local only.',
    startText: session
      ? 'You are connected and ready to play.'
      : 'Ready to play now. Discord will connect in the background.',
    startButtonLabel: session ? 'Start Run' : 'Start Practice',
    startDisabled: false
  });

  if (activityMode && !started && !gameOver) {
    void launchRun();
  }
}

function cancelActivityAutoStart() {
  if (activityAutoStartTimer) {
    clearTimeout(activityAutoStartTimer);
    activityAutoStartTimer = null;
  }
}

function startRunNow(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (started && gameState === 'playing') {
    return;
  }

  cancelActivityAutoStart();
  void unlockAudio();
  updateStatus('Starting run...');
  void autoSaveScore('reset');
  started = false;
  gameOver = false;
  submitted = false;
  score = 0;
  elapsedMs = 0;
  cansCollected = 0;
  paused = false;
  gameOverReason = '';
  particles = [];
  trailPoints = [];
  shakeTime = 0;
  shakeStrength = 0;
  gameState = 'playing';
  resetBoard();
  scoreEl.textContent = '0';
  hideOverlay();
  updateStatus(isPracticeMode ? 'Practice mode running' : 'Session running');
  bird.velocity = FLAP_VELOCITY;
  started = true;
  playLaunchJingle();
  syncMobileTapLayer();
  if (activityMode && !sessionId) {
    void resolveActivitySession(3500);
  }
}

function handleStartRunButtonActivation(event) {
  if (startRunMode === 'reload') {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    window.location.reload();
    return;
  }

  startRunNow(event);
}

function handleMainMenuStartFallback(event) {
  if (menuView !== 'main' || started || gameOver) {
    return;
  }

  if (isInteractiveTarget(event.target)) {
    return;
  }

  startRunNow(event);
}

async function resolveActivitySession(timeoutMs = 3500) {
  if (sessionId && session) {
    return session;
  }

  if (!activityBootstrapPromise) {
    void bootstrapActivitySession();
  }

  if (!activityBootstrapPromise) {
    return null;
  }

  return Promise.race([
    activityBootstrapPromise.then(() => session),
    new Promise((resolve) => window.setTimeout(() => resolve(null), timeoutMs))
  ]);
}

async function bootstrapActivitySession() {
  if (activityBootstrapPromise) {
    return activityBootstrapPromise;
  }

  activityBootstrapPromise = (async () => {
    if (!activityMode || !discordClientId) {
      return null;
    }

    try {
      const sdkModule = await import(DISCORD_SDK_MODULE_URL);
      discordSdk = new sdkModule.DiscordSDK(discordClientId);
      await discordSdk.ready();

      sessionNoteEl.textContent = 'Running inside Discord as an Activity.';
      updateStatus('Discord Activity ready');

      if (!sessionId) {
        const activitySession = await createActivitySession();
        sessionId = activitySession.id;
        isPracticeMode = false;
        session = activitySession;
        bestScoreKey = `discord-mochi-bird-best-${session.userId}`;

        try {
          const bestResponse = await fetch(`/api/mochi/leaderboard/${session.userId}`, { cache: 'no-store' });
          if (bestResponse.ok) {
            const bestPayload = await bestResponse.json();
            if (bestPayload?.entry?.bestScore !== undefined) {
              bestScore = Number(bestPayload.entry.bestScore) || 0;
              localStorage.setItem(bestScoreKey, String(bestScore));
            }
          }
        } catch {
          // Best score lookup is optional.
        }

        sessionNoteEl.textContent = `Activity session created for ${session.userTag}.`;
        updateStatus(`Ready for ${session.userTag}`);
      }

      if (!started && gameState === 'menu' && !gameOver) {
        showReadyMenuForCurrentState();
      }
      void loadLeaderboard(true);
      startLeaderboardAutoRefresh();
      return session;
    } catch (error) {
      updateStatus(`Discord Activity handshake failed: ${error.message}`);
      sessionNoteEl.textContent = 'Discord Activity is still connecting.';
      if (!started && gameState === 'menu' && !gameOver) {
        showReadyMenuForCurrentState();
      }
      return null;
    }
  })();

  return activityBootstrapPromise;
}

async function loadLeaderboard(force = false) {
  if (leaderboardLoading && !force) {
    return leaderboardEntries;
  }

  if (leaderboardLoaded && !force) {
    renderLeaderboard(leaderboardEntries);
    return leaderboardEntries;
  }

  leaderboardLoading = true;
  if (leaderboardSummaryEl) {
    leaderboardSummaryEl.textContent = leaderboardEntries.length
      ? 'Refreshing leaderboard...'
      : 'Loading leaderboard...';
  }
  if (leaderboardListEl) {
    leaderboardListEl.innerHTML = leaderboardEntries.length
      ? leaderboardListEl.innerHTML
      : '<li class="leaderboard-empty">Fetching the top scores...</li>';
  }

  try {
    const response = await fetch(`/api/mochi/leaderboard?ts=${Date.now()}`, { cache: 'no-store' });
    const payload = await readResponsePayload(response);
    if (response.ok && payload && Array.isArray(payload.leaderboard)) {
      leaderboardEntries = payload.leaderboard;
      leaderboardLoaded = true;
      renderLeaderboard(leaderboardEntries);
      persistLeaderboardCache();
      return leaderboardEntries;
    }
    if (!leaderboardEntries.length) {
      leaderboardEntries = [];
      leaderboardLoaded = true;
      renderLeaderboard(leaderboardEntries);
    }
  } catch {
    leaderboardLoaded = true;
    if (!leaderboardEntries.length) {
      leaderboardEntries = [];
      renderLeaderboard(leaderboardEntries);
    } else {
      renderLeaderboard(leaderboardEntries);
    }
  } finally {
    leaderboardLoading = false;
  }

  return leaderboardEntries;
}

function stopMusicLoop() {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

function stopAudio() {
  stopMusicLoop();
}

function playTone({ frequency, duration = 0.18, type = 'triangle', gain = 0.06, start = 0 }) {
  const ctx = ensureAudioContext();
  if (!ctx || !audioMasterGain || !settings.audioEnabled || !audioUnlocked) {
    return;
  }

  const osc = ctx.createOscillator();
  const envelope = ctx.createGain();
  const now = ctx.currentTime + start;

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.linearRampToValueAtTime(gain, now + 0.02);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(envelope);
  envelope.connect(audioMasterGain);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

function playPickupChime() {
  playTone({ frequency: 988, duration: 0.11, type: 'sine', gain: 0.05 });
  playTone({ frequency: 1318.5, duration: 0.14, type: 'triangle', gain: 0.04, start: 0.05 });
}

function playFlapSound() {
  playTone({ frequency: 392, duration: 0.08, type: 'square', gain: 0.02 });
}

function playLaunchJingle() {
  if (!settings.audioEnabled || !audioUnlocked) {
    return;
  }

  playTone({ frequency: 523.25, duration: 0.12, type: 'triangle', gain: 0.035 });
  playTone({ frequency: 659.25, duration: 0.12, type: 'triangle', gain: 0.03, start: 0.08 });
  playTone({ frequency: 783.99, duration: 0.16, type: 'sine', gain: 0.028, start: 0.16 });
}

function playCrashSound(reason = 'pipe') {
  if (!settings.audioEnabled || !audioUnlocked) {
    return;
  }

  const isGround = reason.includes('ground');
  playTone({ frequency: isGround ? 164.81 : 196, duration: 0.18, type: 'sawtooth', gain: 0.04 });
  playTone({ frequency: isGround ? 123.47 : 146.83, duration: 0.22, type: 'triangle', gain: 0.03, start: 0.06 });
}

function startMusicLoop() {
  if (musicTimer || !settings.audioEnabled || !audioUnlocked) {
    return;
  }

  const progression = [
    [440, 554.37, 659.25, 880],
    [392, 493.88, 587.33, 783.99],
    [349.23, 440, 523.25, 659.25],
    [392, 523.25, 659.25, 830.61]
  ];
  const bassLine = [220, 196, 174.61, 196];
  let step = 0;

  const tick = () => {
    if (!settings.audioEnabled || !audioUnlocked) {
      stopMusicLoop();
      return;
    }

    const chord = progression[step % progression.length];
    const bass = bassLine[step % bassLine.length];

    chord.forEach((freq, index) => {
      playTone({
        frequency: freq,
        duration: 0.26,
        type: index === 0 ? 'triangle' : 'sine',
        gain: index === 0 ? 0.035 : 0.018,
        start: index * 0.02
      });
    });

    playTone({
      frequency: bass,
      duration: 0.34,
      type: 'sine',
      gain: 0.03
    });

    step += 1;
  };

  tick();
  musicTimer = window.setInterval(tick, 560);
}

function applySettings() {
  if (!settings.audioEnabled) {
    audioUnlocked = false;
    stopAudio();
  }
  document.body.classList.toggle('reduced-motion', settings.reducedMotion);
  document.body.classList.toggle('hard-mode', settings.hardMode);
  refreshGameplaySettings();
  audioStateEl.textContent = settings.audioEnabled ? 'On' : 'Off';
  reducedMotionStateEl.textContent = settings.reducedMotion ? 'On' : 'Off';
  hardModeStateEl.textContent = settings.hardMode ? 'On' : 'Off';
  modeLabelEl.textContent = settings.hardMode ? 'Hard' : 'Normal';
  updateMainMuteButton();
  if (settings.audioEnabled && audioUnlocked) {
    startMusicLoop();
  }
  saveSettings();
}

function setMenuView(view) {
  menuView = view;
  overlayEl.classList.add('menu-transitioning');
  if (menuTransitionTimer) {
    clearTimeout(menuTransitionTimer);
  }
  menuTransitionTimer = window.setTimeout(() => {
    overlayEl.classList.remove('menu-transitioning');
  }, 180);
  menuTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.menuTab === view);
  });
  menuPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.menuPanel === view);
  });
}

function resetOverlayScroll() {
  overlayEl.scrollTop = 0;
  const overlayCard = overlayEl.querySelector('.overlay-card');
  if (overlayCard) {
    overlayCard.scrollTop = 0;
  }
}

function updateMenuHeader(title, text) {
  overlayTitleEl.textContent = title;
  overlayTextEl.textContent = text;
}

function showMenu(view = 'main', options = {}) {
  const {
    title = session ? `Ready for ${session.userTag}` : 'Main Menu',
    text = activityMode
      ? `Running inside Discord as an Activity${session ? ` for ${session.userTag}.` : '.'}`
      : 'Practice mode: this run is local only.',
    startText = 'Ready to start a new run. Use the button below when you want to launch.',
    startButtonLabel = 'Start Run',
    startAction = 'start',
    startDisabled = false,
    preserveScore = false,
    keepGameOver = false
  } = options;

  started = false;
  if (!keepGameOver) {
    gameOver = false;
  }
  submitted = false;
  gameState = 'menu';

  if (!preserveScore) {
    score = 0;
    elapsedMs = 0;
    scoreEl.textContent = '0';
    resetBoard();
  }

  hydrateBestScore();
  applySettings();
  updateMenuHeader(title, text);
  startMenuTextEl.textContent = startText;
  startRunButton.textContent = startButtonLabel;
  startRunButton.disabled = startDisabled;
  startRunMode = startAction;
  setMenuView(view);
  resetOverlayScroll();
  if (view === 'start' && latestRunSnapshot) {
    syncRunSummary(latestRunSnapshot);
  } else if (view === 'start') {
    syncRunSummary(null);
  }
  if (view === 'leaderboard') {
    void loadLeaderboard();
  } else if (leaderboardLoaded) {
    renderLeaderboard();
  }
  updateStatus(
    session
      ? `Ready for ${session.userTag}`
      : activityMode
        ? 'Activity practice ready'
        : 'Practice mode ready'
  );
  sessionNoteEl.textContent = activityMode
    ? `Running inside Discord as an Activity${session ? ` for ${session.userTag}.` : '.'}`
    : 'Practice mode: this run is local only.';
  overlayEl.classList.remove('hidden');
  syncMobileTapLayer();
}

function launchRun() {
  if (activityMode && !sessionId) {
    void resolveActivitySession(3500);
  }
  startRunNow();
}

function hideOverlay() {
  overlayEl.classList.add('hidden');
}

function updateStatus(text) {
  statusEl.textContent = text;
}

function togglePause() {
  if (!started || gameOver) {
    return;
  }

  paused = !paused;
  updateStatus(paused ? 'Paused' : 'Session running');
  syncMobileTapLayer();
}

async function createActivitySession() {
  if (!discordSdk) {
    return null;
  }

  const participantResponse = await discordSdk.commands.getInstanceConnectedParticipants();
  const participants = Array.isArray(participantResponse)
    ? participantResponse
    : participantResponse?.participants || [];
  const participant = participants[0];
  const participantUser = participant?.user || participant;

  if (!participant) {
    throw new Error('No activity participants found');
  }

  const channelResponse = await discordSdk.commands.getChannel({
    channel_id: discordSdk.channelId
  });
  const channel = channelResponse?.channel || channelResponse;

    const response = await fetch('/api/mochi/activity/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: participantUser?.id || participant?.id,
      userTag: formatDiscordUser(participantUser),
      channelId: channel?.id || discordSdk.channelId,
      guildId: channel?.guild_id || channel?.guildId || ''
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to create activity session');
  }

  return payload.session;
}

function addPipe() {
  const topHeight = 60 + Math.random() * (height - GROUND_HEIGHT - PIPE_GAP - 140);
  pipes.push({
    x: width + 30,
    topHeight,
    passed: false
  });

  if (Math.random() < collectibleChance) {
    const gapCenter = topHeight + PIPE_GAP / 2;
    collectibles.push({
      x: width + 116,
      y: clamp(gapCenter + (Math.random() * 90 - 45), 60, height - GROUND_HEIGHT - 70),
      radius: 20,
      rotation: Math.random() * Math.PI * 2,
      bobSeed: Math.random() * Math.PI * 2,
      collected: false
    });
  }
}

function collectScore(points = 1, source = 'pipe') {
  score += points;
  scoreEl.textContent = String(score);
  if (score > bestScore) {
    bestScore = score;
    bestScoreEl.textContent = String(bestScore);
    localStorage.setItem(bestScoreKey, String(bestScore));
  }
  if (source === 'can') {
    cansCollected += 1;
    spawnParticles(bird.x + 8, bird.y - 6, ['#ff4d6d', '#fdf1d5', '#ffd24a'], 10, 150, 420);
  }
  if (source === 'pipe') {
    spawnParticles(bird.x + 12, bird.y, ['#5be3c5', '#ecf6ff'], 5, 100, 260);
  }
}

async function autoSaveScore(reason = 'reset') {
  if (isPracticeMode || submitted || !sessionId || score <= 0) {
    return false;
  }

  await submitScore(reason);
  return submitted;
}

function collectibleBox(item) {
  return {
    x: item.x - item.radius,
    y: item.y - item.radius,
    width: item.radius * 2,
    height: item.radius * 2
  };
}

function flap() {
  if (gameOver) {
    return;
  }

  if (!started) {
    if (startRunButton?.disabled) {
      return;
    }
    void launchRun();
    return;
  }

  playFlapSound();
  bird.velocity = FLAP_VELOCITY;
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function birdBox() {
  const width = bird.radius * BIRD_HITBOX_SCALE;
  const height = bird.radius * BIRD_HITBOX_SCALE * 0.92;
  return {
    x: bird.x - width / 2,
    y: bird.y - height / 2 + bird.radius * 0.03,
    width,
    height
  };
}

function pipeBoxes(pipe) {
  const gapTop = pipe.topHeight;
  const gapBottom = pipe.topHeight + PIPE_GAP;
  return [
    {
      x: pipe.x,
      y: 0,
      width: PIPE_WIDTH,
      height: gapTop
    },
    {
      x: pipe.x,
      y: gapBottom,
      width: PIPE_WIDTH,
      height: height - GROUND_HEIGHT - gapBottom
    }
  ];
}

function endGame(reason) {
  if (gameOver) {
    return;
  }

  gameOverReason = reason;
  paused = false;
  gameOver = true;
  gameState = 'gameover';
  started = false;
  triggerShake(reason.includes('pipe') ? 7 : 5, reason.includes('pipe') ? 220 : 180);
  playCrashSound(reason);
  recordRunSnapshot('Game over', `Ended by ${reason}. Your score has been saved.`);
  updateStatus(`Game over: ${reason}`);
  showMenu('start', {
    title: 'Game over',
    text: `You scored ${score}. ${isPracticeMode ? 'Press Start Run to try again.' : 'This run has been recorded in Discord.'}`,
    startText: 'Your run ended. Open Start Run when you want another attempt.',
    startButtonLabel: 'Play again',
    preserveScore: true,
    keepGameOver: true
  });
  gameOver = true;
  gameState = 'gameover';
  void autoSaveScore(reason);
  syncMobileTapLayer();
}

async function submitScore(reason) {
  if (isPracticeMode || submitted || scoreSubmissionInFlight || !sessionId) {
    return;
  }

  scoreSubmissionInFlight = true;

  try {
    const response = await fetch(`/api/mochi/session/${sessionId}/score`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        score,
        durationMs: Math.round(elapsedMs),
        reason
      })
    });

    const payload = await readResponsePayload(response);
    if (!response.ok) {
      throw new Error(payload?.error || payload?.__text || 'Failed to submit score');
    }

    submitted = true;
    const submittedBest = payload?.personalBest?.bestScore ?? score;
    bestScore = Math.max(bestScore, submittedBest);
    localStorage.setItem(bestScoreKey, String(bestScore));
    bestScoreEl.textContent = String(bestScore);
    recordRunSnapshot('Saved', `Score saved! Personal best: ${submittedBest}.`);
    if (Array.isArray(payload?.leaderboard)) {
      leaderboardEntries = payload.leaderboard;
      leaderboardLoaded = true;
      renderLeaderboard(leaderboardEntries);
    }
    void loadLeaderboard(true);
    startLeaderboardAutoRefresh();
    updateStatus(`Score submitted. Personal best: ${submittedBest}.`);
  } catch (error) {
    updateStatus(`Could not submit score: ${error.message}`);
    submitted = false;
  } finally {
    scoreSubmissionInFlight = false;
  }
}

function update(deltaSeconds) {
  if (shakeTime > 0) {
    shakeTime = Math.max(0, shakeTime - deltaSeconds * 1000);
  }

  if (paused || !started || gameOver) {
    particles = particles.filter((particle) => particle.life > 0);
    trailPoints = trailPoints.filter((point) => point.life > 0);
    return;
  }

  elapsedMs += deltaSeconds * 1000;
  bird.velocity += GRAVITY * deltaSeconds;
  bird.y += bird.velocity * deltaSeconds;
  backgroundOffset = (backgroundOffset + PIPE_SPEED * deltaSeconds) % width;
  trailPoints.push({
    x: bird.x - 10,
    y: bird.y + 2,
    size: 1.1 + Math.abs(bird.velocity) / 900,
    color: bird.velocity < -60 ? '#fdf1d5' : '#ffd24a',
    life: 220,
    maxLife: 220
  });
  if (trailPoints.length > 18) {
    trailPoints.shift();
  }

  spawnTimer -= deltaSeconds;
  if (spawnTimer <= 0) {
    addPipe();
    spawnTimer = PIPE_INTERVAL;
  }

  for (const pipe of pipes) {
    pipe.x -= PIPE_SPEED * deltaSeconds;
  }

  pipes = pipes.filter((pipe) => pipe.x > -PIPE_WIDTH - 40);

  for (const item of collectibles) {
    item.x -= PIPE_SPEED * deltaSeconds;
    item.rotation += deltaSeconds * 1.8;
  }

  collectibles = collectibles.filter((item) => item.x > -item.radius * 3 && !item.collected);

  const birdBounds = birdBox();

  if (bird.y + bird.radius >= height - GROUND_HEIGHT) {
    bird.y = height - GROUND_HEIGHT - bird.radius;
    endGame('hit the ground');
    return;
  }

  if (bird.y - bird.radius <= 0) {
    bird.y = bird.radius;
    bird.velocity = Math.max(0, bird.velocity);
  }

  for (const pipe of pipes) {
    const [topPipe, bottomPipe] = pipeBoxes(pipe);
    if (rectsOverlap(birdBounds, topPipe) || rectsOverlap(birdBounds, bottomPipe)) {
      endGame('hit a pipe');
      return;
    }

    if (!pipe.passed && pipe.x + PIPE_WIDTH < bird.x - bird.radius) {
      pipe.passed = true;
      collectScore(1, 'pipe');
    }
  }

  for (const item of collectibles) {
    if (item.collected) {
      continue;
    }
    const pickup = collectibleBox(item);
    if (rectsOverlap(birdBounds, pickup)) {
      item.collected = true;
      collectScore(1, 'can');
      playPickupChime();
      updateStatus('Collected a Dr Pepper can!');
    }
  }

  for (const particle of particles) {
    particle.life -= deltaSeconds * 1000;
    particle.x += particle.vx * deltaSeconds;
    particle.y += particle.vy * deltaSeconds;
    particle.vy += 180 * deltaSeconds;
  }
  particles = particles.filter((particle) => particle.life > 0);

  for (const point of trailPoints) {
    point.life -= deltaSeconds * 1000;
    point.x -= 10 * deltaSeconds;
  }
  trailPoints = trailPoints.filter((point) => point.life > 0);

}

function drawSky() {
  const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
  skyGradient.addColorStop(0, '#78cffd');
  skyGradient.addColorStop(0.6, '#beeefe');
  skyGradient.addColorStop(1, '#ffe28a');
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  for (const star of stars) {
    const alpha = 0.3 + Math.sin((elapsedMs / 1000) * star.twinkle + star.x) * 0.2;
    ctx.globalAlpha = clamp(alpha, 0.12, 0.45);
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawCloud(x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.68)';
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.arc(18, -8, 22, 0, Math.PI * 2);
  ctx.arc(38, 0, 16, 0, Math.PI * 2);
  ctx.arc(20, 8, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPipes() {
  for (const pipe of pipes) {
    const radius = 12;
    const capHeight = 16;

    ctx.fillStyle = '#1d7f52';
    ctx.strokeStyle = '#145337';
    ctx.lineWidth = 4;

    const topHeight = pipe.topHeight;
    const bottomY = pipe.topHeight + PIPE_GAP;
    const bottomHeight = height - GROUND_HEIGHT - bottomY;

    ctx.beginPath();
    roundRect(ctx, pipe.x, 0, PIPE_WIDTH, topHeight, radius, true, false);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    roundRect(ctx, pipe.x - 4, Math.max(0, topHeight - capHeight), PIPE_WIDTH + 8, capHeight, 8, true, false);
    ctx.fillStyle = '#2fd18d';
    ctx.fill();

    ctx.beginPath();
    roundRect(ctx, pipe.x, bottomY, PIPE_WIDTH, bottomHeight, radius, true, false);
    ctx.fillStyle = '#1d7f52';
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    roundRect(ctx, pipe.x - 4, bottomY, PIPE_WIDTH + 8, capHeight, 8, true, false);
    ctx.fillStyle = '#2fd18d';
    ctx.fill();
  }
}

function drawCollectibles() {
  for (const item of collectibles) {
    if (item.collected) {
      continue;
    }

    const floatY = Math.sin(elapsedMs / 240 + item.bobSeed) * 6;
    const drawX = item.x;
    const drawY = item.y + floatY;
    const size = item.radius * 2.8;

    ctx.save();
    ctx.translate(drawX, drawY);
    ctx.rotate(item.rotation * 0.5);

    if (canSprite.complete && canSprite.naturalWidth > 0) {
      ctx.drawImage(canSprite, -size / 2, -size / 2, size, size * 1.95);
    } else {
      ctx.fillStyle = '#c81f30';
      ctx.beginPath();
      roundRect(ctx, -size * 0.36, -size * 0.72, size * 0.72, size * 1.44, 10);
      ctx.fill();
      ctx.fillStyle = '#f8f2eb';
      ctx.fillRect(-size * 0.32, -size * 0.06, size * 0.64, size * 0.12);
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function drawGround() {
  const groundY = height - GROUND_HEIGHT;
  const groundGradient = ctx.createLinearGradient(0, groundY, 0, height);
  groundGradient.addColorStop(0, '#e6c265');
  groundGradient.addColorStop(1, '#c69a3a');
  ctx.fillStyle = groundGradient;
  ctx.fillRect(0, groundY, width, GROUND_HEIGHT);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
  for (let i = -1; i < width / 36 + 2; i += 1) {
    const x = (i * 36 - backgroundOffset * 0.6) % (width + 36);
    ctx.fillRect(x, groundY + 8, 22, 4);
  }
}

function drawTrail() {
  for (const point of trailPoints) {
    const alpha = clamp(point.life / point.maxLife, 0, 1) * 0.34;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = point.color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.size + (1 - alpha) * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawParticles() {
  for (const particle of particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * (0.55 + alpha * 0.45), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawBrandWatermark() {
  const pad = 14;
  const boxWidth = 170;
  const boxHeight = 40;

  ctx.save();
  ctx.globalAlpha = 0.94;
  ctx.fillStyle = 'rgba(8, 14, 22, 0.36)';
  roundRect(ctx, pad, pad, boxWidth, boxHeight, 16, true, false);

  ctx.fillStyle = 'rgba(37, 208, 171, 0.18)';
  roundRect(ctx, pad + 1, pad + 1, boxWidth - 2, boxHeight - 2, 15, true, false);

  ctx.fillStyle = '#ecf6ff';
  ctx.font = '800 18px Georgia, "Times New Roman", serif';
  ctx.fillText('Mochi Bird', pad + 16, pad + 25);

  ctx.fillStyle = '#9fb5c8';
  ctx.font = '600 9px "Trebuchet MS", sans-serif';
  ctx.fillText('Collect cans • Dodge pipes', pad + 16, pad + 35);
  ctx.restore();
}

function drawBird() {
  const tilt = clamp(bird.velocity / 400, -0.6, 0.8);
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(tilt);

  if (birdSprite.complete && birdSprite.naturalWidth > 0) {
    const size = bird.radius * BIRD_RENDER_SCALE;
    ctx.drawImage(birdSprite, -size / 2, -size / 2, size, size);
  } else {
    ctx.fillStyle = '#ffd84d';
    ctx.beginPath();
    ctx.arc(0, 0, bird.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffb31f';
    ctx.beginPath();
    ctx.ellipse(-3, 4, 9, 6, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1a2230';
    ctx.beginPath();
    ctx.arc(5, -4, 2.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f27d2f';
    ctx.beginPath();
    ctx.moveTo(11, -1);
    ctx.lineTo(20, 3);
    ctx.lineTo(11, 7);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawHudOverlay() {
  if (started || gameOver) {
    return;
  }
  ctx.save();
  ctx.fillStyle = 'rgba(7, 16, 24, 0.12)';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function handleGameInput(event) {
  if (event) {
    const now = performance.now();
    if (now - lastInputAt < 80) {
      return;
    }
    lastInputAt = now;
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
  }

  void unlockAudio();
  flap();
}

function handleGameplayInput(event) {
  if (gameState !== 'playing' || paused || gameOver) {
    return;
  }

  handleGameInput(event);
}

function handleMobileTapLayerInput(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  handleGameplayInput(event);
}

function isInteractiveTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"]'));
}

function handleDocumentGameInput(event) {
  if (gameState !== 'playing' || paused || gameOver) {
    return;
  }

  if (isInteractiveTarget(event.target)) {
    return;
  }

  handleGameInput(event);
}

function handleMobileTapLayerInput(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  handleGameplayInput(event);
}

function updateViewportMode() {
  const isMobileViewport = mobileViewportQuery.matches || window.innerWidth <= 720;
  document.body.classList.toggle('mobile-activity', isMobileViewport);
  document.body.classList.toggle('desktop-activity', !isMobileViewport);
  syncMobileTapLayer();
}

function syncMobileTapLayer() {
  if (!mobileTapLayerEl) {
    return;
  }

  const showTapLayer = document.body.classList.contains('mobile-activity') && gameState === 'playing' && !paused && !gameOver;
  mobileTapLayerEl.classList.toggle('tap-ready', showTapLayer);
  mobileTapLayerEl.classList.toggle('tap-hidden', !showTapLayer);
}

function drawPauseOverlay() {
  if (!paused || gameOver) {
    return;
  }

  ctx.save();
  ctx.fillStyle = 'rgba(7, 16, 24, 0.36)';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(8, 14, 22, 0.8)';
  roundRect(ctx, width * 0.24, height * 0.34, width * 0.52, 120, 22, true, false);
  ctx.fillStyle = '#ecf6ff';
  ctx.font = '900 24px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('Paused', width / 2, height * 0.39);
  ctx.font = '500 14px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#9fb5c8';
  ctx.fillText('Press P to resume', width / 2, height * 0.45);
  ctx.restore();
}

function drawGameOverOverlay() {
  if (!gameOver) {
    return;
  }

  const summary = latestRunSnapshot || {
    score,
    bestScore,
    cansCollected,
    durationMs: elapsedMs
  };

  ctx.save();
  ctx.fillStyle = 'rgba(7, 16, 24, 0.46)';
  ctx.fillRect(0, 0, width, height);

  const boxW = Math.min(width * 0.76, 320);
  const boxH = Math.min(height * 0.42, 260);
  const boxX = (width - boxW) / 2;
  const boxY = height * 0.18;
  ctx.fillStyle = 'rgba(8, 14, 22, 0.88)';
  roundRect(ctx, boxX, boxY, boxW, boxH, 24, true, false);

  ctx.fillStyle = '#ecf6ff';
  ctx.textAlign = 'center';
  ctx.font = '900 24px Georgia, serif';
  ctx.fillText('Game Over', width / 2, boxY + 38);
  ctx.font = '600 13px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#9fb5c8';
  ctx.fillText(`Score ${summary.score}  •  Best ${summary.bestScore}`, width / 2, boxY + 62);
  ctx.fillText(`Cans ${summary.cansCollected}  •  Time ${formatRunTime(summary.durationMs)}`, width / 2, boxY + 82);
  ctx.fillText(gameOverReason ? `Run ended: ${gameOverReason}` : 'Run recorded in Discord.', width / 2, boxY + 104);
  ctx.fillStyle = '#25d0ab';
  ctx.font = '700 12px "Trebuchet MS", sans-serif';
  ctx.fillText('Press R or tap Play again to restart', width / 2, boxY + 138);
  ctx.restore();
}

function drawMenuScene() {
  if (started || gameOver || document.body.classList.contains('mobile-activity')) {
    return;
  }

  const floatOffset = Math.sin(elapsedMs / 420) * 8;
  const centerX = width * 0.68;
  const centerY = height * 0.42 + floatOffset;

  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 96, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.22;
  ctx.fillStyle = 'rgba(7, 16, 24, 0.12)';
  ctx.beginPath();
  ctx.ellipse(centerX, centerY + 108, 120, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (birdSprite.complete && birdSprite.naturalWidth > 0) {
    ctx.save();
    ctx.globalAlpha = 0.26;
    ctx.translate(centerX, centerY);
    ctx.rotate(Math.sin(elapsedMs / 600) * 0.08);
    const size = BIRD_MENU_SCALE;
    ctx.drawImage(birdSprite, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = 0.18;
  if (logoSprite.complete && logoSprite.naturalWidth > 0) {
    const logoWidth = Math.min(width * 0.62, 340);
    const logoHeight = logoWidth * 0.267;
    ctx.drawImage(logoSprite, width * 0.08, height * 0.1, logoWidth, logoHeight);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 26px Georgia, serif';
    ctx.fillText('Mochi Bird', width * 0.11, height * 0.18);
  }
  ctx.font = '500 13px "Trebuchet MS", sans-serif';
  ctx.fillText('Press Play to start', width * 0.11, height * 0.22);
  ctx.restore();
}

function roundRect(context, x, y, w, h, r, fill = true, stroke = false) {
  if (typeof r === 'number') {
    r = { tl: r, tr: r, br: r, bl: r };
  } else {
    r = { tl: 0, tr: 0, br: 0, bl: 0, ...r };
  }
  context.beginPath();
  context.moveTo(x + r.tl, y);
  context.lineTo(x + w - r.tr, y);
  context.quadraticCurveTo(x + w, y, x + w, y + r.tr);
  context.lineTo(x + w, y + h - r.br);
  context.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
  context.lineTo(x + r.bl, y + h);
  context.quadraticCurveTo(x, y + h, x, y + h - r.bl);
  context.lineTo(x, y + r.tl);
  context.quadraticCurveTo(x, y, x + r.tl, y);
  context.closePath();
  if (fill) {
    context.fill();
  }
  if (stroke) {
    context.stroke();
  }
}

function render() {
  ctx.clearRect(0, 0, width, height);
  const shakeX = shakeTime > 0 ? (Math.random() - 0.5) * shakeStrength : 0;
  const shakeY = shakeTime > 0 ? (Math.random() - 0.5) * shakeStrength : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawSky();

  for (const cloud of clouds) {
    cloud.x -= cloud.speed * 0.008;
    if (cloud.x < -120) {
      cloud.x = width + 120;
      cloud.y = height * (0.12 + Math.random() * 0.18);
    }
    drawCloud(cloud.x, cloud.y, cloud.size);
  }

  drawBrandWatermark();
  drawMenuScene();
  drawPipes();
  drawTrail();
  drawCollectibles();
  drawGround();
  drawParticles();
  drawBird();
  drawHudOverlay();
  drawPauseOverlay();
  drawGameOverOverlay();
  ctx.restore();
}

function loop(timestamp) {
  if (!lastTime) {
    lastTime = timestamp;
  }

  const deltaSeconds = Math.min(0.033, (timestamp - lastTime) / 1000);
  lastTime = timestamp;

  update(deltaSeconds);
  render();
  animationFrame = requestAnimationFrame(loop);
}

async function loadSession() {
  loadSettings();
  applySettings();
  updateViewportMode();
  document.body.classList.toggle('activity-mode', activityMode);
  if (leaderboardLoaded) {
    renderLeaderboard(leaderboardEntries);
  }

  if (!mochiBootstrap || Object.keys(mochiBootstrap).length === 0) {
    void (async () => {
      try {
        const configResponse = await fetch('/api/mochi/config', { cache: 'no-store' });
        const configPayload = await configResponse.json();
        if (configResponse.ok) {
          activityMode = Boolean(configPayload.activityMode);
          discordClientId = configPayload.discordClientId;
          document.body.classList.toggle('activity-mode', activityMode);
          if (Array.isArray(configPayload.leaderboard)) {
            leaderboardEntries = configPayload.leaderboard;
            leaderboardLoaded = true;
            renderLeaderboard(leaderboardEntries);
          }
          if (activityMode && discordClientId) {
            void bootstrapActivitySession();
          }
        }
      } catch {
        // Config lookup is optional.
      }
    })();
  }

  if (activityMode && discordClientId) {
    void bootstrapActivitySession();
  } else if (activityMode) {
    showReadyMenuForCurrentState();
  }

  if (!sessionId && isPracticeMode) {
    if (!activityMode) {
      updateStatus('Practice mode ready');
      sessionNoteEl.textContent = 'Practice mode: this run is local only.';
      showMenu('main');
      return;
    }

    updateStatus('Activity practice ready');
    sessionNoteEl.textContent = 'Running inside Discord as an Activity. Discord connects in the background.';
    if (!started && !gameOver) {
      void launchRun();
    }
    return;
  }

  try {
    const response = await fetch(`/api/mochi/session/${sessionId}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Session not found');
    }

    session = payload.session;
    bestScoreKey = `discord-mochi-bird-best-${session.userId}`;
    sessionNoteEl.textContent = `Session linked to ${session.userTag}.`;
    updateStatus(`Ready for ${session.userTag}`);
    try {
      const bestResponse = await fetch(`/api/mochi/leaderboard/${session.userId}`, { cache: 'no-store' });
      if (bestResponse.ok) {
        const bestPayload = await bestResponse.json();
        if (bestPayload?.entry?.bestScore !== undefined) {
          bestScore = Number(bestPayload.entry.bestScore) || 0;
          localStorage.setItem(bestScoreKey, String(bestScore));
        }
      }
    } catch {
      // Best score lookup is optional.
    }
    void loadLeaderboard(true);
    startLeaderboardAutoRefresh();
    if (!started && gameState === 'menu' && !gameOver) {
      showMenu('main');
    }
  } catch (error) {
    updateStatus(`Session error: ${error.message}`);
    showMenu('start', {
      title: 'Session unavailable',
      text: 'The Discord session is missing or expired. Open a fresh run from the bot.',
      startText: 'Reload the page or start a new session from Discord.',
      startButtonLabel: 'Reload',
      startAction: 'reload'
    });
  }
}

window.addEventListener('resize', () => {
  resizeCanvas();
  updateViewportMode();
  if (gameState === 'menu') {
    showMenu(menuView);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopLeaderboardAutoRefresh();
    return;
  }

  void loadLeaderboard(true);
  startLeaderboardAutoRefresh();
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.code === 'ArrowUp') {
    event.preventDefault();
    void unlockAudio();
    flap();
  }
  if (event.code === 'KeyP') {
    event.preventDefault();
    togglePause();
  }
  if (event.code === 'KeyM') {
    event.preventDefault();
    settings.audioEnabled = !settings.audioEnabled;
    applySettings();
  }
  if (event.code === 'KeyR' && gameOver) {
    void unlockAudio();
    void launchRun();
  }
});

canvas.addEventListener('pointerdown', handleGameInput);
canvas.addEventListener('touchstart', handleGameInput, { passive: false });
document.addEventListener('pointerdown', handleDocumentGameInput, { capture: true });
document.addEventListener('touchstart', handleDocumentGameInput, { capture: true, passive: false });
document.addEventListener('click', handleDocumentGameInput, { capture: true });
mobileTapLayerEl?.addEventListener('pointerdown', handleMobileTapLayerInput);
mobileTapLayerEl?.addEventListener('touchstart', handleMobileTapLayerInput, { passive: false });
mobileTapLayerEl?.addEventListener('click', handleMobileTapLayerInput);

mainPlayButton.addEventListener('click', () => {
  startRunNow();
});
mainPlayButton.addEventListener('pointerdown', startRunNow);
mainPlayButton.addEventListener('touchend', startRunNow, { passive: false });
mainMenuStageEl?.addEventListener('pointerup', handleMainMenuStartFallback);
mainMenuStageEl?.addEventListener('touchend', handleMainMenuStartFallback, { passive: false });
mainLeaderboardButton.addEventListener('click', () => {
  void unlockAudio();
  showMenu('leaderboard');
});
mainLeaderboardButtonInline.addEventListener('click', () => {
  void unlockAudio();
  showMenu('leaderboard');
});
mainSettingsButton.addEventListener('click', () => {
  void unlockAudio();
  showMenu('settings');
});
mainMuteButton.addEventListener('click', () => {
  settings.audioEnabled = !settings.audioEnabled;
  applySettings();
});
startRunButton.addEventListener('click', () => {
  handleStartRunButtonActivation();
});
startRunButton.addEventListener('pointerdown', handleStartRunButtonActivation);
startRunButton.addEventListener('touchend', handleStartRunButtonActivation, { passive: false });
startBackButton.addEventListener('click', () => {
  void unlockAudio();
  showMenu('main');
});
leaderboardBackButton.addEventListener('click', () => {
  void unlockAudio();
  showMenu('main');
});
settingsBackButton.addEventListener('click', () => {
  void unlockAudio();
  showMenu('main');
});

menuTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    void unlockAudio();
    showMenu(tab.dataset.menuTab || 'main');
  });
});

document.querySelectorAll('[data-setting-toggle]').forEach((button) => {
  button.addEventListener('click', () => {
    void unlockAudio();
    const key = button.dataset.settingToggle;
    if (!key || !(key in settings)) {
      return;
    }
    settings[key] = !settings[key];
    applySettings();
  });
});

resizeCanvas();
loadSettings();
hydrateLeaderboardCache();
updateViewportMode();
void loadLeaderboard();
startLeaderboardAutoRefresh();
window.setTimeout(() => {
  if (activityMode) {
    introSplashEl?.classList.add('hidden');
    return;
  }
  introSplashEl?.classList.add('hidden');
}, 1700);
if (activityMode) {
  introSplashEl?.classList.add('hidden');
}
if (activityMode) {
  void launchRun();
} else {
  showReadyMenuForCurrentState();
}
loadSession().catch((error) => {
  updateStatus(`Startup error: ${error.message}`);
});
animationFrame = requestAnimationFrame(loop);
