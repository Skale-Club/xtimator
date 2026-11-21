/**
 * Container format sent to the transcriber, derived from a storage path.
 *
 * iPhone/Safari recordings are stored as `.mp4` (audio-only MP4). The
 * transcriber identifies the container from the declared format, and an audio
 * only MP4 must be declared as `m4a` (same remap WhatsApp inbound audio has
 * always needed, see deriveAudioFormat in lib/whatsapp/media.ts). Apply this
 * ONCE where the format is derived from a path; callers that already derive
 * a clean format (WhatsApp) do not use it, so nothing is mapped twice.
 */
export function transcriberFormatFromPath(storagePath: string): string {
  const ext = (storagePath.split('.').pop() ?? '').trim().toLowerCase() || 'webm'
  return ext === 'mp4' ? 'm4a' : ext
}
