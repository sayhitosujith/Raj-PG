import { razorpayKeyId, razorpayKeySecret } from './razorpayConfig.js'

/**
 * Calls Razorpay's REST API with the account's key pair (Basic auth). Throws on a non-2xx
 * response with Razorpay's error body, so callers log the real reason. Amounts are in paise.
 */
export async function razorpayRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${razorpayKeyId()}:${razorpayKeySecret()}`).toString('base64')}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Razorpay ${path} failed (${response.status}): ${await response.text()}`)
  return await response.json() as T
}
