# Phase 5: Audio Recording & Photo Management - Research

**Researched:** 2026-04-10
**Domain:** Browser media APIs (MediaRecorder, Web Audio, Web Speech), OpenAI Whisper API, client-side image processing, drag-and-drop reorder, Supabase Storage
**Confidence:** HIGH

## Summary

Phase 5 replaces the placeholder Audio and Photos tabs in the project workspace with full media capture functionality. The audio recording subsystem uses the MediaRecorder API with cross-browser format negotiation (webm/opus on Chrome/Android, mp4/aac on iOS Safari), Web Audio API AnalyserNode for waveform visualization, and optional Web Speech API for live transcript preview (Chrome/Edge only). Recordings are uploaded to Supabase Storage and transcribed server-side via OpenAI Whisper API. The photo subsystem uses standard file input with camera capture on mobile, client-side canvas compression to max 2000px, a responsive grid with @dnd-kit/sortable reorder, and lightbox viewing via shadcn/ui Dialog.

All pieces are well-supported by browser standards and established libraries. The main complexity is cross-browser MediaRecorder format handling and the Whisper transcription pipeline (server action downloading from Storage, sending to OpenAI, persisting result). No new database migration is needed -- recordings and photos tables plus Storage buckets already exist from Phase 1.

**Primary recommendation:** Build audio recording and photo upload as two independent component trees, each with their own server actions and queries. Use `MediaRecorder.isTypeSupported()` for format detection, native canvas for image compression (no library needed), and @dnd-kit for photo reorder.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Audio tab replaces PlaceholderTab in project-workspace.tsx using getUserMedia + MediaRecorder API
- D-02: Large circular mic button as primary CTA, pulses red when recording, MM:SS timer, waveform below
- D-03: Web Speech API for live transcript preview (Chrome/Edge only, graceful degradation)
- D-04: Recording format: audio/webm;codecs=opus first, audio/mp4 fallback for iOS Safari, runtime isTypeSupported check
- D-05: Start/Stop toggle on mic button. After stop: Play, Delete, Re-record buttons
- D-06: Multiple recordings per project, each a row in recordings table, list with play/delete per item
- D-07: On stop: upload to Storage audio bucket, insert DB row, call server action for Whisper, persist transcript
- D-08: Server action transcribeRecording downloads from Storage with service role key, sends to Whisper API
- D-09: Transcript in Textarea, user can edit, debounced save via server action
- D-10: Loading spinner during transcription, error with retry button
- D-11: Photos tab replaces PlaceholderTab. Drop zone with file input, capture="environment" for mobile
- D-12: HTML5 native drag-and-drop for the drop zone (no library needed for upload area)
- D-13: Client-side compression via canvas.drawImage + canvas.toBlob, max 2000px, quality 0.85 JPEG
- D-14: Responsive photo grid (2 cols mobile, 3-4 cols desktop), thumbnail with caption overlay and delete icon
- D-15: Lightbox via shadcn/ui Dialog with prev/next navigation
- D-16: Caption editing: click to edit inline, debounced server action save
- D-17: Photo reorder via @dnd-kit/core + @dnd-kit/sortable, updates sort_order
- D-18: 20-photo max enforced client-side, toast error on violation
- D-19: Photos stored at {companyId}/{projectId}/{photoId}.jpg in photos bucket
- D-20: Project status updates: 'recording' after first recording, 'photos_added' after first photo

