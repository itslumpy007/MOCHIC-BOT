const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('bestScore');
const statusEl = document.getElementById('status');
const overlayEl = document.getElementById('overlay');
const overlayTitleEl = document.getElementById('overlayTitle');
const overlayTextEl = document.getElementById('overlayText');
const sessionNoteEl = document.getElementById('sessionNote');
const stageEl = document.getElementById('stage');
const overlaySummaryEl = document.getElementById('overlaySummary');
const primaryButton = document.getElementById('primaryButton');
const leaderboardListEl = document.getElementById('leaderboardList');
const leaderboardEmptyEl = document.getElementById('leaderboardEmpty');
const leaderboardStatusEl = document.getElementById('leaderboardStatus');
const leaderboardUpdatedEl = document.getElementById('leaderboardUpdated');
const canCountEl = document.getElementById('canCount');
const soundToggleEl = document.getElementById('soundToggle');
const bootstrapEl = document.getElementById('mochi-bootstrap');

let bootstrapPayload = null;
if (bootstrapEl?.textContent) {
  try {
    bootstrapPayload = JSON.parse(bootstrapEl.textContent);
  } catch {
    bootstrapPayload = null;
  }
}

const params = new URLSearchParams(window.location.search);
let sessionId = params.get('sid');
let isPracticeMode = !sessionId;
let session = null;
let bestScoreKey = 'discord-mochi-bird-best-practice';
let canWalletKey = 'discord-mochi-bird-can-wallet-practice';
let leaderboardCacheKey = 'discord-mochi-bird-leaderboard-cache';
let leaderboardEntries = [];
let leaderboardUpdatedAt = 0;
let leaderboardRefreshTimer = 0;
let leaderboardLoading = false;
let leaderboardLastFetchAt = 0;
let audioEnabled = localStorage.getItem('discord-mochi-bird-audio') !== 'off';
let audioContext = null;
let musicTimer = 0;
let musicStep = 0;
let canWallet = Number(localStorage.getItem(canWalletKey) || 0);
let runCanCount = 0;

const birdSprite = new Image();
birdSprite.src = './assets/avatar-v3.png?v=reset3';
const canSprite = new Image();
canSprite.src = './assets/dr-pepper-can-v3.png?v=reset4';

let width = 360;
let height = 640;
let dpr = Math.max(1, window.devicePixelRatio || 1);
let raf = 0;
let lastTime = 0;
let started = false;
let gameOver = false;
let submitted = false;
let score = 0;
let bestScore = 0;
let elapsedMs = 0;
let bird = null;
let pipes = [];
let cans = [];
let clouds = [];
let spawnTimer = 0.7;
let canSpawnTimer = 1.1;
let bgOffset = 0;
let particles = [];
let shakeTime = 0;
let shakePower = 0;
let lastPrimaryInputAt = 0;

