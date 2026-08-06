# Phase 189: Browser Uploads Without Browser Credentials — Context

**Gathered:** 2026-08-06. Facts below were measured or executed, not inferred.

## Correction to the milestone's own paperwork: there are THREE browser uploads, not five

`docs/STORAGE-MIGRATION.md` §2 and the v4.24 requirements say "five client
components upload straight from the browser". That count came from grepping
`createStorage` usages in client components, which conflates uploads with
reads. Established during Phase 189 planning:

| Site | Operation | Bucket | Phase |
|---|---|---|---|
| `components/capture/capture-recorder.tsx` (~line 902) | **upload** | `audio` | 189 |
| `components/projects/inline-audio-recorder.tsx` (~line 147) | **upload** | `audio` | 189 |
| `components/workspace/ai-input-group/use-ai-input-submit.ts` (~line 115) | **upload** | `audio` | 189 |
| `components/capture/capture-recorder.tsx` (~line 404) | `getSignedUrl` read | — | 190 |
| `components/workspace/photos/photo-card.tsx` | `getSignedUrl` read | — | 190 |
| `components/workspace/photos/photo-lightbox.tsx` | `getSignedUrl` read | — | 190 |
| `components/workspace/estimate/estimate-document.tsx` | `getSignedUrl` read | — | 190 |

Also established: **browser photo upload does not exist.** `photo-drop-zone`
and the capture photo path both POST FormData to the `uploadProjectPhoto`
server action, which Phase 188 already moved onto `serverStorage()`. The photo
half of UPLOAD-01 is therefore already closed and needs a regression assertion,
not a rewrite.

## Operator prerequisite: R2 bucket CORS — verified blocked, not assumable

A browser PUT to a presigned R2 URL is **cross-origin**. Without a CORS policy
on the `audio` bucket, every browser upload fails at cutover — and the Supabase
code path hides this completely, so no test in this repo can catch it.

**Tested on 2026-08-06:** the production `xtimator app` token (Object Read &
Write, scoped to the five buckets) **cannot** set bucket CORS —
`PutBucketCorsCommand` against bucket `audio` returned `AccessDenied`. That is
correct least-privilege behavior, not a misconfiguration, but it means CORS
must be applied out-of-band with an R2 **admin** credential, which is
deliberately not kept around.

Intended policy for the `audio` bucket (apply at cutover, alongside the
public-access re-assert that also needs an admin token):

- AllowedOrigins: `https://xtimator.com`, `https://www.xtimator.com`, and the
  local dev origin
- AllowedMethods: `PUT`, `GET`, `HEAD`
- AllowedHeaders: `content-type`
- ExposeHeaders: `etag`  ← required, `uploadWithRetry` treats a 409 as success
  and the ETag is how a retry confirms the object landed
- MaxAgeSeconds: 3600

Do not treat this as done because the code is done. It is an infrastructure
step with no repo-side evidence, so it must be verified by an actual
cross-origin PUT from a browser before UPLOAD-01 can be called closed.

## Other verified facts

- `@supabase/storage-js`'s `uploadToSignedUrl` sends a Blob as **multipart
  FormData and ignores its `contentType` option** in that branch — the stored
  type comes from `blob.type`. A single universal raw PUT would silently break
  UPLOAD-03 in Supabase mode. Hence the two-strategy ticket.
- The upload ticket must be minted **once, outside** `uploadWithRetry`.
  Minting per attempt breaks that wrapper's 409-as-success rule and orphans
  objects.
- `lib/storage/upload-with-retry.ts` is field-tested resilience UPLOAD-04
  requires preserving — it must remain untouched, gated by `git diff --stat`.
