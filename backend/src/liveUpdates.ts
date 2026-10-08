import { Router, type NextFunction, type Request, type Response } from 'express'
import { hasLiveSession } from './auth.js'

/**
 * Live updates: every open app page keeps one Server-Sent Events connection, and the server sends a
 * bare "changed" message the moment any write succeeds (a menu saved, a request raised, a payment
 * recorded…). Pages then re-fetch their own data, so notifications and counts appear at once instead
 * of on the next 10-second refresh, which stays as the fallback. The message carries no data, so it
 * reveals nothing; each page still loads only what its user may see. In-memory, which suits the single
 * API instance this app runs as.
 */
const listeners = new Set<Response>()
const heartbeatMs = 25_000
let pending: NodeJS.Timeout | null = null

/** Tells every open page that something changed; bursts of writes become one message. */
export function announceChange() {
  if (pending) return
  pending = setTimeout(() => {
    pending = null
    for (const listener of listeners) listener.write('data: changed\n\n')
  }, 300)
}

/** Announces every successful write to the API (any method but GET/HEAD/OPTIONS, status below 400). */
export function announceWrites(request: Request, response: Response, next: NextFunction) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    response.on('finish', () => { if (response.statusCode < 400) announceChange() })
  }
  next()
}

export const liveUpdatesRouter = Router()

liveUpdatesRouter.get('/events', async (request, response) => {
  if (!await hasLiveSession(request).catch(() => false)) { response.status(401).end(); return }
  // no-transform and X-Accel-Buffering keep proxies (Netlify, Render) from holding the stream back.
  response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  response.flushHeaders()
  response.write('retry: 5000\n: connected\n\n')
  listeners.add(response)
  // Comments every 25 s keep idle connections from being cut by proxies.
  const heartbeat = setInterval(() => response.write(': ping\n\n'), heartbeatMs)
  request.on('close', () => { clearInterval(heartbeat); listeners.delete(response) })
})
