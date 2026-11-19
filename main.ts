// make.fun · news-image-20261118 · "The World Today", Wednesday 18 November 2026
//
// Draws one 1024x1024 front page from code: a bitmap type engine, a rule and
// panel system, and a PNG writer built on node's zlib. No network, no clock,
// no randomness: two runs write byte-identical files.
//
// Run:  MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const PAPER = '#F4F1E8';
const INK = '#15120E';
const RED = '#B22A20';
const MUTED = '#5B564C';
const RULE = '#C8C1AE';
const WHITE = '#FFFFFF';

function rgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

const C = {
  paper: rgb(PAPER),
  ink: rgb(INK),
  red: rgb(RED),
  muted: rgb(MUTED),
  rule: rgb(RULE),
  white: rgb(WHITE),
};

// ---------------------------------------------------------------------------
// Canvas: a page measured in design units, drawn 2x and box-filtered down.
// ---------------------------------------------------------------------------

const W = 1024;
const H = 1024;
const SS = 2;
const PW = W * SS;
const PH = H * SS;

const buf = new Uint8Array(PW * PH * 3);

function fill(x0, y0, w, h, color) {
  const xa = Math.max(0, Math.round(x0 * SS));
  const ya = Math.max(0, Math.round(y0 * SS));
  const xb = Math.min(PW, Math.round((x0 + w) * SS));
  const yb = Math.min(PH, Math.round((y0 + h) * SS));
  for (let y = ya; y < yb; y++) {
    let p = (y * PW + xa) * 3;
    for (let x = xa; x < xb; x++) {
      buf[p++] = color[0];
      buf[p++] = color[1];
      buf[p++] = color[2];
    }
  }
}

function hline(x0, x1, y, thickness, color) {
  fill(x0, y, x1 - x0, thickness, color);
}

function vline(x, y0, y1, thickness, color) {
  fill(x, y0, thickness, y1 - y0, color);
}

function clear(color) {
  const [r, g, b] = color;
  for (let p = 0; p < buf.length; p += 3) {
    buf[p] = r;
    buf[p + 1] = g;
    buf[p + 2] = b;
  }
}

// ---------------------------------------------------------------------------
// Type: a 5x7-cell bitmap grotesque on an 11-row body, baseline row 8.
// Each glyph is [firstRow, ...rows]; '#' is ink, '.' is empty.
// ---------------------------------------------------------------------------

