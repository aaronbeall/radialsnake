import './style.css';
import { SnakeGame, WIDTH, HEIGHT, wrap, type Controls, type GameEvent, type Point } from './game';
import { PALETTES, type Palette } from './palettes';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const ctx = canvas.getContext('2d')!;
const shell = canvas.parentElement!;
const overlay = $('overlay'), play = $('play'), overlayTitle = $('overlay-title');
const scoreText = $('score'), bestText = $('best');
const speedText = $('speed');
let nextSpeedUpdate = 0, displayedSpeed = '1.00×';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const game = new SnakeGame();
const controls: Controls = { left: false, right: false, up: false, down: false };
const pressed = new Set<string>();
const touch = new Set<keyof Controls>();
type State = 'ready' | 'playing' | 'paused' | 'over';
let state: State = 'ready', paletteIndex = 0, elapsed = 0, accumulator = 0, lastTime = 0;
let best = 0, startingBest = 0, recordCelebrated = false;
try { best = Math.max(0, Number(localStorage.getItem('radialsnake.best')) || 0); } catch { /* Private browsing can block storage. */ }
bestText.textContent = String(best).padStart(3, '0');
let toastUntil = 0, screenFlash = 0;
let soundEnabled = true, audio: AudioContext | undefined;
interface Particle extends Point { vx: number; vy: number; life: number; maxLife: number; size: number; color: string }
const particles: Particle[] = [];
interface Ripple extends Point { radius: number; speed: number; life: number; maxLife: number; color: string }
const ripples: Ripple[] = [];
const burstDrag = 7.5;
const sparkDrag = 2.2;
const particleGravity = 180;
const burstOpacity = (life: number, maxLife: number) => Math.min(1, life / (maxLife * .65));
interface RGB { r: number; g: number; b: number }
const hex = (s: string): RGB => ({ r: parseInt(s.slice(1, 3), 16), g: parseInt(s.slice(3, 5), 16), b: parseInt(s.slice(5, 7), 16) });
const colorKeys = ['background', 'snake', 'highlight', 'apple'] as const;
const colors = { background: hex(PALETTES[0].background), snake: hex(PALETTES[0].snake), highlight: hex(PALETTES[0].highlight), apple: hex(PALETTES[0].apple) };
let targetColors = { ...colors };
const rgb = (c: RGB, alpha = 1) => `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${alpha})`;
function applyPalette(palette: Palette, immediate = false): void {
  const root = document.documentElement.style;
  root.setProperty('--page', palette.background); root.setProperty('--panel', palette.panel);
  root.setProperty('--accent', palette.snake); root.setProperty('--apple', palette.apple);
  root.setProperty('--text', palette.text); root.setProperty('--muted', palette.muted);
  targetColors = { background: hex(palette.background), snake: hex(palette.snake), highlight: hex(palette.highlight), apple: hex(palette.apple) };
  if (immediate) for (const key of colorKeys) Object.assign(colors[key], targetColors[key]);
}
applyPalette(PALETTES[0], true);
function tone(frequency: number, delay = 0, duration = .12): void {
  if (!soundEnabled) return;
  audio ??= new AudioContext();
  const oscillator = audio.createOscillator(), gain = audio.createGain();
  oscillator.type = 'sine'; oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, audio.currentTime + delay);
  gain.gain.linearRampToValueAtTime(.055, audio.currentTime + delay + .015);
  gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + delay + duration);
  oscillator.connect(gain); gain.connect(audio.destination);
  oscillator.start(audio.currentTime + delay); oscillator.stop(audio.currentTime + delay + duration + .01);
}
function toast(message: string, seconds = 2.8): void {
  const el = $('toast'); el.textContent = message; el.classList.add('visible'); toastUntil = elapsed + seconds;
}
function burst(x: number, y: number, color: string, count = 24, power = 1, heading?: number): void {
  if (reducedMotion) count = Math.min(8, count);
  for (let i = 0; i < count && particles.length < 220; i++) {
    // An exponential bias packs most particles into the slower range, with a few fast outliers.
    const angle = heading !== undefined && Math.random() < .75
      ? heading + (Math.random() - .5) * 2.4
      : Math.random() * Math.PI * 2;
    const speed = (140 + Math.expm1(Math.random() * 4) / Math.expm1(4) * 560) * power;
    const life = 1.2 + Math.random() * .6;
    particles.push({ x: wrap(x, WIDTH), y: wrap(y, HEIGHT), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 100 * power, life, maxLife: life, size: .7 + Math.random() * .8, color });
  }
  ripples.push({ x: wrap(x, WIDTH), y: wrap(y, HEIGHT), radius: 10, speed: 520 * power, life: .55, maxLife: .55, color });
}
function syncStats(): void {
  scoreText.textContent = String(game.score).padStart(3, '0');
}
const handleEvent = (event: GameEvent): void => {
  if (event.type === 'apple') {
    burst(event.x, event.y, PALETTES[paletteIndex].apple, 24, 1, game.angle);
    tone(440, 0); tone(660, .07); syncStats();
    if (game.score > best) {
      best = game.score; bestText.textContent = String(best).padStart(3, '0');
      try { localStorage.setItem('radialsnake.best', String(best)); } catch { /* Gameplay still works without persistence. */ }
      if (!recordCelebrated && game.score > startingBest) {
        recordCelebrated = true; screenFlash = .3;
        toast('New high score', 3);
        burst(game.head.x, game.head.y, PALETTES[paletteIndex].highlight, 48, 1.6, game.angle);
        tone(523, .15); tone(659, .25); tone(784, .35, .24);
      }
    }
  } else if (event.type === 'palette') {
    paletteIndex = (paletteIndex + 1 + Math.floor(Math.random() * (PALETTES.length - 1))) % PALETTES.length;
    applyPalette(PALETTES[paletteIndex]);
    tone(330, 0, .3); tone(495, .12, .3);
  } else {
    state = 'over'; clearControls(); burst(event.x, event.y, PALETTES[paletteIndex].snake, 55, 1.6);
    tone(180, 0, .3); tone(120, .1, .45);
    overlayTitle.hidden = false; overlayTitle.textContent = 'Game over';
    play.textContent = 'Play again'; overlay.hidden = false;
  }
};
function start(): void {
  clearControls(); game.reset(); syncStats(); particles.length = 0; ripples.length = 0;
  startingBest = best; recordCelebrated = false; accumulator = 0; screenFlash = 0;
  $('toast').classList.remove('visible'); toastUntil = 0;
  state = 'playing'; overlay.hidden = true;
  tone(330); tone(440, .08);
}
function togglePause(): void {
  if (state === 'playing') {
    state = 'paused'; clearControls();
    overlayTitle.hidden = false; overlayTitle.textContent = 'Paused';
    play.textContent = 'Resume'; overlay.hidden = false;
  } else if (state === 'paused') {
    state = 'playing'; overlay.hidden = true; accumulator = 0;
  }
}
play.addEventListener('click', () => { if (state === 'paused') togglePause(); else start(); });
function toggleSound(): void {
  soundEnabled = !soundEnabled;
  if (soundEnabled) { audio ??= new AudioContext(); void audio.resume(); tone(440); }
}
canvas.addEventListener('click', () => { if (state === 'playing') togglePause(); });
const keyMap: Record<string, keyof Controls> = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down' };
function updateControls(): void {
  for (const control of ['left', 'right', 'up', 'down'] as const) {
    controls[control] = touch.has(control);
    for (const key of pressed) if (keyMap[key] === control) controls[control] = true;
  }
}
function clearControls(): void {
  pressed.clear(); touch.clear(); updateControls();
  document.querySelectorAll('.touch-controls button').forEach(button => button.classList.remove('pressed'));
}
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLButtonElement && ['Space', 'Enter'].includes(event.code)) return;
  if (keyMap[event.code] || ['Space', 'KeyP', 'Escape'].includes(event.code)) event.preventDefault();
  if (keyMap[event.code]) { pressed.add(event.code); updateControls(); }
  if (event.repeat) return;
  if (event.code === 'Space') { if (state === 'paused') togglePause(); else if (state !== 'playing') start(); }
  if (event.code === 'KeyP' || event.code === 'Escape') togglePause();
  if (event.code === 'KeyM') toggleSound();
});
window.addEventListener('keyup', event => { pressed.delete(event.code); updateControls(); });
window.addEventListener('blur', () => { clearControls(); if (state === 'playing') togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') togglePause(); });
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-control]')) {
  const control = button.dataset.control as keyof Controls;
  button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); touch.add(control); updateControls(); button.classList.add('pressed'); });
  const release = () => { touch.delete(control); updateControls(); button.classList.remove('pressed'); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
}
new ResizeObserver(() => {
  const dpr = Math.min(2, devicePixelRatio || 1), rect = shell.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
  game.resize(HEIGHT * rect.width / rect.height);
  if (state === 'ready') game.reset();
}).observe(shell);
const leftEdge: Point[] = [], rightEdge: Point[] = [];
function smoothPath(points: Point[], reverse = false): void {
  const step = reverse ? -1 : 1, start = reverse ? points.length - 1 : 0, end = reverse ? 0 : points.length - 1;
  ctx.lineTo(points[start].x, points[start].y);
  for (let i = start; i !== end; i += step) {
    const p = points[i], next = points[i + step];
    ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
  }
  ctx.lineTo(points[end].x, points[end].y);
}
function drawSnake(): void {
  const nodes = game.nodes, count = nodes.length;
  while (leftEdge.length < count) { leftEdge.push({ x: 0, y: 0 }); rightEdge.push({ x: 0, y: 0 }); }
  leftEdge.length = rightEdge.length = count;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    const prev = nodes[Math.max(0, i - 1)], next = nodes[Math.min(count - 1, i + 1)];
    const dx = next.x - prev.x, dy = next.y - prev.y, length = Math.hypot(dx, dy) || 1;
    const radius = 8 * Math.min(1, (count - 1 - i) / 9);
    leftEdge[i].x = nodes[i].x - dy / length * radius; leftEdge[i].y = nodes[i].y + dx / length * radius;
    rightEdge[i].x = nodes[i].x + dy / length * radius; rightEdge[i].y = nodes[i].y - dx / length * radius;
    minX = Math.min(minX, nodes[i].x); minY = Math.min(minY, nodes[i].y); maxX = Math.max(maxX, nodes[i].x); maxY = Math.max(maxY, nodes[i].y);
  }
  // Draw translated continuous ribbons at wrap seams; never join across the arena.
  for (let tx = Math.ceil((-maxX - 30) / WIDTH); tx <= Math.floor((WIDTH - minX + 30) / WIDTH); tx++) {
    for (let ty = Math.ceil((-maxY - 30) / HEIGHT); ty <= Math.floor((HEIGHT - minY + 30) / HEIGHT); ty++) {
      ctx.save(); ctx.translate(tx * WIDTH, ty * HEIGHT);
      ctx.globalAlpha = state === 'over' ? .5 : 1;
      ctx.shadowBlur = 23; ctx.shadowColor = rgb(colors.snake, .38);
      ctx.beginPath(); ctx.moveTo(leftEdge[0].x, leftEdge[0].y); smoothPath(leftEdge); smoothPath(rightEdge, true); ctx.closePath();
      ctx.fillStyle = rgb(colors.snake); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = rgb(colors.highlight, .38); ctx.lineWidth = 1; ctx.beginPath(); smoothPath(leftEdge); ctx.stroke();
      ctx.strokeStyle = rgb(colors.highlight, .2); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(nodes[0].x, nodes[0].y); smoothPath(nodes); ctx.stroke();
      ctx.save(); ctx.translate(game.head.x, game.head.y); ctx.rotate(game.angle);
      const gradient = ctx.createRadialGradient(-2, -3, 1, 0, 0, 11); gradient.addColorStop(0, rgb(colors.highlight)); gradient.addColorStop(1, rgb(colors.snake));
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.ellipse(0, 0, 11, 9.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgb(colors.background, .9);
      for (const y of [-4.4, 4.4]) { ctx.beginPath(); ctx.ellipse(4.2, y, 1.5, 1.8, -.1, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore(); ctx.restore();
    }
  }
}
function drawApple(x: number, y: number, phase: number): void {
  ctx.save(); ctx.translate(x, y);
  const pulse = 1 + (reducedMotion ? 0 : Math.sin(elapsed * 2.3 + phase) * .055);
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 44);
  glow.addColorStop(0, rgb(colors.apple, .17)); glow.addColorStop(1, rgb(colors.apple, 0));
  ctx.fillStyle = glow; ctx.fillRect(-44, -44, 88, 88);
  ctx.strokeStyle = rgb(colors.apple, .14); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 23 * pulse, 0, Math.PI * 2); ctx.stroke();
  ctx.scale(pulse, pulse); ctx.shadowBlur = 13; ctx.shadowColor = rgb(colors.apple, .5);
  const grad = ctx.createLinearGradient(-7, -8, 7, 9); grad.addColorStop(0, rgb(colors.highlight)); grad.addColorStop(.4, rgb(colors.apple)); grad.addColorStop(1, rgb(colors.apple, .75));
  ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(0, -6); ctx.bezierCurveTo(-13, -15, -15, 4, -5, 9); ctx.bezierCurveTo(-2, 11, -1, 8, 0, 9); ctx.bezierCurveTo(8, 14, 16, -8, 6, -9); ctx.bezierCurveTo(3, -10, 1, -7, 0, -6); ctx.fill();
  ctx.shadowBlur = 0; ctx.strokeStyle = rgb(colors.apple); ctx.lineWidth = 1.7; ctx.beginPath(); ctx.moveTo(0, -7); ctx.quadraticCurveTo(-1, -13, 3, -15); ctx.stroke();
  ctx.fillStyle = rgb(colors.highlight, .7); ctx.beginPath(); ctx.ellipse(6, -13, 4, 1.9, -.45, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff70'; ctx.beginPath(); ctx.ellipse(-5, -3, 1.5, 3, .3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function render(dt: number): void {
  ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
  for (const key of colorKeys) { const c = colors[key], target = targetColors[key], t = 1 - Math.exp(-dt * 2.3); c.r += (target.r - c.r) * t; c.g += (target.g - c.g) * t; c.b += (target.b - c.b) * t; }
  ctx.fillStyle = rgb(colors.background); ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const bg = ctx.createRadialGradient(WIDTH * .48, HEIGHT * .4, 15, WIDTH * .48, HEIGHT * .4, WIDTH * .65);
  bg.addColorStop(0, rgb(colors.snake, .055)); bg.addColorStop(1, '#00000035'); ctx.fillStyle = bg; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = rgb(colors.snake, .12);
  for (let y = 34; y < HEIGHT; y += 34) for (let x = 34; x < WIDTH; x += 34) { ctx.beginPath(); ctx.arc(x, y, .75, 0, Math.PI * 2); ctx.fill(); }
  for (const apple of game.apples) drawApple(apple.x, apple.y, apple.phase);
  drawSnake();
  const animate = state !== 'paused';
  const decay = Math.exp(-dt * burstDrag);
  // Integrate exponential velocity exactly so the burst travels consistently at any frame rate.
  const travel = (1 - decay) / burstDrag;
  for (let i = ripples.length - 1; i >= 0; i--) {
    const ring = ripples[i]; if (animate) { ring.life -= dt; ring.radius += ring.speed * travel; ring.speed *= decay; }
    if (ring.life <= 0) { ripples.splice(i, 1); continue; }
    ctx.strokeStyle = ring.color; ctx.globalAlpha = (ring.life / ring.maxLife) ** 2 * .6; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
  const sparkDecay = Math.exp(-dt * sparkDrag);
  const sparkTravel = (1 - sparkDecay) / sparkDrag;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (animate) {
      p.life -= dt;
      // Lighter drag preserves the launch arc before gravity turns the sparks downward.
      const fallSpeed = particleGravity / sparkDrag;
      p.x += p.vx * sparkTravel;
      p.y += (p.vy - fallSpeed) * sparkTravel + fallSpeed * dt;
      p.vx *= sparkDecay;
      p.vy = p.vy * sparkDecay + fallSpeed * (1 - sparkDecay);
    }
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    const opacity = burstOpacity(p.life, p.maxLife);
    const speed = Math.hypot(p.vx, p.vy);
    const tail = Math.min(14, Math.max(2, speed * .035)) / Math.max(1, speed);
    ctx.lineCap = 'round'; ctx.strokeStyle = p.color;
    ctx.beginPath(); ctx.moveTo(p.x - p.vx * tail, p.y - p.vy * tail); ctx.lineTo(p.x, p.y);
    ctx.globalAlpha = opacity * .15; ctx.lineWidth = p.size * 4; ctx.stroke();
    ctx.globalAlpha = opacity; ctx.lineWidth = p.size; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.globalAlpha = opacity * .7;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * .45, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
  }
  if (screenFlash > 0) { ctx.fillStyle = rgb(colors.highlight, screenFlash * .13); ctx.fillRect(0, 0, WIDTH, HEIGHT); screenFlash = Math.max(0, screenFlash - dt); }
}
function frame(time: number): void {
  const dt = Math.min(.05, (time - (lastTime || time)) / 1000); lastTime = time; elapsed += dt;
  if (state === 'playing') {
    accumulator += dt;
    while (accumulator >= 1 / 120 && state === 'playing') { game.step(1 / 120, controls, handleEvent); accumulator -= 1 / 120; }
  } else if (state === 'ready' && !reducedMotion) {
    game.angle = -.25 + Math.sin(elapsed * .42) * .45;
    // An ambient ribbon drifts behind the start screen, without running gameplay.
    for (let i = 0; i < game.nodes.length; i++) {
      const d = i * 6; game.nodes[i].x = WIDTH * .55 - d * .94;
      game.nodes[i].y = HEIGHT * .58 + Math.sin(elapsed * .6 - i * .07) * 40;
    }
    game.head.x = game.nodes[0].x; game.head.y = game.nodes[0].y;
  }
  render(dt);
  if (elapsed >= nextSpeedUpdate) {
    const speed = `${(game.speed / 155).toFixed(2)}×`;
    if (speed !== displayedSpeed) { speedText.textContent = speed; displayedSpeed = speed; }
    nextSpeedUpdate = elapsed + .1;
  }
  if (toastUntil && elapsed > toastUntil) { $('toast').classList.remove('visible'); toastUntil = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Development-only handle for exercising real gameplay and HUD transitions in the browser.
if (import.meta.env.DEV) {
  Object.assign(window, { __radial: { game, start, handleEvent, state: () => state } });
  const record = document.createElement('button');
  record.textContent = 'Record'; record.style.cssText = 'padding:0 8px;font-size:10px';
  document.querySelector('.controls')!.append(record);
  let recorder: MediaRecorder | undefined;
  record.addEventListener('click', () => {
    if (recorder?.state === 'recording') { recorder.stop(); return; }
    const stream = canvas.captureStream(30);
    const chunks: Blob[] = [];
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 6_000_000 });
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      const recording = new Blob(chunks, { type: recorder!.mimeType });
      stream.getTracks().forEach(track => track.stop());
      record.disabled = true; record.textContent = 'Saving…';
      try {
        const response = await fetch('/__recording', { method: 'POST', body: recording });
        if (!response.ok) throw new Error('Unable to save recording');
        if (!(await response.json()).saved) throw new Error('Recording was not saved');
        toast('Recording saved', 4);
      } catch { toast('Recording could not be saved', 6); }
      record.disabled = false; record.textContent = 'Record';
    };
    recorder.start(); record.textContent = 'Stop recording';
  });
}
