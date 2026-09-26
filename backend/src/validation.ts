const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Loose email shape check (something@domain.tld); shared so every form accepts the same addresses. */
export function isValidEmail(value: string) {
  return emailPattern.test(value)
}
