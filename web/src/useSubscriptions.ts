import { useCallback, useEffect, useState } from 'react'
import { fetchSubscriptions, subscriptionEndedCode, type MySubscription, type ReceptionistSubscriptions } from './subscriptions'
import { useRefreshSignal } from './useAutoRefresh'

/**
 * The signed-in receptionist's own subscription, reloaded with the dashboard. When the server answers
 * that it has ended (it signs them out at that moment), `onEnded` gets the message so the app can
 * return to sign-in and say why, instead of leaving pages that fail one by one.
 */
export function useMySubscription(enabled: boolean, refreshSignal: number, onEnded: (message: string) => void) {
  const [subscription, setSubscription] = useState<MySubscription | null>(null)
  const load = useCallback(async () => {
    const response = await fetch('/api/my-subscription').catch(() => null)
    if (!response) return
    if (response.ok) { setSubscription(await response.json() as MySubscription); return }
    const body = await response.json().catch(() => ({})) as { error?: string; code?: string }
    if (body.code === subscriptionEndedCode) onEnded(body.error ?? 'Your subscription has ended.')
  }, [onEnded])
  useEffect(() => { if (enabled) void load() }, [enabled, load])
  useRefreshSignal(refreshSignal, () => { if (enabled) void load() })
  return subscription
}

/** Every receptionist's subscription for the super admin's notifications, reloaded with the dashboard. */
export function useReceptionistSubscriptions(enabled: boolean, refreshSignal: number) {
  const [rows, setRows] = useState<ReceptionistSubscriptions[] | null>(null)
  const load = useCallback(() => { if (enabled) fetchSubscriptions().then(setRows, () => undefined) }, [enabled])
  useEffect(load, [load])
  useRefreshSignal(refreshSignal, load)
  return enabled ? rows : null
}
