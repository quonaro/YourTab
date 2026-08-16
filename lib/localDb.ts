import type { Task, TaskStatus, Project, Board, TaskListResponse } from "./types";
import { readSettings, writeSettings, type ExtensionSettings } from "./settings";

const DB_NAME = "yourtask-local";
const DB_VERSION = 2;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) {
        const store = db.createObjectStore("projects", { keyPath: "id", autoIncrement: true });
        store.createIndex("slug", "slug", { unique: true });
      }
      if (!db.objectStoreNames.contains("statuses")) {
        const store = db.createObjectStore("statuses", { keyPath: "id", autoIncrement: true });
        store.createIndex("projectId", "projectId", { unique: false });
      }
      if (!db.objectStoreNames.contains("tasks")) {
        const store = db.createObjectStore("tasks", { keyPath: "id", autoIncrement: true });
        store.createIndex("projectId", "projectId", { unique: false });
        store.createIndex("statusId", "statusId", { unique: false });
      }
      if (!db.objectStoreNames.contains("boards")) {
        const store = db.createObjectStore("boards", { keyPath: "id", autoIncrement: true });
        store.createIndex("projectId", "projectId", { unique: false });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const req = fn(transaction.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

function txAll<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T[]>): Promise<T[]> {
  return tx(store, mode, fn);
}

function slugify(name: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return name
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
}

async function nextId(store: string): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, "readonly");
    const req = transaction.objectStore(store).count();
    req.onsuccess = () => resolve(req.result + 1);
    req.onerror = () => reject(req.error);
  });
}

// ─── Projects ───

export async function createProject(name: string, description?: string): Promise<Project> {
  const id = await nextId("projects");
  const slug = slugify(name);
  const project: Project = {
    id,
    slug,
    name,
    description,
    organizationId: 0,
    createdAt: new Date().toISOString(),
  };
  await tx("projects", "readwrite", (s) => s.add(project));

  // Initialize default statuses and board (mirrors backend InitializeProject)
  await createStatus(project.id, "To Do", "#6b7280", 0);
  await createStatus(project.id, "In Progress", "#3b82f6", 1);
  await createStatus(project.id, "Done", "#10b981", 2, true);
  await createBoard(project.id, "Основная доска", 0);

  return project;
}

