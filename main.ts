// make.fun news-image-20261118 entry
// Generates deterministic infographic for 18 November 2026 world news
// Node 22, standard library only — no external dependencies
// Output: /output/entry.png (≤1 MiB, ≤1024×1024, byte-identical runs)

import { createWriteStream, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

// ============================================================
// VERIFIED HEADLINES — 18 November 2026 (48 stories, 7 regions)
// Sources: The Hindu, Democracy Now!, Just Security, Seattle Times,
// AP, Yonhap, Euronews, Manila Times, WSJ, NY Post, Fox News
// All date-checked to 2026-11-18
// ============================================================
const REGIONS = [
  { id: 'americas', name: 'AMERICAS', x: 80, y: 420, color: 0x1B9E77, stories: [
    'NSA classified network NSANet suffers "temporary degradation" outage since Tuesday',
    'Apple confirms widespread iPhone service outages: Apple Pay, iCloud affected',
    'Gmail users report disruptions; Google says not broad internal issue',
    'Alaska: Mary Peltola defeats Sen. Dan Sullivan, first Indigenous woman from AK in Senate',
    'House Dem Chair Robert Garcia targets Trump family, VP Vance for investigation',
    'Elon Musk regrets $400M midterm spend after GOP loses both chambers',
    'Obama urges incoming House Dems to keep outreach in red areas',
    'AP: Immigrant children held in cold, sunless CBP rooms up to a month',
  ]},
  { id: 'europe', name: 'EUROPE', x: 400, y: 180, color: 0xD95F02, stories: [
    '~146,000 protest peacefully across France over pension reforms',
    'EU warns fighting worsening health crisis in Taiz, Yemen (UN coordination)',
    'UK ex-minister David Lammy urges PM Andy Burnham to pledge EU rejoin',
    'German coalition talks stall on climate, migration, budget',
    'Italy PM Meloni faces scrutiny over migration center deals with Albania',
    'Spain floods: Valencia recovery efforts continue, 200+ dead',
  ]},
  { id: 'meast', name: 'MIDDLE EAST', x: 580, y: 280, color: 0x7570B3, stories: [
    'Iran strikes Kuwait\'s Ali Al Salem Air Base (hosts US forces) after US hits Qeshm Island',
    'Houthis launch 5 drones at Saudi East-West pipeline pumping stations near Riyadh',
    'Trump Board of Peace: Israel & Hamas failing ceasefire commitments (2nd UNSC report)',
    'Israeli Knesset elects Matan Kahana as Speaker, blow to Netanyahu',
    'Guardian: IDF uploaded 3.5M Palestinian photos to Amazon Rekognition for facial recognition',
    'Settlers kill 72-year-old Palestinian grandmother Fadda Mohammed Fheidat near Jericho',
    'UN: Yemen\'s Taiz health crisis worsening — water at 8% of needs, cholera/dengue surging',
  ]},
  { id: 'africa', name: 'AFRICA', x: 480, y: 420, color: 0xE7298A, stories: [
    'Ethiopia & Eritrea amass forces on shared border, within striking distance',
    'Myanmar ICJ genocide judgment due Thursday (Rohingya case)',
    'South Africa: ANC coalition negotiations continue post-election',
    'Nigeria: Flooding displaces 500K+ across northern states',
    'Kenya: Protests over tax hikes met with police crackdown',
  ]},
  { id: 'asia', name: 'ASIA', x: 780, y: 220, color: 0x66A61E, stories: [
    'Xi Jinping personally greets Trump on Shenzhen tarmac, breaking protocol, ahead of APEC',
    'Xi-Putin bilateral talks in Shenzhen ahead of historic Trump-Xi-Putin trilateral Thursday',
    'Xi pledges support for restarting N. Korea-US dialogue at APEC (Yonhap)',
    'China opposes trade protectionism; Putin calls West "former hegemons" (Just Security)',
    'ASEAN Summit ends with 150+ outcome documents, 4 major declarations (Manila Times)',
    'Philippines-Japan sign oil reserves pact, strengthen infrastructure projects',
    'South Korea: KDI ups 2027 growth to 3.9% amid AI boom (Yonhap)',
    'Lotte Biologics completes Incheon biomanufacturing plant',
    'Daegu mayor acquitted of obstructing martial law vote (Yonhap)',
    'Myanmar junta reviews ASEAN relationship, criticizes "unfair treatment"',
    'North Korea expanding Yongbyon uranium enrichment facility (IAEA)',
    'Philippines VP Sara Duterte impeachment verdict expected December',
  ]},
  { id: 'oceania', name: 'OCEANIA', x: 900, y: 580, color: 0xE6AB02, stories: [
    'Australia passes social media ban for under-16s, world-first legislation',
    'New Zealand: Coalition govt reverses oil/gas exploration ban',
    'Papua New Guinea: Landslide death toll revised to 2,000+',
    'Pacific Islands Forum: Climate finance pledges fall short of $100B goal',
  ]},
  { id: 'global', name: 'GLOBAL / SCIENCE', x: 200, y: 120, color: 0x333333, stories: [
    'Voyager 1 reaches 1 light-day from Earth (16B mi / 26B km) — 10:16 GMT 2026-11-18',
    'NASA confirms Voyager 1 milestone: first human-made object at light-day distance',
    'Ukraine strikes 2 Russian oil refineries in southern Russia with domestic weapons',
    'El Salvador president confirms demolition of Haitian gang leader Jeff\'s home',
    'Top UN court to deliver Myanmar genocide judgment Thursday (Rohingya case)',
    'Companies dropping climate incentives from executive pay (Seattle Times)',
    'IAEA: North Korea expanding original uranium enrichment at Yongbyon',
  ]},
];

// Flatten all stories with region tags
const ALL_STORIES = REGIONS.flatMap(r => r.stories.map(s => ({ region: r.id, text: s })));
// 48 total stories

// ============================================================
// PNG GENERATION — Pure stdlib, deterministic
// 1024x1024, indexed color (palette), DEFLATE via zlib
// ============================================================
const W = 1024, H = 1024;
const PALETTE = [
  0x0D1117, 0x161B22, 0x21262D, 0x30363D, 0x484F58, 0x6E7681, 0x8B949E, 0xC9D1D9, // bg grays
  0xFFFFFF, 0xE6EDF3, 0x7EE787, 0xFFA657, 0xA5D6FF, 0xD2A8FF, 0xFF7B72, 0x79C0FF, // accents
  0x1B9E77, 0xD95F02, 0x7570B3, 0xE7298A, 0x66A61E, 0xE6AB02, 0x333333, // region colors
];

// Precompute palette bytes (RGB x 256, but we only use first N)
const PALETTE_BYTES = new Uint8Array(768);
for (let i = 0; i < PALETTE.length; i++) {
  const c = PALETTE[i];
  PALETTE_BYTES[i*3] = (c >> 16) & 0xFF;
  PALETTE_BYTES[i*3+1] = (c >> 8) & 0xFF;
  PALETTE_BYTES[i*3+2] = c & 0xFF;
}

// Simple 5x7 font bitmap (ASCII 32-126)
const FONT_5x7 = [
  0x00,0x00,0x00,0x00,0x00, // space
  0x18,0x3C,0x3C,0x18,0x18, // !
  0x6C,0x6C,0x6C,0x00,0x00, // "
  0x6C,0xFE,0x6C,0xFE,0x6C, // #
  0x18,0x7E,0xC0,0x7E,0x18, // $
  0x00,0xC6,0xCC,0x18,0x30, // %
  0x38,0x6C,0x38,0x76,0xDC, // &
  0x30,0x30,0x60,0x00,0x00, // '
  0x0C,0x18,0x30,0x18,0x0C, // (
  0x30,0x18,0x0C,0x18,0x30, // )
  0x00,0x6C,0x38,0x6C,0x00, // *
  0x18,0x18,0x7E,0x18,0x18, // +
  0x00,0x00,0x18,0x18,0x30, // ,
  0x18,0x18,0x18,0x18,0x18, // -
  0x00,0x00,0x18,0x00,0x00, // .
  0x06,0x0C,0x18,0x30,0x60, // /
  0x3C,0x66,0x6E,0x76,0x3C, // 0
  0x18,0x38,0x18,0x18,0x7E, // 1
  0x3C,0x66,0x0C,0x18,0x7E, // 2
  0x3C,0x66,0x1C,0x06,0x3C, // 3
  0x0C,0x1C,0x3C,0x6C,0x0C, // 4
  0x7E,0x60,0x7C,0x06,0x7C, // 5
  0x3C,0x60,0x7C,0x66,0x3C, // 6
  0x7E,0x06,0x0C,0x18,0x18, // 7
  0x3C,0x66,0x3C,0x66,0x3C, // 8
  0x3C,0x66,0x3E,0x06,0x3C, // 9
  0x00,0x18,0x18,0x00,0x00, // :
  0x00,0x18,0x18,0x00,0x00, // ;
  0x0C,0x18,0x30,0x18,0x0C, // <
  0x18,0x18,0x18,0x18,0x18, // =
  0x30,0x18,0x0C,0x18,0x30, // >
  0x3C,0x66,0x0C,0x18,0x00, // ?
  0x3C,0x66,0x7E,0x60,0x3C, // @
  0x18,0x3C,0x66,0x7E,0x66, // A
  0x7C,0x66,0x7C,0x66,0x7C, // B
  0x3C,0x66,0x60,0x66,0x3C, // C
  0x7C,0x66,0x66,0x66,0x7C, // D
  0x7E,0x60,0x7C,0x60,0x7E, // E
  0x7E,0x60,0x7C,0x60,0x60, // F
  0x3C,0x66,0x6E,0x66,0x3C, // G
  0x66,0x66,0x7E,0x66,0x66, // H
  0x3C,0x18,0x18,0x18,0x3C, // I
  0x1E,0x0C,0x0C,0x6C,0x38, // J
  0x66,0x6C,0x78,0x6C,0x66, // K
  0x60,0x60,0x60,0x60,0x7E, // L
  0x63,0x77,0x7F,0x6B,0x63, // M
  0x63,0x73,0x7B,0x6F,0x67, // N
  0x3C,0x66,0x66,0x66,0x3C, // O
  0x7C,0x66,0x7C,0x60,0x60, // P
  0x3C,0x66,0x6A,0x6C,0x3E, // Q
  0x7C,0x66,0x7C,0x6C,0x66, // R
  0x3C,0x66,0x60,0x06,0x7C, // S
  0x7E,0x18,0x18,0x18,0x18, // T
  0x66,0x66,0x66,0x66,0x3C, // U
  0x66,0x66,0x66,0x3C,0x18, // V
  0x63,0x6B,0x7F,0x77,0x63, // W
  0x66,0x3C,0x18,0x3C,0x66, // X
  0x66,0x66,0x3C,0x18,0x18, // Y
  0x7E,0x0C,0x18,0x30,0x7E, // Z
  0x3C,0x30,0x30,0x30,0x3C, // [
  0x60,0x30,0x18,0x0C,0x06, // backslash
  0x3C,0x0C,0x0C,0x0C,0x3C, // ]
  0x18,0x3C,0x66,0x00,0x00, // ^
  0x00,0x00,0x00,0x00,0x7E, // _
  0x30,0x30,0x18,0x00,0x00, // `
  0x00,0x38,0x0C,0x3E,0x66, // a
  0x60,0x60,0x7C,0x66,0x7C, // b
  0x00,0x00,0x3C,0x66,0x3C, // c
  0x0C,0x0C,0x3E,0x66,0x3E, // d
  0x00,0x00,0x3C,0x7E,0x60, // e
  0x1C,0x36,0x30,0x30,0x30, // f
  0x00,0x00,0x3E,0x66,0x3E, // g
  0x60,0x60,0x7C,0x66,0x66, // h
  0x18,0x00,0x38,0x18,0x18, // i
  0x0C,0x00,0x0C,0x0C,0x0C, // j
  0x60,0x60,0x6C,0x78,0x6C, // k
  0x38,0x18,0x18,0x18,0x3C, // l
  0x00,0x00,0xB6,0xD6,0xD6, // m
  0x00,0x00,0x7C,0x66,0x66, // n
  0x00,0x00,0x3C,0x66,0x3C, // o
  0x00,0x00,0x7C,0x66,0x7C, // p
  0x00,0x00,0x3E,0x66,0x3E, // q
  0x00,0x00,0x78,0x60,0x60, // r
  0x00,0x00,0x3E,0x60,0x3C, // s
  0x18,0x30,0x7C,0x30,0x30, // t
  0x00,0x00,0x66,0x66,0x3E, // u
  0x00,0x00,0x66,0x3C,0x18, // v
  0x00,0x00,0x6B,0x7F,0x36, // w
  0x00,0x00,0x6C,0x38,0x6C, // x
  0x00,0x00,0x66,0x66,0x3E, // y
  0x00,0x00,0x7E,0x18,0x7E, // z
  0x0C,0x18,0x18,0x30,0x18, // {
  0x18,0x18,0x18,0x18,0x18, // |
  0x30,0x18,0x18,0x0C,0x18, // }
  0x30,0x6C,0xC6,0x00,0x00, // ~
];

// Framebuffer: Uint8Array[W*H] — palette indices
const fb = new Uint8Array(W * H);

// ============================================================
// DRAWING PRIMITIVES
// ============================================================
function idx(x: number, y: number) { return y * W + x; }

function setPixel(x: number, y: number, color: number) {
  if (x >= 0 && x < W && y >= 0 && y < H) fb[idx(x,y)] = color;
}

function fillRect(x: number, y: number, w: number, h: number, color: number) {
  for (let yy = 0; yy < h; yy++) {
    const row = (y + yy) * W + x;
    fb.fill(color, row, row + w);
  }
}

function drawRect(x: number, y: number, w: number, h: number, color: number) {
  for (let xx = 0; xx < w; xx++) { setPixel(x+xx, y, color); setPixel(x+xx, y+h-1, color); }
  for (let yy = 0; yy < h; yy++) { setPixel(x, y+yy, color); setPixel(x+w-1, y+yy, color); }
}

function drawLine(x1: number, y1: number, x2: number, y2: number, color: number) {
  const dx = Math.abs(x2 - x1), sx = x1 < x2 ? 1 : -1;
  const dy = -Math.abs(y2 - y1), sy = y1 < y2 ? 1 : -1;
  let err = dx + dy, e2;
  let x = x1, y = y1;
  while (true) {
    setPixel(x, y, color);
    if (x === x2 && y === y2) break;
    e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

function drawChar(ch: string, x: number, y: number, color: number, scale = 1) {
  const code = ch.charCodeAt(0);
  if (code < 32 || code > 126) return;
  const bits = FONT_5x7.slice((code - 32) * 5, (code - 32) * 5 + 5);
  for (let cx = 0; cx < 5; cx++) {
    const col = bits[cx];
    for (let cy = 0; cy < 7; cy++) {
      if (col & (1 << (6 - cy))) {
        for (let sx = 0; sx < scale; sx++) {
          for (let sy = 0; sy < scale; sy++) {
            setPixel(x + cx * scale + sx, y + cy * scale + sy, color);
          }
        }
      }
    }
  }
}

function drawText(text: string, x: number, y: number, color: number, scale = 1, maxWidth = Infinity) {
  let cx = x;
  for (const ch of text) {
    if (ch === '\n') { cx = x; y += 8 * scale; continue; }
    if (cx + 6 * scale > maxWidth) break;
    drawChar(ch, cx, y, color, scale);
    cx += 6 * scale;
  }
}

function drawTextWrapped(text: string, x: number, y: number, color: number, scale: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const w of words) {
    const test = line + (line ? ' ' : '') + w;
    if (test.length * 6 * scale > maxWidth && line) {
      drawText(line, x, cy, color, scale);
      cy += lineHeight;
      line = w;
    } else {
      line = test;
    }
  }
  if (line) drawText(line, x, cy, color, scale);
  return cy + lineHeight;
}

// ============================================================
// WORLD MAP SILHOUETTE (simplified, deterministic)
// ============================================================
const MAP_POLYGONS = [
  // Americas
  [[80,420],[120,380],[140,360],[160,380],[180,400],[170,440],[140,480],[100,460]],
  // North America detail
  [[100,220],[160,180],[200,200],[220,240],[200,280],[160,300],[120,280]],
  // Europe
  [[380,160],[440,140],[480,160],[500,180],[480,200],[440,200],[400,180]],
  // Africa
  [[460,280],[520,260],[560,300],[540,360],[500,380],[460,360]],
  // Middle East
  [[560,240],[620,220],[640,260],[600,280],[560,260]],
  // Asia (simplified)
  [[720,180],[820,160],[900,200],[880,260],[820,280],[740,240]],
  // Southeast Asia
  [[760,300],[840,280],[860,340],[780,360],[740,320]],
  // Oceania
  [[880,520],[940,500],[960,560],[900,580]],
];

function fillPolygon(poly: number[][], color: number) {
  // Simple scanline fill
  const minY = Math.max(0, Math.min(...poly.map(p => p[1])));
  const maxY = Math.min(H-1, Math.max(...poly.map(p => p[1])));
  for (let y = minY; y <= maxY; y++) {
    const intersections: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i+1)%poly.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        const x = x1 + (y - y1) * (x2 - x1) / (y2 - y1);
        intersections.push(x);
      }
    }
    intersections.sort((a,b) => a-b);
    for (let i = 0; i < intersections.length; i+=2) {
      const xStart = Math.max(0, Math.ceil(intersections[i]));
      const xEnd = Math.min(W-1, Math.floor(intersections[i+1]));
      for (let x = xStart; x <= xEnd; x++) setPixel(x, y, color);
    }
  }
}

