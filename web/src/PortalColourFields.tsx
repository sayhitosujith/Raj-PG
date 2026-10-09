import { useEffect, useState, type CSSProperties } from 'react'
import { Pipette } from 'lucide-react'

/** The portal's default theme, button text and error message colours, used when none is set. */
export const defaultPortalColours = { theme: '#0ea5e9', text: '#ffffff', error: '#a3483b', ink: '#202e35', placeholder: '#9aa5a8', newBadge: '#dc2626', soonBadge: '#d97706', betaBadge: '#ce2c2c', background: '#ffffff', card: '#ffffff', childCard: '#f0f9ff' }

const themePresets = [['Sky blue', '#0ea5e9'], ['Indigo', '#4f46e5'], ['Purple', '#9333ea'], ['Teal', '#0d9488'], ['Orange', '#ea580c'], ['Red', '#dc2626'], ['Charcoal', '#1f2937']] as const
const textPresets = [['White', '#ffffff'], ['Black', '#111827']] as const
const inkPresets = [['Charcoal', '#202e35'], ['Black', '#111827'], ['Slate', '#334155'], ['Navy', '#1e3a8a'], ['Brown', '#44403c']] as const
const placeholderPresets = [['Soft grey', '#9aa5a8'], ['Grey', '#6b7280'], ['Blue grey', '#7c93a8'], ['Warm grey', '#a8a29e']] as const
const badgePresets = [['Red', '#dc2626'], ['Amber', '#d97706'], ['Green', '#16a34a'], ['Blue', '#2563eb'], ['Purple', '#9333ea'], ['Pink', '#db2777']] as const
const backgroundPresets = [['White', '#ffffff'], ['Soft grey', '#f4f5f7'], ['Warm white', '#fbf7f2'], ['Sky tint', '#f0f9ff'], ['Lavender tint', '#f5f3ff'], ['Rose tint', '#fff1f2']] as const
const cardPresets = [['White', '#ffffff'], ['Soft grey', '#f8fafc'], ['Warm white', '#fffbf5'], ['Sky tint', '#f0f9ff'], ['Mint tint', '#f0fdf4'], ['Lavender tint', '#faf5ff']] as const
const errorPresets = [['Brick red', '#a3483b'], ['Red', '#dc2626'], ['Dark red', '#991b1b'], ['Orange', '#c2410c'], ['Pink', '#be185d']] as const

/** The owner's portal colours, each "#rrggbb" or empty for the default. */
export type PortalColours = { theme?: string | null; text?: string | null; error?: string | null; ink?: string | null; placeholder?: string | null; newBadge?: string | null; soonBadge?: string | null; betaBadge?: string | null; background?: string | null; card?: string | null; childCard?: string | null }

/**
 * The inline style that applies chosen colours to a resident portal (or a preview of one). The text
 * and placeholder colours apply in light view only (see portalTheme.css and App.css).
 */
export function portalColourStyle({ theme, text, error, ink, placeholder, newBadge, soonBadge, betaBadge, background, card, childCard }: PortalColours) {
  return { ...(theme ? { '--brand': theme } : {}), ...(text ? { '--brand-on': text } : {}), ...(error ? { '--portal-error': error } : {}), ...(ink ? { '--portal-ink': ink } : {}), ...(placeholder ? { '--placeholder': placeholder } : {}), ...(newBadge ? { '--badge-new': newBadge } : {}), ...(soonBadge ? { '--badge-soon': soonBadge } : {}), ...(betaBadge ? { '--badge-beta': betaBadge } : {}), ...(background ? { '--app-bg': background } : {}), ...(card ? { '--card-bg': card } : {}), ...(childCard ? { '--child-card-bg': childCard } : {}) } as CSSProperties
}

