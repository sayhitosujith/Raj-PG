import { useEffect, useState } from 'react'
import { Globe, Image as ImageIcon, LayoutList, PanelBottom, Save, Sparkles, Type } from 'lucide-react'
import { InlineLoader } from './Loader'
import { defaultAboutPoints, defaultAboutText, defaultAboutTitle, defaultContactNote, defaultFooterText, defaultHeadline, defaultPerks, defaultTagline, siteSections, socialPlatforms, type SiteContent, type SiteFacts, type SiteSection, type SocialPlatform } from './siteContent'
import { fetchSite, locationsOf, startingPrice, unknownLocation } from './siteData'
import { readApiError } from './superAdmin'
import { WebsiteBannerField } from './WebsiteBannerField'

// The editor's working copy: every box as text (empty means "use the built-in text").
type Draft = { headline: string; tagline: string; aboutTitle: string; aboutText: string; aboutPoints: string; perks: Array<{ title: string; text: string }>; footerText: string; contactNote: string; social: Partial<Record<SocialPlatform, string>>; hidden: SiteSection[] }

const perkSlots = 4

const toDraft = (content: SiteContent): Draft => ({
  headline: content.headline ?? '', tagline: content.tagline ?? '', aboutTitle: content.aboutTitle ?? '', aboutText: content.aboutText ?? '',
  aboutPoints: (content.aboutPoints ?? []).join('\n'),
  perks: Array.from({ length: perkSlots }, (_, index) => content.perks?.[index] ?? { title: '', text: '' }),
  footerText: content.footerText ?? '', contactNote: content.contactNote ?? '', social: content.social,
  hidden: content.hidden,
})

const toBody = (draft: Draft) => ({
  headline: draft.headline, tagline: draft.tagline, aboutTitle: draft.aboutTitle, aboutText: draft.aboutText,
  aboutPoints: draft.aboutPoints.split('\n').map((point) => point.trim()).filter(Boolean),
  perks: draft.perks.filter((card) => card.title.trim() || card.text.trim()),
  footerText: draft.footerText, contactNote: draft.contactNote, social: draft.social,
  hidden: draft.hidden,
})

/**
 * The owner's Website page: the banner image (saved on its own, see WebsiteBannerField), the public site's text (hero headline and tagline, the About section and
 * its points, the "Why stay with us" cards, the footer and its social media links) and switches for its sections. A box left empty keeps the
 * built-in text, which shows in it as a grey example, so nothing has to be written for the site to work.
 */
