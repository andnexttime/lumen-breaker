// The game's rules and state, with no drawing and no browser in it: the paddle, the
// balls, the brick grids, the Prism Core boss, falling power-up capsules, particles,
// combo, score, lives and levels. step() advances one fixed step and returns what
// happened as bit flags, so the caller can react (and play sounds) without the world
// knowing about screens or sound. Nothing here allocates after createWorld returns.
//
// The near-vertical trap: a ball bouncing straight up and down in one column can loop
// forever. Three things stop it: the paddle bounce angles from the hit offset, the
// paddle's own motion adds english, and a bounce that comes out too vertical is nudged
// sideways. A small seeded jitter on brick bounces keeps the rally from ever repeating
// exactly.

import {
  BALL, BRICK, COMBO, CORE, FIELD, LEVELS, LIVES, MAX_LIVES, PADDLE, PARTICLES, POWER,
  ROW_COLORS, STEEL_COLOR,
} from './config.js';

export const EVENT_BRICK = 1;
export const EVENT_POWER = 2;
export const EVENT_LOST = 4;
export const EVENT_LEVEL = 8;
export const EVENT_WIN = 16;
export const EVENT_OVER = 32;
export const EVENT_CORE = 64;
export const EVENT_LIFE = 128;
export const EVENT_STEEL = 256;

const TAU = Math.PI * 2;

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function brickWidth(cols) {
  return (BRICK.areaWidth - (cols - 1) * BRICK.gap) / cols;
}