export async function listProjects(): Promise<Project[]> {
  return txAll<Project>("projects", "readonly", (s) => s.getAll() as IDBRequest<Project[]>);
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("projects", "readonly");
    const idx = transaction.objectStore("projects").index("slug");
    const req = idx.get(slug);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function updateProject(id: number, name: string, description?: string): Promise<Project> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("projects", "readwrite");
    const store = transaction.objectStore("projects");
    const req = store.get(id);
    req.onsuccess = () => {
      const existing = req.result as Project | undefined;
      if (!existing) {
        reject(new Error("Project not found"));
        return;
      }
      const updated: Project = {
        ...existing,
        name,
        description,
        slug: slugify(name),
      };
      store.put(updated);
      transaction.oncomplete = () => resolve(updated);
      transaction.onerror = () => reject(transaction.error);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteProject(id: number): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction(["projects", "statuses", "tasks", "boards"], "readwrite");
  transaction.objectStore("projects").delete(id);

  // Delete statuses for this project
  const statusStore = transaction.objectStore("statuses");
  const statusIdx = statusStore.index("projectId");
  const statusReq = statusIdx.getAllKeys(id);
  statusReq.onsuccess = () => {
    for (const key of statusReq.result) statusStore.delete(key);
  };

  // Delete tasks for this project
  const taskStore = transaction.objectStore("tasks");
  const taskIdx = taskStore.index("projectId");
  const taskReq = taskIdx.getAllKeys(id);
  taskReq.onsuccess = () => {
    for (const key of taskReq.result) taskStore.delete(key);
  };

  // Delete boards for this project
  const boardStore = transaction.objectStore("boards");
  const boardIdx = boardStore.index("projectId");
  const boardReq = boardIdx.getAllKeys(id);
  boardReq.onsuccess = () => {
    for (const key of boardReq.result) boardStore.delete(key);
  };

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// ─── Statuses ───

export async function createStatus(
  projectId: number,
  name: string,
  color: string,
  position: number,
  isEnd = false,
): Promise<TaskStatus> {
  const id = await nextId("statuses");
  const status: TaskStatus = { id, name, color, isEnd, position };
  await tx("statuses", "readwrite", (s) => s.add({ ...status, projectId }));
  return status;
}

export async function listStatuses(projectId: number): Promise<TaskStatus[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("statuses", "readonly");
    const idx = transaction.objectStore("statuses").index("projectId");
    const req = idx.getAll(projectId);
    req.onsuccess = () => {
      const results = (req.result ?? []) as (TaskStatus & { projectId: number })[];
      resolve(results.map(({ id, name, color, isEnd, position }) => ({ id, name, color, isEnd, position })));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function updateStatus(
  projectId: number,
  statusId: number,
  name: string,
  color: string,
  position: number,
  isEnd = false,
): Promise<TaskStatus> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("statuses", "readwrite");
    const store = transaction.objectStore("statuses");
    const req = store.get(statusId);
    req.onsuccess = () => {
      const existing = req.result as (TaskStatus & { projectId: number }) | undefined;
      if (!existing || existing.projectId !== projectId) {
        reject(new Error("Status not found"));
        return;
      }
      const updated: TaskStatus & { projectId: number } = {
        ...existing,
        name,
        color,
        position,
        isEnd,
      };
      store.put(updated);
      transaction.oncomplete = () => resolve(updated);
      transaction.onerror = () => reject(transaction.error);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteStatus(id: number): Promise<void> {
  await tx("statuses", "readwrite", (s) => s.delete(id));
}

// ─── Tasks ───

export async function createTask(
  projectId: number,
  title: string,
  statusId: number,
  boardId?: number,
): Promise<Task> {
  const id = await nextId("tasks");
  const now = new Date().toISOString();

  // Look up the status to include it in the returned task
  const statuses = await listStatuses(projectId);
  const status = statuses.find((s) => s.id === statusId);

  const task: Task = {
    id,
    shortId: `L-${id}`,
    title,
    priority: 1,
    archived: false,
    order: Date.now(),
    boardId,
    status: status
      ? { id: status.id, name: status.name, color: status.color, isEnd: status.isEnd, position: status.position }
      : undefined,
    createdAt: now,
    updatedAt: now,
  };
  await tx("tasks", "readwrite", (s) => s.add({ ...task, projectId, statusId, boardId: boardId ?? null }));
  return task;
}

export async function listTasks(projectId: number): Promise<TaskListResponse> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["tasks", "statuses"], "readonly");
    const taskIdx = transaction.objectStore("tasks").index("projectId");
    const taskReq = taskIdx.getAll(projectId);
    taskReq.onsuccess = () => {
      const rawTasks = (taskReq.result ?? []) as (Task & { projectId: number; statusId: number })[];
      const statusStore = transaction.objectStore("statuses");
      const statusReq = statusStore.getAll();
      statusReq.onsuccess = () => {
        const statuses = (statusReq.result ?? []) as (TaskStatus & { projectId: number })[];
        const statusMap = new Map(statuses.map((s) => [s.id, s]));
        const tasks: Task[] = rawTasks.map((t) => {
          const st = statusMap.get(t.statusId);
          return {
            id: t.id,
            shortId: t.shortId,
            title: t.title,
            description: t.description,
            priority: t.priority,
            endDate: t.endDate,
            archived: t.archived ?? false,
            order: t.order,
            boardId: t.boardId ?? undefined,
            status: st
              ? { id: st.id, name: st.name, color: st.color, isEnd: st.isEnd, position: st.position }
              : undefined,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          };
        });
        resolve({ tasks });
      };
      statusReq.onerror = () => reject(statusReq.error);
    };
    taskReq.onerror = () => reject(taskReq.error);
  });
}

export async function updateTask(
  projectId: number,
  taskId: number,
  input: Record<string, unknown>,
): Promise<Task> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["tasks", "statuses"], "readwrite");
    const taskStore = transaction.objectStore("tasks");
    const req = taskStore.get(taskId);
    req.onsuccess = () => {
      const existing = req.result as (Task & { projectId: number; statusId: number }) | undefined;
      if (!existing || existing.projectId !== projectId) {
        reject(new Error("Task not found"));
        return;
      }
      const updated = { ...existing, ...input, updatedAt: new Date().toISOString() };
      taskStore.put(updated);
      const statusReq = transaction.objectStore("statuses").get(updated.statusId);
      statusReq.onsuccess = () => {
        const st = statusReq.result as (TaskStatus & { projectId: number }) | undefined;
        const task: Task = {
          id: updated.id,
          shortId: updated.shortId,
          title: updated.title,
          description: updated.description,
          priority: updated.priority,
          endDate: updated.endDate,
          archived: updated.archived ?? false,
          order: updated.order,
          boardId: updated.boardId ?? undefined,
          status: st
            ? { id: st.id, name: st.name, color: st.color, isEnd: st.isEnd, position: st.position }
            : undefined,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        };
        transaction.oncomplete = () => resolve(task);
      };
      statusReq.onerror = () => reject(statusReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteTask(taskId: number): Promise<void> {
  await tx("tasks", "readwrite", (s) => s.delete(taskId));
}

// ─── Boards ───

export async function createBoard(
  projectId: number,
  name: string,
  position: number,
): Promise<Board> {
  const id = await nextId("boards");
  const board: Board = { id, name, position };
  await tx("boards", "readwrite", (s) => s.add({ ...board, projectId }));
  return board;
}

export async function listBoards(projectId: number): Promise<Board[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("boards", "readonly");
    const idx = transaction.objectStore("boards").index("projectId");
    const req = idx.getAll(projectId);
    req.onsuccess = () => {
      const results = (req.result ?? []) as (Board & { projectId: number })[];
      resolve(
        results
          .map(({ id, name, position }) => ({ id, name, position }))
          .sort((a, b) => a.position - b.position),
      );
    };
    req.onerror = () => reject(req.error);
  });
}

