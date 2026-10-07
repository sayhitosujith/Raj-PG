import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders a modal at the top of the page instead of where its button sits. Cards are CSS containers
 * (container-type), and a container traps position: fixed inside it, so a modal opened from inside a
 * card would be clipped to that card with the card's own tiles drawn over it. It goes into the
 * resident portal's shell when there is one, so the portal's scoped colours still apply.
 */
export function ModalLayer({ children }: { children: ReactNode }) {
  return createPortal(children, document.querySelector('.portal-shell') ?? document.body)
}
