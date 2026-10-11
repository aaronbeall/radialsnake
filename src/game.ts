export let WIDTH = 1100;
export const HEIGHT = 680;
export const HEAD_RADIUS = 10;
export const BODY_RADIUS = 8;
export const APPLE_RADIUS = 9;
export const FRUIT_LIFETIME = 10;
export function fruitScale(age: number): number {
  const progress = Math.min(1, Math.max(0, age / FRUIT_LIFETIME));
  return .18 + .82 * (1 - Math.expm1(progress * 4) / Math.expm1(4));
}
const SPACING = 6;
const TURN_RATE = 2.65;
export interface Point { x: number; y: number }
interface TrailPoint extends Point { distance: number }
export interface Controls { left: boolean; right: boolean; up: boolean; down: boolean }
export const FRUITS = [
  { kind: 'apple', points: 10 }, { kind: 'banana', points: 20 },
  { kind: 'strawberry', points: 35 }, { kind: 'grapes', points: 60 },
  { kind: 'watermelon', points: 100 }, { kind: 'pineapple', points: 150 },
  { kind: 'star', points: 300 },
] as const;
export type FruitKind = typeof FRUITS[number]['kind'];
export function chooseFruit(random: number): FruitKind {
  const total = FRUITS.reduce((sum, _, i) => sum + 4 ** -i, 0);
  let roll = random * total;
  for (let i = 0; i < FRUITS.length; i++) {
    roll -= 4 ** -i;
    if (roll < 0) return FRUITS[i].kind;
  }
  return 'star';
}
export interface Apple extends Point { phase: number; kind: FruitKind; age: number }
export type GameEvent = { type: 'apple'; x: number; y: number; kind: FruitKind; points: number } | { type: 'palette'; level: number } | { type: 'death'; x: number; y: number };
export const wrap = (value: number, size: number) => ((value % size) + size) % size;
export const torusDelta = (value: number, size: number) => wrap(value + size / 2, size) - size / 2;
export function torusDistance(a: Point, b: Point): number {
  return Math.hypot(torusDelta(a.x - b.x, WIDTH), torusDelta(a.y - b.y, HEIGHT));
}
function segmentDistance(p: Point, a: Point, b: Point): number {
  const ax = torusDelta(a.x - p.x, WIDTH), ay = torusDelta(a.y - p.y, HEIGHT);
  const bx = ax + b.x - a.x, by = ay + b.y - a.y;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(ax + t * dx, ay + t * dy);
}
/** Arc-length sampling keeps the body continuous and equally spaced at any speed. */
export class SnakeGame {
  head: Point = { x: WIDTH * .58, y: HEIGHT * .53 };
  angle = -.25;
  distance = 0;
  length = 240;
  score = 0;
  scoringEnabled = true;
  eaten = 0;
  level = 0;
  speed = 155;
  alive = true;
  nodes: Point[] = [];
  apples: Apple[] = [];
  private trail: TrailPoint[] = [];
  private boost = 0;
  constructor(private readonly random = Math.random) { this.reset(); }
  get cruiseSpeed(): number { return 155 * Math.pow(1.045, this.level); }
  spawnTestFruit(kind: FruitKind): void {
    if (!this.alive) return;
    this.scoringEnabled = false;
    const fruit = this.spawnApple(kind);
    if (this.apples.length >= 32) this.apples.pop();
    this.apples.push(fruit);
  }
  resize(width: number): void {
    const scale = width / WIDTH;
    WIDTH = width;
    this.head.x *= scale;
    for (const p of this.trail) p.x *= scale;
    for (const apple of this.apples) apple.x *= scale;
    this.length *= Math.sqrt(scale);
    this.distance = 0;
    let newer: Point = this.head, distance = 0;
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const point = this.trail[i];
      distance -= Math.hypot(newer.x - point.x, newer.y - point.y);
      point.distance = distance; newer = point;
    }
    this.sampleBody();
  }

  reset(): void {
    this.head.x = WIDTH * .58; this.head.y = HEIGHT * .53;
    this.angle = -.25; this.distance = 0; this.length = 240;
    this.score = 0; this.scoringEnabled = true; this.eaten = 0; this.level = 0; this.boost = 0; this.speed = this.cruiseSpeed; this.alive = true;
    this.trail.length = 0;
    for (let d = -this.length - 20; d <= 0; d += 3) {
      this.trail.push({ x: this.head.x + Math.cos(this.angle) * d, y: this.head.y + Math.sin(this.angle) * d, distance: d });
    }
    this.sampleBody(); this.apples.length = 0;
    for (let i = 0; i < 3; i++) this.apples.push(this.spawnApple());
  }
  step(dt: number, controls: Controls, emit: (event: GameEvent) => void): void {
    if (!this.alive) return;
    this.boost = Math.max(0, Math.min(1, this.boost + (controls.down ? -2.1 : controls.up ? 1.2 : -1.4) * dt));
    this.speed = this.cruiseSpeed * (1 + .42 * this.boost);
    this.angle += ((controls.right ? 1 : 0) - (controls.left ? 1 : 0)) * TURN_RATE * dt;
    this.head.x += Math.cos(this.angle) * this.speed * dt;
    this.head.y += Math.sin(this.angle) * this.speed * dt;
    this.distance += this.speed * dt;
    const last = this.trail[this.trail.length - 1];
    if (this.distance - last.distance >= 3) this.trail.push({ ...this.head, distance: this.distance });
    this.sampleBody();
    // The neck belongs to the head's turn; only the older body can eliminate it.
    for (let i = 9; i < this.nodes.length - 1; i++) {
      const taper = Math.min(1, (this.nodes.length - i) / 10);
      if (segmentDistance(this.head, this.nodes[i], this.nodes[i + 1]) < HEAD_RADIUS + BODY_RADIUS * taper - 1) {
        this.alive = false; emit({ type: 'death', ...this.head }); return;
      }
    }
    for (let i = 0; i < this.apples.length; i++) {
      const apple = this.apples[i];
      apple.age += dt;
      if (apple.age >= FRUIT_LIFETIME) {
        this.apples[i] = this.spawnApple();
        continue;
      }
      if (torusDistance(this.head, apple) < HEAD_RADIUS + APPLE_RADIUS * fruitScale(apple.age)) {
        const points = this.scoringEnabled ? FRUITS.find(fruit => fruit.kind === apple.kind)!.points : 0;
        this.eaten++; this.score += points; this.length += 28;
        emit({ type: 'apple', x: apple.x, y: apple.y, kind: apple.kind, points });
        this.apples[i] = this.spawnApple();
        if (this.eaten % 5 === 0) { this.level++; emit({ type: 'palette', level: this.level }); }
      }
    }
  }
  private sampleBody(): void {
    const count = Math.ceil(this.length / SPACING) + 1;
    while (this.nodes.length < count) this.nodes.push({ x: 0, y: 0 });
    this.nodes.length = count;
    let index = this.trail.length - 1;
    let newer: Point = this.head, newerDistance = this.distance;
    for (let i = 0; i < count; i++) {
      const target = this.distance - Math.min(this.length, i * SPACING);
      while (index > 0 && this.trail[index].distance > target) {
        newer = this.trail[index]; newerDistance = this.trail[index].distance; index--;
      }
      const older = this.trail[index];
      const t = Math.max(0, Math.min(1, (target - older.distance) / (newerDistance - older.distance || 1)));
      this.nodes[i].x = older.x + (newer.x - older.x) * t;
      this.nodes[i].y = older.y + (newer.y - older.y) * t;
    }
    // Keep extra history so growth reveals a real trailing path, rather than a new kink.
    if (index > 40) this.trail.splice(0, index - 40);
  }
  private spawnApple(kind: FruitKind = chooseFruit(this.random())): Apple {
    const apple: Apple = { x: 0, y: 0, phase: this.random() * Math.PI * 2, kind, age: 0 };
    for (let attempt = 0; attempt < 120; attempt++) {
      apple.x = 70 + this.random() * (WIDTH - 140);
      apple.y = 90 + this.random() * (HEIGHT - 180);
      if (torusDistance(apple, this.head) < 160) continue;
      if (this.nodes.some(node => torusDistance(node, apple) < 35)) continue;
      if (this.apples.some(other => torusDistance(other, apple) < 110)) continue;
      return apple;
    }
    return apple;
  }
}
