// Every tuning number, colour and level layout in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule below depends
// on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PADDLE = {
  width: 110,
  wideWidth: 176,
  height: 16,
  y: 664,
  speed: 760,
  wideSeconds: 12,
};

export const BALL = {
  radius: 8,
  speed: 520,
  speedPerLevel: 28,
  speedPerTenBricks: 5,
  maxSpeed: 780,
  slowFactor: 0.62,
  slowSeconds: 8,
};

/** Lives the player starts with, and the most a star capsule can raise them to. */
export const LIVES = 3;
export const MAX_LIVES = 5;

export const BRICK = {
  height: 26,
  gap: 8,
  rowGap: 10,
  top: 96,
  areaLeft: 80,
  areaWidth: 1120,
  /** Points for breaking a brick, before the combo multiplier. Steel pays per hit too. */
  points: 50,
  steelPoints: 100,
  steelHitPoints: 25,
  coreHitPoints: 150,
  levelBonus: 500,
};

/** A falling capsule appears from a broken brick this often, and drifts down this fast. */
export const POWER = {
  chance: 0.2,
  fallSpeed: 185,
  maxFalling: 3,
};

/**
 * Combo: each brick hit inside the window raises the combo; the multiplier is
 * 1 + floor(combo / 2), capped at x5. A dropped ball or a quiet stretch resets it.
 */
export const COMBO = { window: 2.5, perStep: 2, max: 5 };

export const PARTICLES = { max: 260 };

/** The Prism Core on level 3: how many hits it takes, and how wide it swings. */
export const CORE = { hits: 8, radius: 34, swing: 190, centreX: 640, y: 316, speed: 1.15 };

/**
 * Level layouts. One character per cell: '.' empty, '1' a prism brick (colour by row),
 * 'S' a steel brick that takes two hits. The Core on level 3 is not a cell: it floats
 * in the middle of the ring and swings side to side.
 */
export const LEVELS = [
  {
    name: 'Dawn Grid',
    rows: [
      '111111111',
      '111111111',
      '111111111',
      '111111111',
      '111111111',
    ],
  },
  {
    name: 'Twin Arches',
    rows: [
      '.1111...1111.',
      '111111.111111',
      '111111.111111',
      '11..11.11..11',
      '1S..11.11..S1',
    ],
  },
  {
    name: 'Prism Core',
    rows: [
      '11111111111',
      '1.........1',
      '1.........1',
      '1.........1',
      '1.........1',
      '1.........1',
      '11111111111',
    ],
    core: true,
  },
];

/** Row colours, top row first: magenta, violet, cyan, lime, amber. */
export const ROW_COLORS = ['#ff4fd8', '#8a5cff', '#2ee6ff', '#7dff5e', '#ffb02e'];
export const STEEL_COLOR = '#d7e0ec';
export const STEEL_DARK = '#7e8aa0';

export const PALETTE = {
  backdrop: '#05050f',
  field: '#0a0a22',
  grid: '#17173a',
  paddle: '#39d5ff',
  paddleWide: '#7dff5e',
  ball: '#f4f7ff',
  ballHalo: '#39d5ff',
  core: '#ff5ea8',
  coreRing: '#ffd23e',
  text: '#eef1f5',
  muted: '#9aa3c0',
  gold: '#ffd23e',
  panel: '#12122e',
  panelEdge: '#2c2c5e',
  danger: '#ff5e6c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'lumen-breaker.best';