const GLYPHS = {
  A: [1, '..#..', '.#.#.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: [1, '####.', '#...#', '#...#', '####.', '#...#', '#...#', '#...#', '####.'],
  C: [1, '.####', '#....', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: [1, '####.', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: [1, '#####', '#....', '#....', '####.', '#....', '#....', '#....', '#####'],
  F: [1, '#####', '#....', '#....', '####.', '#....', '#....', '#....', '#....'],
  G: [1, '.####', '#....', '#....', '#.###', '#...#', '#...#', '#...#', '.####'],
  H: [1, '#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#', '#...#'],
  I: [1, '###.', '.#..', '.#..', '.#..', '.#..', '.#..', '.#..', '###.'],
  J: [1, '...#', '...#', '...#', '...#', '...#', '...#', '#..#', '.##.'],
  K: [1, '#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#', '#...#'],
  L: [1, '#....', '#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: [1, '#....#', '##..##', '#.##.#', '#.##.#', '#....#', '#....#', '#....#', '#....#'],
  N: [1, '#...#', '##..#', '##..#', '#.#.#', '#.#.#', '#..##', '#..##', '#...#'],
  O: [1, '.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: [1, '####.', '#...#', '#...#', '####.', '#....', '#....', '#....', '#....'],
  Q: [1, '.###.', '#...#', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: [1, '####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#', '#...#'],
  S: [1, '.####', '#....', '#....', '.###.', '....#', '....#', '#...#', '.###.'],
  T: [1, '#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: [1, '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: [1, '#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
  W: [1, '#....#', '#....#', '#....#', '#.##.#', '#.##.#', '##..##', '##..##', '#....#'],
  X: [1, '#...#', '#...#', '.#.#.', '..#..', '..#..', '.#.#.', '#...#', '#...#'],
  Y: [1, '#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..', '..#..'],
  Z: [1, '#####', '....#', '...#.', '..#..', '.#...', '#....', '#....', '#####'],

  '0': [1, '.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '#...#', '.###.'],
  '1': [1, '..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  '2': [1, '.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '3': [1, '####.', '....#', '....#', '.###.', '....#', '....#', '....#', '####.'],
  '4': [1, '...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.', '...#.'],
  '5': [1, '#####', '#....', '####.', '....#', '....#', '....#', '#...#', '.###.'],
  '6': [1, '.###.', '#....', '#....', '####.', '#...#', '#...#', '#...#', '.###.'],
  '7': [1, '#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...', '.#...'],
  '8': [1, '.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '#...#', '.###.'],
  '9': [1, '.###.', '#...#', '#...#', '#...#', '.####', '....#', '....#', '.###.'],

  a: [4, '.###.', '....#', '.####', '#...#', '.####'],
  b: [1, '#....', '#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
  c: [4, '.####', '#....', '#....', '#....', '.####'],
  d: [1, '....#', '....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  e: [4, '.###.', '#...#', '#####', '#....', '.###.'],
  f: [1, '..##.', '.#...', '.#...', '####.', '.#...', '.#...', '.#...', '.#...'],
  g: [4, '.####', '#...#', '#...#', '.####', '....#', '#...#', '.###.'],
  h: [1, '#....', '#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#'],
  i: [1, '.#.', '...', '.#.', '.#.', '.#.', '.#.', '.#.', '.#.'],
  j: [1, '..#', '...', '..#', '..#', '..#', '..#', '..#', '..#', '..#', '##.'],
  k: [1, '#....', '#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.'],
  l: [1, '.#.', '.#.', '.#.', '.#.', '.#.', '.#.', '.#.', '.#.'],
  m: [4, '##.##', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
  n: [4, '####.', '#...#', '#...#', '#...#', '#...#'],
  o: [4, '.###.', '#...#', '#...#', '#...#', '.###.'],
  p: [4, '####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  q: [4, '.####', '#...#', '#...#', '.####', '....#', '....#', '....#'],
  r: [4, '####.', '#...#', '#....', '#....', '#....'],
  s: [4, '.####', '#....', '.###.', '....#', '####.'],
  t: [1, '.#..', '.#..', '.#..', '####', '.#..', '.#..', '.#..', '..##'],
  u: [4, '#...#', '#...#', '#...#', '#...#', '.####'],
  v: [4, '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  w: [4, '#....#', '#....#', '#.##.#', '#.##.#', '.#..#.'],
  x: [4, '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  y: [4, '#...#', '#...#', '#...#', '.####', '....#', '#...#', '.###.'],
  z: [4, '#####', '...#.', '..#..', '.#...', '#####'],

  '.': [7, '#', '#'],
  ',': [8, '#', '#'],
  ':': [4, '#', '.', '.', '#'],
  ';': [4, '#', '.', '.', '#', '#'],
  '!': [1, '#', '#', '#', '#', '#', '.', '.', '#'],
  '?': [1, '.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..', '.....'],
  "'": [1, '#', '#'],
  '"': [1, '#.#', '#.#'],
  '-': [5, '####'],
  '–': [5, '#####'],
  '/': [1, '...#', '...#', '..#.', '..#.', '.#..', '.#..', '#...', '#...'],
  '(': [1, '.#', '#.', '#.', '#.', '#.', '#.', '#.', '.#'],
  ')': [1, '#.', '.#', '.#', '.#', '.#', '.#', '.#', '#.'],
  $: [0, '..#..', '.####', '#.#..', '#.#..', '.###.', '..#.#', '..#.#', '####.', '..#..'],
  '%': [1, '##..#', '##.#.', '..#..', '.#...', '#..##', '...##'],
  '+': [2, '..#..', '..#..', '#####', '..#..', '..#..'],
  '·': [5, '#'],
  '&': [1, '.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '’': [1, '#', '#'],
  '“': [1, '#.#', '#.#'],
  '”': [1, '#.#', '#.#'],
};

const BASELINE = 8; // row of the body that sits on the baseline
const SPACE = 4; // advance columns for a space

function glyph(ch) {
  if (ch === ' ') return null;
  let g = GLYPHS[ch];
  if (!g) g = GLYPHS[ch.toUpperCase()];
  return g || null;
}

function glyphWidth(ch) {
  const g = glyph(ch);
  if (!g) return SPACE;
  let w = 0;
  for (let i = 1; i < g.length; i++) w = Math.max(w, g[i].length);
  return w;
}

function boldOffset(scale) {
  return Math.max(1, Math.round(scale * 0.28));
}

// Width of a string in design units.
function measure(str, scale, bold) {
  const off = bold ? boldOffset(scale) : 0;
  let w = 0;
  for (const ch of str) w += (glyphWidth(ch) + 1) * scale + off;
  return w - (str.length ? scale : 0); // trim the trailing gap
}

// Draw one glyph with its baseline row at y.
function drawGlyph(g, x, y, scale, color, bold) {
  const off = bold ? boldOffset(scale) : 0;
  if (!g) return;
  const first = g[0];
  const rows = g.length - 1;
  for (let r = 0; r < rows; r++) {
    const row = g[1 + r];
    const rowY = y - (BASELINE - (first + r)) * scale;
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== '#') continue;
      const px = x + c * scale;
      fill(px, rowY, scale, scale, color);
      if (bold) fill(px + off, rowY, scale, scale, color);
    }
  }
}

// Draw text with its baseline at y. Returns the advance width.
function text(str, x, y, scale, color, bold) {
  const off = bold ? boldOffset(scale) : 0;
  let cx = x;
  for (const ch of str) {
    const g = glyph(ch);
    if (g) drawGlyph(g, cx, y, scale, color, bold);
    cx += (glyphWidth(ch) + 1) * scale + off;
  }
  return cx - x - (str.length ? scale : 0);
}

function textRight(str, xRight, y, scale, color, bold) {
  const w = measure(str, scale, bold);
  return text(str, xRight - w, y, scale, color, bold);
}

function textCenter(str, xCenter, y, scale, color, bold) {
  const w = measure(str, scale, bold);
  return text(str, xCenter - w / 2, y, scale, color, bold);
}

// Greedy word wrap to a design-unit width.
function wrap(str, maxWidth, scale, bold) {
  const words = str.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (line && measure(test, scale, bold) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function paragraph(str, x, y, maxWidth, scale, color, bold, leading) {
  const lines = wrap(str, maxWidth, scale, bold);
  let cy = y;
  for (const line of lines) {
    text(line, x, cy, scale, color, bold);
    cy += leading;
  }
  return cy;
}

// ---------------------------------------------------------------------------
// Rules and panels
// ---------------------------------------------------------------------------

function ruleY(y, thickness, color, x0 = 40, x1 = 984) {
  hline(x0, x1, y, thickness, color);
}

function numberedLabel(no, x, y, color) {
  text(no, x, y, 2, C.red, true);
  return x + measure(no, 2, true) + 16;
}

// ---------------------------------------------------------------------------
// Dateline map: coarse equirectangular land polygons, drawn as a dot grid
// ---------------------------------------------------------------------------

const LAND_COLOR = rgb('#A79E88');
const SEA_COLOR = rgb('#EDE9DB');

const LAND = [
  // Greenland
  [
    [-45, 83], [-22, 80], [-24, 70], [-40, 60], [-54, 62], [-58, 70], [-52, 78],
  ],
  // North America
  [
    [-168, 66], [-160, 71], [-150, 70], [-140, 70], [-130, 70], [-120, 72],
    [-110, 73], [-100, 73], [-90, 72], [-80, 70], [-70, 68], [-60, 60],
    [-55, 50], [-65, 45], [-70, 42], [-75, 35], [-81, 25], [-90, 29],
    [-97, 26], [-105, 22], [-112, 29], [-118, 34], [-124, 40], [-124, 48],
    [-130, 54], [-140, 60], [-150, 60], [-165, 55],
  ],
  // Central America
  [[-92, 18], [-83, 15], [-77, 8], [-83, 8], [-88, 13]],
  // South America
  [
    [-81, 8], [-70, 12], [-60, 11], [-50, 0], [-35, -6], [-38, -15], [-48, -25],
    [-58, -38], [-63, -42], [-70, -52], [-75, -45], [-72, -30], [-70, -18],
    [-78, -5], [-80, 2],
  ],
  // Europe
  [
    [-10, 36], [-9, 44], [-2, 44], [0, 50], [4, 52], [8, 55], [10, 58],
    [6, 62], [12, 66], [20, 70], [30, 70], [32, 66], [40, 66], [40, 45],
    [28, 41], [20, 42], [12, 45], [-4, 43],
  ],
  // Africa
  [
    [-17, 15], [-17, 20], [0, 35], [11, 37], [25, 32], [35, 31], [43, 12],
    [51, 12], [41, -2], [40, -15], [35, -25], [20, -35], [15, -30], [10, -5],
    [5, 5], [-8, 5], [-16, 12],
  ],
  // Asia
  [
    [40, 66], [60, 70], [80, 73], [100, 74], [120, 72], [140, 70],
    [160, 66], [180, 64], [170, 60], [160, 58], [150, 59], [140, 50],
    [130, 42], [122, 38], [120, 30], [110, 20], [105, 10], [100, 14],
    [97, 22], [92, 22], [88, 24], [80, 30], [72, 30], [66, 25], [60, 25],
    [55, 38], [48, 42], [45, 50], [40, 58],
  ],
  // India
  [
    [66, 25], [70, 22], [74, 15], [77, 8], [80, 13], [84, 20], [88, 24],
    [80, 28], [72, 29],
  ],
  // Arabia
  [
    [34, 29], [43, 30], [50, 29], [57, 25], [55, 18], [48, 13], [43, 12],
    [35, 20],
  ],
  // Southeast Asia and Indonesia
  [
    [95, 5], [105, -5], [120, -8], [130, -5], [140, -2], [132, 5], [115, 2],
    [100, 8],
  ],
  // Australia
  [
    [114, -22], [122, -18], [130, -12], [142, -11], [146, -19], [153, -28],
    [150, -37], [140, -38], [129, -32], [115, -34],
  ],
  // Britain
  [[-6, 50], [-2, 58], [0, 55], [-4, 50]],
  // Japan
  [[130, 32], [140, 36], [145, 44], [141, 45], [135, 34]],
  // Madagascar
  [[43, -12], [50, -15], [48, -25], [43, -20]],
  // New Zealand
  [[166, -46], [174, -41], [178, -38], [172, -42]],
];

function inPoly(lon, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const MAP_COLS = 72;
const MAP_ROWS = 30; // latitude 84N down to 66S

function lonToCol(lon) {
  return (lon + 180) / 5;
}

function latToRow(lat) {
  return (90 - lat) / 5;
}

function drawMap(x0, y0, cell) {
  for (let r = 0; r < MAP_ROWS; r++) {
    const lat = 90 - 5 * (r + 0.5);
    for (let c = 0; c < MAP_COLS; c++) {
      const lon = -180 + 5 * (c + 0.5);
      let land = false;
      for (const poly of LAND) {
        if (inPoly(lon, lat, poly)) {
          land = true;
          break;
        }
      }
      if (land) fill(x0 + c * cell, y0 + r * cell, cell - 1, cell - 1, LAND_COLOR);
    }
  }
}

function pin(x0, y0, cell, lon, lat) {
  const cx = x0 + lonToCol(lon) * cell;
  const cy = y0 + latToRow(lat) * cell;
  fill(cx - 3, cy - 3, 7, 7, C.red);
}

// Seven datelines of 18 November 2026.
const PINS = [
  [114.1, 22.5], // Shenzhen
  [30.7, 46.5], // Odesa
  [47.9, 29.4], // Kuwait
  [56.3, 26.7], // Qeshm
  [38.0, 14.9], // Badme
  [30.7, 36.9], // Antalya
  [34.4, 31.4], // Gaza
];

// ---------------------------------------------------------------------------
// The day's content (sourced 18 November 2026; see README)
// ---------------------------------------------------------------------------

const LEAD = {
  no: '01',
  region: 'ASIA-PACIFIC · SHENZHEN',
  lines: ['TRUMP JOINS XI AND PUTIN', 'AT APEC IN SHENZHEN'],
  body:
    'Xi welcomed Trump to Shenzhen on Wednesday; Putin, in town for the same summit, told the forum ' +
    'Europe was in \u201chumiliating decline\u201d. The three hold their first joint session on Thursday.',
};

const STORIES = [
  {
    no: '02',
    region: 'MIDDLE EAST',
    lines: ['US HITS IRAN', 'IRAN HITS BACK'],
    body: 'Qeshm struck; a US base in Kuwait fired on.',
  },
  {
    no: '03',
    region: 'UKRAINE',
    lines: ['FIVE DIE IN', 'ODESA STRIKE'],
    body: 'Kyiv hits two refineries; allies split on deep strikes.',
  },
  {
    no: '04',
    region: 'HORN OF AFRICA',
    lines: ['ARMIES MASS', 'AT THE BORDER'],
    body: 'Troops within range at Badme, monitors say.',
  },
  {
    no: '05',
    region: 'MARKETS',
    lines: ['$115.8BN', 'NVIDIA QUARTER'],
    body: 'Revenue up 103%; AI shares still slipped.',
  },
  {
    no: '06',
    region: 'CLIMATE · ANTALYA',
    lines: ['COP31 STALLS', 'ON FARMING'],
    body: 'Antalya launches food and methane pledges instead.',
  },
  {
    no: '07',
    region: 'GAZA',
    lines: ['A FUNERAL IN', 'DEIR AL-BALAH'],
    body: 'Fadi Ismail, 35, killed in an Israeli air strike.',
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function render() {
  clear(C.paper);

  // Masthead ---------------------------------------------------------------
  ruleY(40, 3, C.ink);
  text('WEDNESDAY 18 NOVEMBER 2026', 40, 64, 2, C.red, true);
  textRight('SEVEN STORIES · FIVE REGIONS', 984, 64, 2, C.muted, false);

  text('THE WORLD TODAY', 40, 148, 6, C.ink, true);

  // Date block
  fill(646, 74, 338, 100, C.red);
  text('18', 664, 152, 7, C.white, true);
  vline(762, 90, 158, 2, C.white);
  text('NOV', 782, 118, 3, C.white, true);
  text('2026', 782, 156, 3, C.white, true);

  // Lead ------------------------------------------------------------------
  ruleY(200, 2, C.ink);
  const leadX = numberedLabel(LEAD.no, 40, 226, C.red);
  text(LEAD.region, leadX, 226, 2, C.ink, true);

  let ly = 284;
  for (const line of LEAD.lines) {
    text(line, 40, ly, 4, C.ink, true);
    ly += 38;
  }
  ruleY(348, 1, C.rule, 40, 340);
  paragraph(LEAD.body, 40, 378, 566, 2, C.muted, false, 21);

  // Dateline map ----------------------------------------------------------
  ruleY(200, 2, C.ink, 620, 984);
  text('SEVEN DATELINES', 620, 226, 2, C.ink, true);
  textRight('18 NOV 2026', 984, 226, 2, C.red, true);
  drawMap(624, 242, 5);
  for (const [lon, lat] of PINS) pin(624, 242, 5, lon, lat);
  text('ONE DAY · ONE WORLD', 620, 416, 1, C.muted, false);

  // Story grid ------------------------------------------------------------
  const colX = [40, 368, 696];
  const rowY = [492, 700];
  const colW = 288;

  STORIES.forEach((story, i) => {
    const x = colX[i % 3];
    const y = rowY[Math.floor(i / 3)];

    ruleY(y, 2, C.ink, x, x + colW);
    const lx = numberedLabel(story.no, x, y + 32, C.red);
    text(story.region, lx, y + 32, 2, C.ink, true);

    let hy = y + 80;
    for (const line of story.lines) {
      text(line, x, hy, 3, C.ink, true);
      hy += 32;
    }
    paragraph(story.body, x, hy + 6, colW, 2, C.muted, false, 21);
  });

  // Footer ----------------------------------------------------------------
  ruleY(902, 2, C.ink);
  text('ALL OF WEDNESDAY 18 NOVEMBER 2026', 40, 932, 2, C.ink, true);
  textRight('DRAWN IN CODE · NO PHOTOGRAPHS', 984, 932, 2, C.muted, false);
  ruleY(946, 1, C.rule);
  text(
    'SOURCES: REUTERS · AP · AL JAZEERA · CNBC · THE GUARDIAN · CARBON BRIEF · TIMES OF ISRAEL',
    40,
    970,
    1,
    C.muted,
    false
  );
  textRight('MAKE.FUN · NEWS IMAGE · 2026-11-18', 984, 970, 1, C.muted, false);
}

// ---------------------------------------------------------------------------
// PNG: 8-bit truecolour, Up-filtered rows, zlib deflate, own CRC32
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'latin1');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Average each SS x SS block of the drawing buffer into one output pixel.
function downsample() {
  const out = new Uint8Array(W * H * 3);
  const n = SS * SS;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        let p = ((y * SS + sy) * PW + x * SS) * 3;
        for (let sx = 0; sx < SS; sx++) {
          r += buf[p];
          g += buf[p + 1];
          b += buf[p + 2];
          p += 3;
        }
      }
      const o = (y * W + x) * 3;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
    }
  }
  return out;
}

function encodePNG(pixels) {
  const stride = W * 3;
  const raw = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = y === 0 ? 0 : 2; // filter: none on row 0, Up after
    for (let i = 0; i < stride; i++) {
      const cur = pixels[y * stride + i];
      const up = y === 0 ? 0 : pixels[(y - 1) * stride + i];
      raw[rowStart + 1 + i] = (cur - up) & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  if (process.env.MAKEFUN_DEBUG_MAP) {
    clear(C.paper);
    drawMap(20, 20, Number(process.env.MAKEFUN_DEBUG_MAP));
    for (const [lon, lat] of PINS) pin(20, 20, Number(process.env.MAKEFUN_DEBUG_MAP), lon, lat);
  } else {
    render();
  }
  const png = encodePNG(downsample());
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'entry.png');
  writeFileSync(outPath, png);
  process.stdout.write(`wrote ${outPath} (${png.length} bytes, ${W}x${H})\n`);
}

main();