export function WebsiteEditor({ onNotice, onBack }: { onNotice: (message: string) => void; onBack: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [facts, setFacts] = useState<SiteFacts | null>(null)
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetch('/api/site-content').then((response) => response.ok ? response.json() as Promise<SiteContent> : Promise.reject(new Error('load failed')))
      .then((content) => setDraft(toDraft(content)), () => setError('The website text could not be loaded.'))
    // The live site's facts, so the grey examples are the exact text the site shows today.
    fetchSite().then((site) => {
      setBannerUrl(site.bannerUrl)
      const prices = site.properties.map(startingPrice).filter((price): price is number => price !== null)
      setFacts({ businessName: site.businessName, cities: locationsOf(site.properties).map((area) => area.name).filter((name) => name !== unknownLocation), propertyCount: site.properties.length, lowestPrice: prices.length ? Math.min(...prices) : null })
    }, () => undefined)
  }, [])

  const update = (changes: Partial<Draft>) => setDraft((current) => current && { ...current, ...changes })
  const updatePerk = (index: number, changes: Partial<Draft['perks'][number]>) => setDraft((current) => current && { ...current, perks: current.perks.map((card, slot) => slot === index ? { ...card, ...changes } : card) })
  const toggleSection = (section: SiteSection, isOn: boolean) => setDraft((current) => current && { ...current, hidden: isOn ? current.hidden.filter((item) => item !== section) : [...current.hidden, section] })

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return
    setIsSaving(true)
    setError('')
    try {
      const response = await fetch('/api/site-content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toBody(draft)) })
      if (!response.ok) { setError(await readApiError(response, 'The website text could not be saved.')); return }
      setDraft(toDraft(await response.json() as SiteContent))
      onNotice('Website updated. Visitors see the changes straight away.')
    } catch {
      setError('Could not reach the server.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="workspace-view website-editor">
      <div className="workspace-view-heading"><div><p className="eyebrow">Manage</p><h2>Website</h2><p>The text on your public website and which sections it shows. Leave a box empty to keep the text shown in grey.</p></div><div className="view-actions"><button className="secondary-button" onClick={onBack}>Back to overview</button></div></div>
      {!draft ? (error ? <p className="login-error" role="alert">{error}</p> : <InlineLoader label="Loading the website text…" />) : (
        <form className="website-editor-grid" onSubmit={save}>
          <fieldset className="website-editor-card website-editor-wide">
            <legend><ImageIcon size={16} aria-hidden="true" /> Banner image</legend>
            <WebsiteBannerField bannerUrl={bannerUrl} onChange={setBannerUrl} onNotice={onNotice} />
          </fieldset>

          <fieldset className="website-editor-card">
            <legend><Type size={16} aria-hidden="true" /> Top of the page</legend>
            <label>Headline<input value={draft.headline} maxLength={90} onChange={(event) => update({ headline: event.target.value })} placeholder={defaultHeadline} /></label>
            <label>Tagline<textarea rows={3} value={draft.tagline} maxLength={240} onChange={(event) => update({ tagline: event.target.value })} placeholder={facts ? defaultTagline(facts) : ''} /></label>
          </fieldset>

          <fieldset className="website-editor-card">
            <legend><Globe size={16} aria-hidden="true" /> About</legend>
            <label>Title<input value={draft.aboutTitle} maxLength={80} onChange={(event) => update({ aboutTitle: event.target.value })} placeholder={defaultAboutTitle} /></label>
            <label>Text<textarea rows={4} value={draft.aboutText} maxLength={600} onChange={(event) => update({ aboutText: event.target.value })} placeholder={facts ? defaultAboutText(facts) : ''} /></label>
            <label>Points <span>(one per line, up to 5)</span><textarea rows={4} value={draft.aboutPoints} onChange={(event) => update({ aboutPoints: event.target.value })} placeholder={defaultAboutPoints.join('\n')} /></label>
          </fieldset>

          <fieldset className="website-editor-card website-editor-wide">
            <legend><Sparkles size={16} aria-hidden="true" /> Why stay with us</legend>
            <div className="website-editor-perks">{draft.perks.map((card, index) => (
              <div key={index} className="website-editor-perk">
                <label>Card {index + 1} title<input value={card.title} maxLength={40} onChange={(event) => updatePerk(index, { title: event.target.value })} placeholder={defaultPerks[index]?.title} /></label>
                <label>Text<textarea rows={2} value={card.text} maxLength={160} onChange={(event) => updatePerk(index, { text: event.target.value })} placeholder={defaultPerks[index]?.text} /></label>
              </div>
            ))}</div>
            <small>Fill in any card to use your own cards instead of the four examples.</small>
          </fieldset>

          <fieldset className="website-editor-card website-editor-wide">
            <legend><PanelBottom size={16} aria-hidden="true" /> Footer &amp; social media</legend>
            <div className="website-editor-perks">
              <label>Footer text<textarea rows={3} value={draft.footerText} maxLength={400} onChange={(event) => update({ footerText: event.target.value })} placeholder={facts ? defaultFooterText(facts) : ''} /></label>
              <label>Note under your phone number<input value={draft.contactNote} maxLength={120} onChange={(event) => update({ contactNote: event.target.value })} placeholder={defaultContactNote} /></label>
            </div>
            <div className="website-editor-perks">{socialPlatforms.map((platform) => (
              <label key={platform.key}>{platform.label}<input type="url" inputMode="url" value={draft.social[platform.key] ?? ''} maxLength={300} onChange={(event) => update({ social: { ...draft.social, [platform.key]: event.target.value } })} placeholder={platform.example} /></label>
            ))}</div>
            <small>Paste the full link to your page (starting with https://). Icons show in the footer only for the links you fill in; WhatsApp uses your contact phone from Settings.</small>
          </fieldset>

          <fieldset className="website-editor-card website-editor-wide">
            <legend><LayoutList size={16} aria-hidden="true" /> Sections</legend>
            <div className="website-editor-sections">{siteSections.map((section) => (
              <label key={section.key} className="website-editor-switch">
                <input type="checkbox" checked={!draft.hidden.includes(section.key)} onChange={(event) => toggleSection(section.key, event.target.checked)} />
                <span><strong>{section.label}</strong><small>{section.hint}</small></span>
              </label>
            ))}</div>
          </fieldset>

          {error && <p className="login-error website-editor-wide" role="alert">{error}</p>}
          <div className="website-editor-actions website-editor-wide">
            <button type="submit" className="primary-button" disabled={isSaving}><Save size={15} aria-hidden="true" /> {isSaving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      )}
    </section>
  )
}