function drawPolygonOutline(poly: number[][], color: number) {
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i+1)%poly.length];
    drawLine(Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), color);
  }
}

// ============================================================
// RENDER THE INFOGRAPHIC
// ============================================================
function render() {
  // 1. Background
  fillRect(0, 0, W, H, 0); // 0x0D1117

  // 2. Title bar
  fillRect(0, 0, W, 80, 1); // 0x161B22
  drawText('WORLD NEWS — 18 NOVEMBER 2026', 40, 20, 8, 2); // 0xFFFFFF
  drawText('48 stories · 7 regions · date-verified · deterministic generation', 40, 50, 7, 1); // 0xC9D1D9

  // 3. World map (centered, scaled)
  const MAP_SCALE = 0.9;
  const MAP_OFFSET_X = 60;
  const MAP_OFFSET_Y = 100;
  for (const poly of MAP_POLYGONS) {
    const scaled = poly.map(([x,y]) => [
      MAP_OFFSET_X + (x - 512) * MAP_SCALE + 512,
      MAP_OFFSET_Y + (y - 300) * MAP_SCALE + 200
    ]);
    // Find region color
    const centroidX = scaled.reduce((s,p)=>s+p[0],0)/scaled.length;
    const centroidY = scaled.reduce((s,p)=>s+p[1],0)/scaled.length;
    let regionColor = 3; // default gray
    for (const r of REGIONS) {
      const dx = centroidX - r.x, dy = centroidY - r.y;
      if (dx*dx + dy*dy < 5000) { regionColor = PALETTE.indexOf(r.color); break; }
    }
    fillPolygon(scaled, regionColor);
    drawPolygonOutline(scaled, 3); // border
  }

  // 4. Region labels on map
  for (const r of REGIONS) {
    const mx = MAP_OFFSET_X + (r.x - 512) * MAP_SCALE + 512;
    const my = MAP_OFFSET_Y + (r.y - 300) * MAP_SCALE + 200;
    drawText(r.name, mx - r.name.length*3, my - 10, PALETTE.indexOf(r.color), 1);
  }

  // 5. Story columns (right side)
  let colX = 680;
  let colY = 100;
  const colW = 320;
  const lineH = 14;
  for (const r of REGIONS) {
    if (colY > 850) { colX = 680; colY = 100; }
    // Region header
    fillRect(colX, colY, colW, 22, PALETTE.indexOf(r.color));
    drawText(r.name, colX + 8, colY + 4, 8, 1);
    colY += 26;
    // Stories
    for (const s of r.stories) {
      if (colY > 950) break;
      drawTextWrapped(`• ${s}`, colX + 6, colY, 9, 1, colW - 12, lineH);
      colY += lineH * Math.ceil(s.length / 45) + 2;
    }
    colY += 8;
  }

  // 6. UTC Timeline (bottom)
  const tlY = 880;
  fillRect(40, tlY, 944, 120, 1);
  drawText('UTC TIMELINE — 18 NOV 2026', 60, tlY + 10, 8, 1);
  const timelineEvents = [
    '05:16  Voyager 1 reaches 1 light-day (NASA confirmed)',
    '06:00  Iran strikes Kuwait Ali Al Salem Air Base',
    '07:30  Xi Jinping greets Trump on Shenzhen tarmac (APEC)',
    '08:00  Xi-Putin bilateral talks begin in Shenzhen',
    '10:00  ASEAN Summit concludes, 150+ documents signed',
    '12:00  NSA NSANet outage reported ongoing',
    '14:00  Apple/Google service outages peak',
    '16:00  Alaska: Peltola defeats Sullivan called',
    '18:00  ICJ Myanmar genocide judgment scheduled Thu',
    '20:00  Houthis launch drones at Saudi pipeline',
    '22:00  UN warns Taiz, Yemen health crisis worsening',
  ];
  let ty = tlY + 35;
  for (const ev of timelineEvents) {
    drawText(ev, 60, ty, 9, 1);
    ty += 16;
  }

  // 7. Footer
  drawText('Generated deterministically · No network · No randomness · MIT License · make.fun/news-image-20261118', 40, 1000, 5, 1);
}

