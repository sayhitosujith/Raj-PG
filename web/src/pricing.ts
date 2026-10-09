import type { FormEvent } from 'react'

/** A property's rent for one sharing type (room size): 1 = single, 2 = double sharing… */
export type SharingPrice = { beds: number; rentWithFood: number; rentWithoutFood: number }

/**
 * Live check for a with/without-food price pair, attached as an onInput handler on a container whose
 * price inputs carry data-price-pair (which pair) and data-food ("with" or "without"). Flags a
 * without-food price above the with-food one (usually a slipped digit); the server checks it too.
 */
export function checkPricePair(event: FormEvent<HTMLElement>) {
  const pair = (event.target as HTMLElement).dataset.pricePair
  if (!pair) return
  const inputs = event.currentTarget.querySelectorAll<HTMLInputElement>(`input[data-price-pair="${pair}"]`)
  const withFood = [...inputs].find((input) => input.dataset.food === 'with')
  const withoutFood = [...inputs].find((input) => input.dataset.food === 'without')
  if (!withFood || !withoutFood) return
  const isTooHigh = Boolean(withFood.value && withoutFood.value) && Number(withoutFood.value) > Number(withFood.value)
  withoutFood.setCustomValidity(isTooHigh ? 'Without food is more than with food. Check for a typo.' : '')
  withoutFood.toggleAttribute('aria-invalid', isTooHigh)
}

/** The parts of a property that decide a resident's rent. */
export type PropertyPricing = { rentWithFood?: number | null; rentWithoutFood?: number | null; sharingPrices?: SharingPrice[] }

/**
 * The rent a property charges for a room size and food choice, or null when it sets none: the price
 * for that sharing type when there is one, otherwise the standard price. Mirrors rentFor in the
 * backend's propertyRent.ts, which decides the stored rent; this only previews it in the form.
 */
export function priceFor(property: PropertyPricing | undefined, beds: number | null, foodOpted: boolean) {
  if (!property) return null
  const pair = (beds !== null && property.sharingPrices?.find((price) => price.beds === beds)) || property
  if (!pair.rentWithFood || !pair.rentWithoutFood) return null
  return foodOpted ? pair.rentWithFood : pair.rentWithoutFood
}
