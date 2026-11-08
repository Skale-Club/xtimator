/** Expected study time and the "too fast" flag used by the admin dashboard. */

export const WORDS_PER_MINUTE = 200

export function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

/**
 * Expected seconds for one lesson: the authored `Expected minutes` when set,
 * else the known video duration plus reading time of the body at 200 wpm.
 */
export function expectedSeconds(input: {
  expectedMinutes: number | null
  videoDurationSeconds: number | null
  bodyWords: number
}): number {
  if (input.expectedMinutes != null && input.expectedMinutes > 0) {
    return Math.round(input.expectedMinutes * 60)
  }
  const reading = (Math.max(0, input.bodyWords) / WORDS_PER_MINUTE) * 60
  return Math.round(Math.max(0, input.videoDurationSeconds ?? 0) + reading)
}

/**
 * "Too fast": the lesson was completed with active time under 50% of expected,
 * or (when a video exists) less than 50% of it was actually watched.
 */
export function isTooFast(input: {
  completed: boolean
  activeSeconds: number
  expectedSeconds: number
  videoWatchedFraction: number | null
}): boolean {
  if (!input.completed) return false
  if (input.expectedSeconds > 0 && input.activeSeconds < input.expectedSeconds * 0.5) return true
  if (input.videoWatchedFraction != null && input.videoWatchedFraction < 0.5) return true
  return false
}
