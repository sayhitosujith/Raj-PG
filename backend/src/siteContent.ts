import type { Prisma, WorkspaceSettings } from '@prisma/client'
import { Router } from 'express'
import { findBannerProblem, photoVersion } from './photo.js'
import { getSettings, updateSettings } from './settings.js'

/**
 * The owner's own text for the public website, edited on the admin Website page, and the sections they
 * turned off. Any text left blank (null) keeps the website's built-in text, so a new workspace has a
 * complete site before anyone writes a word.
 */

/** Website parts the owner can turn off; all show unless listed in `hidden`. */
export const siteSections = ['locations', 'roomOptions', 'gallery', 'steps', 'foodAndRules', 'whatsapp'] as const
type SiteSection = (typeof siteSections)[number]
type Card = { title: string; text: string }

export type SiteContent = {
  headline: string | null
  tagline: string | null
  aboutTitle: string | null
  aboutText: string | null
  /** The About section's bullet points; null keeps the built-in ones. */
  aboutPoints: string[] | null
  /** The four "Why stay with us" cards; null keeps the built-in ones. */
  perks: Card[] | null
  hidden: SiteSection[]
}

const limits = { headline: 90, tagline: 240, aboutTitle: 80, aboutText: 600, point: 140, points: 5, perkTitle: 40, perkText: 160, perks: 4 }
const empty: SiteContent = { headline: null, tagline: null, aboutTitle: null, aboutText: null, aboutPoints: null, perks: null, hidden: [] }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isSection = (value: unknown): value is SiteSection => siteSections.includes(value as SiteSection)

/** The stored content, read leniently (anything unexpected counts as "not set"), for the site and the editor. */
export function siteContentOf(stored: Prisma.JsonValue | null): SiteContent {
  if (!isRecord(stored)) return empty
  const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null
  const points = Array.isArray(stored.aboutPoints) ? stored.aboutPoints.map(text).filter((point): point is string => point !== null) : []
  const perks = Array.isArray(stored.perks) ? stored.perks.flatMap((card) => isRecord(card) && text(card.title) ? [{ title: text(card.title) as string, text: text(card.text) ?? '' }] : []) : []
  return {
    headline: text(stored.headline), tagline: text(stored.tagline), aboutTitle: text(stored.aboutTitle), aboutText: text(stored.aboutText),
    aboutPoints: points.length ? points : null, perks: perks.length ? perks : null,
    hidden: Array.isArray(stored.hidden) ? stored.hidden.filter(isSection) : [],
  }
}

/** Validates the editor's content: lengths, list sizes and known section names. */
export function parseSiteContent(body: unknown): { content: SiteContent } | { error: string } {
  if (!isRecord(body)) return { error: 'Send the website content.' }
  const optionalText = (value: unknown, name: string, max: number): string | null | { error: string } => {
    if (value === undefined || value === null) return null
    if (typeof value !== 'string') return { error: `${name} must be text.` }
    const trimmed = value.trim()
    if (trimmed.length > max) return { error: `${name} can be up to ${max} characters.` }
    return trimmed || null
  }
  const content: SiteContent = { ...empty }
  for (const [key, name, max] of [['headline', 'Headline', limits.headline], ['tagline', 'Tagline', limits.tagline], ['aboutTitle', 'About title', limits.aboutTitle], ['aboutText', 'About text', limits.aboutText]] as const) {
    const value = optionalText(body[key], name, max)
    if (isRecord(value)) return value as { error: string }
    content[key] = value
  }
  if (body.aboutPoints !== undefined && body.aboutPoints !== null) {
    if (!Array.isArray(body.aboutPoints)) return { error: 'About points must be a list.' }
    const points: string[] = []
    for (const point of body.aboutPoints) {
      const value = optionalText(point, 'Each About point', limits.point)
      if (isRecord(value)) return value as { error: string }
      if (value) points.push(value)
    }
    if (points.length > limits.points) return { error: `Add up to ${limits.points} About points.` }
    content.aboutPoints = points.length ? points : null
  }
  if (body.perks !== undefined && body.perks !== null) {
    if (!Array.isArray(body.perks) || body.perks.length > limits.perks) return { error: `"Why stay with us" has up to ${limits.perks} cards.` }
    const perks: Card[] = []
    for (const card of body.perks) {
      if (!isRecord(card)) return { error: 'Each "Why stay with us" card needs a title and text.' }
      const title = optionalText(card.title, 'A card title', limits.perkTitle)
      const text = optionalText(card.text, 'A card text', limits.perkText)
      if (isRecord(title)) return title as { error: string }
      if (isRecord(text)) return text as { error: string }
      if (title && !text) return { error: `Add some text to the "${title}" card, or clear its title.` }
      if (title && text) perks.push({ title, text })
    }
    content.perks = perks.length ? perks : null
  }
  if (body.hidden !== undefined) {
    if (!Array.isArray(body.hidden) || !body.hidden.every(isSection)) return { error: 'Unknown website section.' }
    content.hidden = [...new Set(body.hidden)]
  }
  return { content }
}

/** Owner routes for the Website page; mounted behind the sign-in guard, super admins only (see staffGuard). */
export const siteContentRouter = Router()

siteContentRouter.get('/site-content', async (_request, response) => {
  try {
    response.json(siteContentOf((await getSettings()).siteContent))
  } catch (error) {
    console.error('Website content load failed:', error)
    response.status(503).json({ error: 'The website content could not be loaded.' })
  }
})

siteContentRouter.put('/site-content', async (request, response) => {
  const parsed = parseSiteContent(request.body)
  if ('error' in parsed) { response.status(400).json({ error: parsed.error }); return }
  try {
    const settings = await updateSettings({ siteContent: parsed.content as Prisma.InputJsonValue })
    response.json(siteContentOf(settings.siteContent))
  } catch (error) {
    console.error('Website content save failed:', error)
    response.status(503).json({ error: 'The website content could not be saved.' })
  }
})

/** The banner's public URL, versioned so browsers fetch a new upload at once; null when none is set. */
export const bannerUrlOf = (settings: WorkspaceSettings) => settings.siteBannerUrl && settings.siteBannerUpdatedAt ? `/api/public/site-banner?v=${photoVersion(settings.siteBannerUpdatedAt)}` : null

// The banner image is uploaded (resized in the browser) or removed on its own, like the logo; the
// public site serves it from GET /api/public/site-banner (publicSite.ts).
siteContentRouter.put('/site-content/banner', async (request, response) => {
  const { image } = request.body as { image?: unknown }
  const problem = findBannerProblem(image)
  if (problem) { response.status(400).json({ error: problem }); return }
  try {
    const settings = await updateSettings({ siteBannerUrl: image as string, siteBannerUpdatedAt: new Date() })
    response.json({ bannerUrl: bannerUrlOf(settings) })
  } catch (error) {
    console.error('Website banner save failed:', error)
    response.status(503).json({ error: 'The banner image could not be saved.' })
  }
})

siteContentRouter.delete('/site-content/banner', async (_request, response) => {
  try {
    await updateSettings({ siteBannerUrl: null, siteBannerUpdatedAt: null })
    response.json({ bannerUrl: null })
  } catch (error) {
    console.error('Website banner removal failed:', error)
    response.status(503).json({ error: 'The banner image could not be removed.' })
  }
})
