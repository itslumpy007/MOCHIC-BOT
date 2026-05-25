const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('bestScore');
const statusEl = document.getElementById('status');
const overlayEl = document.getElementById('overlay');
const overlayTitleEl = document.getElementById('overlayTitle');
const overlayTextEl = document.getElementById('overlayText');
const sessionNoteEl = document.getElementById('sessionNote');
const introSplashEl = document.getElementById('introSplash');
const mainPlayButton = document.getElementById('mainPlayButton');
const mainSettingsButton = document.getElementById('mainSettingsButton');
const startRunButton = document.getElementById('startRunButton');
const startBackButton = document.getElementById('startBackButton');
const settingsBackButton = document.getElementById('settingsBackButton');
const audioStateEl = document.getElementById('audioState');
const reducedMotionStateEl = document.getElementById('reducedMotionState');
const hardModeStateEl = document.getElementById('hardModeState');
const startMenuTextEl = document.getElementById('startMenuText');
const modeLabelEl = document.getElementById('modeLabel');
const menuTabs = Array.from(document.querySelectorAll('[data-menu-tab]'));
const menuPanels = Array.from(document.querySelectorAll('[data-menu-panel]'));
const ASSET_VERSION = 'transparent3';
const SETTINGS_KEY = 'discord-mochi-bird-settings';

const params = new URLSearchParams(window.location.search);
let sessionId = params.get('sid');
let isPracticeMode = !sessionId;

let bestScoreKey = 'discord-mochi-bird-best-practice';
let activityMode = false;
let discordClientId = null;
let discordSdk = null;
let menuView = 'main';
let settings = {
  audioEnabled: true,
  reducedMotion: false,
  hardMode: false
};
let startRunMode = 'start';

let session = null;
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
let score = 0;
let bestScore = 0;
let elapsedMs = 0;
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function startMusicLoop() {
  if (musicTimer || !settings.audioEnabled || !audioUnlocked) {
    return;
  }

  const progression = [
    [440, 554.37, 659.25],
    [392, 493.88, 587.33],
    [349.23, 440, 523.25],
    [392, 523.25, 659.25]
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
        duration: 0.28,
        type: index === 0 ? 'triangle' : 'sine',
        gain: index === 0 ? 0.035 : 0.02,
        start: index * 0.02
      });
    });

    playTone({
      frequency: bass,
      duration: 0.36,
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
  if (settings.audioEnabled && audioUnlocked) {
    startMusicLoop();
  }
  saveSettings();
}

function setMenuView(view) {
  menuView = view;
  menuTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.menuTab === view);
  });
  menuPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.menuPanel === view);
  });
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
    preserveScore = false
  } = options;

  started = false;
  gameOver = false;
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
}

function launchRun() {
  started = false;
  gameOver = false;
  submitted = false;
  score = 0;
  elapsedMs = 0;
  gameState = 'playing';
  resetBoard();
  scoreEl.textContent = '0';
  hideOverlay();
  updateStatus(isPracticeMode ? 'Practice mode running' : 'Session running');
  bird.velocity = FLAP_VELOCITY;
  started = true;
}

function hideOverlay() {
  overlayEl.classList.add('hidden');
}

function updateStatus(text) {
  statusEl.textContent = text;
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

function collectScore(points = 1) {
  score += points;
  scoreEl.textContent = String(score);
  if (score > bestScore) {
    bestScore = score;
    bestScoreEl.textContent = String(bestScore);
    localStorage.setItem(bestScoreKey, String(bestScore));
  }
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
    launchRun();
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
  return {
    x: bird.x - bird.radius,
    y: bird.y - bird.radius,
    width: bird.radius * 2,
    height: bird.radius * 2
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

  gameOver = true;
  gameState = 'gameover';
  started = false;
  updateStatus(`Game over: ${reason}`);
  showMenu('start', {
    title: 'Game over',
    text: `You scored ${score}. ${isPracticeMode ? 'Press Start Run to try again.' : 'This run has been recorded in Discord.'}`,
    startText: 'Your run ended. Open Start Run when you want another attempt.',
    startButtonLabel: 'Play again',
    preserveScore: true
  });
  gameOver = true;
  gameState = 'gameover';
  submitScore(reason);
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
  } catch (error) {
    updateStatus(`Could not submit score: ${error.message}`);
  }
}

function update(deltaSeconds) {
  if (!started || gameOver) {
    return;
  }

  elapsedMs += deltaSeconds * 1000;
  bird.velocity += GRAVITY * deltaSeconds;
  bird.y += bird.velocity * deltaSeconds;
  backgroundOffset = (backgroundOffset + PIPE_SPEED * deltaSeconds) % width;

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
      collectScore(1);
    }
  }

  for (const item of collectibles) {
    if (item.collected) {
      continue;
    }
    const pickup = collectibleBox(item);
    if (rectsOverlap(birdBounds, pickup)) {
      item.collected = true;
      collectScore(1);
      playPickupChime();
      updateStatus('Collected a Dr Pepper can!');
    }
  }
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

