import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { CountryField } from './CountryField'
import { documentAccept, readDocumentFile } from './documentUpload'
import { identityDocumentName, indianNationality, isIndian, visaTypeLabels, type DocumentUploads, type IdentityDetails } from './identity'

type IdentityDocumentFieldsProps = {
  /** The record being edited; its values prefill the inputs and its nationality is the saved one. */
  details?: Partial<IdentityDetails>
  /** Preselected nationality when there is no record to edit, e.g. the resident's own submission. */
  defaultNationality?: string
  /** Where the uploads on file can be viewed (owner only); omitted links are not shown. */
  currentDocumentUrls?: { aadharCard?: string; passportScan?: string }
  required: boolean
  onUpload: (uploads: DocumentUploads) => void
  onError: (message: string) => void
}

// The earliest expiry a new document may have: tomorrow, in the viewer's calendar.
function tomorrowDateInputValue() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Nationality plus the matching identity document inputs: Aadhaar number and card for Indian
 * nationals, passport (number, expiry, photo page) and visa (number, type, expiry) for everyone
 * else. Text inputs submit with the form; chosen files are read and passed up through `onUpload`.
 * Shared by the owner's resident form and the resident's own verification screen.
 */
export function IdentityDocumentFields({ details, defaultNationality, currentDocumentUrls, required, onUpload, onError }: IdentityDocumentFieldsProps) {
  const savedNationality = details?.nationality ?? defaultNationality ?? indianNationality
  const [nationality, setNationality] = useState(savedNationality)
  const isNationalityChanged = Boolean(details?.nationality) && nationality !== savedNationality
  // An expiry already on file may have passed; blocking it in the browser would stop unrelated
  // edits, so only a fresh entry gets the minimum (the server rejects newly entered past dates).
  const minimumExpiry = (saved: string | null | undefined) => (saved ? undefined : tomorrowDateInputValue())

  async function choose(event: React.ChangeEvent<HTMLInputElement>, key: keyof DocumentUploads, documentName: string) {
    const input = event.target
    const file = input.files?.[0]
    if (!file) { onUpload({ [key]: undefined }); return }
    const result = await readDocumentFile(file, documentName)
    if ('error' in result) { onError(result.error); input.value = ''; onUpload({ [key]: undefined }); return }
    onError('')
    onUpload({ [key]: result.dataUrl })
  }

  const replaceHint = (hasFile: boolean | undefined) => details && <span>{hasFile ? '(choose a file to replace the current one)' : '(none on file)'}</span>

  return (
    <>
      <CountryField name="nationality" label="Nationality" defaultCode={savedNationality} onChange={(country) => setNationality(country.code)} />
      {isNationalityChanged && <p className="identity-change-note" role="status">Saving removes the {identityDocumentName(savedNationality).toLowerCase()} details on file and restarts verification with the {identityDocumentName(nationality).toLowerCase()}.</p>}
      {isIndian(nationality)
        ? <>
            <label>Aadhaar number <span>(12 digits)</span><input name="aadharNumber" inputMode="numeric" autoComplete="off" pattern="[0-9 ]{12,14}" maxLength={14} title="Enter the 12-digit Aadhaar number" required={required} defaultValue={isNationalityChanged ? '' : details?.aadharNumber ?? ''} placeholder="12-digit Aadhaar number" /></label>
            <label className="document-upload">Aadhaar card {replaceHint(details?.hasAadharCard && !isNationalityChanged)}<input type="file" accept={documentAccept} required={required} onChange={(event) => choose(event, 'aadharCardUrl', 'Aadhaar card')} /></label>
            {!isNationalityChanged && details?.hasAadharCard && currentDocumentUrls?.aadharCard && <a className="current-card-link" href={currentDocumentUrls.aadharCard} target="_blank" rel="noopener noreferrer">View current card <ExternalLink size={11} /></a>}
          </>
        : <>
            <label>Passport number <span>(6–9 letters or digits)</span><input name="passportNumber" autoComplete="off" autoCapitalize="characters" spellCheck={false} pattern="[A-Za-z0-9]{6,9}" maxLength={9} title="6 to 9 letters or digits, as printed on the passport" required={required} defaultValue={isNationalityChanged ? '' : details?.passportNumber ?? ''} placeholder="e.g. K1234567" /></label>
            <label>Passport expiry<input name="passportExpiry" type="date" required={required} min={minimumExpiry(details?.passportExpiry)} defaultValue={isNationalityChanged ? '' : details?.passportExpiry?.slice(0, 10) ?? ''} /></label>
            <label className="document-upload">Passport photo page {replaceHint(details?.hasPassportScan && !isNationalityChanged)}<input type="file" accept={documentAccept} required={required} onChange={(event) => choose(event, 'passportScanUrl', 'Passport scan')} /></label>
            {!isNationalityChanged && details?.hasPassportScan && currentDocumentUrls?.passportScan && <a className="current-card-link" href={currentDocumentUrls.passportScan} target="_blank" rel="noopener noreferrer">View current passport scan <ExternalLink size={11} /></a>}
            <label>Visa number <span>(OCI card number for OCI holders)</span><input name="visaNumber" autoComplete="off" autoCapitalize="characters" spellCheck={false} pattern="[A-Za-z0-9]{4,20}" maxLength={20} title="4 to 20 letters or digits" required={required} defaultValue={isNationalityChanged ? '' : details?.visaNumber ?? ''} /></label>
            <label>Visa type<select name="visaType" required={required} defaultValue={isNationalityChanged ? '' : details?.visaType ?? ''}><option value="" disabled>Select visa type</option>{Object.entries(visaTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Visa expiry<input name="visaExpiry" type="date" required={required} min={minimumExpiry(details?.visaExpiry)} defaultValue={isNationalityChanged ? '' : details?.visaExpiry?.slice(0, 10) ?? ''} /></label>
          </>}
    </>
  )
}
