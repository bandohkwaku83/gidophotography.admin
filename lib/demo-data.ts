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
  editedPreviewUrl?: string;
};

export type DemoFinalAsset = {
  id: string;
  name: string;
  url: string;
};

export type DemoProject = {
  id: string;
  /** Client / job title shown on cards */
  clientName: string;
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

const STORAGE_EXTRA = "gidostorage_demo_projects_v2";
const STORAGE_OVERRIDES = "gidostorage_folder_overrides_v1";

export type FolderOverride = Partial<DemoProject> & { deleted?: boolean };

function emptyFinals(): DemoFinalAsset[] {
  return [];
}

export const SEED_PROJECTS: DemoProject[] = [
  {
    id: "p-kwaku",
    clientName: "Kwaku Wedding",
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
}): DemoProject {
  return {
    id: nextFolderId(),
    clientName: input.clientName.trim(),
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
  const next = readExtraProjects().map((p) => (p.id === updated.id ? updated : p));
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