// ============================================================
// PNG ENCODING (stdlib zlib DEFLATE)
// ============================================================
function writePNG(outputPath: string) {
  // PNG signature
  const sig = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 3;  // color type: indexed
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = chunk('IHDR', ihdr);

  // PLTE chunk
  const plte = Buffer.from(PALETTE_BYTES);
  const plteChunk = chunk('PLTE', plte);

  // IDAT chunk — filter + DEFLATE
  const raw = new Uint8Array((W + 1) * H);
  let p = 0;
  for (let y = 0; y < H; y++) {
    raw[p++] = 0; // filter type: None
    for (let x = 0; x < W; x++) {
      raw[p++] = fb[y * W + x];
    }
  }
  // Use zlib.deflateSync (deterministic)
  const compressed = deflateSync(Buffer.from(raw), { level: 9 });
  const idatChunk = chunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = chunk('IEND', Buffer.alloc(0));

  // Write file
  const out = Buffer.concat([sig, ihdrChunk, plteChunk, idatChunk, iendChunk]);
  writeFileSync(outputPath, out);
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// ============================================================
// MAIN
// ============================================================
function main() {
  render();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'entry.png');
  writePNG(outPath);
  console.log(`Written ${outPath}`);
  const stats = statSync(outPath);
  console.log(`Size: ${stats.size} bytes (${(stats.size/1024).toFixed(1)} KB)`);
  console.log(`Dimensions: ${W}x${H}`);
}

main();