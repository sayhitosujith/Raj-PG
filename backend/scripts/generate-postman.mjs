// Builds the Postman collection in ../api from the Express routes in src, so it can be regenerated
// whenever routes change: `npm run postman` (from backend/). Read-only over the source; it never runs the app.
//
// What it reads, per route:
// - method and path: `app.<method>('/api/…'` in server.ts, and `<name>Router.<method>('/…'` elsewhere,
//   which server.ts mounts at /api (it mounts every router there);
// - body fields: the keys of `request.body as { … }` and of `const { … } = request.body` in the handler;
// - query parameters: `request.query.<name>` in the handler, added switched off;
// - description: the comment block just above the route.
// Sign-in is cookie based for the web app and token based for the mobile app; the collection
// supports both (see README in ../api).
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, '..', 'src')
const outDir = join(here, '..', '..', 'api')

const routePattern = /\b(app|[A-Za-z]+Router)\.(get|post|put|patch|delete)\(\s*'([^']+)'/g
// settings.ts builds the logo and UPI QR routes with a helper rather than literal paths.
const imageRoutePattern = /imageSettingRoutes\(\s*'([^']+)'/g

/** The comment block (// lines or /** *\/) ending on the line above `index`, as plain text. */
function commentAbove(source, index) {
  const lines = source.slice(0, index).split('\n')
  lines.pop() // the route's own line
  const picked = []
  while (lines.length) {
    const line = lines.pop().trim()
    if (line.startsWith('//')) picked.unshift(line.replace(/^\/\/\s?/, ''))
    else if (line.startsWith('*') || line.startsWith('/**') || line.endsWith('*/')) picked.unshift(line.replace(/^\/\*\*?|\*\/$|^\*\s?/g, '').trim())
    else break
  }
  return picked.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

/** A sample value for a field from its TypeScript type, so the body shows what to send. */
function sampleFor(type = '') {
  const t = type.trim()
  if (/^(number|bigint)\b/.test(t)) return 0
  if (/^boolean\b/.test(t)) return false
  if (/\[\]$|^Array</.test(t)) return []
  if (/^(Record<|\{)/.test(t)) return {}
  return ''
}

/** The text between the brace at `open` and its matching close, or null. */
function balancedBlock(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1
    else if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i)
  }
  return null
}

/** The fields of an object type's body ("a?: string; b: { c: number }"), split only at the top level. */
function objectTypeFields(block) {
  const fields = {}
  const clean = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  let depth = 0, start = 0
  const entries = []
  for (let i = 0; i <= clean.length; i += 1) {
    const char = clean[i]
    if ('{[(<'.includes(char)) depth += 1
    else if ('}])>'.includes(char)) depth -= 1
    else if (i === clean.length || (depth === 0 && (char === ';' || char === '\n' || char === ','))) { entries.push(clean.slice(start, i)); start = i + 1 }
  }
  for (const entry of entries) {
    const match = entry.trim().match(/^(?:readonly\s+)?([A-Za-z_]\w*)\??\s*:\s*([\s\S]+)$/)
    if (match) fields[match[1]] ??= sampleFor(match[2])
  }
  return fields
}

// Named body types (`request.body as ResidentBody`) are resolved the way TypeScript would: in the
// handler's own file first, then through that file's imports. Two files can declare the same name
// (IdentityInput does), so a global lookup would pick the wrong one.
const sources = new Map(readdirSync(srcDir).filter((name) => name.endsWith('.ts') && !name.includes('.tmp.')).map((name) => [name, readFileSync(join(srcDir, name), 'utf8')]))

/** `text` split at `separator` only where no bracket of any kind is open. */
function splitTopLevel(text, separator) {
  const parts = []
  let depth = 0, start = 0
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if ('{[(<'.includes(char)) depth += 1
    else if ('}])>'.includes(char)) depth -= 1
    else if (depth === 0 && char === separator) { parts.push(text.slice(start, i)); start = i + 1 }
  }
  parts.push(text.slice(start))
  return parts.map((part) => part.trim()).filter(Boolean)
}

/** The right-hand side of `type <name> =` (to its end at depth 0), `interface <name>` as `{…}`, or `const <name> =`, with the file it is in. */
function findDeclaration(name, file, seen = new Set()) {
  if (seen.has(`${file}:${name}`) || !sources.has(file)) return null
  seen.add(`${file}:${name}`)
  const source = sources.get(file)
  const declaration = source.match(new RegExp(`\\b(type|const)\\s+${name}\\s*=\\s*|\\binterface\\s+${name}\\s*`))
  if (declaration) {
    const start = declaration.index + declaration[0].length
    if (!declaration[1]) return { file, text: `{${balancedBlock(source, source.indexOf('{', start)) ?? ''}}` }
    let depth = 0, end = start
    for (; end < source.length; end += 1) {
      const char = source[end]
      if ('{[(<'.includes(char)) depth += 1
      else if ('}])>'.includes(char)) depth -= 1
      else if (depth === 0 && char === '\n' && !/^\s*[&|]/.test(source.slice(end + 1, end + 40))) break
    }
    return { file, text: source.slice(start, end).trim() }
  }
  for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/([\w-]+)\.js'/g)) {
    const names = match[1].split(',').map((part) => part.replace(/\btype\s+/, '').trim().split(/\s+as\s+/)[0])
    if (names.includes(name)) return findDeclaration(name, `${match[2]}.ts`, seen)
  }
  return null
}

