import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Dark theme, generated from the light stylesheets.
 *
 * The app's CSS uses many literal colours. Rather than hand-maintaining a parallel dark sheet that
 * drifts out of date, this reads the light CSS and, for every rule that sets a colour, emits the
 * same rule under :root[data-theme="dark"] with the colour mapped by its role:
 * light backgrounds → dark surfaces, dark text → light text, borders dimmed, saturated accents kept.
 * Light mode is untouched; the extra selector specificity makes the dark rules win when active.
 */

const darkRoot = ':root[data-theme="dark"]'
const colorPattern = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\bwhite\b/g

// Hand-picked values for the shared custom properties, which most newer rules use via var().
const rootTokens = `${darkRoot} { color-scheme: dark; --ink: #e2ebe7; --muted: #92a19c; --line: #2b3532; --paper: #101514; --teal: #1f9e8d; --teal-soft: #173833; --coral: #f08a70; --gold: #d9a24b; --blue: #7aa7e6; }`

type Role = 'bg' | 'fg' | 'border' | 'shadow'

const neutralHue = 165
const neutralSaturation = 0.08
type Rgba = { r: number; g: number; b: number; a: number }

function parseColor(literal: string): Rgba {
  const hex = literal === 'white' ? 'ffffff' : literal.slice(1)
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16), a: full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1 }
}

function toHsl({ r, g, b }: Rgba) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4
  return { h: h * 60, s, l }
}

