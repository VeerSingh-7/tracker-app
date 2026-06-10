// The whole app is gated by a single fixed 6-digit master PIN. We store only the
// SHA-256 hash of the PIN as the constant below — this is LIGHT OBFUSCATION so the
// raw number isn't sitting in plain sight in the source. It is NOT real security:
// client-side code (including this hash) is fully inspectable, and a 6-digit PIN
// is trivially brute-forced. It only keeps casual snoopers out on a shared device.

export const MASTER_PIN_LENGTH = 6

// SHA-256("300110")
const MASTER_PIN_HASH = '01250ed681a81c1e74fdcc89d4c38af22445184045277c1a595cbd1e3d9740e6'

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

// Hash the entered PIN and compare it to the stored master hash.
export async function verifyMasterPin(pin: string): Promise<boolean> {
  return (await sha256(pin)) === MASTER_PIN_HASH
}
