import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, Copy, MessageCircle, Phone, Plus, Share2, Trash2, UserPlus, X } from 'lucide-react'
import { BookingFields } from './BookingFields'
import { bookingLink, bookingSourceLabels, readBookingFields, bookingStatusLabels, bookingStatusTones, shareableSources, type BookableProperty, type BookingRequest, type BookingSource, type BookingStatus } from './booking'
import { Pagination } from './Pagination'
import { readApiError } from './superAdmin'
import { useRefreshSignal } from './useAutoRefresh'
import { listPageSize, usePagination } from './usePagination'

async function fetchBookings() {
  const response = await fetch('/api/bookings')
  if (!response.ok) throw new Error('Booking requests failed')
  return await response.json() as BookingRequest[]
}

const formatDay = (value: string) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
// WhatsApp's click-to-chat wants the number with its country code and no "+".
const whatsappLink = (booking: BookingRequest) => `https://wa.me/91${booking.phone}?text=${encodeURIComponent(`Hi ${booking.name}, thanks for your booking request for ${booking.property}.`)}`

/**
 * Booking requests from the public /book form (shared on social media) plus the owner's own
 * phone and walk-in entries: filter by source and status, triage, contact, or convert one into
 * a resident. `onConvert` opens the resident form; its callback marks the request accepted.
 */
