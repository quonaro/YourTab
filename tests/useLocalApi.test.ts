import { describe, it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

// localDb caches an open IndexedDB connection module-wide, so each test gets
// a fresh module registry and a fresh in-memory IDBFactory.
async function load() {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
  const mod = await import("@/composables/useLocalApi");
  return mod.useLocalApi();
}

describe("useLocalApi projects", () => {
  it("loads, creates, updates and deletes projects", async () => {
    const api = await load();
    await api.seedIfEmpty();
    expect(api.projects.value).toHaveLength(1);

    const p = await api.createProject("Extra");
    expect(api.projects.value).toHaveLength(2);

    const updated = await api.updateProject(p.id, "Renamed");
    expect(api.projects.value.find((x) => x.id === p.id)!.name).toBe("Renamed");
    expect(updated.slug).toBe("renamed");

    await api.deleteProject(p.id);
    expect(api.projects.value).toHaveLength(1);
  });
});

describe("useLocalApi tasks/statuses/boards", () => {
  it("resolves the project by slug for every operation", async () => {
    const api = await load();
    await api.createProject("Work");

    const statuses = await api.getStatuses("work");
    expect(statuses).toHaveLength(3);

    const task = await api.createTask("work", {
      title: "thing",
      statusId: statuses[0].id,
    });
    expect(task.shortId).toMatch(/^L-/);
    expect((await api.listTasks("work")).tasks).toHaveLength(1);

    const moved = await api.updateTask("work", String(task.id), {
      statusId: statuses[1].id,
    });
    expect(moved.status?.id).toBe(statuses[1].id);

    const boards = await api.getBoards("work");
    expect(boards).toHaveLength(1);
    const b2 = await api.createBoard("work", "Second");
    expect(await api.getBoards("work")).toHaveLength(2);
    const renamed = await api.updateBoard("work", b2.id, "B2");
    expect(renamed.name).toBe("B2");
    await api.deleteBoard("work", b2.id);
    expect(await api.getBoards("work")).toHaveLength(1);

    const s2 = await api.createStatus("work", "Review", "#f0f", 3);
    expect(await api.getStatuses("work")).toHaveLength(4);
    const sUpd = await api.updateStatus("work", s2.id, "QA", "#0f0", 3);
    expect(sUpd.name).toBe("QA");
    await api.deleteStatus("work", s2.id);
    expect(await api.getStatuses("work")).toHaveLength(3);
  });

  it("returns empty results for unknown project slugs", async () => {
    const api = await load();
    await api.createProject("P");
    expect((await api.listTasks("nope")).tasks).toEqual([]);
    expect(await api.getStatuses("nope")).toEqual([]);
    expect(await api.getBoards("nope")).toEqual([]);
    await expect(
      api.createTask("nope", { title: "x", statusId: 1 }),
    ).rejects.toThrow("Project not found");
    await expect(api.updateTask("nope", "1", {})).rejects.toThrow(
      "Project not found",
    );
    await expect(api.createStatus("nope", "s", "#000", 0)).rejects.toThrow(
      "Project not found",
    );
  });

  it("createTask requires a statusId", async () => {
    const api = await load();
    await api.createProject("P");
    await expect(api.createTask("p", { title: "x" })).rejects.toThrow(
      "Status ID required",
    );
  });
});

describe("useLocalApi seeding", () => {
  it("seeds dev data only when empty", async () => {
    const api = await load();
    await api.seedDevIfEmpty();
    expect(api.projects.value).toHaveLength(3);
    await api.seedDevIfEmpty();
    expect(api.projects.value).toHaveLength(3);
    const { tasks } = await api.listTasks(api.projects.value[0].slug);
    expect(tasks.length).toBeGreaterThan(0);
  });
});