const GRAVITY = 1100;
const FLAP_VELOCITY = -340;
const PIPE_SPEED = 170;
const PIPE_WIDTH = 72;
const PIPE_GAP = 166;
const PIPE_INTERVAL = 1.35;
const GROUND_HEIGHT = 90;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resizeCanvas() {
  const rect = stageEl.getBoundingClientRect();
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function hydrateBestScore() {
  bestScore = Number(localStorage.getItem(bestScoreKey) || 0);
  bestScoreEl.textContent = String(bestScore);
}

function hydrateCanWallet() {
  canWallet = Number(localStorage.getItem(canWalletKey) || 0);
  canCountEl.textContent = String(canWallet);
}

function persistCanWallet() {
  localStorage.setItem(canWalletKey, String(canWallet));
  canCountEl.textContent = String(canWallet);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function formatRelativeTime(timestamp) {
  if (!timestamp) {
    return 'Last updated just now';
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 5) {
    return 'Last updated just now';
  }
  if (diffSeconds < 60) {
    return `Last updated ${diffSeconds}s ago`;
  }
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) {
    return `Last updated ${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `Last updated ${hours}h ago`;
}

function renderLeaderboard(entries, updatedAt = Date.now()) {
  leaderboardEntries = Array.isArray(entries) ? entries.slice(0, 10) : [];
  leaderboardListEl.replaceChildren();

  if (!leaderboardEntries.length) {
    leaderboardEmptyEl.classList.remove('hidden');
    leaderboardStatusEl.textContent = 'No scores yet.';
    leaderboardUpdatedAt = updatedAt;
    leaderboardUpdatedEl.textContent = formatRelativeTime(leaderboardUpdatedAt);
    return;
  }

  leaderboardEmptyEl.classList.add('hidden');
  leaderboardStatusEl.textContent = `${leaderboardEntries.length} top scores saved from Discord runs.`;

  for (let index = 0; index < leaderboardEntries.length; index += 1) {
    const entry = leaderboardEntries[index];
    const item = document.createElement('li');
    item.className = 'leaderboard-entry';
    if (index === 0) {
      item.classList.add('leaderboard-entry--top');
    }

    const rank = document.createElement('span');
    rank.className = 'leaderboard-rank';
    rank.textContent = `#${index + 1}`;

    const meta = document.createElement('div');
    meta.className = 'leaderboard-meta-block';
    const user = document.createElement('strong');
    user.textContent = entry.userTag || entry.userName || `Player ${index + 1}`;
    const sub = document.createElement('span');
    const timeText = entry.updatedAt
      ? `Saved ${formatRelativeTime(entry.updatedAt).replace('Last updated ', '')}`
      : 'Recorded run';
    sub.textContent = `${timeText} · ${formatDuration(Number(entry.durationMs || 0))}`;
    meta.append(user, sub);

    const score = document.createElement('strong');
    score.className = 'leaderboard-score';
    score.textContent = String(entry.bestScore ?? entry.score ?? 0);

    item.append(rank, meta, score);
    leaderboardListEl.appendChild(item);
  }

  leaderboardUpdatedAt = updatedAt;
  leaderboardUpdatedEl.textContent = formatRelativeTime(leaderboardUpdatedAt);
  localStorage.setItem(
    leaderboardCacheKey,
    JSON.stringify({ updatedAt: leaderboardUpdatedAt, entries: leaderboardEntries })
  );
}

function hydrateLeaderboardCache() {
  try {
    const raw = localStorage.getItem(leaderboardCacheKey);
    if (!raw) {
      return;
    }

    const payload = JSON.parse(raw);
    if (Array.isArray(payload.entries)) {
      leaderboardUpdatedAt = Number(payload.updatedAt) || 0;
      leaderboardLastFetchAt = leaderboardUpdatedAt || Date.now();
      renderLeaderboard(payload.entries, leaderboardUpdatedAt || Date.now());
    }
  } catch {
    // Cached leaderboard is optional.
  }
}

async function loadLeaderboard({ quiet = false } = {}) {
  if (leaderboardLoading) {
    return;
  }

  leaderboardLoading = true;
  try {
    if (!quiet) {
      leaderboardStatusEl.textContent = 'Refreshing top scores...';
    }

    const response = await fetch('/api/mochi/leaderboard', { cache: 'no-store' });
    const payloadText = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      payload = null;
    }

    const entries = Array.isArray(payload?.leaderboard) ? payload.leaderboard : [];
    if (response.ok && entries.length) {
      renderLeaderboard(entries, Date.now());
    } else if (response.ok && !entries.length && bootstrapPayload?.leaderboard && Array.isArray(bootstrapPayload.leaderboard)) {
      renderLeaderboard(bootstrapPayload.leaderboard, Date.now());
    } else if (!leaderboardEntries.length && bootstrapPayload?.leaderboard && Array.isArray(bootstrapPayload.leaderboard)) {
      renderLeaderboard(bootstrapPayload.leaderboard, Date.now());
    } else if (leaderboardEntries.length) {
      leaderboardStatusEl.textContent = `${leaderboardEntries.length} top scores saved from Discord runs.`;
      leaderboardEmptyEl.classList.add('hidden');
    }
  } catch {
    if (leaderboardEntries.length) {
      leaderboardStatusEl.textContent = `${leaderboardEntries.length} top scores saved from Discord runs.`;
      leaderboardEmptyEl.classList.add('hidden');
    } else if (bootstrapPayload?.leaderboard && Array.isArray(bootstrapPayload.leaderboard)) {
      renderLeaderboard(bootstrapPayload.leaderboard, Date.now());
    }
  } finally {
    leaderboardLoading = false;
    leaderboardLastFetchAt = Date.now();
  }
}