### Claude's Discretion
- Exact waveform visualization style (bars vs line vs circular)
- Waveform colors and animation timing
- Exact lightbox transition animation
- Photo grid gap spacing and thumbnail aspect ratio
- Whether to show recording duration on recordings list
- Drag-and-drop visual feedback style (ghost, opacity, etc.)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUDIO-01 | Start/stop audio recording via mic button | MediaRecorder API, getUserMedia, D-01/D-02 |
| AUDIO-02 | Recording timer in MM:SS format | setInterval counter during recording state |
| AUDIO-03 | Real-time waveform visualization (Web Audio API) | AnalyserNode + getByteTimeDomainData, canvas or div bars |
| AUDIO-04 | Live transcript preview (Web Speech API) | SpeechRecognition -- Chrome/Edge only, graceful degradation pattern |
| AUDIO-05 | Audio uploaded to Supabase Storage after stop | Browser Supabase client .storage.from('audio').upload() |
| AUDIO-06 | Whisper API transcription | Server action with service role client, OpenAI API multipart upload |
| AUDIO-07 | Editable transcript in Textarea | Textarea component + debounced updateTranscript server action |
| AUDIO-08 | Delete recording and re-record | Delete from Storage + DB, UI state reset |
| AUDIO-09 | Multiple recordings per project | recordings table already supports, list UI component |
| AUDIO-10 | Works on iOS Safari and Android Chrome | Format fallback (webm -> mp4), isTypeSupported detection |
| PHOTO-01 | Upload multiple photos via file input | input type="file" accept="image/*" multiple |
| PHOTO-02 | Camera capture on mobile | capture="environment" attribute |
| PHOTO-03 | Drag-and-drop upload on desktop | Native HTML5 drag events (ondragover, ondrop) |
| PHOTO-04 | Photo grid with thumbnails | Responsive CSS grid, Supabase Storage signed URLs for display |
| PHOTO-05 | Full-size photo on tap/click | shadcn/ui Dialog as lightbox |
| PHOTO-06 | Delete individual photos | Delete from Storage + DB, UI update |
| PHOTO-07 | Reorder via drag-and-drop | @dnd-kit/core 6.3.1 + @dnd-kit/sortable 10.0.0 |
| PHOTO-08 | Add/edit caption per photo | Inline edit on thumbnail card, debounced server action |
| PHOTO-09 | Photos stored in Supabase Storage | photos bucket already configured with RLS |
| PHOTO-10 | Max 20 photos per project | Client-side count check before upload |
| PHOTO-11 | Client-side compression (max 2000px) | Canvas drawImage + toBlob, quality 0.85 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech Stack**: Next.js 14+ (App Router), TypeScript strict, Tailwind CSS, shadcn/ui
- **Audio transcription**: OpenAI Whisper API (server-side only)
- **Mobile**: Audio recording and camera capture must work on iOS Safari and Android Chrome
- **Security**: Service role key never exposed to browser; all AI calls server-side via API routes
- **Patterns**: Server actions in lib/actions/, queries in lib/queries/, getAuthContext() for auth
- **Storage**: Browser-side Supabase upload established in Phase 2, path pattern {companyId}/{...}
- **Toast**: sonner for notifications

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.2.3 | App framework | Project stack |
| react | 19.2.4 | UI framework | Project stack |
| @supabase/supabase-js | 2.103.0 | Storage uploads + DB | Project stack |
| sonner | 2.0.7 | Toast notifications | Project stack |
| lucide-react | 1.8.0 | Icons | Project stack |

### New Dependencies (to install)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @dnd-kit/core | 6.3.1 | Drag-and-drop framework | Photo grid reorder (D-17) |
| @dnd-kit/sortable | 10.0.0 | Sortable preset for dnd-kit | Photo grid reorder list (D-17) |
| @dnd-kit/utilities | latest | CSS transform utility | DnD visual transforms |

### Not Needed
| Instead of | Could Use | Why Not |
|------------|-----------|---------|
| browser-image-compression | npm library | Canvas API is sufficient for resize + quality reduction; no library needed (D-13) |
| react-dropzone | npm library | Native HTML5 drag events are enough for the drop zone (D-12) |
| wavesurfer.js | npm library | Only need simple waveform during recording; raw AnalyserNode + canvas/divs is simpler |
| openai npm package | npm library | Single fetch call to Whisper API is simpler than pulling the full SDK |

**Installation:**
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

## Architecture Patterns

### Recommended Component Structure
```
components/workspace/
  audio/
    audio-tab.tsx           # Main Audio tab container (replaces PlaceholderTab)
    audio-recorder.tsx      # MediaRecorder + waveform + timer + live preview
    recording-list.tsx      # List of saved recordings with play/delete
    recording-item.tsx      # Single recording row (play, delete, transcript)
    transcript-editor.tsx   # Textarea with debounced save
    waveform-visualizer.tsx # Canvas/div waveform from AnalyserNode
  photos/
    photos-tab.tsx          # Main Photos tab container (replaces PlaceholderTab)
    photo-drop-zone.tsx     # File input + drag-and-drop area + camera capture
    photo-grid.tsx          # Sortable grid with @dnd-kit
    photo-card.tsx          # Thumbnail + caption + delete
    photo-lightbox.tsx      # Dialog-based full-size viewer
    image-compressor.ts     # Canvas compression utility (pure function)
lib/
  actions/
    recording.ts            # transcribeRecording, updateTranscript, deleteRecording
    photo.ts                # updatePhotoCaption, deletePhoto, reorderPhotos
  queries/
    recording.ts            # getProjectRecordings
    photo.ts                # getProjectPhotos
  supabase/
    service.ts              # Service role client for Whisper pipeline (new)
  utils/
    media-format.ts         # getSupportedAudioMimeType utility
```

