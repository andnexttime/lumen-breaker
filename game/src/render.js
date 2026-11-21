// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. Neon bricks, a glowing paddle and ball, particles, the Prism Core with its
// health ring, the HUD and the panels. Text that holds a number is rebuilt only when the
// number changes, so a frame allocates nothing. The shake is a wobble of the frame time,
// never Math.random, so a screenshot scene paints the same frame every time.

import { BALL, BRICK, CORE, FIELD, FONT, MAX_LIVES, PALETTE, PADDLE, ROW_COLORS, STEEL_COLOR, STEEL_DARK } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const PANEL = { width: 640, top: 150, line: 34, bottom: 76 };
const POWER_COLORS = { W: '#7dff5e', M: '#8a5cff', S: '#2ee6ff', L: '#ffd23e' };

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('SCORE ');
  const bestLabel = cachedLabel('BEST ');
  const levelLabel = cachedLabel('');
  const bricksLabel = cachedLabel('');
  const livesLabel = cachedLabel('');

  // A fixed starfield behind the game, drawn from one seed so it never moves.
  const stars = [];
  {
    const random = createRandom(20261115);
    for (let index = 0; index < 110; index += 1) {
      stars.push({
        x: random() * FIELD.width,
        y: random() * FIELD.height,
        r: 0.6 + random() * 1.6,
        phase: random() * Math.PI * 2,
        speed: 0.4 + random() * 1.2,
      });
    }
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function rrect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + w, y, x + w, y + h, radius);
    context.arcTo(x + w, y + h, x, y + h, radius);
    context.arcTo(x, y + h, x, y, radius);
    context.arcTo(x, y, x + w, y, radius);
    context.closePath();
  }

  function drawBackground(now) {
    context.fillStyle = PALETTE.field;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    for (const star of stars) {
      const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now * star.speed + star.phase));
      context.globalAlpha = twinkle * 0.8;
      context.fillStyle = '#cdd7ff';
      context.fillRect(star.x, star.y, star.r, star.r);
    }
    context.globalAlpha = 1;
    context.strokeStyle = PALETTE.grid;
    context.lineWidth = 1;
    for (let x = 0; x <= FIELD.width; x += 80) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, FIELD.height);
      context.stroke();
    }
    for (let y = 0; y <= FIELD.height; y += 80) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(FIELD.width, y);
      context.stroke();
    }
  }

  function drawBricks(state) {
    for (const brick of state.bricks) {
      if (!brick.alive) continue;
      const color = brick.steel ? STEEL_COLOR : ROW_COLORS[brick.tier % ROW_COLORS.length];
      context.globalAlpha = 0.28;
      context.fillStyle = color;
      rrect(brick.x - 3, brick.y - 3, brick.w + 6, brick.h + 6, 7);
      context.fill();
      context.globalAlpha = 1;
      context.fillStyle = color;
      rrect(brick.x, brick.y, brick.w, brick.h, 5);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.28)';
      context.fillRect(brick.x + 4, brick.y + 3, brick.w - 8, 4);
      if (brick.steel) {
        context.strokeStyle = STEEL_DARK;
        context.lineWidth = 2;
        if (brick.hits === 1) {
          context.beginPath();
          context.moveTo(brick.x + 6, brick.y + 4);
          context.lineTo(brick.x + brick.w * 0.45, brick.y + brick.h - 5);
          context.lineTo(brick.x + brick.w * 0.7, brick.y + 6);
          context.stroke();
        }
        context.fillStyle = STEEL_DARK;
        context.beginPath();
        context.arc(brick.x + 9, brick.y + brick.h / 2, 2.5, 0, Math.PI * 2);
        context.arc(brick.x + brick.w - 9, brick.y + brick.h / 2, 2.5, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawBoss(state, now) {
    const boss = state.boss;
    if (!boss.active || boss.hp <= 0) return;
    const spin = now * 0.8;
    const pulse = 1 + 0.06 * Math.sin(now * 3);
    const radius = boss.radius * pulse;
    context.save();
    context.translate(boss.x, boss.y);
    context.rotate(spin);
    context.globalAlpha = 0.25;
    context.fillStyle = PALETTE.core;
    context.beginPath();
    context.moveTo(0, -radius - 12);
    context.lineTo(radius + 12, 0);
    context.lineTo(0, radius + 12);
    context.lineTo(-radius - 12, 0);
    context.closePath();
    context.fill();
    context.globalAlpha = 1;
    context.fillStyle = PALETTE.core;
    context.beginPath();
    context.moveTo(0, -radius);
    context.lineTo(radius, 0);
    context.lineTo(0, radius);
    context.lineTo(-radius, 0);
    context.closePath();
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.55)';
    context.beginPath();
    context.moveTo(0, -radius * 0.55);
    context.lineTo(radius * 0.4, 0);
    context.lineTo(0, radius * 0.55);
    context.lineTo(-radius * 0.4, 0);
    context.closePath();
    context.fill();
    context.restore();
    // Health ring: the gold arc that shrinks with every hit.
    context.strokeStyle = PALETTE.coreRing;
    context.lineWidth = 5;
    context.beginPath();
    context.arc(boss.x, boss.y, radius + 20, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * boss.hp) / boss.maxHp);
    context.stroke();
    context.strokeStyle = 'rgba(255,210,62,0.25)';
    context.lineWidth = 5;
    context.beginPath();
    context.arc(boss.x, boss.y, radius + 20, -Math.PI / 2 + (Math.PI * 2 * boss.hp) / boss.maxHp, -Math.PI / 2 + Math.PI * 2);
    context.stroke();
    text(`${boss.hp}`, boss.x, boss.y - radius - 34, 22, PALETTE.coreRing, 'center');
  }

  function drawPowerups(state) {
    for (const powerup of state.powerups) {
      if (!powerup.active) continue;
      const color = POWER_COLORS[powerup.kind];
      context.globalAlpha = 0.3;
      context.fillStyle = color;
      rrect(powerup.x - 18, powerup.y - 13, 36, 26, 13);
      context.fill();
      context.globalAlpha = 1;
      context.fillStyle = color;
      rrect(powerup.x - 15, powerup.y - 10, 30, 20, 10);
      context.fill();
      context.fillStyle = '#0a0a22';
      if (powerup.kind === 'L') {
        text('★', powerup.x, powerup.y + 5, 16, '#0a0a22', 'center');
      } else {
        text(powerup.kind, powerup.x, powerup.y + 5, 15, '#0a0a22', 'center');
      }
    }
  }

  function drawParticles(state) {
    for (const particle of state.particles) {
      if (!particle.active) continue;
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    }
    context.globalAlpha = 1;
  }

  function drawPaddle(state) {
    const paddle = state.paddle;
    const wide = paddle.width > PADDLE.width;
    const color = wide ? PALETTE.paddleWide : PALETTE.paddle;
    context.globalAlpha = 0.3;
    context.fillStyle = color;
    rrect(paddle.x - 4, PADDLE.y - 4, paddle.width + 8, PADDLE.height + 8, 12);
    context.fill();
    context.globalAlpha = 1;
    context.fillStyle = color;
    rrect(paddle.x, PADDLE.y, paddle.width, PADDLE.height, 8);
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.5)';
    context.fillRect(paddle.x + 6, PADDLE.y + 3, paddle.width - 12, 4);
  }

  function drawBalls(state) {
    for (const ball of state.balls) {
      if (!ball.active) continue;
      context.globalAlpha = 0.25;
      context.fillStyle = PALETTE.ballHalo;
      context.beginPath();
      context.arc(ball.x, ball.y, BALL.radius + 7, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      context.fillStyle = PALETTE.ball;
      context.beginPath();
      context.arc(ball.x, ball.y, BALL.radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawHud(state, best) {
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 26, PALETTE.text, 'left');
    text(bestLabel(best), 24, 50, 16, PALETTE.muted, 'left');
    text(levelLabel(`${state.levelName}  ·  LEVEL ${state.levelIndex + 1}/3`), FIELD.width / 2, 18, 26, PALETTE.text, 'center');
    const remaining = state.bricks.filter((brick) => brick.alive).length;
    text(bricksLabel(`${remaining} PRISMS LEFT`), FIELD.width / 2, 50, 16, PALETTE.muted, 'center');
    let livesText = '';
    for (let index = 0; index < MAX_LIVES; index += 1) livesText += index < state.lives ? '●' : '○';
    text(livesLabel(livesText), FIELD.width - 24, 18, 26, PALETTE.text, 'right');
    text('LIVES', FIELD.width - 24, 50, 16, PALETTE.muted, 'right');
    if (state.multiplier > 1) {
      const pulse = 1 + 0.08 * Math.sin(performance.now() / 90);
      context.save();
      context.translate(24, 84);
      context.scale(pulse, pulse);
      context.fillStyle = PALETTE.gold;
      rrect(0, 0, 92, 30, 8);
      context.fill();
      context.fillStyle = '#0a0a22';
      context.font = `bold 18px ${FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(`COMBO x${state.multiplier}`, 46, 16);
      context.restore();
    }
  }

  function drawPanel(title, lines, prompt, accent, highlight = -1) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(5,5,15,0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    rrect(x, y, PANEL.width, height, 14);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    rrect(x, y, PANEL.width, height, 14);
    context.stroke();
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 76, 46, accent ?? PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 21, index === highlight ? PALETTE.gold : PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 23, PALETTE.gold, 'center');
  }

  function drawLevelBanner(state) {
    const lines = [`${state.levelName} cleared  ·  +${BRICK.levelBonus} bonus`];
    const height = 120;
    const width = 560;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2 - 40;
    context.fillStyle = 'rgba(18,18,46,0.92)';
    rrect(x, y, width, height, 12);
    context.fill();
    context.strokeStyle = PALETTE.gold;
    context.lineWidth = 2;
    rrect(x, y, width, height, 12);
    context.stroke();
    context.textBaseline = 'alphabetic';
    text('LEVEL CLEAR', FIELD.width / 2, y + 52, 34, PALETTE.gold, 'center');
    text(lines[0], FIELD.width / 2, y + 92, 20, PALETTE.text, 'center');
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, stats, now) {
    const time = now ?? performance.now() / 1000;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shake = state.shake;
    const shakeX = shake > 0 ? Math.sin(time * 91) * shake * 0.6 : 0;
    const shakeY = shake > 0 ? Math.cos(time * 113) * shake * 0.6 : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawBackground(time);
    drawBricks(state);
    drawBoss(state, time);
    drawPowerups(state);
    drawParticles(state);
    drawPaddle(state);
    drawBalls(state);
    if (screen === SCREEN_TITLE) {
      drawPanel(
        'LUMEN BREAKER',
        [
          'Bounce the light. Break every prism. Shatter the Prism Core.',
          'Mouse or ← → / A D to move  ·  Space or click to launch',
          'Catch capsules: W wide paddle  ·  M multiball  ·  S slow ball  ·  ★ extra life',
          `Best score: ${best}`,
          '',
        ],
        'Press Space or click to start',
        '#39d5ff',
      );
      return;
    }
    drawHud(state, best);
    if (state.status === 'clear' && screen === SCREEN_PLAY) drawLevelBanner(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The prisms will wait for you.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      const minutes = Math.floor(state.time / 60);
      const seconds = Math.floor(state.time % 60);
      drawPanel(
        'GAME OVER',
        [
          `Score ${state.score}  ·  Best ${best}`,
          `Reached ${state.levelName}  ·  ${state.bricksBroken} prisms broken`,
          `Survived ${minutes}:${String(seconds).padStart(2, '0')}`,
          '',
        ],
        'Press Space or click to play again',
        PALETTE.danger,
      );
    } else if (screen === SCREEN_WIN && stats) {
      const stars = '★'.repeat(stats.stars) + '☆'.repeat(3 - stats.stars);
      const minutes = Math.floor(stats.time / 60);
      const seconds = Math.floor(stats.time % 60);
      drawPanel(
        'PRISM CORE SHATTERED',
        [
          stars,
          `Score ${stats.score}  ·  Best ${stats.best}`,
          `${stats.bricksBroken} prisms broken  ·  ${stats.lives} ${stats.lives === 1 ? 'life' : 'lives'} left`,
          `Cleared in ${minutes}:${String(seconds).padStart(2, '0')}  ·  ${stats.ballsLost} ${stats.ballsLost === 1 ? 'ball' : 'balls'} lost`,
          '',
        ],
        'Press Space or click to play again',
        PALETTE.gold,
        0,
      );
    }
  }

  /** Convert a client X into a field X (for pointer steering). */
  function fieldX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * FIELD.width;
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, fieldX };
}