/** The string keys in a union type: literals, named unions, and `(typeof list)[number]` of an `as const` list. */
function unionKeys(expression, file) {
  const keys = []
  for (const part of splitTopLevel(expression, '|')) {
    const literal = part.match(/^'([^']+)'$/)
    const listOf = part.match(/^\(typeof\s+([A-Za-z_]\w*)\)\[number\]$/)
    if (literal) keys.push(literal[1])
    else if (listOf) {
      const list = findDeclaration(listOf[1], file)
      if (list) keys.push(...[...list.text.matchAll(/'([^']+)'/g)].map((m) => m[1]))
    } else if (/^[A-Za-z_]\w*$/.test(part)) {
      const alias = findDeclaration(part, file)
      if (alias) keys.push(...unionKeys(alias.text, alias.file))
    }
  }
  return keys
}

/** Fields of a type expression: `{…}`, `Record<Keys, T>`, a named type, `Partial<…>`, or any of these joined with `&`. */
function typeFields(expression, file, depth = 0) {
  const fields = {}
  if (depth > 8) return fields
  for (let part of splitTopLevel(expression, '&')) {
    const wrapper = part.match(/^(?:Partial|Required|Readonly)<([\s\S]*)>$/)
    if (wrapper) part = wrapper[1].trim()
    if (part.startsWith('{')) Object.assign(fields, objectTypeFields(balancedBlock(part, 0) ?? ''))
    else if (part.startsWith('Record<')) {
      const [keys, value = ''] = splitTopLevel(part.slice('Record<'.length, -1), ',')
      for (const key of unionKeys(keys, file)) fields[key] ??= sampleFor(value)
    } else if (/^[A-Za-z_]\w*$/.test(part)) {
      const declaration = findDeclaration(part, file)
      if (declaration) Object.assign(fields, typeFields(declaration.text, declaration.file, depth + 1))
    }
  }
  return fields
}

/**
 * The declared type of the first parameter of function `name` (in `file` or a file it imports from),
 * for handlers that pass the body straight to a parser (`pickTextFields(request.body)`).
 */
function firstParameterType(name, file, seen = new Set()) {
  if (seen.has(`${file}:${name}`) || !sources.has(file)) return null
  seen.add(`${file}:${name}`)
  const source = sources.get(file)
  const declaration = source.match(new RegExp(`\\bfunction\\s+${name}\\s*\\(\\s*\\w+\\s*:\\s*`))
  if (declaration) {
    let depth = 0, end = declaration.index + declaration[0].length
    for (; end < source.length; end += 1) {
      const char = source[end]
      if ('{[(<'.includes(char)) depth += 1
      else if ('}])>'.includes(char)) { if (depth === 0) break; depth -= 1 }
      else if (depth === 0 && char === ',') break
    }
    return { file, text: source.slice(declaration.index + declaration[0].length, end).trim() }
  }
  for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/([\w-]+)\.js'/g)) {
    if (match[1].split(',').map((part) => part.trim().split(/\s+as\s+/)[0]).includes(name)) return firstParameterType(name, `${match[2]}.ts`, seen)
  }
  return null
}

/** The type written after `request.body as ` (up to the end of the expression), resolved to its fields. */
function castFields(handler, typeStart, file) {
  let depth = 0, end = typeStart
  for (; end < handler.length; end += 1) {
    const char = handler[end]
    if ('{[(<'.includes(char)) depth += 1
    else if ('}])>'.includes(char)) { if (depth === 0) break; depth -= 1 }
    else if (depth === 0 && (char === ',' || char === ';' || char === '\n')) break
  }
  return typeFields(handler.slice(typeStart, end), file)
}

/** Body fields used by one handler: { name: sample }. */
function bodyFields(handler, file) {
  const fields = {}
  for (const match of handler.matchAll(/request\.body as /g)) Object.assign(fields, { ...castFields(handler, match.index + match[0].length, file), ...fields })
  // A body passed as-is to a parser takes that parser's declared parameter type (none for `unknown`).
  for (const match of handler.matchAll(/\b([A-Za-z_]\w*)\(\s*request\.body\b/g)) {
    const parameter = firstParameterType(match[1], file)
    if (parameter) Object.assign(fields, { ...typeFields(parameter.text, parameter.file), ...fields })
  }
  for (const match of handler.matchAll(/const \{([^}]*)\} = request\.body\b/g)) {
    for (const part of match[1].split(',')) {
      const name = part.split(':')[0].replace(/=.*/, '').trim()
      if (name && /^[A-Za-z_]\w*$/.test(name)) fields[name] ??= ''
    }
  }
  for (const match of handler.matchAll(/request\.body\.([A-Za-z_]\w*)/g)) fields[match[1]] ??= ''
  return fields
}

