import { useEffect, useState } from 'react'
import { BadgeCheck, Eye, EyeOff } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { EmergencyContactFields, emergencyContactFields } from './EmergencyContact'
import { readIdentityFields, type DocumentUploads } from './identity'
import { IdentityDocumentFields } from './IdentityDocumentFields'
import { InlineLoader } from './Loader'
import { OccupationFields } from './OccupationFields'
import { ResidentPhotoField, type PhotoChange } from './ResidentPhotoField'
import { readApiError } from './superAdmin'
import { useTransparentLogo } from './transparentLogo'
import { VehicleFields, vehicleFields } from './VehicleFields'

/** Who the link is for and the bed reserved for them; mirrors GET /api/registration/:token. */
type Invite = { name: string; phone: string | null; property: string | null; /** The property's cover image; null when it has none, and the workspace logo shows instead. */ propertyImage: string | null; room: string | null; bed: number | null; businessName: string; defaultNationality: string }

const minimumPasswordLength = 10

/**
 * The page a new resident opens from the registration link staff sent them on WhatsApp. They fill in what the
 * owner's Add resident form asks for (personal details, emergency contact, vehicle, ID document), take a live
 * photo and choose a password. Staff then review and approve it before the resident can sign in, so the page
 * ends by saying so. No account is needed: the link's token is the only key, and it works once.
 */
export function RegistrationPage({ token }: { token: string }) {
  const [invite, setInvite] = useState<Invite | null>(null)
  const [loadError, setLoadError] = useState('')
  const [uploads, setUploads] = useState<DocumentUploads>({})
  const [photo, setPhoto] = useState<PhotoChange>(undefined)
  const [name, setName] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const propertyImage = useTransparentLogo(invite?.propertyImage ?? null)

  useEffect(() => {
    fetch(`/api/registration/${token}`)
      .then(async (response) => response.ok ? response.json() as Promise<Invite> : Promise.reject(new Error(await readApiError(response, 'This registration link cannot be opened.'))))
      .then((loaded) => { setInvite(loaded); setName(loaded.name) }, (reason: unknown) => setLoadError(reason instanceof Error ? reason.message : 'This registration link cannot be opened.'))
  }, [token])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') ?? '')
    if (!photo) { setError('Take your profile photo with the camera.'); return }
    if (password.length < minimumPasswordLength) { setError(`Choose a password of at least ${minimumPasswordLength} characters.`); return }
    if (password !== form.get('confirmPassword')) { setError('The two passwords do not match.'); return }
    const fields = Object.fromEntries(['name', 'email', 'occupation', 'permanentAddress', ...emergencyContactFields, ...vehicleFields].map((field) => [field, String(form.get(field) ?? '')]))
    setIsSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/registration/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fields, ...readIdentityFields(form), ...uploads, profilePhoto: photo, password }) })
      if (!response.ok) { setError(await readApiError(response, 'Your registration could not be sent.')); return }
      setIsDone(true)
      window.scrollTo(0, 0)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const place = invite && [invite.property, invite.room && `Room ${invite.room}`, invite.bed && `Bed ${invite.bed}`].filter(Boolean).join(' · ')

  return (
    <main className="booking-page">
      <div className="booking-card registration-card">
        {/* The property the resident is joining, rather than the workspace's brand, once the link is known to be theirs. */}
        {invite && propertyImage
          ? <div className="registration-property"><img src={propertyImage} alt={invite.property ?? 'Property'} /><strong>{invite.property}</strong></div>
          : <div className="brand-row booking-brand"><BrandMark /></div>}
        {loadError ? <><h1>Link not available</h1><p className="booking-intro">{loadError}</p></>
          : !invite ? <InlineLoader />
          : isDone ? <div className="registration-done"><BadgeCheck size={36} /><h1>Registration sent</h1><p className="booking-intro">Thank you, {name.split(' ')[0]}. {invite.businessName} will check your details and ID. Once they approve, sign in with your phone number ({invite.phone}) and the password you chose.</p></div>
          : <form className="profile-modal resident-modal registration-form" onSubmit={submit}>
              <div className="registration-intro"><h1>Complete your registration</h1><p className="booking-intro">{invite.businessName} has reserved your bed{place ? `: ${place}` : ''}. Fill in your details below; they are checked before your account is opened.</p></div>
              <ResidentPhotoField name={name} currentUrl={null} change={photo} onChange={setPhoto} isRequired />
              <label>Full name<input name="name" required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>
              <label>Phone number<input value={invite.phone ?? ''} readOnly aria-readonly="true" /><small>The number this link was sent to; it is how you sign in.</small></label>
              <label>Email address<input name="email" type="email" required autoComplete="email" placeholder="you@example.com" /></label>
              <OccupationFields onCard={(card) => setUploads((current) => ({ ...current, studentIdCardUrl: card }))} onError={setError} />
              <label>Permanent address<textarea name="permanentAddress" required autoComplete="street-address" placeholder="Full permanent address" /></label>
              <EmergencyContactFields />
              <VehicleFields />
              <IdentityDocumentFields defaultNationality={invite.defaultNationality} required onUpload={(chosen) => setUploads((current) => ({ ...current, ...chosen }))} onError={setError} />
              <div className="access-key-field">
                <label htmlFor="registration-password">Choose a password <span>(at least {minimumPasswordLength} characters)</span></label>
                <div className="access-key-control">
                  <input id="registration-password" name="password" type={isPasswordVisible ? 'text' : 'password'} required minLength={minimumPasswordLength} autoComplete="new-password" />
                  <button type="button" className="icon-button" aria-label={isPasswordVisible ? 'Hide password' : 'Show password'} onClick={() => setIsPasswordVisible((visible) => !visible)}>{isPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
              </div>
              <label>Confirm password<input name="confirmPassword" type={isPasswordVisible ? 'text' : 'password'} required minLength={minimumPasswordLength} autoComplete="new-password" /></label>
              {error && <p className="login-error" role="alert">{error}</p>}
              <div className="modal-actions"><button type="submit" className="primary-button" disabled={isSaving}>{isSaving ? 'Sending…' : 'Submit registration'}</button></div>
            </form>}
      </div>
    </main>
  )
}
