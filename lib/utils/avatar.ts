/**
 * Deterministic-color initials avatar utility.
 *
 * getInitials() derives 1-2 uppercase initials from a display name.
 * getAvatarColor() hashes a seed (contact name/phone/conversation id) to a
 * stable entry in a fixed palette, so the same contact always renders the
 * same avatar background color across reloads.
 */

export function getInitials(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim().replace(/\s+/g, ' ')
  if (!trimmed) return '?'
  const words = trimmed.split(' ')
  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase()
  }
  const first = words[0].charAt(0).toUpperCase()
  const last = words[words.length - 1].charAt(0).toUpperCase()
  return `${first}${last}`
}

export const AVATAR_PALETTE: { bg: string; text: string }[] = [
  { bg: 'bg-blue-500', text: 'text-white' },
  { bg: 'bg-emerald-500', text: 'text-white' }, // echoes --gradient-success #10B981
  { bg: 'bg-amber-500', text: 'text-white' }, // echoes --gradient-warning #F59E0B
  { bg: 'bg-rose-500', text: 'text-white' }, // echoes --gradient-danger #EF4444
  { bg: 'bg-purple-500', text: 'text-white' }, // echoes --gradient-premium #A855F7
  { bg: 'bg-pink-500', text: 'text-white' }, // echoes --gradient-premium #EC4899
  { bg: 'bg-cyan-500', text: 'text-white' },
  { bg: 'bg-indigo-500', text: 'text-white' },
]

function hashString(s: string): number {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i)
    hash |= 0 // force 32-bit int
  }
  return Math.abs(hash)
}

export function getAvatarColor(seed: string | null | undefined): { bg: string; text: string } {
  const key = (seed ?? '').trim() || 'unknown'
  const index = hashString(key) % AVATAR_PALETTE.length
  return AVATAR_PALETTE[index]
}