export function BookingRequestsView({ properties, refreshSignal, onConvert, onBack, onNotice }: { properties: BookableProperty[]; refreshSignal: number; onConvert: (booking: BookingRequest, onConverted: (residentId: string) => void) => void; onBack: () => void; onNotice: (message: string) => void }) {
  const [bookings, setBookings] = useState<BookingRequest[] | null>(null)
  const [source, setSource] = useState<BookingSource | 'all'>('all')
  const [status, setStatus] = useState<BookingStatus | 'all'>('all')
  const [isAdding, setIsAdding] = useState(false)
  const [isSharing, setIsSharing] = useState(false)

  useEffect(() => { fetchBookings().then(setBookings, () => onNotice('Booking requests could not be loaded.')) }, [onNotice])
  useRefreshSignal(refreshSignal, () => { fetchBookings().then(setBookings, () => undefined) })

  const all = bookings ?? []
  const sourceCounts = all.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.source]: (counts[item.source] ?? 0) + 1 }), {})
  const visible = all.filter((item) => (source === 'all' || item.source === source) && (status === 'all' || item.status === status))
  const pager = usePagination(visible, listPageSize, `${source}|${status}`)

  const upsert = useCallback((booking: BookingRequest) => setBookings((current) => (current ?? []).some((item) => item.id === booking.id) ? (current ?? []).map((item) => item.id === booking.id ? booking : item) : [booking, ...(current ?? [])]), [])

  async function changeStatus(booking: BookingRequest, next: BookingStatus, residentId?: string) {
    const response = await fetch(`/api/bookings/${booking.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next, residentId }) }).catch(() => null)
    if (!response?.ok) { onNotice(response ? await readApiError(response, 'The request could not be updated.') : 'Could not reach the server.'); return }
    upsert(await response.json() as BookingRequest)
  }

  async function remove(booking: BookingRequest) {
    if (!window.confirm(`Delete the booking request from ${booking.name}?`)) return
    const response = await fetch(`/api/bookings/${booking.id}`, { method: 'DELETE' }).catch(() => null)
    if (!response?.ok) { onNotice('The request could not be deleted.'); return }
    setBookings((current) => (current ?? []).filter((item) => item.id !== booking.id))
    onNotice('Booking request deleted.')
  }

  async function copyLink(platform: string) {
    try { await navigator.clipboard.writeText(bookingLink(platform)); onNotice(`${bookingSourceLabels[platform as BookingSource]} link copied.`) } catch { onNotice(bookingLink(platform)) }
  }

  const sourceChips: Array<BookingSource | 'all'> = ['all', ...(Object.keys(bookingSourceLabels) as BookingSource[]).filter((key) => sourceCounts[key])]

  return (
    <section className="workspace-view crud-view booking-requests">
      <div className="workspace-view-heading"><div><p className="eyebrow">Workspace module</p><h2>Booking requests</h2><p>Requests from your booking link on Instagram, Facebook, WhatsApp and Google, plus calls and walk-ins you add.</p></div><div className="view-actions"><button className="secondary-button" onClick={() => setIsSharing((open) => !open)}><Share2 size={15} /> Share booking link</button><button className="primary-button" onClick={() => setIsAdding(true)}><Plus size={16} /> Add request</button><button className="secondary-button" onClick={onBack}>Back to overview</button></div></div>

      {isSharing && (
        <div className="booking-share">
          <p>Post the link for each platform, e.g. in your Instagram bio or WhatsApp status. Requests show which one they came from.</p>
          <ul>{shareableSources.map((platform) => <li key={platform}><strong>{bookingSourceLabels[platform]}</strong><code>{bookingLink(platform)}</code><button type="button" className="icon-button" aria-label={`Copy ${bookingSourceLabels[platform]} link`} title="Copy link" onClick={() => copyLink(platform)}><Copy size={14} /></button></li>)}</ul>
        </div>
      )}

      {all.length > 0 && (
        <div className="booking-filters">
          <div className="booking-source-chips" role="group" aria-label="Filter by source">{sourceChips.map((key) => <button key={key} type="button" className={`booking-chip${source === key ? ' is-selected' : ''}`} aria-pressed={source === key} onClick={() => setSource(key)}>{key === 'all' ? 'All' : bookingSourceLabels[key]}<b>{key === 'all' ? all.length : sourceCounts[key]}</b></button>)}</div>
          <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value as BookingStatus | 'all')}><option value="all">All statuses</option>{Object.entries(bookingStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>
      )}

      <div className="crud-list">
        {bookings === null ? <p className="portal-empty">Loading…</p> : visible.length ? pager.pageItems.map((booking) => (
          <div className="crud-row booking-row" key={booking.id}>
            <div className="crud-main">
              <strong>{booking.name} <span className="booking-source">{bookingSourceLabels[booking.source] ?? booking.source}</span></strong>
              <small>{[booking.phone, booking.property, booking.moveInDate && `Move in ${formatDay(booking.moveInDate)}`, booking.foodOpted === null ? null : booking.foodOpted ? 'With food' : 'Without food', `Received ${formatDay(booking.createdAt)}`].filter(Boolean).join(' · ')}</small>
              {booking.message && <p className="booking-message">“{booking.message}”</p>}
            </div>
            <div className="crud-actions">
              <select className={`booking-status is-${bookingStatusTones[booking.status]}`} aria-label={`Status of ${booking.name}'s request`} value={booking.status} onChange={(event) => void changeStatus(booking, event.target.value as BookingStatus)}>{Object.entries(bookingStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <a className="icon-button" href={`tel:${booking.phone}`} aria-label={`Call ${booking.name}`} title="Call"><Phone size={15} /></a>
              <a className="icon-button" href={whatsappLink(booking)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${booking.name}`} title="WhatsApp"><MessageCircle size={15} /></a>
              {booking.residentId ? <span className="status-pill sage">Resident added</span> : <button type="button" className="secondary-button" onClick={() => onConvert(booking, (residentId) => void changeStatus(booking, 'accepted', residentId))}><UserPlus size={13} /> Convert to resident</button>}
              <button className="row-delete" aria-label={`Delete request from ${booking.name}`} onClick={() => remove(booking)}><Trash2 size={14} /></button>
            </div>
          </div>
        )) : <div className="workspace-empty"><div className="workspace-empty-icon"><ClipboardList size={22} /></div><h3>{all.length ? 'No requests match' : 'No booking requests yet'}</h3><p>{all.length ? 'Try another source or status.' : 'Share your booking link on social media; requests will appear here.'}</p>{!all.length && <button className="secondary-button" onClick={() => setIsSharing(true)}><Share2 size={15} /> Share booking link</button>}</div>}
      </div>
      <Pagination state={pager} label="Booking requests" />

      {isAdding && <AddBookingModal properties={properties} onClose={() => setIsAdding(false)} onSaved={(booking) => { upsert(booking); setIsAdding(false); onNotice('Booking request added.') }} />}
    </section>
  )
}

/** The owner's form for an enquiry that came by phone or in person (or any other source). */
function AddBookingModal({ properties, onClose, onSaved }: { properties: BookableProperty[]; onClose: () => void; onSaved: (booking: BookingRequest) => void }) {
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setIsSaving(true)
    const response = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...readBookingFields(form), source: form.get('source') }) }).catch(() => null)
    setIsSaving(false)
    if (!response?.ok) { setError(response ? await readApiError(response, 'The request could not be saved.') : 'Could not reach the server.'); return }
    onSaved(await response.json() as BookingRequest)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="profile-modal payment-modal" onSubmit={save}>
        <div className="modal-heading"><div><p className="eyebrow">Booking requests</p><h2>Add request</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
        <label>Came in by<select name="source" defaultValue="phone">{Object.entries(bookingSourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <BookingFields properties={properties} />
        {error && <p className="login-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={isSaving}><Plus size={16} /> {isSaving ? 'Saving…' : 'Save'}</button></div>
      </form>
    </div>
  )
}
