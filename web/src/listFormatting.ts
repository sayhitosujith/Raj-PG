/** List styles the policy editors can apply; 'none' removes any list marker. */
export type ListStyle = 'bullet' | 'dash' | 'number' | 'letter' | 'roman' | 'none'

// A marker this module (or a person) may have put at the start of a line: •, –, -, 1., 1), a., a), iv., iv).
// Letters are single and Roman numerals must be well-formed, so words like "No.", "Mr." or "Did." survive.
const existingMarker = /^\s*(?:[•–\-▪◦]|\d{1,3}[.)]|[a-z][.)]|(?=[ivxlcdm])m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})[.)])\s+/i

function toLetters(index: number) {
  let label = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(97 + ((n - 1) % 26)) + label
  return label
}

function toRoman(index: number) {
  const numerals: Array<[number, string]> = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
  let rest = index + 1
  return numerals.reduce((label, [value, symbol]) => { while (rest >= value) { label += symbol; rest -= value } return label }, '')
}

const markers: Record<Exclude<ListStyle, 'none'>, (index: number) => string> = {
  bullet: () => '•',
  dash: () => '–',
  number: (index) => `${index + 1}.`,
  letter: (index) => `${toLetters(index)}.`,
  roman: (index) => `${toRoman(index)}.`,
}

/**
 * Re-marks every non-blank line of `text` in `style`, replacing any marker already there, so
 * switching from bullets to numbers never stacks two markers. Blank lines are kept and are not
 * counted, so "1. 2. 3." stays continuous across paragraph gaps.
 */
export function applyListStyle(text: string, style: ListStyle) {
  let index = 0
  return text.split('\n').map((line) => {
    if (!line.trim()) return line
    const content = line.replace(existingMarker, '').trimStart()
    return style === 'none' ? content : `${markers[style](index++)} ${content}`
  }).join('\n')
}
