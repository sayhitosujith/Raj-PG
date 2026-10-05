import { Copy } from 'lucide-react'
import { copyWithNotice } from './clipboard'

/** Small icon button that copies a value and confirms it through the app's toast. */
export function CopyButton({ value, label, onNotice, className = 'icon-button' }: { value: string; label: string; onNotice: (message: string) => void; className?: string }) {
  return <button type="button" className={className} aria-label={`Copy ${label.toLowerCase()}`} title={`Copy ${label.toLowerCase()}`} onClick={() => copyWithNotice(value, label, onNotice)}><Copy size={12} /></button>
}
