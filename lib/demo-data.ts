export type SelectionState = "UNSELECTED" | "SELECTED";
export type EditState = "NONE" | "IN_PROGRESS" | "EDITED";
export type FolderStatus = "DRAFT" | "SELECTION_PENDING" | "COMPLETED";

export type DemoAsset = {
  id: string;
  originalName: string;
  selection: SelectionState;
  editState: EditState;
  clientComment: string;
  hasEdited: boolean;
  thumbUrl: string;
  /** Full-screen preview URL when better than {@link thumbUrl} (share galleries / API). */
  previewUrl?: string;
  editedPreviewUrl?: string;
};

export type DemoFinalAsset = {
  id: string;
  name: string;
  url: string;
  /** Payment lock — client share hides full-res download until unlock. */
  locked?: boolean;
};

export type DemoProject = {
  id: string;
  /** Client / job title shown on cards */
  clientName: string;
  /** Client contact details (used on Clients page). Optional in this demo. */
  contactEmail?: string;
  contactPhone?: string;
  shareToken: string;
  createdAt: string;
  eventDate: string;
  description: string;
  updatedAt: string;
  status: FolderStatus;
  assets: DemoAsset[];
  finalAssets: DemoFinalAsset[];
  sharePasswordEnabled: boolean;
  /** Relative days from “today” in UI; null = no expiry */
  shareExpiryDays: number | null;
  /** Client submitted picks */
  selectionSubmitted: boolean;
};

export type DemoClient = {
  id: string;
  name: string;
  /** Optional in this demo (user can register without email). */
  contactEmail?: string;
  /** Required in this demo. */
  contactPhone: string;
  location?: string;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_EXTRA = "gidostorage_demo_projects_v2";
const STORAGE_OVERRIDES = "gidostorage_folder_overrides_v1";
const STORAGE_CLIENTS_EXTRA = "gidostorage_demo_clients_v1";

export type FolderOverride = Partial<DemoProject> & { deleted?: boolean };

function emptyFinals(): DemoFinalAsset[] {
  return [];
}

export const SEED_PROJECTS: DemoProject[] = [
  {
    id: "p-kwaku",
    clientName: "Kwaku Wedding",
    contactEmail: "kwaku.wedding@client.gido",
    shareToken: "demo-kwaku-gallery",
    createdAt: "2026-04-01T10:00:00.000Z",
    eventDate: "2026-05-18",
    description: "Full-day coverage — ceremony & reception.",
    updatedAt: "2026-04-10T15:30:00.000Z",
    status: "DRAFT",
    selectionSubmitted: false,
    sharePasswordEnabled: false,
    shareExpiryDays: 30,
    assets: [
      {
        id: "kw-1",
        originalName: "ceremony_001.jpg",
        selection: "SELECTED",
        editState: "EDITED",
        clientComment: "Love the light on the aisle.",
        hasEdited: true,
        thumbUrl: "https://picsum.photos/seed/kwaku1/900/700",
        editedPreviewUrl: "https://picsum.photos/seed/kwaku1e/900/700",
      },
      {
        id: "kw-2",
        originalName: "reception_014.jpg",
        selection: "SELECTED",
        editState: "IN_PROGRESS",
        clientComment: "",
        hasEdited: false,
        thumbUrl: "https://picsum.photos/seed/kwaku2/900/700",
      },
      {
        id: "kw-3",
        originalName: "details_rings.jpg",
        selection: "UNSELECTED",
        editState: "NONE",
        clientComment: "",
        hasEdited: false,
        thumbUrl: "https://picsum.photos/seed/kwaku3/900/700",
      },
    ],
    finalAssets: [
      {
        id: "f-kw-1",
        name: "ceremony_001_final.jpg",
        url: "https://picsum.photos/seed/kwakuf1/1200/900",
      },
    ],
  },
  {
    id: "p-portrait",
    clientName: "Studio Portraits — April",
    contactEmail: "studio.portraits.april@client.gido",
    shareToken: "demo-portraits-april",
    createdAt: "2026-04-05T12:00:00.000Z",
    eventDate: "2026-04-12",
    description: "",
    updatedAt: "2026-04-08T10:00:00.000Z",
    status: "DRAFT",
    selectionSubmitted: false,
    sharePasswordEnabled: false,
    shareExpiryDays: null,
    assets: [
      {
        id: "pr-1",
        originalName: "look_01.jpg",
        selection: "UNSELECTED",
        editState: "NONE",
        clientComment: "",
        hasEdited: false,
        thumbUrl: "https://picsum.photos/seed/portrait1/900/700",
      },
      {
        id: "pr-2",
        originalName: "look_02.jpg",
        selection: "UNSELECTED",
        editState: "NONE",
        clientComment: "",
        hasEdited: false,
        thumbUrl: "https://picsum.photos/seed/portrait2/900/700",
      },
    ],
    finalAssets: emptyFinals(),
  },
];

function seedClientsFromProjects(projects: DemoProject[]): DemoClient[] {
  const map = new Map<string, DemoClient>();
  for (const p of projects) {
    const key = p.clientName.toLowerCase();
    if (map.has(key)) continue;
    const emailBase = p.clientName.toLowerCase().replace(/[^a-z0-9]+/g, ".");
    const contactEmail = p.contactEmail?.trim() || `${emailBase}@client.gido`;
    const contactPhone = p.contactPhone?.trim() || "555-0100";
    const id = `seed-${key.replace(/[^a-z0-9]+/g, "-")}`;
    map.set(key, {
      id,
      name: p.clientName,
      contactEmail: contactEmail || undefined,
      contactPhone,
      location: "Unknown",
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });
  }
  return Array.from(map.values());
}

export const SEED_CLIENTS: DemoClient[] = seedClientsFromProjects(SEED_PROJECTS);

function nextClientId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function readExtraClients(): DemoClient[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_CLIENTS_EXTRA);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as DemoClient[]) : [];
  } catch {
    return [];
  }
}