function tickLeaderboardLabel() {
  leaderboardUpdatedEl.textContent = formatRelativeTime(leaderboardUpdatedAt);
}

function scheduleLeaderboardRefresh() {
  if (leaderboardRefreshTimer) {
    return;
  }

  leaderboardRefreshTimer = window.setInterval(() => {
    tickLeaderboardLabel();
    if (!document.hidden && Date.now() - leaderboardLastFetchAt > 15000) {
      void loadLeaderboard({ quiet: true });
    }
  }, 1000);
}

function ensureAudioContext() {
  if (audioContext) {
    return audioContext;
  }

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) {
    return null;
  }

  audioContext = new AudioCtor();
  return audioContext;
}

async function unlockAudio() {
  if (!audioEnabled) {
    return null;
  }

  const context = ensureAudioContext();
  if (!context) {
    return null;
  }

  if (context.state === 'suspended') {
    try {
      await context.resume();
    } catch {
      // Ignore audio resume failures; the game still works without sound.
    }
  }

  return context;
}

function playTone({ frequency, duration = 0.16, type = 'sine', gain = 0.04, slideTo = null }) {
  if (!audioEnabled) {
    return;
  }

  const context = ensureAudioContext();
  if (!context) {
    return;
  }

  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  if (slideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + duration);
  }
  envelope.gain.setValueAtTime(0.0001, context.currentTime);
  envelope.gain.exponentialRampToValueAtTime(gain, context.currentTime + 0.02);
  envelope.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  oscillator.connect(envelope).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration + 0.02);
}

function playFlapSound() {
  playTone({ frequency: 520, slideTo: 760, duration: 0.08, gain: 0.03, type: 'triangle' });
}

function playScoreSound() {
  playTone({ frequency: 660, slideTo: 880, duration: 0.09, gain: 0.03, type: 'square' });
  window.setTimeout(() => playTone({ frequency: 990, slideTo: 1320, duration: 0.08, gain: 0.025, type: 'triangle' }), 70);
}

function playHitSound() {
  playTone({ frequency: 220, slideTo: 140, duration: 0.18, gain: 0.05, type: 'sawtooth' });
}

function playCanSound() {
  playTone({ frequency: 880, slideTo: 1120, duration: 0.08, gain: 0.028, type: 'triangle' });
  window.setTimeout(() => playTone({ frequency: 1320, slideTo: 1640, duration: 0.07, gain: 0.022, type: 'sine' }), 55);
}

function startMusicLoop() {
  if (!audioEnabled || musicTimer) {
    return;
  }

  const pattern = [587.33, 523.25, 659.25, 493.88];
  musicStep = 0;
  playTone({ frequency: 174.61, duration: 0.24, gain: 0.015, type: 'triangle' });
  musicTimer = window.setInterval(() => {
    if (!started || gameOver || !audioEnabled) {
      return;
    }
    const note = pattern[musicStep % pattern.length];
    const octave = musicStep % 8 === 7 ? note / 2 : note;
    playTone({ frequency: octave, duration: 0.14, gain: 0.012, type: 'triangle' });
    musicStep += 1;
  }, 420);
}

function stopMusicLoop() {
  if (musicTimer) {
    window.clearInterval(musicTimer);
    musicTimer = 0;
  }
}

