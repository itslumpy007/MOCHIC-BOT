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

const params = new URLSearchParams(window.location.search);
let sessionId = params.get('sid');
let isPracticeMode = !sessionId;
let session = null;
let bestScoreKey = 'discord-mochi-bird-best-practice';

const birdSprite = new Image();
birdSprite.src = './assets/avatar.png?v=reset1';

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
let clouds = [];
let spawnTimer = 0.7;
let bgOffset = 0;

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

function resetBoard() {
  bird = {
    x: width * 0.28,
    y: height * 0.42,
    radius: 14,
    velocity: 0
  };
  pipes = [];
  spawnTimer = 0.65;
  bgOffset = 0;
  clouds = Array.from({ length: 5 }, (_, index) => ({
    x: width * (0.2 + index * 0.22),
    y: height * (0.12 + (index % 2) * 0.08),
    speed: 8 + index * 2,
    size: 0.8 + index * 0.16
  }));
  score = 0;
  elapsedMs = 0;
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
  resetBoard();
  showOverlay('Ready to play', 'Tap anywhere, click, or press Space to start.');
  updateStatus(isPracticeMode ? 'Practice mode ready' : 'Ready to play');
}

function startRun() {
  if (gameOver) {
    resetBoard();
  }

  started = true;
  gameOver = false;
  hideOverlay();
  updateStatus(isPracticeMode ? 'Practice mode running' : 'Session running');
  bird.velocity = FLAP_VELOCITY;
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
}

function endGame(reason) {
  if (gameOver) {
    return;
  }

  gameOver = true;
  started = false;
  updateStatus(`Game over: ${reason}`);
  showOverlay('Game over', `You scored ${score}. Tap to play again.`);
  void submitScore(reason);
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
    submitted = false;
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
  bgOffset = (bgOffset + PIPE_SPEED * deltaSeconds) % width;

  spawnTimer -= deltaSeconds;
  if (spawnTimer <= 0) {
    addPipe();
    spawnTimer = PIPE_INTERVAL;
  }

  for (const pipe of pipes) {
    pipe.x -= PIPE_SPEED * deltaSeconds;
  }

  pipes = pipes.filter((pipe) => pipe.x > -PIPE_WIDTH - 40);

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
      if (score > bestScore) {
        bestScore = score;
        bestScoreEl.textContent = String(bestScore);
        localStorage.setItem(bestScoreKey, String(bestScore));
      }
    }
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

  drawPipes();
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
  } catch (error) {
    sessionNoteEl.textContent = 'Discord session is missing or expired. Practice mode is still available.';
    updateStatus(`Session warning: ${error.message}`);
    isPracticeMode = true;
  }
}

function onPrimaryInput(event) {
  if (event) {
    event.preventDefault();
  }
  flap();
}

resizeCanvas();
hydrateBestScore();
resetRun();
void loadSession();

window.addEventListener('resize', () => {
  resizeCanvas();
  resetRun();
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
stageEl.addEventListener('click', onPrimaryInput);

overlayEl.addEventListener('click', onPrimaryInput);

raf = requestAnimationFrame(loop);