// EnsureDefaultBoard creates a default board for a project if no boards exist yet.
// Idempotent — safe to call multiple times. Mirrors backend EnsureDefaultBoard.
export async function ensureDefaultBoard(projectId: number): Promise<void> {
  const existing = await listBoards(projectId);
  if (existing.length > 0) return;
  await createBoard(projectId, "Основная доска", 0);
}

export async function updateBoard(
  id: number,
  name: string,
): Promise<Board> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("boards", "readwrite");
    const req = transaction.objectStore("boards").get(id);
    req.onsuccess = () => {
      const existing = req.result as (Board & { projectId: number }) | undefined;
      if (!existing) {
        reject(new Error("Board not found"));
        return;
      }
      const updated = { ...existing, name };
      transaction.objectStore("boards").put(updated);
      transaction.oncomplete = () => {
        resolve({ id: updated.id, name: updated.name, position: updated.position });
      };
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteBoard(id: number): Promise<void> {
  await tx("boards", "readwrite", (s) => s.delete(id));
}

// ─── Default seed data ───

export async function seedDefaultData(): Promise<void> {
  const projects = await listProjects();
  if (projects.length > 0) return;

  const _project = await createProject("My First Project", "Default local project");
  // createProject already creates default statuses and a board
}

// ─── Export / Import ───

const EXPORT_VERSION = 1;
const ALL_STORES = ["projects", "statuses", "tasks", "boards", "meta"] as const;

export interface ExportData {
  version: number;
  exportedAt: string;
  settings: ExtensionSettings;
  database: Record<string, unknown[]>;
}

function getAllFromStore(db: IDBDatabase, store: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

function clearStore(db: IDBDatabase, store: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function putAllToStore(db: IDBDatabase, store: string, records: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    for (const record of records) {
      os.put(record);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function exportAllData(): Promise<ExportData> {
  const db = await openDB();
  const database: Record<string, unknown[]> = {};

  for (const store of ALL_STORES) {
    if (db.objectStoreNames.contains(store)) {
      database[store] = await getAllFromStore(db, store);
    }
  }

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: readSettings(),
    database,
  };
}

export async function importAllData(data: ExportData): Promise<void> {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid import data");
  }
  if (data.version !== EXPORT_VERSION) {
    throw new Error(`Unsupported export version: ${data.version}`);
  }

  const db = await openDB();

  // Clear and restore each store
  for (const store of ALL_STORES) {
    if (!db.objectStoreNames.contains(store)) continue;
    await clearStore(db, store);
    const records = data.database?.[store];
    if (Array.isArray(records) && records.length > 0) {
      await putAllToStore(db, store, records);
    }
  }

  // Restore settings
  if (data.settings) {
    writeSettings(data.settings);
  }
}

export function downloadExportData(data: ExportData): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `yourtask-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