function writeExtraClients(clients: DemoClient[]) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_CLIENTS_EXTRA, JSON.stringify(clients));
}

export function appendExtraClient(client: DemoClient) {
  writeExtraClients([...readExtraClients(), client]);
}

export function loadAllClients(): DemoClient[] {
  return [...SEED_CLIENTS, ...readExtraClients()];
}

export function createClientDraft(input: {
  name: string;
  contactEmail?: string;
  contactPhone: string;
  location?: string;
}): DemoClient {
  const now = new Date().toISOString();
  return {
    id: nextClientId(),
    name: input.name.trim(),
    contactEmail: input.contactEmail?.trim() || undefined,
    contactPhone: input.contactPhone.trim(),
    location: input.location?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
}

function readOverrides(): Record<string, FolderOverride> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_OVERRIDES);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    return typeof p === "object" && p !== null ? (p as Record<string, FolderOverride>) : {};
  } catch {
    return {};
  }
}

function writeOverrides(next: Record<string, FolderOverride>) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_OVERRIDES, JSON.stringify(next));
}

export function patchFolderOverride(id: string, patch: FolderOverride) {
  const cur = readOverrides();
  writeOverrides({ ...cur, [id]: { ...cur[id], ...patch } });
}

function readExtraProjects(): DemoProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_EXTRA);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as DemoProject[]) : [];
  } catch {
    return [];
  }
}

export function writeExtraProjects(projects: DemoProject[]) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_EXTRA, JSON.stringify(projects));
}

export function appendExtraProject(project: DemoProject) {
  writeExtraProjects([...readExtraProjects(), project]);
}

function mergeProject(base: DemoProject): DemoProject {
  const o = readOverrides()[base.id];
  if (!o) return base;
  return {
    ...base,
    ...o,
    assets: o.assets ?? base.assets,
    finalAssets: o.finalAssets ?? base.finalAssets,
  };
}

function isRemoved(p: DemoProject): boolean {
  return readOverrides()[p.id]?.deleted === true;
}

export function loadAllProjects(): DemoProject[] {
  const merged = [...SEED_PROJECTS, ...readExtraProjects()].map(mergeProject);
  return merged.filter((p) => !isRemoved(p));
}

export function loadProjectById(id: string): DemoProject | undefined {
  return loadAllProjects().find((p) => p.id === id);
}

export function loadProjectByShareToken(token: string): DemoProject | undefined {
  return loadAllProjects().find((p) => p.shareToken === token);
}

/** In-memory clone for React state (avoid mutating seed/extra references). */
export function cloneDemoProject(project: DemoProject): DemoProject {
  return {
    ...project,
    assets: project.assets.map((a) => ({ ...a })),
    finalAssets: project.finalAssets.map((f) => ({ ...f })),
  };
}

