import { useRef } from 'react'
import { dragCoverPosition, nudgeCoverPosition, type CoverPosition } from './coverPosition'

type DragStart = { pointerId: number; clientX: number; clientY: number; from: CoverPosition }

/**
 * Pointer and keyboard handlers that move the own cover image while it is being adjusted; spread them on the banner.
 * Pointer Events with capture cover mouse, pen and touch alike. The banner must carry touch-action: none before
 * the gesture starts, or a phone takes a vertical swipe as a page scroll and cancels the pointer.
 */
export function useCoverDrag(position: CoverPosition, onMove: (next: CoverPosition) => void) {
  const imageRef = useRef<HTMLImageElement>(null)
  const drag = useRef<DragStart | null>(null)

  function onPointerDown(event: React.PointerEvent<HTMLElement>) {
    // Only the picture itself starts a drag: the zoom slider and buttons sit on the same banner.
    if (!event.isPrimary || event.button !== 0 || event.target !== imageRef.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, from: position }
  }

  function onPointerMove(event: React.PointerEvent<HTMLElement>) {
    const start = drag.current
    const image = imageRef.current
    if (!start || start.pointerId !== event.pointerId || !image) return
    // Layout sizes, not getBoundingClientRect: the image's zoom transform must not count as banner size.
    const banner = { width: event.currentTarget.clientWidth, height: event.currentTarget.clientHeight }
    onMove(dragCoverPosition(start.from, event.clientX - start.clientX, event.clientY - start.clientY, banner, { width: image.naturalWidth, height: image.naturalHeight }))
  }

  function onPointerEnd(event: React.PointerEvent<HTMLElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    // Arrow keys on the slider bubble up here too; those change the zoom, not the position.
    if (event.target !== event.currentTarget) return
    const next = nudgeCoverPosition(position, event.key)
    if (!next) return
    event.preventDefault()
    onMove(next)
  }

  return { imageRef, handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onLostPointerCapture: onPointerEnd, onKeyDown } }
}
