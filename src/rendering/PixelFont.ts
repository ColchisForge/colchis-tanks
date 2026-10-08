/**
 * An original 5x7 bitmap font. Each glyph is seven rows separated by '|'; '#' is a lit pixel.
 * Glyph width comes from the row length, so narrow punctuation stays narrow.
 */
const GLYPHS: Readonly<Record<string, string>> = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####',
  F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####',
  H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '###|.#.|.#.|.#.|.#.|.#.|###',
  J: '..###|...#.|...#.|...#.|#..#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
  L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
  N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.',
  T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.',
  X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
  '1': '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  '2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
  '3': '#####|...#.|..#..|...#.|....#|#...#|.###.',
  '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  '5': '#####|#....|####.|....#|....#|#...#|.###.',
  '6': '..##.|.#...|#....|####.|#...#|#...#|.###.',
  '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
  '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  '9': '.###.|#...#|#...#|.####|....#|...#.|.##..',
  ' ': '...|...|...|...|...|...|...',
  '.': '..|..|..|..|..|##|##',
  ',': '..|..|..|..|##|.#|#.',
  ':': '..|##|##|..|##|##|..',
  '!': '#|#|#|#|#|.|#',
  '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
  '-': '....|....|....|####|....|....|....',
  '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
  '=': '....|....|####|....|####|....|....',
  '/': '....#|....#|...#.|..#..|.#...|#....|#....',
  "'": '#|#|.|.|.|.|.',
  '(': '..#|.#.|#..|#..|#..|.#.|..#',
  ')': '#..|.#.|..#|..#|..#|.#.|#..',
  '>': '#...|##..|###.|####|###.|##..|#...',
  '<': '...#|..##|.###|####|.###|..##|...#',
  '%': '##...|##..#|...#.|..#..|.#...|#..##|...##',
  '*': '.....|#.#.#|.###.|#####|.###.|#.#.#|.....',
  '©': '.#####.|#.....#|#..##.#|#.#...#|#..##.#|#.....#|.#####.',
  '♥': '.#.#.|#####|#####|#####|.###.|..#..|.....',
};

interface Glyph {
  readonly width: number;
  readonly pixels: readonly (readonly [number, number])[];
}

const LETTER_SPACING = 1;

const glyphCache = new Map<string, Glyph>();

function glyphFor(char: string): Glyph {
  const key = GLYPHS[char] !== undefined ? char : GLYPHS[char.toUpperCase()] !== undefined ? char.toUpperCase() : '?';
  const cached = glyphCache.get(key);
  if (cached) return cached;
  const rows = GLYPHS[key].split('|');
  const pixels: [number, number][] = [];
  rows.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell === '#') pixels.push([x, y]);
    });
  });
  const glyph = { width: rows[0].length, pixels };
  glyphCache.set(key, glyph);
  return glyph;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TextStyle {
  readonly color: string;
  readonly scale?: number;
  readonly align?: TextAlign;
  /** Optional 1px drop shadow, scaled with the text. */
  readonly shadow?: string;
  /** Per-row colours (top to bottom) for gradient titles; overrides `color`. */
  readonly rowColors?: readonly string[];
}

export function measureText(text: string, scale = 1): number {
  let width = 0;
  for (const char of text) width += (glyphFor(char).width + LETTER_SPACING) * scale;
  return Math.max(0, width - LETTER_SPACING * scale);
}

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, style: TextStyle): void {
  const scale = style.scale ?? 1;
  const width = measureText(text, scale);
  const left = Math.round(style.align === 'center' ? x - width / 2 : style.align === 'right' ? x - width : x);
  const top = Math.round(y);
  const shadow = style.shadow;
  const offset = Math.max(1, Math.floor(scale / 2));
  if (shadow) drawRun(ctx, text, left + offset, top + offset, scale, () => shadow);

  const rows = style.rowColors;
  const colorForRow = rows && rows.length > 0 ? (row: number) => rows[Math.min(row, rows.length - 1)] : () => style.color;
  drawRun(ctx, text, left, top, scale, colorForRow);
}

function drawRun(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scale: number,
  colorForRow: (row: number) => string,
): void {
  let cursor = x;
  for (const char of text) {
    const glyph = glyphFor(char);
    for (const [px, py] of glyph.pixels) {
      ctx.fillStyle = colorForRow(py);
      ctx.fillRect(cursor + px * scale, y + py * scale, scale, scale);
    }
    cursor += (glyph.width + LETTER_SPACING) * scale;
  }
}
