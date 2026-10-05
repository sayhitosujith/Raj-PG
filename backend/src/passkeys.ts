import { UserRole } from '@prisma/client'
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse, type AuthenticationResponseJSON, type AuthenticatorTransportFuture, type RegistrationResponseJSON } from '@simplewebauthn/server'
import { randomBytes } from 'node:crypto'
import type { Request, RequestHandler, Response, Router } from 'express'
import { findAccessBlock } from './accessBlocks.js'
import { startSession, type AuthContext } from './auth.js'
import { prisma } from './db.js'
import { getSettings } from './settings.js'

/**
 * Face ID / Touch ID / fingerprint sign-in for residents, as passkeys (WebAuthn). The phone checks
 * the face or finger itself and signs a one-time challenge with a key that never leaves it; the
 * server stores only the public key, so no biometric data is ever sent or kept.
 *
 * A passkey is bound to the site's domain, so the accepted origins are fixed: APP_URL in production,
 * plus the local dev servers otherwise. A passkey only works while the resident's sign-in is valid
 * (they have a password), and every place that clears sign-in also deletes their passkeys.
 */
function allowedOrigins() {
  const appUrl = (process.env.APP_URL || 'https://raj-pg.netlify.app').replace(/\/$/, '')
  return process.env.NODE_ENV === 'production' ? [appUrl] : [appUrl, 'http://localhost:5173', 'http://127.0.0.1:5173']
}

/**
 * The relying party for this request: the browser's origin if it is one we serve, and that origin's
 * host as the RP ID. In production the API is reached through the Netlify proxy, which may not pass
 * the Origin header on, so APP_URL is assumed there; that is safe because the phone signs the real
 * origin into its response and verification rejects any mismatch.
 */
function relyingParty(request: Request) {
  const origins = allowedOrigins()
  const header = request.headers.origin
  const origin = header && origins.includes(header) ? header : process.env.NODE_ENV === 'production' ? origins[0] : null
  if (!origin) return null
  return { origin, rpID: new URL(origin).hostname }
}

// Challenges live a few minutes in memory, keyed by a random id the browser sends back. One server
// process serves the API, so memory is enough; a lost challenge (e.g. after a restart) just means
// the resident taps the button again.
const challengeLifetimeMs = 5 * 60_000
const challenges = new Map<string, { challenge: string; residentId?: string; expiresAt: number }>()

function saveChallenge(challenge: string, residentId?: string) {
  const now = Date.now()
  for (const [key, value] of challenges) if (value.expiresAt < now) challenges.delete(key)
  const id = randomBytes(16).toString('base64url')
  challenges.set(id, { challenge, residentId, expiresAt: now + challengeLifetimeMs })
  return id
}

/** The challenge saved under `id`, used once: it is removed whether or not it is still valid. */
function takeChallenge(id: unknown) {
  if (typeof id !== 'string') return null
  const saved = challenges.get(id)
  challenges.delete(id)
  return saved && saved.expiresAt > Date.now() ? saved : null
}

/** A short name for the device, so a resident with several passkeys can tell them apart. */
function deviceLabel(userAgent = '') {
  if (/iPhone/i.test(userAgent)) return 'iPhone'
  if (/iPad/i.test(userAgent)) return 'iPad'
  if (/Android/i.test(userAgent)) return 'Android phone'
  if (/Macintosh/i.test(userAgent)) return 'Mac'
  if (/Windows/i.test(userAgent)) return 'Windows PC'
  return 'This device'
}

const wrongSite = 'Face ID and fingerprint sign-in only work on the StayNest site itself.'

/**
 * The signed-in resident's passkey routes, mounted on the portal router behind `guards` (a session
 * with full portal access): start and finish saving a passkey, list them, and remove one.
 */