### Pattern 1: MediaRecorder Format Detection
**What:** Runtime detection of best audio format
**When to use:** Before creating MediaRecorder instance
**Example:**
```typescript
// lib/utils/media-format.ts
export function getSupportedAudioMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',  // Chrome, Edge, Android (smallest files)
    'audio/webm',               // Fallback webm without codec spec
    'audio/mp4',                // iOS Safari (AAC codec)
    'audio/ogg;codecs=opus',    // Firefox
  ]
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return '' // Will cause MediaRecorder to use browser default
}

export function getFileExtension(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'webm' // default
}
```

### Pattern 2: Audio Recording with Waveform
**What:** MediaRecorder + Web Audio API AnalyserNode for visualization
**When to use:** audio-recorder.tsx component
**Example:**
```typescript
// Simplified recording setup
const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
const audioContext = new AudioContext()
const source = audioContext.createMediaStreamSource(stream)
const analyser = audioContext.createAnalyser()
analyser.fftSize = 256
source.connect(analyser)

const mimeType = getSupportedAudioMimeType()
const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
const chunks: Blob[] = []
recorder.ondataavailable = (e) => chunks.push(e.data)
recorder.onstop = () => {
  const blob = new Blob(chunks, { type: recorder.mimeType })
  // Upload blob to Supabase Storage
}

// Waveform animation loop
const dataArray = new Uint8Array(analyser.frequencyBinCount)
function draw() {
  analyser.getByteTimeDomainData(dataArray)
  // Render bars/line from dataArray values (128 = silence, 0/255 = peak)
  requestAnimationFrame(draw)
}
```

### Pattern 3: Web Speech API with Graceful Degradation
**What:** Live transcript preview, Chrome/Edge only
**When to use:** During recording, if browser supports it
**Example:**
```typescript
function useSpeechRecognition() {
  const SpeechRecognition = typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null

  const isSupported = !!SpeechRecognition

  function start(onResult: (text: string) => void) {
    if (!SpeechRecognition) return null
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (event: any) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      onResult(transcript)
    }
    recognition.start()
    return recognition
  }

  return { isSupported, start }
}
```

### Pattern 4: Client-Side Image Compression
**What:** Canvas-based resize and JPEG compression
**When to use:** Before uploading each photo
**Example:**
```typescript
// lib/utils/image-compressor.ts or components/workspace/photos/image-compressor.ts
export function compressImage(
  file: File,
  maxWidth: number = 2000,
  quality: number = 0.85
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Compression failed')),
        'image/jpeg',
        quality
      )
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}
```

### Pattern 5: Whisper Transcription Server Action
**What:** Download audio from Storage, send to OpenAI Whisper API
**When to use:** After audio upload completes
**Example:**
```typescript
// lib/actions/recording.ts
'use server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'

export async function transcribeRecording(recordingId: string) {
  // Auth check with user's client
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' }

  // Get recording row
  const { data: recording } = await supabase
    .from('recordings')
    .select('storage_path, company_id')
    .eq('id', recordingId)
    .single()
  if (!recording) return { error: 'Recording not found' }

  // Download audio with service role (bypasses RLS for Storage)
  const serviceClient = createServiceClient()
  const { data: fileData, error: downloadError } = await serviceClient
    .storage.from('audio')
    .download(recording.storage_path)
  if (downloadError || !fileData) return { error: 'Failed to download audio' }

  // Send to Whisper API
  const formData = new FormData()
  formData.append('file', fileData, `recording.${recording.storage_path.split('.').pop()}`)
  formData.append('model', 'whisper-1')
  formData.append('response_format', 'text')

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: formData,
  })

  if (!response.ok) return { error: 'Transcription failed' }
  const transcript = await response.text()

  // Update recording with transcript
  await supabase
    .from('recordings')
    .update({ transcript })
    .eq('id', recordingId)

  return { data: { transcript } }
}
```

