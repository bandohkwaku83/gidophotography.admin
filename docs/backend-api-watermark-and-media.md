# Backend API — watermark previews, URLs, and raw media

This document describes how **watermarked previews**, **`displayUrl`**, and related settings behave in the API consumed by this Next.js app. Implement these semantics on the backend (e.g. FastAPI/Express + storage); the dashboard only toggles settings and displays URLs returned by the API.

---

## Collection / settings model (notes for implementers)

| Field / concept | Notes |
|-----------------|--------|
| **`watermarkPreviewImages`** | Boolean on the photographer’s settings document. When `true`, the backend should generate **watermarked preview derivatives** for raw uploads (see below). When `false`, previews may omit the watermark or point at non-watermarked thumbnails—product rules are server-defined. |
| **Generated previews** | Typically written beside or derived from the original raw file (e.g. a companion file such as `*-wm.jpg` or a dedicated `previews/` key). Used for **client-facing** and **share-link** views without exposing full-resolution masters when watermarking is enabled. |
| **`displayUrl`** | Optional field on media rows where the API wants to expose a **canonical URL for UI display** (often the watermarked preview when watermarking is on). Prefer this when present; fall back to `url` / `thumbUrl` / legacy fields. |
| **`WATERMARK_PREVIEW_TEXT`** | Optional server environment variable: default text (or branding string) composited onto preview images when generating watermarks. If unset, the backend may use a fixed default or omit text-only overlays. |

Raw uploads themselves may remain **unmodified on disk** while previews carry the watermark—only the backend pipeline decides whether “raw” bytes are ever overwritten.

---

## `GET /api/settings` (authenticated)

Returns the current photographer settings.

### Response fields (relevant to uploads)

| Field | Description |
|-------|-------------|
| **`watermarkPreviewImages`** | Whether **new** raw uploads should get watermarked **preview** derivatives after this flag is on. Ties directly to the raw-upload pipeline: when enabled, ingest generates previews suitable for gallery/share; when disabled, previews are generated without watermark (or existing behavior). |
| **`defaultCoverImage`** | Relative storage path for the default folder cover image, if set. |
| **`defaultCoverImageUrl`** | Absolute URL for that cover (for admin UI). Not the same as per-photo raw/preview URLs. |
| **`updatedAt`** | Last settings write. |

**Relationship to raw uploads:** This GET does not list folder media; it only tells clients whether **future** processing should watermark previews. Existing folder files are unchanged until **re-upload** or a separate **backfill job** (if you add one).

---

## `PUT /api/settings` — toggle watermark / update cover

Updates settings. Supports **JSON** (watermark-only or boolean-only) and **multipart** (cover image + optional watermark flag).

### JSON body example

```json
{ "watermarkPreviewImages": true }
```

### Multipart example

- `defaultCoverImage`: file (optional if only updating watermark).
- `watermarkPreviewImages`: string `"true"` / `"false"` when sending with `FormData`.

### Behavior to document on the server

1. **Generation:** Turning **`watermarkPreviewImages` on** means **new** raw uploads should trigger creation of watermarked preview assets (using `WATERMARK_PREVIEW_TEXT` or equivalent). Turning it **off** means new previews should not apply that watermark (existing generated files may remain until reprocessed).

2. **Admin vs share URL behavior:**  
   - **Authenticated admin** folder/detail responses may expose **`url`** pointing at **original or full-quality** assets for photographer workflows, and **`displayUrl`** (or thumbnail fields) pointing at **preview-safe** URLs when watermarking applies.  
   - **Public share** responses should prefer **watermarked** URLs on fields exposed to clients (`uploads[].url`, nested `raw.url`, thumbs), consistent with `watermarkPreviewImages`.

3. **Existing files:** Changing the toggle **does not automatically regenerate** previews for media already stored. Previously uploaded raws only get new watermarked previews after **re-upload** of that asset or a dedicated **regeneration** endpoint/job—document that clearly for API consumers.

### Example success payload

```json
{
  "message": "Settings updated successfully",
  "settings": {
    "_id": "…",
    "defaultCoverImage": "uploads/settings/…",
    "defaultCoverImageUrl": "http://localhost:8000/uploads/settings/…",
    "watermarkPreviewImages": true,
    "updatedAt": "2026-04-27T19:56:45.517Z"
  }
}
```

---

## `GET /api/folders/:id` (or equivalent) — one folder (authenticated)

Documents how **URLs** differ on raw/selection rows.

| Concept | Description |
|---------|-------------|
| **`url`** | Often the **storage URL for the raw file** or primary asset used in the photographer dashboard (may be full quality). Exact policy is backend-defined. |
| **`displayUrl`** | When watermark previews exist, this should point to the **preview asset** intended for safe display (watermarked when settings require it). Clients should prefer **`displayUrl`** for embedded previews when present. |
| **`selection[].raw`** | Selection rows may nest the associated **raw** media object. Apply the same **`url` vs `displayUrl`** rules: nested `raw.displayUrl` for UI previews vs `raw.url` for original reference if exposed. |

---

## Upload raw photo — `POST …` (folder raw upload)

- **When previews are created:** After the file is stored, the backend should asynchronously or synchronously generate thumbnail/preview derivatives. If **`watermarkPreviewImages`** is **true**, include **watermarked** previews in storage and expose them via **`displayUrl`** (and/or `thumbUrl` / `previewUrl` as documented for your API).

- **`media[]` / response shape:** Upload responses may return **`media`** array/objects where each item can include **`displayUrl`** alongside **`url`** so the client can render the correct preview immediately after upload.

---

## Delete raw photo — `DELETE …` (folder raw delete)

When deleting a raw asset, the backend should remove:

- The primary raw file (and any DB row).
- **Associated preview/watermark artifacts**, e.g. files matching patterns such as **`*-wm.jpg`** or whatever naming convention the generator uses, so orphaned watermarked files do not accumulate.

---

## `GET` shared folder — **public** (share token / code)

Public responses (**no** photographer cookie/JWT) must assume clients might scrape URLs.

- When **`watermarkPreviewImages`** is **true** for that photographer’s settings: expose **watermarked** assets on client-visible fields—typically **`uploads[].url`**, **`selection[].raw.url`**, and thumbnail fields—unless your product intentionally exposes hi-res originals via share (unusual).

- When **false**: URLs may point to non-watermarked previews or originals per product rules.

Document clearly which fields are **always safe for clients** vs **photographer-only**.

---

## Client pick photo / client sync selections (public share API)

Endpoints where the client toggles selection or syncs picks should return nested **`raw`** / **`uploads`** structures whose **`url`** fields follow the **same watermark and URL rules** as **`GET` shared folder**. Do not leak un-watermarked preview URLs in public JSON if share views are meant to be protected.

---

## Summary

| Concern | Where it belongs |
|--------|-------------------|
| Toggle & persistence | `GET`/`PUT /api/settings`, `watermarkPreviewImages` |
| Preview files & naming | Backend storage pipeline (`*-wm.jpg`, etc.) |
| Safe URLs for clients | Watermarked URLs on public/share GETs; optional **`displayUrl`** on authenticated GETs |
| This Next.js repo | Sends toggles, renders returned URLs; does not composite watermarks on uploaded bytes |
