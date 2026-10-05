/** Copies text (an access key, contact detail, Wi-Fi password) and reports the outcome through the app's toast. */
export async function copyWithNotice(text: string, label: string, onNotice: (message: string) => void) {
  try {
    await navigator.clipboard.writeText(text)
    onNotice(`${label} copied.`)
  } catch {
    onNotice(`Could not copy. Select the ${label.toLowerCase()} and copy it manually.`)
  }
}