### Pattern 6: Service Role Client (new utility)
**What:** Server-only Supabase client with service role key for privileged operations
**When to use:** Whisper pipeline (download from Storage bypassing user session)
**Example:**
```typescript
// lib/supabase/service.ts
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

### Pattern 7: Supabase Storage Upload from Browser
**What:** Upload blob directly from browser using anon key client
**When to use:** Audio recording upload, photo upload
**Example:**
```typescript
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const path = `${companyId}/${projectId}/${recordingId}.webm`

const { error } = await supabase.storage
  .from('audio')
  .upload(path, blob, {
    contentType: mimeType,
    upsert: false,
  })
```

### Pattern 8: @dnd-kit Sortable Grid
**What:** Drag-and-drop photo reorder with visual feedback
**When to use:** photo-grid.tsx
**Example:**
```typescript
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function SortablePhoto({ photo }: { photo: Photo }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: photo.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <PhotoCard photo={photo} />
    </div>
  )
}

function PhotoGrid({ photos, onReorder }: Props) {
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = photos.findIndex(p => p.id === active.id)
      const newIndex = photos.findIndex(p => p.id === over.id)
      const reordered = arrayMove(photos, oldIndex, newIndex)
      onReorder(reordered)
    }
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={photos.map(p => p.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map(photo => <SortablePhoto key={photo.id} photo={photo} />)}
        </div>
      </SortableContext>
    </DndContext>
  )
}
```

### Anti-Patterns to Avoid
- **Using getUserMedia without permission error handling:** Always catch NotAllowedError (user denied mic) and NotFoundError (no mic) with user-friendly messages
- **Not stopping MediaStream tracks after recording:** Must call stream.getTracks().forEach(t => t.stop()) to release the microphone
- **Uploading original images without compression:** Job site photos from phones can be 5-10MB each; always compress before upload
- **Using getPublicUrl on private buckets:** Audio and photos buckets are private; use createSignedUrl for display or download via server action
- **Creating AudioContext before user gesture:** Browsers block AudioContext creation without a user interaction; create it inside the start-recording click handler
- **Not cleaning up object URLs:** Call URL.revokeObjectURL() when no longer needed to prevent memory leaks

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop reorder | Custom drag event handling | @dnd-kit/sortable | Touch support, keyboard accessibility, animation, edge cases with scroll |
| Audio format detection | Hardcoded format per user-agent | MediaRecorder.isTypeSupported() | Browser detection is fragile; feature detection is reliable |
| Image compression | Manual pixel manipulation | Canvas drawImage + toBlob | Browser-native, handles all image formats, hardware-accelerated |
| Signed URLs for display | Manual token generation | supabase.storage.createSignedUrl() | Handles expiration, auth, proper URL construction |

## Common Pitfalls

### Pitfall 1: iOS Safari MediaRecorder Format
**What goes wrong:** Attempting audio/webm on iOS Safari fails silently or throws
**Why it happens:** iOS Safari only supports audio/mp4 (AAC codec), not webm/opus
**How to avoid:** Always check MediaRecorder.isTypeSupported() before creating recorder; test fallback order: webm/opus -> webm -> mp4 -> ogg -> default
**Warning signs:** Recording works on desktop but produces empty/corrupt files on iOS

### Pitfall 2: AudioContext Autoplay Policy
**What goes wrong:** AudioContext starts in 'suspended' state, waveform shows flatline
**Why it happens:** Browsers require user gesture to start AudioContext
**How to avoid:** Create AudioContext inside the click handler for the record button; call audioContext.resume() if state is 'suspended'
**Warning signs:** analyser.getByteTimeDomainData returns all 128s (silence)

### Pitfall 3: Web Speech API Not Available on iOS/Firefox
**What goes wrong:** Live transcript feature crashes or shows errors
**Why it happens:** SpeechRecognition is only available on Chrome, Edge, and desktop Safari (partial). NOT available on iOS Safari or Firefox
**How to avoid:** Check for API existence before use; show "Live preview not available on this browser" message; the real transcript comes from Whisper anyway
**Warning signs:** TypeError: SpeechRecognition is not a constructor

### Pitfall 4: Supabase Storage Private Bucket URL Generation
**What goes wrong:** Photos/audio won't display -- 403 or broken images
**Why it happens:** Audio and photos buckets are private (not public); getPublicUrl returns a URL but it requires auth. For display, need signed URLs or download blobs
**How to avoid:** Use createSignedUrl() with an expiration (e.g., 3600 seconds) for displaying photos in the grid. Or download blob server-side
**Warning signs:** Images show broken icon, network tab shows 400/403 on storage URLs

### Pitfall 5: Memory Leaks with Object URLs and Audio Streams
**What goes wrong:** Page becomes sluggish after multiple recordings
**Why it happens:** Object URLs created with URL.createObjectURL() and MediaStream tracks not cleaned up
**How to avoid:** Call URL.revokeObjectURL() in cleanup; stop all stream tracks after recording; close AudioContext when done
**Warning signs:** Increasing memory usage in DevTools

### Pitfall 6: Whisper API 25MB File Size Limit
**What goes wrong:** Long recordings fail transcription
**Why it happens:** OpenAI Whisper API has a 25MB file size limit
**How to avoid:** Audio bucket already limits to 50MB, but Whisper is 25MB. For typical speech at webm/opus bitrate (~32kbps), 25MB is about 100 minutes. Should be fine for job site walkthroughs. Add a client-side warning if file size exceeds 24MB
**Warning signs:** 413 or error response from OpenAI API

### Pitfall 7: canvas.toBlob Returns null
**What goes wrong:** Image compression silently fails
**Why it happens:** Some edge cases (corrupted images, extremely large dimensions) cause toBlob to return null
**How to avoid:** Always check for null in the callback; fall back to uploading original file if compression fails
**Warning signs:** Photos fail to upload with cryptic errors

### Pitfall 8: @dnd-kit Hydration Mismatch with Next.js
**What goes wrong:** React hydration warnings in console
**Why it happens:** DndContext renders differently on server vs client
**How to avoid:** Wrap in a client component (which the workspace already is). Consider dynamic import with ssr: false if hydration issues persist
**Warning signs:** "Text content does not match server-rendered HTML" warnings

## Code Examples

### Debounced Server Action Pattern
```typescript
// Reusable debounce for transcript/caption editing
import { useRef, useCallback } from 'react'

