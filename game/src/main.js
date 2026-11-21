// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title (with the game playing itself
// behind the panel), play, paused, game over and victory.
//
// ?shot=title|play|boss|win (with &seed=N) stages that scene instead of running the
// loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, LIVES, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_BRICK, EVENT_CORE, EVENT_LEVEL, EVENT_LIFE, EVENT_LOST,
  EVENT_OVER, EVENT_POWER, EVENT_STEEL, EVENT_WIN,
} from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { autopilot, stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** Fixed clock for screenshot scenes, so twinkle and spin paint the same frame. */
const SHOT_NOW = 12.5;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, scene.stats, SHOT_NOW);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let winStats = null;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    winStats = null;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Playing Lumen Breaker. ${LIVES} lives. Break every prism.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    audio.over();
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function winGame() {
    const state = world.state;
    winStats = {
      score: state.score,
      best: Math.max(best, state.score),
      bricksBroken: state.bricksBroken,
      lives: state.lives,
      time: state.time,
      ballsLost: state.ballsLost,
      stars: state.lives >= 3 ? 3 : state.lives === 2 ? 2 : 1,
    };
    if (state.score > best) {
      best = state.score;
      saveBest(best);
    }
    screen = SCREEN_WIN;
    audio.win();
    announce(`Victory! The Prism Core is shattered. Score ${state.score}. Best ${best}.`);
  }

  function playEvents(events) {
    if (events & EVENT_BRICK) audio.brick(world.state.multiplier);
    if (events & EVENT_STEEL) audio.steel();
    if (events & EVENT_CORE) audio.coreHit();
    if (events & EVENT_POWER) audio.power();
    if (events & EVENT_LIFE) {
      audio.life();
      announce(`Extra life. ${world.state.lives} lives.`);
    }
    if (events & EVENT_LOST) {
      audio.lose();
      announce(world.state.lives === 1 ? 'Ball lost. 1 life left.' : `Ball lost. ${world.state.lives} lives left.`);
    }
    if (events & EVENT_LEVEL) {
      audio.levelClear();
      announce(`${world.state.levelName} cleared.`);
    }
    if (events & EVENT_WIN) winGame();
    else if (events & EVENT_OVER) endGame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) startGame();
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) {
        startGame();
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }

    // The pointer steers the paddle; the keys steer when it has not moved.
    const pointerX = input.pointerActive() ? renderer.fieldX(input.pointerX()) : null;
    const launch = Boolean(actions & ACTION_CONFIRM) && screen === SCREEN_PLAY;

    if (screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        const pilot = autopilot(world.state);
        world.step(STEP, { direction: 0, pointerX: pilot.pointerX, launch: pilot.launch }, true);
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        const events = world.step(STEP, { direction: input.direction(), pointerX, launch }, false);
        playEvents(events);
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) break;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, winStats);
  }

  // Leaving the tab pauses a running game rather than letting the ball drop unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Lumen Breaker. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