/** The colour as a typed hex code; applied once it is a full "#rrggbb", so half-typed values do no harm. */
function HexInput({ value, label, onChange }: { value: string; label: string; onChange: (colour: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return <input className="colour-hex" value={draft} maxLength={7} spellCheck={false} aria-label={`${label} as a hex code`} onChange={(event) => {
    const next = event.target.value.trim()
    setDraft(next)
    const colour = next.startsWith('#') ? next : `#${next}`
    if (/^#[0-9a-f]{6}$/i.test(colour)) onChange(colour.toLowerCase())
  }} />
}

/** One colour: preset swatches, a free picker, a hex code box, and Reset (blank = default, sent to the server as null). */
function ColourChoice({ name, label, presets, value, fallback, onChange }: { name: string; label: string; presets: ReadonlyArray<readonly [string, string]>; value: string | null; fallback: string; onChange: (colour: string | null) => void }) {
  const shown = value ?? fallback
  return (
    <fieldset className="colour-choice">
      <legend>{label}</legend>
      <input type="hidden" name={name} value={value ?? ''} />
      <div className="colour-swatches">
        {presets.map(([title, colour]) => <button key={colour} type="button" className={`colour-swatch${shown.toLowerCase() === colour ? ' is-selected' : ''}`} style={{ background: colour }} title={title} aria-label={title} aria-pressed={shown.toLowerCase() === colour} onClick={() => onChange(colour)} />)}
        <label className="colour-picker" title="Pick any colour">
          <span className="colour-picker-dot" style={{ background: shown }} aria-hidden="true" /><Pipette size={14} aria-hidden="true" /> Pick colour
          <input type="color" value={shown} onChange={(event) => onChange(event.target.value)} aria-label={`${label}: pick any colour`} />
        </label>
        <HexInput value={shown} label={label} onChange={onChange} />
        <button type="button" className="text-link" disabled={value === null} onClick={() => onChange(null)}>Reset to default</button>
      </div>
    </fieldset>
  )
}

/**
 * The owner's colour choices for the resident portal, with a live preview of text, a card, a button
 * and an error message in them. Saved through the surrounding Settings form (hidden inputs
 * portalThemeColor, portalButtonTextColor, portalErrorColor, portalTextColor, portalPlaceholderColor
 * the three banner colours, the app background and the card backgrounds); blank = default.
 */
export function PortalColourFields({ theme, text, error, ink, placeholder, newBadge, soonBadge, betaBadge, background, card, childCard }: { theme: string | null; text: string | null; error: string | null; ink: string | null; placeholder: string | null; newBadge: string | null; soonBadge: string | null; betaBadge: string | null; background: string | null; card: string | null; childCard: string | null }) {
  const [themeColour, setThemeColour] = useState(theme)
  const [textColour, setTextColour] = useState(text)
  const [errorColour, setErrorColour] = useState(error)
  const [inkColour, setInkColour] = useState(ink)
  const [placeholderColour, setPlaceholderColour] = useState(placeholder)
  const [newColour, setNewColour] = useState(newBadge)
  const [soonColour, setSoonColour] = useState(soonBadge)
  const [betaColour, setBetaColour] = useState(betaBadge)
  const [backgroundColour, setBackgroundColour] = useState(background)
  const [cardColour, setCardColour] = useState(card)
  const [childCardColour, setChildCardColour] = useState(childCard)
  return (
    <>
      <ColourChoice name="portalThemeColor" label="Theme colour" presets={themePresets} value={themeColour} fallback={defaultPortalColours.theme} onChange={setThemeColour} />
      <ColourChoice name="portalButtonTextColor" label="Button text colour" presets={textPresets} value={textColour} fallback={defaultPortalColours.text} onChange={setTextColour} />
      <ColourChoice name="portalBackgroundColor" label="App background colour (light view)" presets={backgroundPresets} value={backgroundColour} fallback={defaultPortalColours.background} onChange={setBackgroundColour} />
      <ColourChoice name="portalCardColor" label="Main card background (light view)" presets={cardPresets} value={cardColour} fallback={defaultPortalColours.card} onChange={setCardColour} />
      <ColourChoice name="portalChildCardColor" label="Inner card background (light view)" presets={cardPresets} value={childCardColour} fallback={defaultPortalColours.childCard} onChange={setChildCardColour} />
      <ColourChoice name="portalTextColor" label="Text colour (light view)" presets={inkPresets} value={inkColour} fallback={defaultPortalColours.ink} onChange={setInkColour} />
      <ColourChoice name="portalPlaceholderColor" label="Placeholder text colour (light view)" presets={placeholderPresets} value={placeholderColour} fallback={defaultPortalColours.placeholder} onChange={setPlaceholderColour} />
      <ColourChoice name="portalErrorColor" label="Error message colour" presets={errorPresets} value={errorColour} fallback={defaultPortalColours.error} onChange={setErrorColour} />
      <ColourChoice name="portalNewBadgeColor" label="New banner colour" presets={badgePresets} value={newColour} fallback={defaultPortalColours.newBadge} onChange={setNewColour} />
      <ColourChoice name="portalSoonBadgeColor" label="Coming soon banner colour" presets={badgePresets} value={soonColour} fallback={defaultPortalColours.soonBadge} onChange={setSoonColour} />
      <ColourChoice name="portalBetaBadgeColor" label="Beta banner colour" presets={badgePresets} value={betaColour} fallback={defaultPortalColours.betaBadge} onChange={setBetaColour} />
      <div className="portal-colour-preview" style={portalColourStyle({ theme: themeColour ?? defaultPortalColours.theme, text: textColour ?? defaultPortalColours.text, error: errorColour ?? defaultPortalColours.error, ink: inkColour ?? defaultPortalColours.ink, placeholder: placeholderColour ?? defaultPortalColours.placeholder, newBadge: newColour ?? defaultPortalColours.newBadge, soonBadge: soonColour ?? defaultPortalColours.soonBadge, betaBadge: betaColour ?? defaultPortalColours.betaBadge, background: backgroundColour ?? defaultPortalColours.background, card: cardColour ?? defaultPortalColours.card, childCard: childCardColour ?? defaultPortalColours.childCard })} aria-label="Preview">
        <span className="portal-colour-preview-label">Preview (how residents will see it)</span>
        <span className="portal-colour-preview-text">Good evening, Mark. Your rent for October is paid.</span>
        <input className="portal-colour-preview-input" placeholder="e.g. Fan not working" readOnly tabIndex={-1} aria-label="Example input with placeholder text" />
        <span className="portal-colour-preview-card"><strong>Upcoming holidays</strong><small>Cards are tinted with the theme colour</small></span>
        <span className="portal-colour-preview-button">Request housekeeping</span>
        <span className="portal-colour-preview-badges"><span className="new-badge">New</span><span className="coming-soon-tag">Coming soon</span><span className="beta-tag">Beta</span></span>
        <span className="portal-colour-preview-error">Example error message: "Choose a time slot before sending."</span>
      </div>
    </>
  )
}
