// components/workspace/estimate/preview-template/shared.tsx
//
// Template-agnostic pieces both PreviewTemplates reuse: the 40/12/13/17/18%
// column geometry and the read-only photo thumbnail (the frame/caption classes
// are the only thing that differs per template, so they are props).
'use client'

import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { createStorage } from '@/lib/storage'
import type { DocumentPhoto } from '@/lib/estimate/document/model'

// ItemTableColgroup — the ONE source of the 40/12/13/17/18% column geometry,
// applied via <col> (not per-<th> width classes) so EVERY item table on
// EVERY page — headed or headless, new-section or continuation slice — sizes
// its 5 columns identically under table-fixed layout. Without this, a
// continuation page's headless rows table and a headed table elsewhere would
// auto-size independently and columns would drift out of alignment.
export function ItemTableColgroup() {
  return (
    <colgroup>
      <col style={{ width: '40%' }} />
      <col style={{ width: '12%' }} />
      <col style={{ width: '13%' }} />
      <col style={{ width: '17%' }} />
      <col style={{ width: '18%' }} />
    </colgroup>
  )
}

// ReadOnlyPhotoThumb — mirrors estimate-document.tsx's private
// AttachedPhotoThumb (not exported, so re-implemented here against the same
// createClient/createStorage utilities) minus the onRemove affordance.
export function ReadOnlyPhotoThumb({
  photo,
  frameClassName,
  captionClassName,
}: {
  photo: DocumentPhoto
  frameClassName: string
  captionClassName: string
}) {
  // A photo that already carries a URL needs no lookup; otherwise a signed URL
  // is fetched (the skeleton shows until it resolves).
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const imageUrl = photo.url ?? signedUrl

  useEffect(() => {
    if (photo.url) return
    const supabase = createClient()
    createStorage(supabase)
      .getSignedUrl('photos', photo.storage_path, 3600)
      .then((url) => setSignedUrl(url))
      .catch(() => {
        // signed URL failed — leave skeleton in place
      })
  }, [photo.url, photo.storage_path])

  return (
    <div>
      <div className={frameClassName}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={photo.caption ?? ''} className="object-cover w-full h-full" />
        ) : (
          <Skeleton className="w-full h-full" />
        )}
      </div>
      {photo.caption && <p className={captionClassName}>{photo.caption}</p>}
    </div>
  )
}
