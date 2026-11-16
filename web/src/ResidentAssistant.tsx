import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles, X } from 'lucide-react'
import { readApiError } from './superAdmin'

type Turn = { role: 'user' | 'assistant'; content: string }

const suggestions = ['When is my rent due?', "What's the Wi-Fi password?", 'What are the quiet hours?']

/**
 * The resident AI assistant: a floating button (bottom-right, above the tab bar on phones) that opens a chat which
 * answers questions about their own stay from what the portal knows (backend assistant.ts). Read-only by design: it
 * points to the right screen rather than doing anything. The chat lives only in this page's memory, never stored.
 */
export function ResidentAssistant() {
  const [isOpen, setIsOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [error, setError] = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  // Keep the newest message in view as the chat grows.
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }) }, [turns, isThinking])

  async function ask(question: string) {
    const text = question.trim()
    if (!text || isThinking) return
    const next: Turn[] = [...turns, { role: 'user', content: text }]
    setTurns(next)
    setDraft('')
    setError('')
    setIsThinking(true)
    try {
      const response = await fetch('/api/resident-portal/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next }) })
      if (!response.ok) { setError(await readApiError(response, 'The assistant could not answer. Please try again.')); return }
      const { reply } = await response.json() as { reply: string }
      setTurns([...next, { role: 'assistant', content: reply }])
    } catch {
      setError('Could not reach the server.')
    } finally {
      setIsThinking(false)
    }
  }

  return (
    <>
      {!isOpen && <button type="button" className="assistant-fab" aria-label="Ask the AI assistant" title="AI assistant" onClick={() => setIsOpen(true)}><Sparkles size={22} /></button>}
      {isOpen && (
        <section className="assistant-panel" role="dialog" aria-label="AI assistant">
          <header className="assistant-head"><span className="assistant-head-icon" aria-hidden="true"><Sparkles size={16} /></span><div><strong>AI assistant</strong><small>Answers about your stay. Can make mistakes.</small></div><button type="button" className="icon-button" aria-label="Close assistant" onClick={() => setIsOpen(false)}><X size={18} /></button></header>
          <div className="assistant-log" ref={logRef} aria-live="polite">
            {!turns.length && <div className="assistant-empty"><p>Hi! Ask me about rent, Wi-Fi, house rules, meals or anything about your PG.</p><div className="assistant-suggestions">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => void ask(suggestion)}>{suggestion}</button>)}</div></div>}
            {turns.map((turn, index) => <p key={index} className={`assistant-bubble is-${turn.role}`}>{turn.content}</p>)}
            {isThinking && <p className="assistant-bubble is-assistant is-thinking" aria-label="Thinking"><span /><span /><span /></p>}
            {error && <p className="assistant-error" role="alert">{error}</p>}
          </div>
          <form className="assistant-form" onSubmit={(event) => { event.preventDefault(); void ask(draft) }}>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1000} placeholder="Ask a question…" aria-label="Your question" autoFocus />
            <button type="submit" className="assistant-send" aria-label="Send" disabled={!draft.trim() || isThinking}><Send size={16} /></button>
          </form>
        </section>
      )}
    </>
  )
}
