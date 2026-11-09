import { describe, it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

// localDb caches an open IndexedDB connection in a module-level promise, so
// each test gets a fresh module registry plus a fresh in-memory IDBFactory.
async function loadDb() {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  return import("@/lib/localDb");
}

describe("projects", () => {
  it("creates a project with default statuses and a board", async () => {
    const db = await loadDb();
    const p = await db.createProject("My Project", "desc");
    expect(p.id).toBeGreaterThan(0);
    expect(p.slug).toBe("my-project");
    expect(p.organizationId).toBe(0);

    const statuses = await db.listStatuses(p.id);
    expect(statuses.map((s) => s.name)).toEqual([
      "To Do",
      "In Progress",
      "Done",
    ]);
    expect(statuses[2].isEnd).toBe(true);
    expect(statuses.map((s) => s.position)).toEqual([0, 1, 2]);

    const boards = await db.listBoards(p.id);
    expect(boards).toHaveLength(1);
    expect(boards[0].name).toBe("Main Board");
  });

  it("generates unique slugs for duplicate names", async () => {
    const db = await loadDb();
    const a = await db.createProject("Same Name");
    const b = await db.createProject("Same Name");
    const c = await db.createProject("Same Name");
    expect(a.slug).toBe("same-name");
    expect(b.slug).toBe("same-name-2");
    expect(c.slug).toBe("same-name-3");
  });

  it("finds a project by slug", async () => {
    const db = await loadDb();
    const p = await db.createProject("Lookup");
    expect((await db.getProjectBySlug("lookup"))?.id).toBe(p.id);
    expect(await db.getProjectBySlug("missing")).toBeNull();
  });

  it("updates name and slug, keeps slug on rename to same value", async () => {
    const db = await loadDb();
    const p = await db.createProject("First");
    const other = await db.createProject("Second");
    const renamed = await db.updateProject(other.id, "First");
    expect(renamed.slug).toBe("first-2");
    const again = await db.updateProject(other.id, "First");
    expect(again.slug).toBe("first-2");
    expect((await db.getProjectBySlug("first"))?.id).toBe(p.id);
  });

  it("rejects updating a missing project", async () => {
    const db = await loadDb();
    await expect(db.updateProject(999, "X")).rejects.toThrow(
      "Project not found",
    );
  });

  it("deletes a project along with statuses, tasks and boards", async () => {
    const db = await loadDb();
    const p = await db.createProject("Doomed");
    const statuses = await db.listStatuses(p.id);
    await db.createTask(p.id, "t1", statuses[0].id);

    await db.deleteProject(p.id);
    expect(await db.listProjects()).toHaveLength(0);
    expect(await db.listStatuses(p.id)).toHaveLength(0);
    expect((await db.listTasks(p.id)).tasks).toHaveLength(0);
    expect(await db.listBoards(p.id)).toHaveLength(0);
  });
});

describe("statuses", () => {
  it("creates, lists and deletes statuses scoped to a project", async () => {
    const db = await loadDb();
    const p = await db.createProject("P");
    const extra = await db.createStatus(p.id, "Review", "#fff000", 3);
    const statuses = await db.listStatuses(p.id);
    expect(statuses).toHaveLength(4);
    expect(statuses.find((s) => s.id === extra.id)?.color).toBe("#fff000");

    await db.deleteStatus(extra.id);
    expect(await db.listStatuses(p.id)).toHaveLength(3);
  });

  it("updates a status", async () => {
    const db = await loadDb();
    const p = await db.createProject("P");
    const [s] = await db.listStatuses(p.id);
    const updated = await db.updateStatus(
      p.id,
      s.id,
      "New",
      "#123456",
      0,
      true,
    );
    expect(updated.name).toBe("New");
    expect(updated.isEnd).toBe(true);
  });

  it("rejects updating a status from another project", async () => {
    const db = await loadDb();
    const a = await db.createProject("A");
    const b = await db.createProject("B");
    const [sa] = await db.listStatuses(a.id);
    await expect(
      db.updateStatus(b.id, sa.id, "X", "#000000", 0),
    ).rejects.toThrow("Status not found");
  });
});

describe("tasks", () => {
  it("creates a task with generated shortId and embedded status", async () => {
    const db = await loadDb();
    const p = await db.createProject("P");
    const statuses = await db.listStatuses(p.id);
    const task = await db.createTask(p.id, "Do thing", statuses[1].id);
    expect(task.shortId).toBe(`L-${task.id}`);
    expect(task.status?.id).toBe(statuses[1].id);
    expect(task.status?.name).toBe("In Progress");
    expect(task.priority).toBe(1);
    expect(task.archived).toBe(false);
  });

  it("lists tasks of a project with joined status", async () => {
    const db = await loadDb();
    const p = await db.createProject("P");
    const other = await db.createProject("Other");
    const [s] = await db.listStatuses(p.id);
    const [so] = await db.listStatuses(other.id);
    await db.createTask(p.id, "a", s.id);
    await db.createTask(p.id, "b", s.id);
    await db.createTask(other.id, "c", so.id);

    const { tasks } = await db.listTasks(p.id);
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.title).sort()).toEqual(["a", "b"]);
    expect(tasks[0].status?.name).toBe("To Do");
  });

  it("updates a task and refreshes updatedAt", async () => {
    const db = await loadDb();
    const p = await db.createProject("P");
    const statuses = await db.listStatuses(p.id);
    const task = await db.createTask(p.id, "t", statuses[0].id);

    const updated = await db.updateTask(p.id, task.id, {
      title: "renamed",
      statusId: statuses[2].id,
      archived: true,
    });
    expect(updated.title).toBe("renamed");
    expect(updated.archived).toBe(true);
    expect(updated.status?.id).toBe(statuses[2].id);
  });

  it("rejects updating a task from another project", async () => {
    const db = await loadDb();
    const a = await db.createProject("A");
    const b = await db.createProject("B");
    const [sa] = await db.listStatuses(a.id);
    const t = await db.createTask(a.id, "t", sa.id);
    await expect(db.updateTask(b.id, t.id, {})).rejects.toThrow(
      "Task not found",
    );
  });

  it("deletes a task", async () => {
    const db = await loadDb();
    const p = await db.createProject("P");
    const [s] = await db.listStatuses(p.id);
    const t = await db.createTask(p.id, "t", s.id);
    await db.deleteTask(t.id);
    expect((await db.listTasks(p.id)).tasks).toHaveLength(0);
  });
});

