# Backend API — gallery collection labels & order

The dashboard lets photographers **rename** the virtual “All media” and “General” tabs and **drag to reorder** General + named collections. The client share gallery reads the same labels and order.

---

## Folder fields (persist on `Folder` document)

| Field | Type | Default | Notes |
|-------|------|---------|--------|
| `allMediaLabel` | `string` \| omit | — | Custom label for the “show everything” tab. UI defaults: **All Media** (dashboard), **All** (client) when omitted. |
| `generalSetLabel` | `string` \| omit | — | Custom label for uncategorized media (`setId: null`). Default **General**. |
| `generalSetSortOrder` | `number` | `-1` | Sort position of the General bucket among collection tabs (named sets use `sets[].sortOrder`). |

Include these on:

- `GET /api/folders/:id`
- `GET /api/share/:token` (public)
- Responses from the PATCH endpoints below

Named sets already use `sets[].sortOrder` (ascending).

---

## `PATCH /api/folders/:folderId/gallery-collections` (authenticated)

Rename virtual collection tabs.

### Request

```json
{
  "allMediaLabel": "Full gallery",
  "generalSetLabel": "Highlights"
}
```

Either field may be omitted. Trim strings; reject empty strings (400). Max length ~80 chars recommended.

### Response

```json
{
  "message": "Collection labels updated",
  "folder": { "...": "..." }
}
```

Or return the updated label fields at the top level; the frontend also accepts `folder` nested or refreshes via `GET`.

---

## `PATCH /api/folders/:folderId/sets/reorder` (authenticated)

Reorder **General + named sets** for client collection chips and `uploadsBySet` / `finalsBySet` bucket order.

The **“All media”** tab is not in this list — it is always first in the UI and is not a stored bucket.

### Request

```json
{
  "orderedKeys": ["general", "507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]
}
```

| Key | Meaning |
|-----|---------|
| `"general"` | Uncategorized bucket (`setId: null`) |
| `<set _id>` | Named `FolderSet` id |

### Validation

- Photographer owns the folder.
- `orderedKeys` is a non-empty array with **no duplicates**.
- Every set id exists on the folder.
- Exactly one `"general"` entry when the folder uses collections (optional: allow omitting `general` only if you never show it).

### Server writes

For each index `i` in `orderedKeys`:

- If key is `"general"` → `folder.generalSetSortOrder = i`
- Else → `sets.id.sortOrder = i`

Renumber as `0, 1, 2, …`.

### Response

```json
{
  "message": "Collection order updated",
  "updatedCount": 3,
  "generalSetSortOrder": 0,
  "sets": [ { "_id": "...", "name": "...", "sortOrder": 1 } ],
  "folder": { "...": "..." }
}
```

### Media flat lists

After reorder, rebuild flat `uploads` / `finals` and grouped `uploadsBySet` / `finalsBySet` the same way as media reorder:

1. **General** bucket first or at `generalSetSortOrder` relative to named sets.
2. Named set buckets in `sortOrder` ascending.
3. Within each bucket, media sorted by `sortOrder` (existing media reorder behavior).

Apply on **both** `GET /api/folders/:id` and `GET /api/share/:token`.

---

## Client share gallery

Public `GET /api/share/:token` must expose:

- `allMediaLabel`, `generalSetLabel`, `generalSetSortOrder`
- `sets[]` with `sortOrder`
- `uploadsBySet` / `finalsBySet` in the same bucket order

The Next.js client builds tabs: `[All (custom label)]` then General + sets sorted by `generalSetSortOrder` / `sets[].sortOrder`.

---

## Existing endpoints (unchanged)

- `PATCH /api/folders/:folderId/sets/:setId` — rename one set (`name`) or single `sortOrder` (still supported).
- `PATCH /api/folders/:folderId/media/reorder` — photo order inside a bucket.

---

## Postman / smoke test

1. Create folder with 2 sets + general uploads.
2. `PATCH gallery-collections` with custom labels → client share shows new names.
3. `PATCH sets/reorder` with `["setB", "general", "setA"]` → client chips match; media in each bucket unchanged except tab order.
4. `PATCH media/reorder` inside one set → client grid order updates within that collection.