const queryParams = (handler) => [...new Set([...handler.matchAll(/request\.query\.([A-Za-z_]\w*)/g)].map((m) => m[1]))]

const routes = []
for (const file of readdirSync(srcDir).filter((name) => name.endsWith('.ts') && !name.includes('.tmp.'))) {
  const source = readFileSync(join(srcDir, file), 'utf8')
  const matches = [...source.matchAll(routePattern)]
  matches.forEach((match, i) => {
    const [, owner, method, rawPath] = match
    const path = owner === 'app' ? rawPath : `/api${rawPath}`
    if (!path.startsWith('/api')) return
    const handler = source.slice(match.index, matches[i + 1]?.index ?? match.index + 6000)
    routes.push({ file, method: method.toUpperCase(), path, description: commentAbove(source, match.index), body: bodyFields(handler, file), query: queryParams(handler) })
  })
  for (const match of source.matchAll(imageRoutePattern)) {
    const path = `/api${match[1]}`
    const description = commentAbove(source, match.index)
    routes.push({ file, method: 'PUT', path, description, body: { image: 'data:image/png;base64,…' }, query: [] })
    routes.push({ file, method: 'DELETE', path, description, body: {}, query: [] })
  }
}

// One folder per API area: the first path segment after /api ("resident-portal" -> "Resident portal").
const folderName = (path) => {
  const segment = path.split('/')[2] ?? 'other'
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ')
}

const toUrl = ({ path, query }) => {
  const segments = path.replace(/^\//, '').split('/')
  return {
    raw: `{{baseUrl}}${path}`,
    host: ['{{baseUrl}}'],
    path: segments,
    ...(query.length ? { query: query.map((key) => ({ key, value: '', disabled: true })) } : {}),
    ...(segments.some((s) => s.startsWith(':')) ? { variable: segments.filter((s) => s.startsWith(':')).map((s) => ({ key: s.slice(1), value: '' })) } : {}),
  }
}

// The resident sign-in the mobile app uses answers with a token; saving it lets every other request
// send it as a bearer header. The web sign-in sets a cookie instead, which Postman keeps on its own.
const saveTokenScript = [
  'const body = pm.response.json();',
  'if (body.token) { pm.collectionVariables.set("token", body.token); console.log("Saved the session token."); }',
]

const toItem = (route) => ({
  name: `${route.method} ${route.path.replace(/^\/api/, '')}`,
  request: {
    method: route.method,
    header: Object.keys(route.body).length ? [{ key: 'Content-Type', value: 'application/json' }] : [],
    url: toUrl(route),
    ...(route.description ? { description: `${route.description}\n\nSource: backend/src/${route.file}` } : { description: `Source: backend/src/${route.file}` }),
    ...(Object.keys(route.body).length ? { body: { mode: 'raw', raw: JSON.stringify(route.body, null, 2), options: { raw: { language: 'json' } } } } : {}),
  },
  ...(route.path === '/api/resident-portal/login' ? { event: [{ listen: 'test', script: { type: 'text/javascript', exec: saveTokenScript } }] } : {}),
})

const folders = new Map()
for (const route of routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))) {
  const name = folderName(route.path)
  if (!folders.has(name)) folders.set(name, [])
  folders.get(name).push(toItem(route))
}
// Auth first, as the place to start.
const ordered = [...folders.entries()].sort(([a], [b]) => (a === 'Auth' ? -1 : b === 'Auth' ? 1 : a.localeCompare(b)))

const collection = {
  info: {
    name: 'Raj-PG API',
    description: 'Generated from backend/src by backend/scripts/generate-postman.mjs; regenerate with `npm run postman` in backend/. Start with Auth: sign in, then run any request. See api/README.md.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:4000' },
    { key: 'token', value: '' },
  ],
  item: ordered.map(([name, item]) => ({ name, item })),
}

const environment = (name, baseUrl) => ({ name: `Raj-PG ${name}`, values: [{ key: 'baseUrl', value: baseUrl, enabled: true }], _postman_variable_scope: 'environment' })

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'raj-pg.postman_collection.json'), `${JSON.stringify(collection, null, 2)}\n`)
writeFileSync(join(outDir, 'raj-pg-local.postman_environment.json'), `${JSON.stringify(environment('Local', 'http://localhost:4000'), null, 2)}\n`)
writeFileSync(join(outDir, 'raj-pg-production.postman_environment.json'), `${JSON.stringify(environment('Production', 'https://raj-pg.netlify.app'), null, 2)}\n`)
console.log(`Wrote ${routes.length} requests in ${ordered.length} folders to api/raj-pg.postman_collection.json, plus Local and Production environments.`)
