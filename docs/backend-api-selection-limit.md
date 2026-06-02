# Backend API — client selection limit (`maxClientSelections`)

This document describes what the **gidostorage** Next.js app already calls and reads. Implement these semantics on your API server (the app proxies authenticated folder routes to `BACKEND_API_URL`, typically `https://api.gidophotography.com`).

The photographer sets the limit on **Folder detail → Selection tab → Selection limit → Save**.  
The client gallery enforces it in the UI **and** should be enforced on the server when syncing picks.

---

## Data model

Store one integer on the folder’s **share** settings (or on the folder root and mirror into `share` in JSON responses).

| Field | Type | Meaning |
|-------|------|---------|
| **`maxClientSelections`** | `number \| null` | Max photos the client may select. **`null`** (or omit / `0`) = **unlimited**. |
| | | Valid range when set: **1–9999** (app clamps to 9999). |

Recommended DB shape (example):

```js
// Mongo / similar
folder.share = {
  enabled: true,
  code: "abc123",
  maxClientSelections: 20,   // null = unlimited
  selectionLocked: false,
  selectionSubmittedAt: null,
  // ...
};
```

You may also accept snake_case on input and emit camelCase on output:

- `max_client_selections`, `selection_limit`, `max_selections` — the Next app **reads** these aliases on GET; prefer returning **`maxClientSelections`** on share + folder GETs.

---

## 1. Photographer: save the limit

### `PATCH /api/folders/:folderId/share`

**Auth:** photographer JWT (same as other folder routes).

**Body (JSON)** — any subset:

```json
{
  "maxClientSelections": 20
}
```

Unlimited:

```json
{
  "maxClientSelections": null
}
```

Other fields the same route may already support (optional on the same PATCH):

```json
{
  "selectionLocked": true,
  "clearSelectionSubmit": false,
  "maxClientSelections": 15
}
```

**Server behavior:**

1. Validate: if `maxClientSelections` is a number, it must be **≥ 1** and **≤ 9999**.
2. Persist on the folder’s share document.
3. Return the **updated folder** (same shape as `GET /api/folders/:id`), including the new value under **`share.maxClientSelections`** and/or root **`maxClientSelections`**.

**Example success (minimal):**

```json
{
  "folder": {
    "_id": "674a…",
    "eventName": "Smith wedding",
    "share": {
      "enabled": true,
      "code": "x7k2p9",
      "maxClientSelections": 20,
      "selectionLocked": false
    },
    "maxClientSelections": 20,
    "selection": [ … ],
    "uploads": [ … ]
  }
}
```

**Errors:**

| Status | When |
|--------|------|
| `400` | Limit is `0`, negative, non-integer, or &gt; 9999 |
| `401` / `403` | Not authenticated / not folder owner |
| `404` | Unknown `folderId` |

The dashboard calls this via `patchFolderShare()` in `lib/folders-api.ts`.

---

## 2. Photographer: read the limit (folder detail)

### `GET /api/folders/:folderId`

Include the cap so the Selection tab and sidebar can show progress.

**Required in response** (at least one location):

```json
{
  "share": {
    "maxClientSelections": 20
  }
}
```

or top-level:

```json
{
  "maxClientSelections": 20
}
```

If unlimited, use `null` or omit the field.

The Next app parses with `extractMaxClientSelections()` in `lib/folders/helpers.ts`.

---

## 3. Client: read the limit (share gallery)

### `GET /api/share/:token`

**Auth:** none (public share link).

**Required in normalized payload** — the app reads from `share`, `folder`, or response root:

```json
{
  "folder": {
    "eventName": "Smith wedding",
    "share": {
      "maxClientSelections": 20,
      "selectionLocked": false
    }
  },
  "maxClientSelections": 20,
  "canEditSelections": true,
  "uploads": [ … ],
  "selection": [ … ]
}
```

Client UI uses `maxClientSelections` to:

- Show “You can select up to **N** photos”.
- Block new selects when `selectedCount >= max` (before calling sync).

**Important:** UI-only enforcement is not enough. The sync endpoint below **must** reject over-limit lists.

---

## 4. Client: sync selections (enforce the limit)

### `POST /api/share/:token/selections/sync`

**Auth:** none (share token identifies the gallery).

**Body:**

```json
{
  "rawMediaIds": ["mediaId1", "mediaId2", "mediaId3"]
}
```

(`rawMediaIds` = IDs of **raw/upload** media rows in this folder.)

**Server behavior:**

1. Resolve folder from share token; ensure share is enabled and not expired.
2. If **`share.selectionLocked === true`**, return **`403`** (client must not change picks).
3. Load **`max = folder.share.maxClientSelections`** (null = unlimited).
4. If **`max != null`** and **`rawMediaIds.length > max`**, return **`400`** with a clear message, e.g.  
   `"You can select at most 20 photos."`
5. Validate every id exists, belongs to this folder, and is an eligible raw/upload asset.
6. Replace the client’s selection set with exactly these ids (same as today).
7. Return **`200`** (body can be empty or `{ "selected": 3 }`).

**Example error:**

```json
{
  "message": "You can select at most 20 photos."
}
```

The client calls this on every heart toggle via `syncShareGallerySelections()` in `lib/share-gallery-api.ts`.

### Optional: single-select endpoint

### `POST /api/share/:token/selections`

**Body:** `{ "rawMediaId": "…" }`  

Apply the same cap: if adding would exceed `maxClientSelections`, return **`400`**.

---

## 5. Selection tab data (photographer view)

### `GET /api/folders/:folderId` — `selection` array

The Selection tab lists rows the client has picked. Each row should reflect selection state on uploads or a dedicated `selection` list (already expected by the app).

The limit does not change this shape; it only caps how many items the client can add via share.

---

## Checklist for backend

- [ ] `PATCH /api/folders/:id/share` accepts `maxClientSelections` (`number | null`).
- [ ] `GET /api/folders/:id` returns `share.maxClientSelections` (or root alias).
- [ ] `GET /api/share/:token` returns `maxClientSelections` for the client gallery.
- [ ] `POST /api/share/:token/selections/sync` rejects `rawMediaIds.length > max` with **400**.
- [ ] Optional: `POST /api/share/:token/selections` enforces cap when adding one id.
- [ ] `null` / missing / `0` means unlimited (match frontend `extractMaxClientSelections`).

---

## Reference: frontend call sites

| Action | Frontend |
|--------|----------|
| Save limit | `components/photographer/folder-detail-view.tsx` → `patchFolderShare(folderId, { maxClientSelections })` |
| Parse on folder GET | `lib/folders/helpers.ts` → `extractMaxClientSelections()` |
| Parse on share GET | `lib/share-gallery-api.ts` → `normalizeShareGalleryBody()` |
| Client enforce + sync | `components/client/client-gallery-app.tsx` → `toggleSelect()` + `syncShareGallerySelections()` |

Once the four API behaviors above are implemented, the Selection limit UI in folder detail and the client share gallery will work end-to-end without further frontend changes.

**Status:** Backend + Next.js app integrated (photographer PATCH/GET, client GET + sync enforcement, UI rollback on 400).
