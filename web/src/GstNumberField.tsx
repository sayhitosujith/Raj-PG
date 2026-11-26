/**
 * The optional GST number (GSTIN) input on the add and edit property forms. Shown upper-case as it is
 * typed; the API strips spaces, upper-cases it and checks its check character, so a typo is reported
 * on save. Room is left for spaces, since owners often copy it as "29 ABCDE1234F 1ZW".
 */
export function GstNumberField({ defaultValue = '' }: { defaultValue?: string }) {
  return (
    <label>GST number <span>(optional, 15 characters)</span>
      <input name="gstNumber" className="gst-input" maxLength={20} autoCapitalize="characters" autoComplete="off" spellCheck={false} defaultValue={defaultValue} placeholder="e.g. 29ABCDE1234F1ZW" />
    </label>
  )
}
