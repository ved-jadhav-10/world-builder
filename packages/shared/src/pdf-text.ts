/*
 * PDFs here use the standard fonts every reader has, which hold Western European text
 * (Windows-1252). Anything else is turned into the nearest plain letter, or "?", rather than
 * coming out as garbage.
 */

/** The characters Windows-1252 has beyond Latin-1, by their Unicode value. */
const CP1252_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

const isWinAnsi = (code: number) =>
  code === 0x09 ||
  code === 0x0a ||
  (code >= 0x20 && code <= 0x7e) ||
  (code >= 0xa0 && code <= 0xff) ||
  CP1252_EXTRA.has(code);

/** Letters that have no accent to strip but still have a plain look-alike. */
const LOOKALIKES: Record<string, string> = {
  ł: 'l',
  Ł: 'L',
  đ: 'd',
  Đ: 'D',
  ħ: 'h',
  Ħ: 'H',
  ı: 'i',
  ŧ: 't',
  Ŧ: 'T',
};

/** Text a standard PDF font can show. */
export function toWinAnsi(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (isWinAnsi(code)) {
      out += char;
    } else if (LOOKALIKES[char]) {
      out += LOOKALIKES[char];
    } else if (code === 0x2192) {
      out += '->';
    } else if (code === 0x2212) {
      out += '-';
    } else if (code === 0x00a0 || (code >= 0x2000 && code <= 0x200a) || code === 0x202f) {
      out += ' ';
    } else if (code === 0x200b || code === 0x200c || code === 0x200d || code === 0xfeff) {
      // Invisible characters: nothing to show.
    } else {
      // The letter without its accent, when there is one; otherwise a question mark.
      const base = char.normalize('NFKD').replace(/\p{M}/gu, '');
      out += base && [...base].every((c) => isWinAnsi(c.codePointAt(0)!)) ? base : '?';
    }
  }
  return out;
}