export function createWorld(random) {
  const paddle = { x: 0, width: PADDLE.width, wideTimer: 0, vx: 0 };
  const balls = [];
  for (let index = 0; index < 4; index += 1) {
    balls.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, speed: BALL.speed });
  }
  const bricks = [];
  const powerups = [];
  for (let index = 0; index < 6; index += 1) {
    powerups.push({ active: false, x: 0, y: 0, kind: 'W' });
  }
  const particles = [];
  for (let index = 0; index < PARTICLES.max; index += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, color: '#ffffff', size: 3 });
  }
  const boss = { active: false, x: CORE.centreX, y: CORE.y, hp: CORE.hits, maxHp: CORE.hits, radius: CORE.radius, phase: 0 };

  const state = {
    paddle, balls, bricks, powerups, particles, boss,
    score: 0, lives: LIVES, levelIndex: 0, levelName: LEVELS[0].name,
    combo: 0, comboTimer: 0, multiplier: 1,
    bricksBroken: 0, bricksTotal: 0, time: 0, ballsLost: 0,
    slowTimer: 0, shake: 0, status: 'serving', clearTimer: 0,
  };

  function freeBall() {
    for (let index = 0; index < balls.length; index += 1) if (!balls[index].active) return balls[index];
    return null;
  }

  function freePowerup() {
    for (let index = 0; index < powerups.length; index += 1) if (!powerups[index].active) return powerups[index];
    return null;
  }

  function freeParticle() {
    for (let index = 0; index < particles.length; index += 1) if (!particles[index].active) return particles[index];
    return null;
  }

  function burst(x, y, color, count, speed) {
    for (let index = 0; index < count; index += 1) {
      const particle = freeParticle();
      if (particle === null) return;
      const angle = random() * TAU;
      const magnitude = speed * (0.3 + random() * 0.7);
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * magnitude;
      particle.vy = Math.sin(angle) * magnitude - 60;
      particle.maxLife = 0.4 + random() * 0.5;
      particle.life = particle.maxLife;
      particle.color = color;
      particle.size = 2 + random() * 4;
    }
  }

  function ballTargetSpeed() {
    const base = Math.min(
      BALL.maxSpeed,
      BALL.speed + BALL.speedPerLevel * state.levelIndex + BALL.speedPerTenBricks * Math.floor(state.bricksBroken / 10),
    );
    return state.slowTimer > 0 ? base * BALL.slowFactor : base;
  }

  function loadLevel(index) {
    const level = LEVELS[index];
    const cols = level.rows[0].length;
    const width = brickWidth(cols);
    bricks.length = 0;
    for (let row = 0; row < level.rows.length; row += 1) {
      const line = level.rows[row];
      for (let col = 0; col < line.length; col += 1) {
        const cell = line[col];
        if (cell === '.') continue;
        bricks.push({
          x: BRICK.areaLeft + col * (width + BRICK.gap),
          y: BRICK.top + row * (BRICK.height + BRICK.rowGap),
          w: width, h: BRICK.height,
          hits: cell === 'S' ? 2 : 1, maxHits: cell === 'S' ? 2 : 1,
          tier: row, steel: cell === 'S', alive: true,
        });
      }
    }
    state.bricksTotal = bricks.length;
    state.levelIndex = index;
    state.levelName = level.name;
    boss.active = Boolean(level.core);
    boss.hp = CORE.hits;
    boss.maxHp = CORE.hits;
    boss.x = CORE.centreX;
    boss.y = CORE.y;
    boss.phase = 0;
    for (const ball of balls) ball.active = false;
    for (const powerup of powerups) powerup.active = false;
    paddle.width = PADDLE.width;
    paddle.wideTimer = 0;
    state.slowTimer = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.multiplier = 1;
    serveBall();
  }

  function serveBall() {
    const ball = freeBall();
    if (ball === null) return;
    ball.active = true;
    ball.x = paddle.x + paddle.width / 2;
    ball.y = PADDLE.y - BALL.radius - 1;
    ball.vx = 0;
    ball.vy = 0;
    ball.speed = ballTargetSpeed();
    state.status = 'serving';
  }

  function launchBall() {
    for (const ball of balls) {
      if (!ball.active || ball.vy !== 0) continue;
      const angle = (random() - 0.5) * 0.9;
      ball.speed = ballTargetSpeed();
      ball.vx = Math.sin(angle) * ball.speed;
      ball.vy = -Math.cos(angle) * ball.speed;
    }
    if (state.status === 'serving') state.status = 'playing';
  }

  function activeBalls() {
    let count = 0;
    for (const ball of balls) if (ball.active) count += 1;
    return count;
  }

  function addScore(base) {
    state.score += base * state.multiplier;
  }

  function registerHit() {
    state.combo += 1;
    state.comboTimer = COMBO.window;
    state.multiplier = Math.min(1 + Math.floor(state.combo / COMBO.perStep), COMBO.max);
  }

  function maybeDrop(x, y) {
    if (random() >= POWER.chance) return;
    let falling = 0;
    for (const powerup of powerups) if (powerup.active) falling += 1;
    if (falling >= POWER.maxFalling) return;
    const drop = freePowerup();
    if (drop === null) return;
    const roll = random();
    drop.kind = roll < 0.3 ? 'W' : roll < 0.55 ? 'M' : roll < 0.8 ? 'S' : 'L';
    drop.active = true;
    drop.x = x;
    drop.y = y;
  }

  function applyPower(kind) {
    if (kind === 'W') {
      paddle.width = PADDLE.wideWidth;
      paddle.wideTimer = PADDLE.wideSeconds;
    } else if (kind === 'M') {
      const sources = balls.filter((ball) => ball.active);
      for (const source of sources) {
        if (activeBalls() >= 3) break;
        const extra = freeBall();
        if (extra === null) break;
        const angle = Math.atan2(source.vy, source.vx) + (random() < 0.5 ? 0.5 : -0.5);
        extra.active = true;
        extra.x = source.x;
        extra.y = source.y;
        extra.speed = source.speed;
        extra.vx = Math.cos(angle) * extra.speed;
        extra.vy = Math.sin(angle) * extra.speed;
        if (extra.vy > -extra.speed * 0.3) extra.vy = -extra.speed * 0.5;
      }
    } else if (kind === 'S') {
      state.slowTimer = BALL.slowSeconds;
    } else if (kind === 'L') {
      state.lives = Math.min(state.lives + 1, MAX_LIVES);
    }
  }

  function levelCleared() {
    for (const brick of bricks) if (brick.alive) return false;
    if (boss.active && boss.hp > 0) return false;
    return true;
  }

  function breakBrick(brick, ball) {
    let events = 0;
    if (brick.steel && brick.hits > 1) {
      brick.hits -= 1;
      addScore(BRICK.steelHitPoints);
      registerHit();
      burst(ball.x, ball.y, '#d7e0ec', 8, 160);
      return EVENT_STEEL;
    }
    brick.alive = false;
    state.bricksBroken += 1;
    addScore(brick.steel ? BRICK.steelPoints : BRICK.points);
    registerHit();
    const color = brick.steel ? STEEL_COLOR : ROW_COLORS[brick.tier % ROW_COLORS.length];
    burst(brick.x + brick.w / 2, brick.y + brick.h / 2, color, 16, 240);
    events |= EVENT_BRICK;
    maybeDrop(brick.x + brick.w / 2, brick.y + brick.h / 2);
    if (levelCleared()) {
      state.score += BRICK.levelBonus;
      state.status = 'clear';
      state.clearTimer = 1.8;
      events |= EVENT_LEVEL;
    }
    return events;
  }

  /** Circle-versus-rectangle hit; reflects the ball and reports whether it hit. */
  function hitBrick(ball, brick) {
    const closestX = clamp(ball.x, brick.x, brick.x + brick.w);
    const closestY = clamp(ball.y, brick.y, brick.y + brick.h);
    const dx = ball.x - closestX;
    const dy = ball.y - closestY;
    const distSq = dx * dx + dy * dy;
    if (distSq >= BALL.radius * BALL.radius) return false;
    let nx = dx;
    let ny = dy;
    let length = Math.sqrt(distSq);
    if (length === 0) {
      nx = 0;
      ny = ball.vy > 0 ? -1 : 1;
      length = 1;
    }
    nx /= length;
    ny /= length;
    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      ball.vx -= 2 * dot * nx;
      ball.vy -= 2 * dot * ny;
    }
    // A whisper of seeded jitter so a rally never repeats itself exactly.
    const jitter = (random() - 0.5) * 0.05;
    const cos = Math.cos(jitter);
    const sin = Math.sin(jitter);
    const vx = ball.vx * cos - ball.vy * sin;
    const vy = ball.vx * sin + ball.vy * cos;
    ball.vx = vx;
    ball.vy = vy;
    // Push the ball out of the brick so it cannot stick to a corner.
    ball.x = closestX + nx * (BALL.radius + 0.5);
    ball.y = closestY + ny * (BALL.radius + 0.5);
    return true;
  }

  function hitBoss(ball) {
    if (!boss.active || boss.hp <= 0) return 0;
    const dx = ball.x - boss.x;
    const dy = ball.y - boss.y;
    const reach = boss.radius + BALL.radius;
    if (dx * dx + dy * dy >= reach * reach) return 0;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / length;
    const ny = dy / length;
    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      ball.vx -= 2 * dot * nx;
      ball.vy -= 2 * dot * ny;
    }
    ball.x = boss.x + nx * (reach + 0.5);
    ball.y = boss.y + ny * (reach + 0.5);
    boss.hp -= 1;
    registerHit();
    addScore(BRICK.coreHitPoints);
    burst(ball.x, ball.y, '#ff5ea8', 22, 260);
    state.shake = Math.min(state.shake + 7, 14);
    if (boss.hp <= 0) {
      burst(boss.x, boss.y, '#ff5ea8', 60, 340);
      burst(boss.x, boss.y, '#ffd23e', 40, 260);
      state.shake = 14;
      if (levelCleared()) {
        state.score += BRICK.levelBonus;
        state.status = 'clear';
        state.clearTimer = 1.8;
        return EVENT_CORE | EVENT_LEVEL;
      }
      return EVENT_CORE;
    }
    return EVENT_CORE;
  }

  function bouncePaddle(ball) {
    const centre = paddle.x + paddle.width / 2;
    const offset = clamp((ball.x - centre) / (paddle.width / 2), -1, 1);
    const speed = ball.speed;
    // The bounce angle follows the hit point, up to 60 degrees from vertical...
    let vx = Math.sin(offset * (Math.PI / 3)) * speed;
    // ...plus english from the paddle's own motion...
    vx += paddle.vx * 0.12;
    let vy = -Math.sqrt(Math.max(speed * speed - vx * vx, speed * speed * 0.25));
    // ...and a nudge away from dead vertical, so the ball never loops one column.
    if (Math.abs(vx) < speed * 0.16) {
      const sign = offset !== 0 ? Math.sign(offset) : (ball.vx >= 0 ? 1 : -1);
      vx = sign * speed * 0.16;
      vy = -Math.sqrt(Math.max(speed * speed - vx * vx, speed * speed * 0.25));
    }
    ball.vx = vx;
    ball.vy = vy;
    ball.y = PADDLE.y - BALL.radius - 0.5;
    burst(ball.x, PADDLE.y, '#39d5ff', 5, 120);
  }

  function reset() {
    paddle.x = (FIELD.width - PADDLE.width) / 2;
    paddle.width = PADDLE.width;
    paddle.wideTimer = 0;
    paddle.vx = 0;
    state.score = 0;
    state.lives = LIVES;
    state.bricksBroken = 0;
    state.ballsLost = 0;
    state.time = 0;
    state.shake = 0;
    loadLevel(0);
  }

  /**
   * One fixed step. `input` is { direction, pointerX, launch }: -1/0/1 from the keys,
   * a field X from the pointer (or null), and true on the frame a launch was pressed.
   * With `attract` set the game plays itself behind the title: a lost ball is re-served
   * and a cleared level loops back to level one, so the backdrop never ends.
   */
  function step(dt, input, attract = false) {
    let events = 0;
    state.time += dt;

    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.combo = 0;
        state.multiplier = 1;
      }
    }
    if (paddle.wideTimer > 0) {
      paddle.wideTimer -= dt;
      if (paddle.wideTimer <= 0) paddle.width = PADDLE.width;
    }
    if (state.slowTimer > 0) state.slowTimer -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);

    // Paddle: the pointer wins when it has moved; the keys steer the rest of the time.
    const oldX = paddle.x;
    if (input.pointerX !== null && input.pointerX !== undefined) {
      const target = clamp(input.pointerX - paddle.width / 2, 0, FIELD.width - paddle.width);
      const maxMove = PADDLE.speed * dt;
      paddle.x = clamp(target, paddle.x - maxMove, paddle.x + maxMove);
    } else if (input.direction !== 0) {
      paddle.x = clamp(paddle.x + input.direction * PADDLE.speed * dt, 0, FIELD.width - paddle.width);
    }
    paddle.vx = (paddle.x - oldX) / dt;

    if (state.status === 'clear') {
      state.clearTimer -= dt;
      updateParticles(dt);
      if (state.clearTimer <= 0) {
        if (attract || state.levelIndex + 1 >= LEVELS.length) {
          if (attract) {
            loadLevel(0);
          } else {
            state.status = 'won';
            events |= EVENT_WIN;
          }
        } else {
          loadLevel(state.levelIndex + 1);
        }
      }
      return events;
    }
    if (state.status === 'won' || state.status === 'over') {
      updateParticles(dt);
      return events;
    }

    // The served ball rides on the paddle until it is launched.
    if (state.status === 'serving') {
      for (const ball of balls) {
        if (!ball.active) continue;
        ball.x = paddle.x + paddle.width / 2;
        ball.y = PADDLE.y - BALL.radius - 1;
      }
      if (input.launch) launchBall();
      updateParticles(dt);
      return events;
    }

    // The boss crystal swings across the middle of the ring.
    if (boss.active && boss.hp > 0) {
      boss.phase += dt * CORE.speed;
      boss.x = CORE.centreX + Math.sin(boss.phase) * CORE.swing;
    }

    const targetSpeed = ballTargetSpeed();
    for (const ball of balls) {
      if (!ball.active) continue;
      ball.speed = targetSpeed;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      // Keep the speed honest after every reflection.
      const magnitude = Math.hypot(ball.vx, ball.vy) || 1;
      ball.vx = (ball.vx / magnitude) * ball.speed;
      ball.vy = (ball.vy / magnitude) * ball.speed;

      if (ball.x - BALL.radius < 0) {
        ball.x = BALL.radius;
        ball.vx = Math.abs(ball.vx);
      } else if (ball.x + BALL.radius > FIELD.width) {
        ball.x = FIELD.width - BALL.radius;
        ball.vx = -Math.abs(ball.vx);
      }
      if (ball.y - BALL.radius < 0) {
        ball.y = BALL.radius;
        ball.vy = Math.abs(ball.vy);
      }

      // The paddle catches the ball on its way down.
      if (ball.vy > 0 && ball.y + BALL.radius >= PADDLE.y && ball.y - BALL.radius <= PADDLE.y + PADDLE.height
        && ball.x >= paddle.x - BALL.radius && ball.x <= paddle.x + paddle.width + BALL.radius) {
        bouncePaddle(ball);
      }

      // One brick per ball per step: the first it touches.
      for (const brick of bricks) {
        if (!brick.alive) continue;
        if (hitBrick(ball, brick)) {
          events |= breakBrick(brick, ball);
          break;
        }
      }
      if (state.status === 'clear') break;

      events |= hitBoss(ball);

      if (ball.y - BALL.radius > FIELD.height) {
        ball.active = false;
        state.ballsLost += 1;
        if (activeBalls() === 0) {
          state.combo = 0;
          state.multiplier = 1;
          if (attract) {
            serveBall();
          } else {
            state.lives -= 1;
            events |= EVENT_LOST;
            if (state.lives <= 0) {
              state.status = 'over';
              events |= EVENT_OVER;
            } else {
              serveBall();
            }
          }
        }
      }
    }

    for (const powerup of powerups) {
      if (!powerup.active) continue;
      powerup.y += POWER.fallSpeed * dt;
      if (powerup.y > PADDLE.y && powerup.y < PADDLE.y + PADDLE.height + 10
        && powerup.x >= paddle.x - 8 && powerup.x <= paddle.x + paddle.width + 8) {
        powerup.active = false;
        const kind = powerup.kind;
        applyPower(kind);
        events |= kind === 'L' ? EVENT_LIFE : EVENT_POWER;
        burst(powerup.x, PADDLE.y, '#ffd23e', 10, 150);
      } else if (powerup.y > FIELD.height + 20) {
        powerup.active = false;
      }
    }

    updateParticles(dt);
    return events;
  }

  function updateParticles(dt) {
    for (const particle of particles) {
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 320 * dt;
    }
  }

  reset();
  return { state, reset, step, launchBall, serveBall, loadLevel };
}