/**
 * Rich placeholder gallery for any share URL while the backend is not wired.
 * Uses picsum images only — no API or database.
 */
export function buildUiDevGallery(shareToken: string): DemoProject {
  const safe =
    shareToken.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "preview";
  const id = `ui-dev-${safe}`;
  const seeds = ["uidev1", "uidev2", "uidev3", "uidev4", "uidev5", "uidev6"];
  const assets: DemoAsset[] = seeds.map((seed, i) => ({
    id: `${id}-a-${i}`,
    originalName: `photo_${String(i + 1).padStart(2, "0")}.jpg`,
    selection: i % 4 === 0 ? "SELECTED" : "UNSELECTED",
    editState: "NONE",
    clientComment: i === 2 ? "Sample client note for layout." : "",
    hasEdited: false,
    thumbUrl: `https://picsum.photos/seed/${seed}-${safe.slice(0, 8)}/900/700`,
  }));

  return {
    id,
    clientName: "Preview client (UI only)",
    contactEmail: undefined,
    contactPhone: "",
    shareToken,
    createdAt: new Date().toISOString(),
    eventDate: new Date().toISOString().slice(0, 10),
    description: "",
    updatedAt: new Date().toISOString(),
    status: "DRAFT",
    selectionSubmitted: false,
    assets,
    finalAssets: [
      {
        id: `${id}-f-1`,
        name: "sample_delivery.jpg",
        url: `https://picsum.photos/seed/uidevfinal-${safe.slice(0, 8)}/900/700`,
      },
    ],
    sharePasswordEnabled: false,
    shareExpiryDays: null,
  };
}

/** Seed gallery by token, otherwise a static UI-dev gallery (no network). */
export function loadProjectForClientShare(shareToken: string): DemoProject {
  return loadProjectByShareToken(shareToken) ?? buildUiDevGallery(shareToken);
}

export function nextAssetId(): string {
  return `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function nextFolderId(): string {
  return `p-${Date.now().toString(36)}`;
}

export function nextShareToken(): string {
  return `share-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createFolderDraft(input: {
  clientName: string;
  eventDate: string;
  description: string;
  contactEmail?: string;
  contactPhone?: string;
}): DemoProject {
  return {
    id: nextFolderId(),
    clientName: input.clientName.trim(),
    contactEmail: input.contactEmail?.trim() || undefined,
    contactPhone: input.contactPhone?.trim() || undefined,
    shareToken: nextShareToken(),
    createdAt: new Date().toISOString(),
    eventDate: input.eventDate,
    description: input.description.trim(),
    updatedAt: new Date().toISOString(),
    status: "DRAFT",
    selectionSubmitted: false,
    assets: [],
    finalAssets: [],
    sharePasswordEnabled: false,
    shareExpiryDays: 14,
  };
}

export function replaceExtraProject(updated: DemoProject) {
  const extras = readExtraProjects();
  const idx = extras.findIndex((p) => p.id === updated.id);
  const next =
    idx >= 0
      ? extras.map((p) => (p.id === updated.id ? updated : p))
      : [...extras, updated];
  writeExtraProjects(next);
}

export function deleteFolder(id: string) {
  if (SEED_PROJECTS.some((s) => s.id === id)) {
    patchFolderOverride(id, { deleted: true });
    return;
  }
  writeExtraProjects(readExtraProjects().filter((p) => p.id !== id));
}

export function saveProjectSnapshot(project: DemoProject) {
  const nextUpdated = new Date().toISOString();
  if (SEED_PROJECTS.some((s) => s.id === project.id)) {
    patchFolderOverride(project.id, {
      clientName: project.clientName,
      contactEmail: project.contactEmail,
      contactPhone: project.contactPhone,
      eventDate: project.eventDate,
      description: project.description,
      assets: project.assets,
      finalAssets: project.finalAssets,
      status: project.status,
      selectionSubmitted: project.selectionSubmitted,
      shareToken: project.shareToken,
      sharePasswordEnabled: project.sharePasswordEnabled,
      shareExpiryDays: project.shareExpiryDays,
      updatedAt: nextUpdated,
    });
    return;
  }
  replaceExtraProject({ ...project, updatedAt: nextUpdated });
}

export function regenerateShareLink(id: string): string {
  const token = nextShareToken();
  patchFolderOverride(id, { shareToken: token });
  return token;
}
