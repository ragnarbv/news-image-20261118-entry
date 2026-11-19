// make.fun entry - deterministic PNG generator using only Node built-ins (zlib + buffer)
// Output: output/entry.png, size ≤1 MiB, dimensions ≤1024×1024

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// Constants
const WIDTH = 512;
const HEIGHT = 512;
const OUTPUT_DIR = join(process.cwd(), 'output');
const OUTPUT_FILE = join(OUTPUT_DIR, 'entry.png');

// Simple CRC32 table (IEEE polynomial)
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, data.length, false);
  const typeBytes = new TextEncoder().encode(type);
  const crc = crc32(new Uint8Array([...typeBytes, ...data]));
  const crcBytes = new Uint8Array(4);
  new DataView(crcBytes.buffer).setUint32(0, crc, false);
  return new Uint8Array([...len, ...typeBytes, ...data, ...crcBytes]);
}

// Generate deterministic pixel data - a simple gradient pattern
function generatePixels(): Uint8Array {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const idx = (y * WIDTH + x) * 3;
      // Deterministic pattern: diagonal gradient with checkerboard
      const r = (x * 255) / (WIDTH - 1);
      const g = (y * 255) / (HEIGHT - 1);
      const b = ((x + y) * 127) / (WIDTH + HEIGHT - 2);
      // Add a subtle checkerboard for visual interest
      const checker = ((x >> 4) + (y >> 4)) & 1 ? 60 : 0;
      pixels[idx] = Math.min(255, Math.round(r) + checker);
      pixels[idx + 1] = Math.min(255, Math.round(g) + checker);
      pixels[idx + 2] = Math.min(255, Math.round(b) + checker);
    }
  }
  return pixels;
}

// Encode raw pixels to PNG using zlib deflate (Up filter)
function encodePNG(pixels: Uint8Array): Uint8Array {
  const stride = WIDTH * 3;
  const filtered = new Uint8Array((stride + 1) * HEIGHT);
  
  for (let y = 0; y < HEIGHT; y++) {
    const rowStart = y * (stride + 1);
    // Filter type 0 (None) for first row, type 2 (Up) for others
    filtered[rowStart] = y === 0 ? 0 : 2;
    
    for (let i = 0; i < stride; i++) {
      const cur = pixels[y * stride + i];
      const up = y === 0 ? 0 : pixels[(y - 1) * stride + i];
      filtered[rowStart + 1 + i] = (cur - up) & 0xff;
    }
  }
  
  // Compress with zlib
  const compressed = deflateSync(Buffer.from(filtered), { level: 9 });
  
  // IHDR chunk
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, WIDTH, false);
  new DataView(ihdr.buffer).setUint32(4, HEIGHT, false);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: truecolor (RGB)
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method
  
  // PNG signature
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  
  // Assemble PNG
  const chunks = [
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', new Uint8Array(compressed)),
    makeChunk('IEND', new Uint8Array(0)),
  ];
  
  const totalLength = signature.length + chunks.reduce((sum, c) => sum + c.length, 0);
  const png = new Uint8Array(totalLength);
  let offset = 0;
  png.set(signature, offset);
  offset += signature.length;
  for (const chunk of chunks) {
    png.set(chunk, offset);
    offset += chunk.length;
  }
  
  return png;
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const pixels = generatePixels();
  const png = encodePNG(pixels);
  
  writeFileSync(OUTPUT_FILE, png);
  
  const sizeKB = (png.length / 1024).toFixed(1);
  console.log(`wrote ${OUTPUT_FILE} (${png.length} bytes, ${sizeKB} KB, ${WIDTH}x${HEIGHT})`);
  
  // Verify size constraint
  if (png.length > 1024 * 1024) {
    console.error(`ERROR: PNG size ${png.length} exceeds 1 MiB limit`);
    process.exit(1);
  }
  if (WIDTH > 1024 || HEIGHT > 1024) {
    console.error(`ERROR: Dimensions ${WIDTH}x${HEIGHT} exceed 1024x1024 limit`);
    process.exit(1);
  }
  
  console.log('OK: PNG meets all constraints');
}

main();