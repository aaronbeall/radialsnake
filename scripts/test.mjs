import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const dir = mkdtempSync(join(tmpdir(), 'radialsnake-test-'));
const source = readFileSync(new URL('../src/game.ts', import.meta.url), 'utf8');
writeFileSync(join(dir, 'game.mjs'), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
const { SnakeGame, WIDTH, HEIGHT, torusDistance, FRUITS, chooseFruit, fruitScale, FRUIT_LIFETIME } = await import(pathToFileURL(join(dir, 'game.mjs')).href);
after(() => rmSync(dir, { recursive: true, force: true }));
const idle = { left: false, right: false, up: false, down: false };
function fresh() { const g = new SnakeGame(); g.apples.length = 0; return g; }
function run(g, seconds, controls = idle, events = []) { for (let i = 0; i < seconds * 120 && g.alive; i++) g.step(1 / 120, controls, e => events.push(e)); return events; }
test('forced forward motion and cruise-speed floor', () => {
  const g = fresh(); const p = { ...g.head };
  run(g, 1, { ...idle, down: true });
  assert.equal(g.speed, g.cruiseSpeed); assert.ok(torusDistance(g.head, p) > 150);
});
test('held speed increase, release, and deceleration never cross cruise floor', () => {
  const g = fresh(); run(g, 1, { ...idle, up: true });
  assert.ok(g.speed > g.cruiseSpeed); assert.ok(g.speed <= g.cruiseSpeed * 1.42);
  run(g, 1); assert.equal(g.speed, g.cruiseSpeed);
  run(g, 1, { ...idle, up: true }); run(g, 1, { ...idle, down: true }); assert.equal(g.speed, g.cruiseSpeed);
});
test('opposite turning inputs cancel; left and right turn continuously', () => {
  const g = fresh(), angle = g.angle; run(g, .2, { ...idle, left: true }); assert.ok(g.angle < angle);
  const before = g.angle; run(g, .2, { ...idle, left: true, right: true }); assert.equal(g.angle, before);
  run(g, .2, { ...idle, right: true }); assert.ok(Math.abs(g.angle - angle) < 1e-8);
});
test('five head-eaten apples grow the body, score, and emit one palette change', () => {
  const g = fresh(), events = [];
  for (let i = 0; i < 5; i++) { g.apples = [{ ...g.head, phase: 0, age: 0, kind: 'apple' }]; g.step(1 / 120, idle, e => events.push(e)); }
  assert.equal(g.score, 50); assert.equal(g.eaten, 5); assert.equal(g.length, 380); assert.equal(g.level, 1);
  assert.equal(events.filter(e => e.type === 'palette').length, 1); assert.equal(events.filter(e => e.type === 'apple').length, 5);
  assert.ok(g.cruiseSpeed > 155);
});
test('body contact eliminates a long looping snake exactly once', () => {
  const g = fresh(); g.length = 500;
  const events = run(g, 6, { ...idle, left: true });
  assert.equal(g.alive, false); assert.equal(events.filter(e => e.type === 'death').length, 1);
  const p = { ...g.head }; run(g, 1); assert.deepEqual(g.head, p);
});
test('wraparound distances work and a straight snake can cross edges safely', () => {
  assert.equal(torusDistance({ x: 1, y: 20 }, { x: WIDTH - 1, y: 20 }), 2);
  assert.equal(torusDistance({ x: 40, y: 1 }, { x: 40, y: HEIGHT - 1 }), 2);
  const g = fresh(); g.angle = 0; run(g, 9); assert.ok(g.head.x > WIDTH); assert.equal(g.alive, true);
  for (let i = 1; i < g.nodes.length; i++) assert.ok(Math.hypot(g.nodes[i].x - g.nodes[i - 1].x, g.nodes[i].y - g.nodes[i - 1].y) <= 6.01);
});
test('reset creates a fresh run with safe apple placement', () => {
  const g = fresh(); g.score = 50; g.length = 500; g.alive = false; g.reset();
  assert.equal(g.score, 0); assert.equal(g.length, 240); assert.equal(g.alive, true); assert.equal(g.apples.length, 3);
  for (const a of g.apples) { assert.ok(torusDistance(a, g.head) >= 160); assert.ok(g.nodes.every(n => torusDistance(a, n) >= 35)); }
});

test('rarity has exact fourfold tiers and an extremely rare star', () => {
  const total = FRUITS.reduce((sum, _, i) => sum + 4 ** -i, 0);
  let cumulative = 0;
  for (let i = 0; i < FRUITS.length; i++) {
    const width = 4 ** -i / total;
    assert.equal(chooseFruit(cumulative + width / 2), FRUITS[i].kind);
    cumulative += width;
  }
  assert.equal(chooseFruit(0), 'apple');
  assert.equal(chooseFruit(1 - Number.EPSILON), 'star');
  assert.ok(4 ** -6 / total < .0002);
});
test('every fruit awards its points while counting once for growth and progress', () => {
  const g = fresh(), events = [];
  for (const fruit of FRUITS) {
    const score = g.score, eaten = g.eaten, length = g.length;
    g.apples = [{ ...g.head, phase: 0, age: 0, kind: fruit.kind }];
    g.step(1 / 120, idle, e => events.push(e));
    assert.equal(g.score - score, fruit.points);
    assert.equal(g.eaten - eaten, 1); assert.equal(g.length - length, 28);
    assert.equal(events.filter(e => e.type === 'apple').at(-1).kind, fruit.kind);
  }
  assert.equal(g.level, 1);
  assert.equal(events.filter(e => e.type === 'palette').length, 1);
});

test('test fruit freezes score for the run but retains growth and progress; reset restores scoring', () => {
  const g = fresh(), events = [];
  g.score = 50;
  g.spawnTestFruit('star');
  assert.equal(g.apples.at(-1).kind, 'star'); assert.equal(g.scoringEnabled, false);
  for (let i = 0; i < 5; i++) {
    g.apples = [{ ...g.head, phase: 0, age: 0, kind: i ? 'apple' : 'star' }];
    g.step(1 / 120, idle, e => events.push(e));
  }
  assert.equal(g.score, 50); assert.equal(g.eaten, 5); assert.equal(g.level, 1); assert.equal(g.length, 380);
  assert.ok(events.filter(e => e.type === 'apple').every(e => e.points === 0));
  g.reset(); assert.equal(g.scoringEnabled, true);
  g.apples = [{ ...g.head, phase: 0, age: 0, kind: 'banana' }]; g.step(1 / 120, idle, () => {});
  assert.equal(g.score, 20);
});

test('fruit shrink accelerates near the ten-second expiry', () => {
  assert.equal(fruitScale(0), 1);
  assert.ok(fruitScale(5) > .9);
  assert.ok(fruitScale(9) < .5);
  assert.ok(Math.abs(fruitScale(FRUIT_LIFETIME) - .18) < 1e-9);
  assert.ok(fruitScale(8) - fruitScale(9) > fruitScale(1) - fruitScale(2));
});
test('expired fruit is replaced without score, growth, or collection events', () => {
  const g = fresh(), events = [];
  const expired = { ...g.head, kind: 'star', phase: 0, age: FRUIT_LIFETIME - .001 };
  g.apples = [expired];
  g.step(1 / 120, idle, e => events.push(e));
  assert.notEqual(g.apples[0], expired); assert.equal(g.apples[0].age, 0);
  assert.equal(g.score, 0); assert.equal(g.eaten, 0); assert.equal(g.length, 240); assert.equal(events.length, 0);
});
test('fruit pickup radius shrinks with its visible size', () => {
  for (const age of [0, 9.9]) {
    const g = fresh(); g.angle = 0;
    g.apples = [{ x: g.head.x + 16, y: g.head.y, phase: 0, kind: 'apple', age }];
    g.step(1 / 120, idle, () => {});
    assert.equal(g.eaten, age === 0 ? 1 : 0);
  }
});