function setSoundButtonLabel() {
  soundToggleEl.textContent = audioEnabled ? 'Sound: On' : 'Sound: Off';
  soundToggleEl.setAttribute('aria-pressed', audioEnabled ? 'true' : 'false');
}

function toggleSound() {
  audioEnabled = !audioEnabled;
  localStorage.setItem('discord-mochi-bird-audio', audioEnabled ? 'on' : 'off');
  setSoundButtonLabel();
  if (!audioEnabled) {
    stopMusicLoop();
  } else if (started && !gameOver) {
    void unlockAudio().then(() => startMusicLoop());
  }
}

function emitParticles(x, y, color = 'rgba(255,255,255,0.8)', count = 8) {
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.2;
    const speed = 80 + Math.random() * 140;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      life: 0.55 + Math.random() * 0.2,
      age: 0,
      color,
      size: 2 + Math.random() * 2
    });
  }
}

function nudgeScreenShake(power = 5, duration = 0.14) {
  shakePower = Math.max(shakePower, power);
  shakeTime = Math.max(shakeTime, duration);
}

function updateParticles(deltaSeconds) {
  particles = particles.filter((particle) => {
    particle.age += deltaSeconds;
    particle.x += particle.vx * deltaSeconds;
    particle.y += particle.vy * deltaSeconds;
    particle.vy += 240 * deltaSeconds;
    return particle.age < particle.life;
  });

  if (shakeTime > 0) {
    shakeTime = Math.max(0, shakeTime - deltaSeconds);
  } else {
    shakePower = 0;
  }
}

function drawParticles() {
  if (!particles.length) {
    return;
  }

  ctx.save();
  for (const particle of particles) {
    const alpha = 1 - particle.age / particle.life;
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function resetBoard() {
  bird = {
    x: width * 0.28,
    y: height * 0.42,
    radius: Math.max(15, Math.min(18, Math.round(width * 0.045))),
    velocity: 0
  };
  pipes = [];
  cans = [];
  spawnTimer = 0.65;
  canSpawnTimer = 0.95;
  bgOffset = 0;
  clouds = Array.from({ length: 5 }, (_, index) => ({
    x: width * (0.2 + index * 0.22),
    y: height * (0.12 + (index % 2) * 0.08),
    speed: 8 + index * 2,
    size: 0.8 + index * 0.16
  }));
  score = 0;
  elapsedMs = 0;
  runCanCount = 0;
  started = false;
  gameOver = false;
  submitted = false;
  scoreEl.textContent = '0';
}

function showOverlay(title, text) {
  overlayTitleEl.textContent = title;
  overlayTextEl.textContent = text;
  overlayEl.classList.remove('hidden');
}

function hideOverlay() {
  overlayEl.classList.add('hidden');
}

function updateStatus(text) {
  statusEl.textContent = text;
}

function addPipe() {
  const topHeight = 60 + Math.random() * (height - GROUND_HEIGHT - PIPE_GAP - 140);
  pipes.push({
    x: width + 30,
    topHeight,
    passed: false
  });
}

function addCan() {
  const canSize = clamp(Math.round(width * 0.085), 26, 40);
  const minY = Math.max(72, canSize * 1.5);
  const maxY = Math.max(minY + 60, height - GROUND_HEIGHT - canSize * 1.5 - 20);
  cans.push({
    x: width + canSize + 24,
    y: minY + Math.random() * (maxY - minY),
    size: canSize,
    bob: Math.random() * Math.PI * 2,
    collected: false
  });
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
  return {
    x: bird.x - bird.radius,
    y: bird.y - bird.radius,
    width: bird.radius * 2,
    height: bird.radius * 2
  };
}

function canBox(can) {
  const size = can.size * 0.96;
  return {
    x: can.x - size / 2,
    y: can.y - size / 2,
    width: size,
    height: size
  };
}

function pipeBoxes(pipe) {
  const gapBottom = pipe.topHeight + PIPE_GAP;
  return [
    {
      x: pipe.x,
      y: 0,
      width: PIPE_WIDTH,
      height: pipe.topHeight
    },
    {
      x: pipe.x,
      y: gapBottom,
      width: PIPE_WIDTH,
      height: height - GROUND_HEIGHT - gapBottom
    }
  ];
}

function drawSky() {
  const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
  skyGradient.addColorStop(0, '#78cffd');
  skyGradient.addColorStop(0.6, '#beeefe');
  skyGradient.addColorStop(1, '#ffe28a');
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height);
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
    const topHeight = pipe.topHeight;
    const bottomY = pipe.topHeight + PIPE_GAP;
    const bottomHeight = height - GROUND_HEIGHT - bottomY;

    ctx.fillStyle = '#1d7f52';
    ctx.strokeStyle = '#145337';
    ctx.lineWidth = 4;

    ctx.beginPath();
    roundRect(ctx, pipe.x, 0, PIPE_WIDTH, topHeight, 12, true, false);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    roundRect(ctx, pipe.x - 4, Math.max(0, topHeight - 16), PIPE_WIDTH + 8, 16, 8, true, false);
    ctx.fillStyle = '#2fd18d';
    ctx.fill();

    ctx.beginPath();
    roundRect(ctx, pipe.x, bottomY, PIPE_WIDTH, bottomHeight, 12, true, false);
    ctx.fillStyle = '#1d7f52';
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    roundRect(ctx, pipe.x - 4, bottomY, PIPE_WIDTH + 8, 16, 8, true, false);
    ctx.fillStyle = '#2fd18d';
    ctx.fill();
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
    const x = (i * 36 - bgOffset * 0.6) % (width + 36);
    ctx.fillRect(x, groundY + 8, 22, 4);
  }
}

