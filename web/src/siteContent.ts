import { formatRupees } from './rent'

/** Website parts the owner can turn off on the Website page (same names as backend siteContent.ts). */
export const siteSections = [
  { key: 'locations', label: 'Available locations', hint: 'Area cards and the location filter' },
  { key: 'roomOptions', label: 'Room options', hint: 'Single, 2 sharing… price cards' },
  { key: 'gallery', label: 'Photo gallery', hint: 'Photos of your PGs on the home page' },
  { key: 'steps', label: 'How it works', hint: 'Enquiry → visit → move in' },
  { key: 'foodAndRules', label: 'Food & rules page', hint: 'Weekly menu and house rules' },
  { key: 'whatsapp', label: 'WhatsApp chat button', hint: 'The floating green button' },
] as const
export type SiteSection = (typeof siteSections)[number]['key']

type Card = { title: string; text: string }

/** The owner's website text (null keeps the built-in text below) and the sections they turned off. */
export type SiteContent = { headline: string | null; tagline: string | null; aboutTitle: string | null; aboutText: string | null; aboutPoints: string[] | null; perks: Card[] | null; hidden: SiteSection[] }

export const emptySiteContent: SiteContent = { headline: null, tagline: null, aboutTitle: null, aboutText: null, aboutPoints: null, perks: null, hidden: [] }

/** Whether a section shows on the website. */
export const isShown = (content: SiteContent, section: SiteSection) => !content.hidden.includes(section)

// The built-in text: what the site says when the owner has not written their own, and the editor's placeholders.
export const defaultAboutTitle = 'A home away from home'
export const defaultAboutPoints = [
  'Furnished rooms, from single to shared, at clear monthly prices.',
  'Rent, meals, housekeeping and repairs, all in one resident app.',
  'A team that answers, usually the same day.',
]
export const defaultPerks: Card[] = [
  { title: 'Food plan', text: 'See the weekly menu ahead, and skip a meal in one tap.' },
  { title: 'Housekeeping on request', text: 'Book a room cleaning at a time that suits you.' },
  { title: 'Repairs tracked', text: 'Report a problem from your phone and follow it until it is fixed.' },
  { title: 'Verified residents', text: "Every resident's ID is checked by the property owner." },
]

/** Facts the built-in headline, tagline and about text are written from. */
export type SiteFacts = { businessName: string; cities: string[]; propertyCount: number; lowestPrice: number | null }

export const defaultHeadline = ({ cities }: SiteFacts) => `Comfortable PG living${cities.length ? ` in ${cities.join(', ')}` : ''}`
export const defaultTagline = ({ lowestPrice }: SiteFacts) => `Furnished rooms, home-style food and an app for everything from rent to repairs.${lowestPrice ? ` Rooms from ${formatRupees(lowestPrice)} a month.` : ''}`
export const defaultAboutText = ({ businessName, cities, propertyCount }: SiteFacts) => `${businessName} runs ${propertyCount === 1 ? 'a PG' : `${propertyCount} PGs`}${cities.length ? ` in ${cities.join(', ')}` : ''}, made for students and working professionals who want a clean, safe and easy place to live.`

/** Website links without the ones whose section the owner turned off (shared by the menu and footer). */
export const visibleLinks = <T extends { section?: SiteSection }>(links: T[], content: SiteContent) => links.filter((link) => !link.section || isShown(content, link.section))