function useDebouncedAction<T extends (...args: any[]) => Promise<any>>(
  action: T,
  delay: number = 1000
) {
  const timeoutRef = useRef<NodeJS.Timeout>()

  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => action(...args), delay)
  }, [action, delay])
}
```

### Storage Signed URL for Photo Display
```typescript
// In photo queries or component
async function getPhotoSignedUrl(supabase: SupabaseClient, storagePath: string) {
  const { data } = await supabase.storage
    .from('photos')
    .createSignedUrl(storagePath, 3600) // 1 hour expiry
  return data?.signedUrl ?? null
}
```

### Recording Duration Tracking
```typescript
// Track recording duration with setInterval
const [duration, setDuration] = useState(0)
const intervalRef = useRef<NodeJS.Timeout>()

function startTimer() {
  setDuration(0)
  intervalRef.current = setInterval(() => setDuration(d => d + 1), 1000)
}

function stopTimer() {
  if (intervalRef.current) clearInterval(intervalRef.current)
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| getUserMedia + manual recording | MediaRecorder API standard | Stable across all major browsers 2023+ | Simpler API, consistent cross-browser |
| Whisper-only transcription | gpt-4o-transcribe model available | 2025 | Better accuracy, but whisper-1 is cheaper and sufficient for this use case |
| react-beautiful-dnd | @dnd-kit | react-beautiful-dnd deprecated 2024 | @dnd-kit is the modern standard |
| Server-side image resize | Client-side canvas compression | Long-standing | Saves bandwidth, faster uploads |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 + jsdom |
| Config file | vitest.config.ts |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUDIO-01 | Recorder start/stop state management | unit | `npx vitest run tests/unit/audio-recorder.test.tsx -t "start stop"` | Wave 0 |
| AUDIO-02 | Timer MM:SS formatting | unit | `npx vitest run tests/unit/media-format.test.ts` | Wave 0 |
| AUDIO-04 | Speech recognition graceful degradation | unit | `npx vitest run tests/unit/audio-recorder.test.tsx -t "speech"` | Wave 0 |
| AUDIO-06 | Whisper transcription action | unit | `npx vitest run tests/unit/recording-actions.test.ts` | Wave 0 |
| AUDIO-10 | Format detection cross-browser | unit | `npx vitest run tests/unit/media-format.test.ts` | Wave 0 |
| PHOTO-07 | Photo reorder sort_order update | unit | `npx vitest run tests/unit/photo-actions.test.ts` | Wave 0 |
| PHOTO-10 | 20-photo limit enforcement | unit | `npx vitest run tests/unit/photo-upload.test.tsx` | Wave 0 |
| PHOTO-11 | Image compression output | unit | `npx vitest run tests/unit/image-compressor.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before /gsd:verify-work

### Wave 0 Gaps
- [ ] `tests/unit/media-format.test.ts` -- format detection + duration formatting
- [ ] `tests/unit/image-compressor.test.ts` -- compression utility
- [ ] `tests/unit/recording-actions.test.ts` -- server action mocking
- [ ] `tests/unit/photo-actions.test.ts` -- reorder/caption/delete actions

Note: MediaRecorder, getUserMedia, AudioContext, and SpeechRecognition are not available in jsdom. Unit tests for components using these APIs must mock them. Integration/e2e testing of actual recording requires Playwright with browser flags.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| OPENAI_API_KEY | Whisper transcription | Must be in .env.local | -- | None -- required for AUDIO-06 |
| Supabase Storage (audio bucket) | Audio upload | Pre-configured in migration | -- | -- |
| Supabase Storage (photos bucket) | Photo upload | Pre-configured in migration | -- | -- |
| @dnd-kit/core | Photo reorder | Not installed | 6.3.1 (npm) | Must install |
| @dnd-kit/sortable | Photo reorder | Not installed | 10.0.0 (npm) | Must install |

**Missing dependencies with no fallback:**
- OPENAI_API_KEY must be added to .env.local (server-side only, never NEXT_PUBLIC_)

**Missing dependencies with fallback:**
- None -- all other dependencies either exist or will be installed via npm

## Open Questions

1. **Signed URL caching for photo grid**
   - What we know: Private buckets need createSignedUrl() for display. URLs expire.
   - What's unclear: Whether to generate signed URLs server-side (in page.tsx) and pass down, or generate them client-side via Supabase browser client.
   - Recommendation: Use browser Supabase client to create signed URLs client-side (RLS allows authenticated users to access their own company's files). Cache URLs in component state with refresh logic.

2. **Audio playback after recording**
   - What we know: Need play/stop buttons for each recording in the list
   - What's unclear: Whether to use signed URLs + HTML5 audio element, or download blob and create object URL
   - Recommendation: Use signed URLs with `<audio>` element -- simpler, no memory overhead.

## Sources

### Primary (HIGH confidence)
- [MDN MediaStream Recording API](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API)
- [MDN Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [OpenAI Speech to Text docs](https://platform.openai.com/docs/guides/speech-to-text)
- [OpenAI Create Transcription API](https://platform.openai.com/docs/api-reference/audio/createTranscription)
- [Can I Use: MediaRecorder](https://caniuse.com/mediarecorder)
- [Can I Use: Speech Recognition](https://caniuse.com/speech-recognition)
- [Supabase Storage JS Reference](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl)

### Secondary (MEDIUM confidence)
- [Build with Matija: iPhone Safari MediaRecorder](https://www.buildwithmatija.com/blog/iphone-safari-mediarecorder-audio-recording-transcription) - iOS Safari format specifics
- [WebKit: MediaRecorder API](https://webkit.org/blog/11353/mediarecorder-api/) - Safari codec details
- [@dnd-kit npm](https://www.npmjs.com/package/@dnd-kit/core) - Version 6.3.1
- [@dnd-kit/sortable npm](https://www.npmjs.com/package/@dnd-kit/sortable) - Version 10.0.0

### Tertiary (LOW confidence)
- @dnd-kit React 19 compatibility -- no explicit confirmation found; library last published ~1 year ago. Should work but may need testing.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All APIs well-documented, versions verified on npm
- Architecture: HIGH - Patterns follow established project conventions, clear CONTEXT.md decisions
- Pitfalls: HIGH - Cross-browser MediaRecorder issues well-documented, Whisper API limits confirmed
- @dnd-kit React 19 compat: MEDIUM - No explicit React 19 peerDep check found, but widely used

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable browser APIs, unlikely to change)
