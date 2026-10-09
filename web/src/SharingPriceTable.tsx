import { Fragment, useEffect, useState } from 'react'
import type { SharingPrice } from './pricing'
import { fetchRooms, sharingLabel } from './rooms'

// Rows offered: Single to 6 sharing, plus any larger size already priced or set on a room.
const commonSharing = [1, 2, 3, 4, 5, 6]
const shownRoomNumbers = 6

/** "101, 102, 103 +4 more", or a note when no room has that many beds. */
function roomsText(numbers: string[] | undefined) {
  if (!numbers?.length) return 'No rooms yet'
  const shown = numbers.slice(0, shownRoomNumbers).join(', ')
  return numbers.length > shownRoomNumbers ? `${shown} +${numbers.length - shownRoomNumbers} more` : shown
}

/**
 * The property's prices by sharing type, one row per room size, each with the rooms of that size
 * (when editing an existing property) so the owner sees what a price applies to. Uncontrolled inputs
 * named sharing-<beds>-withFood / -withoutFood, read back by readPropertyFeatures.
 */
export function SharingPriceTable({ propertyId, prices }: { propertyId?: string; prices: SharingPrice[] }) {
  const [roomsByBeds, setRoomsByBeds] = useState<Map<number, string[]> | null>(null)

  useEffect(() => {
    if (!propertyId) return
    let isCurrent = true
    // Rooms are a guide only, so a failed load just leaves the room lines out.
    fetchRooms(propertyId).then((data) => {
      if (!isCurrent) return
      const grouped = new Map<number, string[]>()
      for (const room of data.rooms) grouped.set(room.beds, [...(grouped.get(room.beds) ?? []), room.number])
      setRoomsByBeds(grouped)
    }, () => undefined)
    return () => { isCurrent = false }
  }, [propertyId])

  const rows = [...new Set([...commonSharing, ...prices.map((price) => price.beds), ...(roomsByBeds?.keys() ?? [])])].sort((a, b) => a - b)
  return (
    <div className="sharing-prices" role="group" aria-label="Price by sharing type">
      <span className="sharing-prices-head">Sharing type</span><span className="sharing-prices-head">With food</span><span className="sharing-prices-head">Without food</span>
      {rows.map((beds) => {
        const price = prices.find((row) => row.beds === beds)
        const label = sharingLabel(beds)
        return (
          <Fragment key={beds}>
            <span className="sharing-prices-name">{label}{roomsByBeds && <small title={roomsByBeds.get(beds)?.join(', ')}>{roomsByBeds.get(beds)?.length ? 'Rooms ' : ''}{roomsText(roomsByBeds.get(beds))}</small>}</span>
            <input name={`sharing-${beds}-withFood`} data-price-pair={beds} data-food="with" type="number" inputMode="numeric" min={1} max={1000000} step={1} defaultValue={price?.rentWithFood} placeholder="Standard" aria-label={`${label} with food`} />
            <input name={`sharing-${beds}-withoutFood`} data-price-pair={beds} data-food="without" type="number" inputMode="numeric" min={1} max={1000000} step={1} defaultValue={price?.rentWithoutFood} placeholder="Standard" aria-label={`${label} without food`} />
          </Fragment>
        )
      })}
    </div>
  )
}
