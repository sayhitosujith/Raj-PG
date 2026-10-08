import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss, { type AtRule, type Container, type Rule } from 'postcss'
import type { Plugin } from 'vite'
import { generateDarkCss } from './darkThemePlugin.ts'

/**
 * The owner's theme colour for the admin pages, generated from the light stylesheet and its dark twin.
 *
 * The admin is styled in a teal-green with many fixed shades. Every rule that uses a green gets a copy
 * in which each green becomes the owner's colour (`--brand`) at the green's own saturation and
 * lightness, so tints stay tints and dark text stays dark. The copies apply only while the page root
 * carries `data-brand` (set by App when the owner has chosen a colour), once for the light view and
 * once for the dark one, with enough specificity to win over the originals. Without a chosen colour
 * nothing changes. Uses CSS relative colours: hsl(from var(--brand) h s l).
 */

const light = ':root[data-brand]:not([data-theme="dark"])'
const dark = ':root[data-brand][data-theme="dark"]'

const hexPattern = /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi
const rgbPattern = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[/,]\s*([\d.]+%?))?\s*\)/gi

type Rgb = [number, number, number]

function toHsl([r, g, b]: Rgb) {
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

// The brand's greens: yellow-green to cyan-green and tinted at all (as in scripts/neutral-portal.mjs).
function isGreen(rgb: Rgb) {
  const { h, s } = toHsl(rgb)
  return Math.max(...rgb) - Math.min(...rgb) >= 3 && s > 0 && h >= 75 && h <= 185
}

// The owner's hue at this green's lightness; saturation is capped by the brand's own, so a grey brand
// (charcoal) gives greys rather than an arbitrary hue.
function branded(rgb: Rgb, alpha?: string) {
  const { s, l } = toHsl(rgb)
  const a = alpha ? ` / ${alpha}` : ''
  return `hsl(from var(--brand) h min(s, ${Math.round(s * 100)}) ${Math.round(l * 100)}${a})`
}

/** The value with every green replaced, or null when it has none. */
function brandValue(value: string) {
  let changed = false
  let result = value.replace(hexPattern, (match, hex: string) => {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex
    const rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb
    if (!isGreen(rgb)) return match
    changed = true
    return branded(rgb, full.length === 8 ? String(Math.round(parseInt(full.slice(6), 16) / 255 * 100) / 100) : undefined)
  })
  result = result.replace(rgbPattern, (match, r: string, g: string, b: string, alpha?: string) => {
    const rgb = [r, g, b].map(Number) as Rgb
    if (!isGreen(rgb)) return match
    changed = true
    return branded(rgb, alpha)
  })
  return changed ? result : null
}

// The selector under the light or dark brand scope. A selector already written for the dark theme
// always goes to the dark scope. The resident portal has its own colours and is left out.
function scope(selector: string, view: 'light' | 'dark') {
  if (selector.includes('.portal-shell')) return null
  const isDark = view === 'dark' || selector.includes('[data-theme="dark"]')
  const prefix = isDark ? dark : light
  const root = selector.match(/^:root(\[[^\]]*\]|:not\([^)]*\))*/)
  if (root) return prefix + selector.slice(root[0].length)
  if (/^(html|body)\b/.test(selector)) return null
  return `${prefix} ${selector}`
}

function brandSheet(css: string, view: 'light' | 'dark') {
  const output = postcss.root()
  postcss.parse(css).walkRules((rule: Rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test((rule.parent as AtRule).name)) return
    const declarations = [] as ReturnType<typeof postcss.decl>[]
    rule.walkDecls((decl) => {
      const value = brandValue(decl.value)
      if (value) declarations.push(postcss.decl({ prop: decl.prop, value, important: decl.important }))
    })
    if (!declarations.length) return
    const selectors = rule.selectors.map((selector) => scope(selector.trim(), view)).filter((selector): selector is string => Boolean(selector))
    if (!selectors.length) return
    let node: Container = postcss.rule({ selectors })
    declarations.forEach((decl) => node.append(decl))
    // Keep the rule's media/container/supports wrappers so it applies at the same sizes.
    for (let parent = rule.parent; parent && parent.type === 'atrule'; parent = parent.parent) {
      node = postcss.atRule({ name: (parent as AtRule).name, params: (parent as AtRule).params }).append(node)
    }
    output.append(node)
  })
  return output.toString()
}

/** The branded light and dark copies of the given stylesheet. */
export function generateBrandCss(css: string) {
  return [brandSheet(css, 'light'), brandSheet(generateDarkCss([css]), 'dark')].join('\n')
}

const virtualId = 'virtual:admin-brand.css'
const resolvedId = '\0admin-brand.css'

/** Serves the branded sheet as `import 'virtual:admin-brand.css'`, regenerated when the source changes. */
export function brandThemePlugin(sourceFile: string): Plugin {
  const file = resolve(sourceFile)
  return {
    name: 'raj-pg-admin-brand',
    resolveId: (id) => (id === virtualId ? resolvedId : null),
    load(id) {
      if (id !== resolvedId) return null
      this.addWatchFile(file)
      return generateBrandCss(readFileSync(file, 'utf8'))
    },
    handleHotUpdate({ file: changed, server, modules }) {
      if (resolve(changed) !== file) return
      const brandModule = server.moduleGraph.getModuleById(resolvedId)
      if (!brandModule) return
      server.moduleGraph.invalidateModule(brandModule)
      return [...modules, brandModule]
    },
  }
}
