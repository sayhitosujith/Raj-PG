import { Router } from 'express'
import { prisma } from './db.js'
import { mealColumnsSelect, toMealTimes } from './meals.js'
import { bedCounts, roomBedsSelect } from './occupancy.js'
import { contentVersion, sendBanner, sendPublicPropertyPhoto } from './photo.js'
import { pricingSelect } from './propertyRent.js'
import { policiesOf } from './policies.js'
import { getSettings, houseRulesOf } from './settings.js'
import { bannerUrlOf, siteContentOf } from './siteContent.js'

/**
 * The public website (/, /pg/:id, /food-and-rules, /contact): what someone looking for a PG may see
 * before signing up. Marketing details only: names, locations, prices, free beds, amenities, photos,
 * weekly menus, house rules, the Terms and Privacy policy, and the owner's website text. Never Wi-Fi details, important contacts, the manager's number or
 * anything about residents. Mounted before the sign-in guard.
 */
export const publicSiteRouter = Router()

// Uploaded covers are data URLs, served by their own route with a content hash so browsers cache them;
// a cover given as a web address is used as it is.
const coverUrl = (propertyId: string, imageUrl: string) => imageUrl.startsWith('data:') ? `/api/public/properties/${propertyId}/cover?v=${contentVersion(imageUrl)}` : imageUrl

const siteProperty = {
  id: true, name: true, location: true, city: true, tenantType: true, amenities: true, totalRooms: true, noticePeriodDays: true, imageUrl: true, checkInTime: true, checkOutTime: true, gateClosingTime: true,
  ...pricingSelect, ...mealColumnsSelect,
  rooms: { select: roomBedsSelect },
  photos: { select: { id: true, caption: true }, orderBy: { createdAt: 'asc' } },
  menuItems: { select: { weekday: true, meal: true, items: true } },
} as const

publicSiteRouter.get('/public/site', async (_request, response) => {
  try {
    const [settings, properties] = await Promise.all([getSettings(), prisma.property.findMany({ orderBy: { name: 'asc' }, select: siteProperty })])
    const houseRules = houseRulesOf(settings)
    response.json({
      businessName: settings.businessName,
      contactPhone: settings.contactPhone,
      contactEmail: settings.contactEmail,
      houseRules,
      ...policiesOf(settings),
      content: siteContentOf(settings.siteContent),
      bannerUrl: bannerUrlOf(settings),
      properties: properties.map((property) => {
        const { taken, total } = bedCounts(property)
        return {
          id: property.id, name: property.name, location: property.location, city: property.city, tenantType: property.tenantType, amenities: property.amenities,
          rentWithFood: property.rentWithFood, rentWithoutFood: property.rentWithoutFood, sharingPrices: [...property.sharingPrices].sort((a, b) => a.beds - b.beds),
          freeBeds: Math.max(0, total - taken), totalBeds: total,
          noticePeriodDays: property.noticePeriodDays ?? houseRules.noticePeriodDays,
          checkInTime: property.checkInTime, checkOutTime: property.checkOutTime, gateClosingTime: property.gateClosingTime,
          image: property.imageUrl ? coverUrl(property.id, property.imageUrl) : null,
          photos: property.photos.map((photo) => ({ id: photo.id, caption: photo.caption, url: `/api/public/properties/${property.id}/photos/${photo.id}` })),
          mealTimes: toMealTimes(property),
          menu: property.menuItems.map((item) => ({ weekday: item.weekday, meal: item.meal.toLowerCase(), items: item.items })),
        }
      }),
    })
  } catch (error) {
    console.error('Public site load failed:', error)
    response.status(503).json({ error: 'The site could not be loaded.' })
  }
})

publicSiteRouter.get('/public/site-banner', async (_request, response) => {
  try {
    sendBanner(response, (await getSettings()).siteBannerUrl)
  } catch (error) {
    console.error('Website banner failed:', error)
    response.status(503).json({ error: 'The banner could not be loaded.' })
  }
})

publicSiteRouter.get('/public/properties/:id/cover', async (request, response) => {
  try {
    const property = await prisma.property.findUnique({ where: { id: request.params.id }, select: { imageUrl: true } })
    sendPublicPropertyPhoto(response, property?.imageUrl)
  } catch (error) {
    console.error('Public cover photo failed:', error)
    response.status(503).json({ error: 'The photo could not be loaded.' })
  }
})

publicSiteRouter.get('/public/properties/:id/photos/:photoId', async (request, response) => {
  try {
    const photo = await prisma.propertyPhoto.findFirst({ where: { id: request.params.photoId, propertyId: request.params.id }, select: { imageUrl: true } })
    sendPublicPropertyPhoto(response, photo?.imageUrl)
  } catch (error) {
    console.error('Public gallery photo failed:', error)
    response.status(503).json({ error: 'The photo could not be loaded.' })
  }
})