function drawHudOverlay() {
  if (started || gameOver) {
    return;
  }
  ctx.save();
  ctx.fillStyle = 'rgba(7, 16, 24, 0.12)';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawMenuScene() {
  if (started || gameOver) {
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
    const size = 156;
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
  drawCollectibles();
  drawGround();
  drawBird();
  drawHudOverlay();
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

  try {
    const configResponse = await fetch('/api/mochi/config');
    const configPayload = await configResponse.json();
    if (configResponse.ok) {
      activityMode = Boolean(configPayload.activityMode);
      discordClientId = configPayload.discordClientId;
      document.body.classList.toggle('activity-mode', activityMode);
    }
  } catch {
    // Config lookup is optional.
  }

  if (activityMode && discordClientId) {
    try {
      const sdkModule = await import('https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk/+esm');
      discordSdk = new sdkModule.DiscordSDK(discordClientId);
      await discordSdk.ready();
      updateStatus('Discord Activity ready');
      sessionNoteEl.textContent = 'Running inside Discord as an Activity.';
      if (!sessionId) {
        const activitySession = await createActivitySession();
        sessionId = activitySession.id;
        isPracticeMode = false;
        session = activitySession;
        bestScoreKey = `discord-mochi-bird-best-${session.userId}`;
        const bestResponse = await fetch(`/api/mochi/leaderboard/${session.userId}`);
        if (bestResponse.ok) {
          const bestPayload = await bestResponse.json();
          if (bestPayload?.entry?.bestScore !== undefined) {
            bestScore = Number(bestPayload.entry.bestScore) || 0;
            localStorage.setItem(bestScoreKey, String(bestScore));
          }
        }
        sessionNoteEl.textContent = `Activity session created for ${session.userTag}.`;
        updateStatus(`Ready for ${session.userTag}`);
      }
    } catch (error) {
      updateStatus(`Discord Activity handshake failed: ${error.message}`);
    }
  }

  if (!sessionId && isPracticeMode) {
    updateStatus(activityMode ? 'Activity practice ready' : 'Practice mode ready');
    if (!activityMode) {
      sessionNoteEl.textContent = 'Practice mode: this run is local only.';
    }
    showMenu('main');
    return;
  }

  try {
    const response = await fetch(`/api/mochi/session/${sessionId}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Session not found');
    }

    session = payload.session;
    bestScoreKey = `discord-mochi-bird-best-${session.userId}`;
    sessionNoteEl.textContent = `Session linked to ${session.userTag}.`;
    updateStatus(`Ready for ${session.userTag}`);
    try {
      const bestResponse = await fetch(`/api/mochi/leaderboard/${session.userId}`);
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
    showMenu('main');
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
  if (gameState === 'menu') {
    showMenu(menuView);
  }
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.code === 'ArrowUp') {
    event.preventDefault();
    void unlockAudio();
    flap();
  }
  if (event.code === 'KeyR' && gameOver) {
    void unlockAudio();
    launchRun();
  }
});

canvas.addEventListener('pointerdown', () => {
  void unlockAudio();
  flap();
});

mainPlayButton.addEventListener('click', () => {
  void unlockAudio();
  showMenu('start');
});
mainSettingsButton.addEventListener('click', () => {
  void unlockAudio();
  showMenu('settings');
});
startRunButton.addEventListener('click', () => {
  void unlockAudio();
  if (startRunMode === 'reload') {
    window.location.reload();
    return;
  }
  if (gameState === 'gameover') {
    launchRun();
    return;
  }
  launchRun();
});
startBackButton.addEventListener('click', () => {
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
showMenu('main', {
  title: 'Launching Activity',
  text: 'Connecting to Discord and preparing your run.',
  startText: 'If this takes a moment, the Activity is still loading in the background.',
  startButtonLabel: 'Please wait',
  startDisabled: true
});
window.setTimeout(() => {
  introSplashEl?.classList.add('hidden');
}, 1700);
loadSession().catch((error) => {
  updateStatus(`Startup error: ${error.message}`);
});
animationFrame = requestAnimationFrame(loop);