function fromHsl(h: number, s: number, l: number, a: number) {
  const clamp = (value: number) => Math.min(1, Math.max(0, value))
  const [sc, lc] = [clamp(s), clamp(l)]
  const k = (n: number) => (n + h / 30) % 12
  const f = (n: number) => lc - sc * Math.min(lc, 1 - lc) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  const hex = (value: number) => Math.round(clamp(value) * 255).toString(16).padStart(2, '0')
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}${a < 1 ? hex(a) : ''}`
}

/** The dark counterpart of one literal colour, by the role it plays in its declaration. */
export function darkColor(literal: string, role: Role) {
  const color = parseColor(literal)
  const { h: rawHue, s: rawSaturation, l } = toHsl(color)
  // Greys and whites pick up the brand's faint green-teal tint so dark surfaces match the page.
  const isNeutral = rawSaturation < 0.12
  const h = isNeutral ? neutralHue : rawHue
  const s = isNeutral ? neutralSaturation : rawSaturation
  if (role === 'shadow') return fromHsl(0, 0, 0, Math.min(1, color.a * 1.8))
  const isAccent = s > 0.35 && l < 0.72
  if (role === 'bg') {
    // Solid accents (buttons, dots, toasts, overlays) keep their colour; light surfaces go dark,
    // keeping a little of their hue so status tints stay recognisable.
    if (l < 0.45 || isAccent) return literal
    return fromHsl(h, isNeutral ? s : Math.min(s * 0.45, 0.35), Math.min(0.3, 0.1 + (1 - l) * 0.85), color.a)
  }
  if (role === 'fg') {
    if (l > 0.97 && isNeutral) return literal // white text on coloured buttons stays white
    if (l < 0.62) return s > 0.28 ? fromHsl(h, Math.min(s, 0.6), 0.72, color.a) : fromHsl(h, s * 0.6, 1 - l * 0.8, color.a)
    return fromHsl(h, s * 0.6, Math.min(0.62, Math.max(0.32, 1.35 - l * 1.2)), color.a)
  }
  if (l < 0.5) return literal
  return fromHsl(h, s * 0.5, Math.min(0.34, 0.16 + (1 - l) * 0.9), color.a)
}

function roleOf(property: string): Role | null {
  if (property.startsWith('background')) return 'bg'
  if (property === 'color' || property === 'fill' || property === 'stroke' || property === 'caret-color') return 'fg'
  if (property.startsWith('border') || property.startsWith('outline')) return 'border'
  if (property === 'box-shadow' || property === 'text-shadow') return 'shadow'
  return null
}

/** Splits on a separator only at the top level, so commas inside :is(a, b) or rgba() survive. */
function splitTopLevel(text: string, separator: string) {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === separator && depth === 0) { parts.push(current); current = '' } else current += char
  }
  if (current.trim()) parts.push(current)
  return parts
}

function darkSelector(selector: string) {
  const trimmed = selector.trim()
  if (trimmed.startsWith(':root')) return darkRoot + trimmed.slice(':root'.length)
  if (trimmed === 'html') return darkRoot
  return `${darkRoot} ${trimmed}`
}

function darkDeclarations(block: string) {
  return splitTopLevel(block, ';').flatMap((declaration) => {
    const colon = declaration.indexOf(':')
    if (colon < 0) return []
    const property = declaration.slice(0, colon).trim().toLowerCase()
    const value = declaration.slice(colon + 1)
    const role = roleOf(property)
    if (!role || property.startsWith('--') || value.includes('url(') || !colorPattern.test(value)) return []
    colorPattern.lastIndex = 0
    return [`${property}: ${value.trim().replace(colorPattern, (literal) => darkColor(literal, role))}`]
  })
}

/** Walks a (possibly nested) block of CSS and returns the dark rules for it. */
function transform(css: string): string {
  const output: string[] = []
  let index = 0
  while (index < css.length) {
    const open = css.indexOf('{', index)
    const semicolon = css.indexOf(';', index)
    // Block-less at-rules such as @import are skipped.
    if (semicolon !== -1 && (open === -1 || semicolon < open) && css.slice(index, semicolon).trim().startsWith('@')) { index = semicolon + 1; continue }
    if (open === -1) break
    const prelude = css.slice(index, open).trim()
    let depth = 1
    let close = open + 1
    while (close < css.length && depth > 0) { if (css[close] === '{') depth += 1; if (css[close] === '}') depth -= 1; close += 1 }
    const body = css.slice(open + 1, close - 1)
    index = close
    if (prelude.startsWith('@keyframes') || prelude.startsWith('@font-face')) continue
    if (prelude.startsWith('@')) {
      const inner = transform(body)
      if (inner) output.push(`${prelude} { ${inner} }`)
      continue
    }
    // Rules already written for the dark theme hold dark colours; converting them again would
    // treat those as light colours and wash them out.
    const selectors = splitTopLevel(prelude, ',').filter((selector) => !selector.includes(darkRoot))
    const declarations = selectors.length ? darkDeclarations(body) : []
    if (declarations.length) output.push(`${selectors.map(darkSelector).join(', ')} { ${declarations.join('; ')} }`)
  }
  return output.join('\n')
}

/** Dark stylesheet for the given light CSS sources, in order. */
export function generateDarkCss(sources: string[]) {
  const stripped = sources.map((css) => css.replace(/\/\*[\s\S]*?\*\//g, ''))
  return [rootTokens, ...stripped.map(transform)].join('\n')
}

const virtualId = 'virtual:dark-theme.css'
const resolvedId = '\0dark-theme.css'

/**
 * Serves the generated dark sheet as `import 'virtual:dark-theme.css'` and regenerates it when a
 * source stylesheet changes, so dark mode never falls behind edits to the light CSS.
 */
export function darkThemePlugin(sourceFiles: string[]): Plugin {
  const files = sourceFiles.map((file) => resolve(file))
  return {
    name: 'raj-pg-dark-theme',
    resolveId: (id) => (id === virtualId ? resolvedId : null),
    load(id) {
      if (id !== resolvedId) return null
      files.forEach((file) => this.addWatchFile(file))
      return generateDarkCss(files.map((file) => readFileSync(file, 'utf8')))
    },
    handleHotUpdate({ file, server, modules }) {
      if (!files.includes(resolve(file))) return
      const darkModule = server.moduleGraph.getModuleById(resolvedId)
      if (!darkModule) return
      server.moduleGraph.invalidateModule(darkModule)
      return [...modules, darkModule]
    },
  }
}
