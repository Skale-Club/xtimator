/**
 * Phase 189 Plan 03 — UPLOAD-01: pure types shared by the server-only ticket
 * minter (`lib/storage/upload-ticket.ts`) and the browser-safe ticket
 * consumer (`lib/storage/browser-upload.ts`).
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `upload-ticket.ts`:
 * `upload-ticket.ts` carries `import 'server-only'` plus real server-side
 * imports (`@aws-sdk/client-s3`, `./server`, `./s3-config`). A type-only
 * `import type { UploadTicket } from './upload-ticket'` from the browser
 * module would be erased at compile time and therefore harmless at runtime
 * — but it would still place that server module's specifier in the browser
 * module's static import list, which is exactly what Plan 04's static
 * import-graph gate scans for. Splitting the type into its own zero-runtime
 * file makes the browser module's import graph provably clean rather than
 * clean-only-if-you-trust-erasure.
 *
 * Zero runtime code. Zero imports. If you need to add a helper function
 * here, it belongs in `upload-ticket.ts` (server) or `browser-upload.ts`
 * (browser) instead — this file stays type-only forever.
 */

export type UploadTicket =
  | {
      strategy: 's3-presigned-put'
      bucket: string
      key: string
      url: string
      /**
       * Sent VERBATIM by the browser. Includes the exact Content-Type the
       * URL was signed for — verbatim-or-broken: a presigned PUT signed for
       * `audio/webm` fails with `SignatureDoesNotMatch` if the browser sends
       * a different Content-Type header (e.g. `audio/webm;codecs=opus`,
       * which is exactly what `getSupportedAudioMimeType()` returns on
       * Chrome).
       */
      headers: Record<string, string>
      expiresInSeconds: number
      /** Echo of the normalized type — the browser stamps its Blob with this. */
      contentType: string
    }
  | {
      strategy: 'supabase-signed-upload'
      bucket: string
      key: string
      token: string
      expiresInSeconds: number
      /**
       * Echo of the normalized type. NOT decoration: `@supabase/storage-js`'s
       * `uploadToSignedUrl` sends the Blob as multipart FormData and IGNORES
       * this ticket's content type entirely in that branch — the stored
       * type comes from the Blob's own `.type`. The browser module MUST
       * re-stamp the Blob with this value before calling
       * `uploadToSignedUrl`, or the object lands with whatever MIME the
       * MediaRecorder happened to produce (which may include a
       * `;codecs=...` suffix Supabase doesn't want). Do not "clean up" this
       * field as redundant — it is the only thing that fixes that mismatch.
       */
      contentType: string
    }