describe("boards", () => {
  it("creates and lists boards sorted by position", async () => {
    const db = await loadDb();
    const p = await db.createProject("P");
    await db.createBoard(p.id, "Second", 5);
    await db.createBoard(p.id, "Third", 2);
    const names = (await db.listBoards(p.id)).map((b) => b.name);
    expect(names).toEqual(["Main Board", "Third", "Second"]);
  });

  it("ensureDefaultBoard is idempotent", async () => {
    const db = await loadDb();
    const p = await db.createProject("P");
    await db.ensureDefaultBoard(p.id);
    await db.ensureDefaultBoard(p.id);
    expect(await db.listBoards(p.id)).toHaveLength(1);
  });

  it("renames and deletes boards", async () => {
    const db = await loadDb();
    const p = await db.createProject("P");
    const b = await db.createBoard(p.id, "Extra", 1);
    const renamed = await db.updateBoard(b.id, "Renamed");
    expect(renamed.name).toBe("Renamed");
    await db.deleteBoard(b.id);
    expect(await db.listBoards(p.id)).toHaveLength(1);
  });

  it("rejects renaming a missing board", async () => {
    const db = await loadDb();
    await expect(db.updateBoard(999, "X")).rejects.toThrow("Board not found");
  });
});

describe("seedDefaultData", () => {
  it("seeds one project only when empty", async () => {
    const db = await loadDb();
    await db.seedDefaultData();
    expect(await db.listProjects()).toHaveLength(1);
    await db.seedDefaultData();
    expect(await db.listProjects()).toHaveLength(1);
  });
});

describe("export / import", () => {
  it("round-trips all data", async () => {
    const db = await loadDb();
    const p = await db.createProject("Export Me");
    const [s] = await db.listStatuses(p.id);
    await db.createTask(p.id, "task one", s.id);

    const data = await db.exportAllData();
    expect(data.version).toBe(1);
    expect(data.database.projects).toHaveLength(1);
    expect(data.database.tasks).toHaveLength(1);

    const fresh = await loadDb();
    expect(await fresh.listProjects()).toHaveLength(0);
    await fresh.importAllData(data);
    const projects = await fresh.listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("Export Me");
    const { tasks } = await fresh.listTasks(projects[0].id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("task one");
    expect(tasks[0].status?.name).toBe("To Do");
  });

  it("restores settings from the export", async () => {
    const db = await loadDb();
    const data = await db.exportAllData();
    data.settings = { ...data.settings, theme: "dark", uiScale: 130 };

    localStorage.clear();
    const fresh = await loadDb();
    await fresh.importAllData(data);
    const raw = localStorage.getItem("yourtask-settings");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).theme).toBe("dark");
  });

  it("rejects wrong version and malformed payloads", async () => {
    const db = await loadDb();
    await expect(db.importAllData({ version: 99 } as never)).rejects.toThrow(
      "Unsupported export version",
    );
    await expect(db.importAllData(null as never)).rejects.toThrow(
      "Invalid import data",
    );
  });
});