function drawBird() {
  if (!bird) {
    return;
  }

  const tilt = clamp(bird.velocity / 400, -0.6, 0.8);
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(tilt);

  if (birdSprite.complete && birdSprite.naturalWidth > 0) {
    const size = bird.radius * 2.35;
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

function drawCans() {
  if (!cans.length) {
    return;
  }

  for (const can of cans) {
    const wobble = Math.sin(can.bob) * 3;
    can.bob += 0.08;

    ctx.save();
    ctx.translate(can.x, can.y + wobble);
    ctx.rotate(Math.sin(can.bob * 0.8) * 0.12);

    if (canSprite.complete && canSprite.naturalWidth > 0) {
      ctx.drawImage(canSprite, -can.size / 2, -can.size / 2, can.size, can.size);
    } else {
      const fallbackWidth = can.size * 0.82;
      const fallbackHeight = can.size * 1.1;
      ctx.fillStyle = '#b51030';
      roundRect(ctx, -fallbackWidth / 2, -fallbackHeight / 2, fallbackWidth, fallbackHeight, 5);
      ctx.fill();
    }

    ctx.restore();
  }
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

function resetRun() {
  stopMusicLoop();
  shakeTime = 0;
  shakePower = 0;
  resetBoard();
  overlaySummaryEl.replaceChildren();
  showOverlay('Ready to play', 'Tap anywhere, click, or press Space to start.');
  primaryButton.textContent = 'Play';
  updateStatus(isPracticeMode ? 'Practice mode ready' : 'Ready to play');
}

function startRun() {
  if (gameOver) {
    resetBoard();
  }

  started = true;
  gameOver = false;
  hideOverlay();
  overlaySummaryEl.replaceChildren();
  updateStatus(isPracticeMode ? 'Practice mode running' : 'Session running');
  bird.velocity = FLAP_VELOCITY;
  emitParticles(bird.x, bird.y, 'rgba(255,255,255,0.45)', 5);
  playFlapSound();
  void unlockAudio().then(() => startMusicLoop());
}

function flap() {
  if (!started) {
    startRun();
    return;
  }

  if (gameOver) {
    resetRun();
    startRun();
    return;
  }

  bird.velocity = FLAP_VELOCITY;
  emitParticles(bird.x - 2, bird.y + 4, 'rgba(255, 210, 90, 0.85)', 4);
  playFlapSound();
}

function endGame(reason) {
  if (gameOver) {
    return;
  }

  gameOver = true;
  started = false;
  stopMusicLoop();
  updateStatus(`Game over: ${reason}`);
  const isNewBest = score > bestScore;
  const summary = [
    { label: 'Score', value: String(score) },
    { label: 'Best', value: String(Math.max(bestScore, score)) },
    { label: 'Cans', value: String(runCanCount) },
    { label: 'Time', value: formatDuration(elapsedMs) }
  ];

  overlaySummaryEl.replaceChildren();
  for (const item of summary) {
    const pill = document.createElement('div');
    pill.className = 'overlay-pill';
    pill.innerHTML = `<span>${item.label}</span><strong>${item.value}</strong>`;
    overlaySummaryEl.appendChild(pill);
  }

  showOverlay(
    'Game over',
    `${isNewBest ? 'New best score! ' : ''}You scored ${score}. Tap play again to run it back.`
  );
  primaryButton.textContent = 'Play again';
  void submitScore(reason);
  playHitSound();
  emitParticles(bird.x, Math.max(0, bird.y), 'rgba(255, 105, 105, 0.9)', 14);
  nudgeScreenShake(8, 0.2);
}

async function submitScore(reason) {
  if (isPracticeMode || submitted || !sessionId) {
    return;
  }

  submitted = true;

  try {
    const response = await fetch(`/api/mochi/session/${sessionId}/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        score,
        durationMs: Math.round(elapsedMs),
        cans: runCanCount,
        reason
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to submit score');
    }

    const submittedBest = payload.personalBest?.bestScore ?? score;
    bestScore = Math.max(bestScore, submittedBest);
    localStorage.setItem(bestScoreKey, String(bestScore));
    bestScoreEl.textContent = String(bestScore);
    updateStatus(`Score submitted. Personal best: ${submittedBest}.`);
    void loadLeaderboard({ quiet: true });
  } catch (error) {
    submitted = false;
    updateStatus(`Could not submit score: ${error.message}`);
  }
}

function update(deltaSeconds) {
  updateParticles(deltaSeconds);

  if (!started || gameOver) {
    return;
  }

  elapsedMs += deltaSeconds * 1000;
  bird.velocity += GRAVITY * deltaSeconds;
  bird.y += bird.velocity * deltaSeconds;
  bgOffset = (bgOffset + PIPE_SPEED * deltaSeconds) % width;

  spawnTimer -= deltaSeconds;
  canSpawnTimer -= deltaSeconds;
  if (spawnTimer <= 0) {
    addPipe();
    spawnTimer = PIPE_INTERVAL;
  }
  if (canSpawnTimer <= 0) {
    addCan();
    canSpawnTimer = 1.6 + Math.random() * 1.4;
  }

  for (const pipe of pipes) {
    pipe.x -= PIPE_SPEED * deltaSeconds;
  }

  pipes = pipes.filter((pipe) => pipe.x > -PIPE_WIDTH - 40);
  for (const can of cans) {
    can.x -= PIPE_SPEED * deltaSeconds * 0.92;
  }
  cans = cans.filter((can) => can.x > -80 && !can.collected);

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
      score += 1;
      scoreEl.textContent = String(score);
      playScoreSound();
      emitParticles(pipe.x + PIPE_WIDTH * 0.5, pipe.topHeight + PIPE_GAP * 0.5, 'rgba(37, 208, 171, 0.95)', 10);
      if (score > bestScore) {
        bestScore = score;
        bestScoreEl.textContent = String(bestScore);
        localStorage.setItem(bestScoreKey, String(bestScore));
      }
    }
  }

  for (const can of cans) {
    if (can.collected) {
      continue;
    }

    if (rectsOverlap(birdBounds, canBox(can))) {
      can.collected = true;
      runCanCount += 1;
      canWallet += 1;
      persistCanWallet();
      playCanSound();
      emitParticles(can.x, can.y, 'rgba(255, 200, 87, 0.95)', 12);
    }
  }
}

function render() {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  if (shakeTime > 0 && shakePower > 0) {
    const jitterX = (Math.random() - 0.5) * shakePower;
    const jitterY = (Math.random() - 0.5) * shakePower;
    ctx.translate(jitterX, jitterY);
  }

  drawSky();

  for (const cloud of clouds) {
    cloud.x -= cloud.speed * 0.008;
    if (cloud.x < -120) {
      cloud.x = width + 120;
      cloud.y = height * (0.12 + Math.random() * 0.18);
    }
    drawCloud(cloud.x, cloud.y, cloud.size);
  }

  drawPipes();
  drawCans();
  drawGround();
  drawParticles();
  drawBird();
  drawHudOverlay();
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
  raf = requestAnimationFrame(loop);
}

async function loadSession() {
  if (!sessionId) {
    isPracticeMode = true;
    sessionNoteEl.textContent = 'Practice mode: this run is local only.';
    hydrateBestScore();
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
    canWalletKey = `discord-mochi-bird-can-wallet-${session.userId}`;
    sessionNoteEl.textContent = `Session linked to ${session.userTag}.`;
    updateStatus(`Ready for ${session.userTag}`);

    try {
      const bestResponse = await fetch(`/api/mochi/leaderboard/${session.userId}`, { cache: 'no-store' });
      if (bestResponse.ok) {
        const bestPayload = await bestResponse.json();
        if (bestPayload?.entry?.bestScore !== undefined) {
          bestScore = Number(bestPayload.entry.bestScore) || 0;
          localStorage.setItem(bestScoreKey, String(bestScore));
          bestScoreEl.textContent = String(bestScore);
        }
      }
    } catch {
      // Best score lookup is optional.
    }

    hydrateCanWallet();
  } catch (error) {
    sessionNoteEl.textContent = 'Discord session is missing or expired. Practice mode is still available.';
    updateStatus(`Session warning: ${error.message}`);
    isPracticeMode = true;
  }

  void loadLeaderboard({ quiet: true });
}

async function onPrimaryInput(event) {
  const now = Date.now();
  if (now - lastPrimaryInputAt < 120) {
    return;
  }
  lastPrimaryInputAt = now;

  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  await unlockAudio();
  flap();
}

resizeCanvas();
hydrateBestScore();
hydrateCanWallet();
hydrateLeaderboardCache();
setSoundButtonLabel();
if (bootstrapPayload?.leaderboard && Array.isArray(bootstrapPayload.leaderboard)) {
  renderLeaderboard(bootstrapPayload.leaderboard, Date.now());
}
resetRun();
void loadSession();
scheduleLeaderboardRefresh();
void loadLeaderboard({ quiet: true });

window.addEventListener('resize', () => {
  resizeCanvas();
  resetRun();
});

window.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    void loadLeaderboard({ quiet: true });
    tickLeaderboardLabel();
  }
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.code === 'ArrowUp') {
    event.preventDefault();
    onPrimaryInput(event);
  }
  if (event.code === 'KeyR' && gameOver) {
    event.preventDefault();
    resetRun();
  }
});

canvas.addEventListener('pointerdown', onPrimaryInput);
canvas.addEventListener('touchstart', onPrimaryInput, { passive: false });
stageEl.addEventListener('pointerdown', onPrimaryInput);
stageEl.addEventListener('touchstart', onPrimaryInput, { passive: false });
stageEl.addEventListener('click', onPrimaryInput);
primaryButton.addEventListener('pointerdown', onPrimaryInput);
primaryButton.addEventListener('touchend', onPrimaryInput, { passive: false });
soundToggleEl.addEventListener('click', toggleSound);

raf = requestAnimationFrame(loop);
