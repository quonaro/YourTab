import { describe, it, expect, vi } from "vitest";
import { ref, computed } from "vue";
import { useBoardTaskOps } from "@/composables/useBoardTaskOps";
import type { Task } from "@/lib/types";

const task = (over: Partial<Task> = {}): Task => ({
  id: 1,
  shortId: "T-1",
  title: "t",
  priority: 1,
  order: 0,
  ...over,
});

function setup(opts: { remote?: boolean; readOnly?: boolean } = {}) {
  const tasks = ref<Task[]>([]);
  const projectSlug = computed(() => "proj");
  const readOnly = computed(() => opts.readOnly ?? false);
  const isRemote = computed(() => opts.remote ?? false);
  const silentRefresh = vi.fn().mockResolvedValue(undefined);
  const createTask = vi
    .fn()
    .mockResolvedValue(task({ id: 42, title: "new task" }));
  const updateTask = vi.fn().mockResolvedValue(task());
  const api = useBoardTaskOps({
    tasks,
    projectSlug,
    readOnly,
    isRemote,
    silentRefresh,
    createTask,
    updateTask,
  });
  return { api, tasks, silentRefresh, createTask, updateTask };
}

describe("handleCreateTask", () => {
  it("returns null and does nothing for empty title", async () => {
    const { api, createTask } = setup();
    expect(await api.handleCreateTask(1, 2)).toBeNull();
    expect(createTask).not.toHaveBeenCalled();
  });

  it("returns read-only error when board is read-only", async () => {
    const { api, createTask } = setup({ readOnly: true });
    api.updateNewTaskInput("1-2", "new task");
    const err = await api.handleCreateTask(1, 2);
    expect(err).toBeTruthy();
    expect(createTask).not.toHaveBeenCalled();
  });

  it("creates task locally and clears the input", async () => {
    const { api, tasks, createTask } = setup();
    api.updateNewTaskInput("1-2", " new task ");
    expect(await api.handleCreateTask(1, 2)).toBeNull();
    expect(createTask).toHaveBeenCalledWith("proj", {
      title: "new task",
      statusId: 2,
      boardId: 1,
    });
    expect(tasks.value.map((t) => t.id)).toEqual([42]);
    expect(api.newTaskInputs.value["1-2"]).toBe("");
  });

  it("re-fetches remotely instead of pushing the task", async () => {
    const { api, tasks, silentRefresh } = setup({ remote: true });
    api.updateNewTaskInput("pile-2", "new task");
    await api.handleCreateTask(null, 2);
    expect(silentRefresh).toHaveBeenCalledTimes(1);
    expect(tasks.value).toHaveLength(0);
  });

  it("returns mapped error on API failure", async () => {
    const { api, createTask } = setup();
    createTask.mockRejectedValue(new Error("tasks.readonly"));
    api.updateNewTaskInput("1-2", "x");
    const err = await api.handleCreateTask(1, 2);
    expect(err).toBeTruthy();
    expect(err).not.toBeNull();
  });
});

describe("archive / unarchive", () => {
  it("archives a task optimistically", async () => {
    const { api, tasks, updateTask } = setup();
    tasks.value = [task({ id: 7 })];
    expect(await api.archiveTask(7)).toBeNull();
    expect(updateTask).toHaveBeenCalledWith("proj", "7", { archived: true });
    expect(tasks.value[0].archived).toBe(true);
  });

  it("unarchives a task", async () => {
    const { api, tasks, updateTask } = setup();
    tasks.value = [task({ id: 7, archived: true })];
    expect(await api.unarchiveTask(7)).toBeNull();
    expect(updateTask).toHaveBeenCalledWith("proj", "7", { archived: false });
    expect(tasks.value[0].archived).toBe(false);
  });

  it("blocks archiving in read-only mode", async () => {
    const { api, updateTask } = setup({ readOnly: true });
    expect(await api.archiveTask(7)).toBeTruthy();
    expect(await api.unarchiveTask(7)).toBeTruthy();
    expect(updateTask).not.toHaveBeenCalled();
  });

  it("returns error on API failure without touching tasks", async () => {
    const { api, tasks, updateTask } = setup();
    tasks.value = [task({ id: 7 })];
    updateTask.mockRejectedValue(new Error("boom"));
    expect(await api.archiveTask(7)).toBe("boom");
    expect(tasks.value[0].archived).toBeFalsy();
  });
});
