import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { documentAccept, readDocumentFile } from './documentUpload'
import { occupationChoices, splitOccupation, type OccupationChoice } from './occupations'

/**
 * The required occupation as one form cell: a choice of Student, Working professional, Business or
 * Other (which asks for their own words), submitted as `occupation`. A Student also needs their college or
 * school ID card: required while none is on file, replaceable when one is, and passed up through `onCard`
 * like the other ID documents (undefined keeps what is on file). Shared by the owner's resident form and the
 * resident's own My details form; the server applies the same rule (studentId.ts).
 */
export function OccupationFields({ saved, hasCardOnFile = false, currentCardUrl, onCard, onError }: { saved?: string | null; hasCardOnFile?: boolean; /** Where the card on file can be viewed; no link without it. */ currentCardUrl?: string; onCard: (dataUrl: string | undefined) => void; onError: (message: string) => void }) {
  const initial = splitOccupation(saved)
  const [choice, setChoice] = useState<OccupationChoice | ''>(initial.choice)
  const [other, setOther] = useState(initial.other)
  const occupation = choice === 'Other' ? other.trim() : choice

  async function chooseCard(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const file = input.files?.[0]
    if (!file) { onCard(undefined); return }
    const result = await readDocumentFile(file, 'Student ID card')
    if ('error' in result) { onError(result.error); input.value = ''; onCard(undefined); return }
    onError('')
    onCard(result.dataUrl)
  }

  function changeChoice(next: OccupationChoice | '') {
    setChoice(next)
    // A card picked before switching away from Student must not be sent with another occupation.
    if (next !== 'Student') onCard(undefined)
  }

  return (
    <div className="occupation-fields">
      <label>Occupation<select required value={choice} onChange={(event) => changeChoice(event.target.value as OccupationChoice | '')}>
        <option value="" disabled>Choose one</option>
        {[...occupationChoices, 'Other' as const].map((item) => <option key={item} value={item}>{item}</option>)}
      </select></label>
      {choice === 'Other' && <label className="occupation-other">What do they do?<input required maxLength={60} value={other} onChange={(event) => setOther(event.target.value)} placeholder="e.g. Nurse, Freelancer" /></label>}
      <input type="hidden" name="occupation" value={occupation} />
      {choice === 'Student' && <>
        <label className="document-upload">Student ID card <span>{hasCardOnFile ? '(choose a file to replace the current one)' : '(college or school ID; JPG, PNG or PDF)'}</span><input type="file" accept={documentAccept} required={!hasCardOnFile} onChange={(event) => void chooseCard(event)} /></label>
        {hasCardOnFile && currentCardUrl && <a className="current-card-link" href={currentCardUrl} target="_blank" rel="noopener noreferrer">View current ID card <ExternalLink size={11} /></a>}
      </>}
    </div>
  )
}