export function residentPasskeyRoutes(router: Router, guards: RequestHandler[]) {
  router.post('/resident-portal/passkeys/options', ...guards, async (request, response) => {
    const { userId } = response.locals.auth as AuthContext
    const party = relyingParty(request)
    if (!party) { response.status(400).json({ error: wrongSite }); return }
    try {
      const resident = await prisma.resident.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, phone: true, passkeys: { select: { credentialId: true, transports: true } } } })
      const options = await generateRegistrationOptions({
        rpName: (await getSettings()).businessName || 'StayNest', rpID: party.rpID,
        userName: resident.email || resident.phone || resident.name, userDisplayName: resident.name, userID: new TextEncoder().encode(userId),
        attestationType: 'none',
        // A key on this phone already? The phone says so instead of saving a second one.
        excludeCredentials: resident.passkeys.map((key) => ({ id: key.credentialId, transports: key.transports as AuthenticatorTransportFuture[] })),
        // Discoverable, so sign-in needs no email first; the phone's own lock (face, finger, PIN) must be used.
        authenticatorSelection: { residentKey: 'required', userVerification: 'required', authenticatorAttachment: 'platform' },
      })
      response.json({ options, challengeId: saveChallenge(options.challenge, userId) })
    } catch (error) {
      console.error('Passkey options failed:', error)
      response.status(503).json({ error: 'Face ID / fingerprint sign-in could not be set up. Please try again.' })
    }
  })

  router.post('/resident-portal/passkeys', ...guards, async (request, response) => {
    const { userId } = response.locals.auth as AuthContext
    const party = relyingParty(request)
    if (!party) { response.status(400).json({ error: wrongSite }); return }
    const { challengeId, credential } = request.body as { challengeId?: unknown; credential?: RegistrationResponseJSON }
    const saved = takeChallenge(challengeId)
    if (!saved || saved.residentId !== userId || !credential) { response.status(400).json({ error: 'That took too long. Please try again.' }); return }
    try {
      const { verified, registrationInfo } = await verifyRegistrationResponse({ response: credential, expectedChallenge: saved.challenge, expectedOrigin: party.origin, expectedRPID: party.rpID, requireUserVerification: true })
      if (!verified) { response.status(400).json({ error: 'Your phone could not confirm it was you. Please try again.' }); return }
      const { id, publicKey, counter, transports } = registrationInfo.credential
      await prisma.residentPasskey.create({ data: { residentId: userId, credentialId: id, publicKey, counter, transports: transports ?? [], label: deviceLabel(request.headers['user-agent']) } })
      response.status(201).json(await listPasskeys(userId))
    } catch (error) {
      console.error('Passkey registration failed:', error)
      response.status(400).json({ error: 'Face ID / fingerprint sign-in could not be saved. Please try again.' })
    }
  })

  router.get('/resident-portal/passkeys', ...guards, async (_request, response) => {
    const { userId } = response.locals.auth as AuthContext
    response.json(await listPasskeys(userId))
  })

  router.delete('/resident-portal/passkeys/:id', ...guards, async (request, response) => {
    const { userId } = response.locals.auth as AuthContext
    const removed = await prisma.residentPasskey.deleteMany({ where: { id: String(request.params.id), residentId: userId } })
    if (!removed.count) { response.status(404).json({ error: 'That passkey was not found.' }); return }
    response.json(await listPasskeys(userId))
  })
}

// What the resident sees about their passkeys: never the key material.
function listPasskeys(residentId: string) {
  return prisma.residentPasskey.findMany({ where: { residentId }, orderBy: { createdAt: 'desc' }, select: { id: true, label: true, createdAt: true, lastUsedAt: true } })
}

/**
 * Public sign-in routes: a challenge for the phone to sign, then the check that signs the resident
 * in. The same access rules as a password sign-in apply (closed account, ended stay, overdue rent).
 */
export function passkeyLoginRoutes(router: Router) {
  router.post('/resident-portal/passkey-login/options', async (request, response) => {
    const party = relyingParty(request)
    if (!party) { response.status(400).json({ error: wrongSite }); return }
    const options = await generateAuthenticationOptions({ rpID: party.rpID, userVerification: 'required' })
    response.json({ options, challengeId: saveChallenge(options.challenge) })
  })

  router.post('/resident-portal/passkey-login', async (request: Request, response: Response) => {
    const party = relyingParty(request)
    if (!party) { response.status(400).json({ error: wrongSite }); return }
    const { challengeId, credential } = request.body as { challengeId?: unknown; credential?: AuthenticationResponseJSON }
    const saved = takeChallenge(challengeId)
    if (!saved || !credential?.id) { response.status(400).json({ error: 'That took too long. Please try again.' }); return }
    const notRecognised = 'This Face ID / fingerprint sign-in is no longer set up. Sign in with your password, then turn it on again in Profile.'
    try {
      const passkey = await prisma.residentPasskey.findUnique({ where: { credentialId: credential.id }, include: { resident: { select: { id: true, active: true, passwordHash: true } } } })
      if (!passkey || !passkey.resident.active || !passkey.resident.passwordHash) { response.status(401).json({ error: notRecognised }); return }
      const { verified, authenticationInfo } = await verifyAuthenticationResponse({
        response: credential, expectedChallenge: saved.challenge, expectedOrigin: party.origin, expectedRPID: party.rpID, requireUserVerification: true,
        credential: { id: passkey.credentialId, publicKey: new Uint8Array(passkey.publicKey), counter: passkey.counter, transports: passkey.transports as AuthenticatorTransportFuture[] },
      })
      if (!verified) { response.status(401).json({ error: 'Your phone could not confirm it was you. Please try again.' }); return }
      await prisma.residentPasskey.update({ where: { id: passkey.id }, data: { counter: authenticationInfo.newCounter, lastUsedAt: new Date() } })
      const block = await findAccessBlock(passkey.resident.id)
      if (block) { response.status(403).json({ error: block.message, code: block.code }); return }
      // Same reply as the main sign-in (POST /auth/login), so the web app handles both alike.
      await startSession(response, UserRole.RESIDENT, { residentId: passkey.resident.id })
      response.json({ role: UserRole.RESIDENT })
    } catch (error) {
      console.error('Passkey sign-in failed:', error)
      response.status(401).json({ error: 'Face ID / fingerprint sign-in did not work. Please try again or use your password.' })
    }
  })
}
