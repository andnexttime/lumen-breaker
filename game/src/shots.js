// The screenshot scenes behind ?shot=title|play|boss|win. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by an autopilot that
// tracks the lowest ball and angles its paddle so the bounce steers toward the nearest
// prism (or the Core), so the frame is what a real game looks like and the same seed
// always gives the same frame. The win scene plays all three levels through to the
// victory screen; if the pilot has not won by the step cap, the run is completed
// directly so the victory screen still shows.
import { FIELD, PADDLE, STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const TITLE_SECONDS = 5;
const PLAY_LEVEL2_SECONDS = 10;
const BOSS_SECONDS = 25;
const STEP_CAP = 22000;

/** The lowest live ball: the one the paddle must be under next. */
function lowestBall(state) {
  let lowest = null;
  for (const ball of state.balls) {
    if (ball.active && (lowest === null || ball.y > lowest.y)) lowest = ball;
  }
  return lowest;
}

/** The nearest thing worth hitting: a prism, or the Core once the ring is thin. */
function aimTarget(state) {
  const ball = lowestBall(state);
  if (ball === null) return null;
  const boss = state.boss;
  const remaining = state.bricks.filter((brick) => brick.alive).length;
  if (boss.active && boss.hp > 0 && remaining <= 6) return boss.x;
  let best = null;
  let bestDist = Infinity;
  for (const brick of state.bricks) {
    if (!brick.alive) continue;
    const cx = brick.x + brick.w / 2;
    const cy = brick.y + brick.h / 2;
    const dist = (cx - ball.x) * (cx - ball.x) + (cy - ball.y) * (cy - ball.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = cx;
    }
  }
  return best;
}

/**
 * One autopilot decision: the field X the paddle's centre should head for, and
 * whether to launch a served ball. The paddle centre sits off to one side of the ball
 * so the bounce angles toward the target. The title screen's attract mode uses it too.
 */
export function autopilot(state) {
  const ball = lowestBall(state);
  if (ball === null) return { pointerX: FIELD.width / 2, launch: true };
  const target = aimTarget(state);
  let offset = 0;
  if (target !== null) {
    offset = Math.max(-0.8, Math.min(0.8, (target - ball.x) / 90)) * (state.paddle.width / 2);
  }
  return { pointerX: ball.x - offset, launch: state.status === 'serving' };
}

function playSteps(world, count) {
  for (let index = 0; index < count; index += 1) {
    const input = autopilot(world.state);
    world.step(STEP, { direction: 0, pointerX: input.pointerX, launch: input.launch }, false);
    if (world.state.status === 'won' || world.state.status === 'over') break;
  }
}

function playUntil(world, done, cap) {
  for (let index = 0; index < cap; index += 1) {
    if (done(world.state)) return true;
    const input = autopilot(world.state);
    world.step(STEP, { direction: 0, pointerX: input.pointerX, launch: input.launch }, false);
    if (world.state.status === 'won') return true;
  }
  return done(world.state);
}

function winStats(world) {
  const state = world.state;
  return {
    score: state.score,
    best: Math.max(state.score, 1240),
    bricksBroken: state.bricksBroken,
    lives: state.lives,
    time: state.time,
    ballsLost: state.ballsLost,
    stars: state.lives >= 3 ? 3 : state.lives === 2 ? 2 : 1,
  };
}

/**
 * Set `world` to the named scene and return the screen to draw over it, the best score
 * to show and, for the victory scene, its stats.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'title') {
    for (let index = 0; index < TITLE_SECONDS / STEP; index += 1) {
      const input = autopilot(world.state);
      world.step(STEP, { direction: 0, pointerX: input.pointerX, launch: input.launch }, true);
    }
    return { screen: SCREEN_TITLE, best: 1240, stats: null };
  }
  if (name === 'play') {
    // Clear Dawn Grid, then play Twin Arches for a while: arches, steel and a combo.
    playUntil(world, (state) => state.levelIndex === 1, STEP_CAP);
    playSteps(world, PLAY_LEVEL2_SECONDS / STEP);
    const over = world.state.status === 'over';
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score, stats: null };
  }
  if (name === 'boss') {
    // Clear the first two levels, then fight the Prism Core until it is well damaged.
    playUntil(world, (state) => state.levelIndex === 2, STEP_CAP);
    playUntil(world, (state) => state.boss.active && state.boss.hp <= 5, BOSS_SECONDS / STEP);
    // A few more steps so a freshly served ball is flying, not sitting on the paddle.
    playSteps(world, 30);
    return { screen: SCREEN_PLAY, best: world.state.score, stats: null };
  }
  if (name === 'win') {
    const won = playUntil(world, (state) => state.status === 'won', STEP_CAP);
    if (!won) {
      // The pilot ran out of steps: complete the run so the victory screen still shows.
      for (const brick of world.state.bricks) brick.alive = false;
      world.state.boss.hp = 0;
      world.state.status = 'won';
    }
    return { screen: SCREEN_WIN, best: Math.max(world.state.score, 1240), stats: winStats(world) };
  }
  return { screen: SCREEN_TITLE, best: 1240, stats: null };
}
