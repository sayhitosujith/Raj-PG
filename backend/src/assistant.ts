import Anthropic from '@anthropic-ai/sdk'
import { Router } from 'express'
import type { AuthContext } from './auth.js'
import { assistantFacts } from './assistantFacts.js'
import { propertyNow } from './dates.js'
import { requireResidentFeature } from './residentFeatureGate.js'
import { receptionistEmailFor, requirePortalAccess, requireResident } from './residentPortal.js'
import { isAssistantConfigured } from './assistantConfig.js'

// Every message is billed, so each resident gets a daily allowance (India time). In memory, like live updates:
// a restart resets it, which is acceptable for a cost guard on a single API instance.
const dailyLimit = 30
const used = new Map<string, { day: string; count: number }>()
function takeAllowance(residentId: string) {
  const day = propertyNow().date
  const entry = used.get(residentId)
  const count = entry?.day === day ? entry.count : 0
  if (count >= dailyLimit) return false
  used.set(residentId, { day, count: count + 1 })
  return true
}

const maxTurns = 12
const maxMessageLength = 1000

// Stable instructions first; the resident's facts follow, so the wording of the rules never depends on whose chat it is.
const instructions = `You are the resident assistant in a paying-guest (PG) hostel app in India. You answer residents' questions about their own stay using only the facts below, which come from the app.

- Answer in the language the resident writes in, briefly: one to four short sentences, plain text, no markdown headings or tables.
- Use only the facts given. If something is not in them, say you don't have that information and suggest contacting the receptionist (give their phone or email from the facts).
- You cannot change anything: you can't record payments, book cleaning, raise repairs or move dates. Tell the resident which screen of the app does it instead.
- Never invent amounts, dates, rules or passwords. Quote figures exactly as given.
- For emergencies (fire, medical, safety), tell them to call 112 straight away and then the receptionist.
- Stay on the topic of their stay at the PG; politely decline unrelated requests.`

type ChatTurn = { role: 'user' | 'assistant'; content: string }

/** The conversation as sent by the portal, or a reason it is refused: alternating turns, ending with the resident's. */
function parseConversation(value: unknown): { turns: ChatTurn[] } | { error: string } {
  if (!Array.isArray(value) || !value.length) return { error: 'Ask a question first.' }
  const turns = value.slice(-maxTurns)
  for (const turn of turns) {
    if (typeof turn !== 'object' || turn === null) return { error: 'The conversation is not readable.' }
    const { role, content } = turn as Record<string, unknown>
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) return { error: 'The conversation is not readable.' }
    if (content.length > maxMessageLength) return { error: `Keep each message under ${maxMessageLength} characters.` }
  }
  // Trimming to the last few turns may cut mid-exchange; the API needs the first turn to be the resident's.
  while (turns.length && (turns[0] as ChatTurn).role !== 'user') turns.shift()
  if (!turns.length || (turns.at(-1) as ChatTurn).role !== 'user') return { error: 'Ask a question first.' }
  return { turns: turns.map((turn) => ({ role: (turn as ChatTurn).role, content: (turn as ChatTurn).content.trim() })) }
}

let client: Anthropic | null = null

/** POST /resident-portal/assistant: one reply to the resident's latest question. */
export const assistantRouter = Router()

assistantRouter.post('/resident-portal/assistant', requireResident, requirePortalAccess, requireResidentFeature('assistant'), async (request, response) => {
  if (!isAssistantConfigured()) { response.status(503).json({ error: 'The assistant is not set up yet.' }); return }
  const conversation = parseConversation((request.body as { messages?: unknown }).messages)
  if ('error' in conversation) { response.status(400).json({ error: conversation.error }); return }
  const { userId } = response.locals.auth as AuthContext
  if (!takeAllowance(userId)) { response.status(429).json({ error: `You've reached today's limit of ${dailyLimit} questions. Please contact the receptionist, or try again tomorrow.` }); return }
  try {
    const facts = await assistantFacts(userId, await receptionistEmailFor(response.locals.propertyId as string))
    client ??= new Anthropic()
    // Server-side fallback re-runs a declined request on a fallback model inside the same call ("default" routes by
    // the decline's category), so a resident rarely sees a refusal for an ordinary question.
    const reply = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: instructions }, { type: 'text', text: `Facts about this resident and their PG:\n${facts}` }],
      messages: conversation.turns,
    })
    if (reply.stop_reason === 'refusal') { response.json({ reply: "Sorry, I can't help with that. Please contact the receptionist." }); return }
    const text = reply.content.flatMap((block) => block.type === 'text' ? [block.text] : []).join('\n').trim()
    response.json({ reply: text || 'Sorry, I could not answer that. Please contact the receptionist.' })
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) { response.status(429).json({ error: 'The assistant is busy right now. Please try again in a minute.' }); return }
    if (error instanceof Anthropic.AuthenticationError) { console.error('Assistant: the Anthropic API key was rejected.'); response.status(503).json({ error: 'The assistant is not available right now.' }); return }
    console.error('Assistant reply failed:', error)
    response.status(503).json({ error: 'The assistant is not available right now. Please try again.' })
  }
})
