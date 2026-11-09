import { describe, it, expect, vi } from "vitest";
import { ref, computed } from "vue";
import { useBoardData } from "@/composables/useBoardData";
import type { Task, TaskStatus, Board, TaskListParams } from "@/lib/types";

const status = (id: number, position = id, isEnd = false): TaskStatus => ({
  id,
  name: `S${id}`,
  color: "#000",
  isEnd,
  position,
});

const task = (over: Partial<Task> = {}): Task => ({
  id: 1,
  shortId: `T-${over.id ?? 1}`,
  title: "t",
  priority: 1,
  order: 0,
  ...over,
});

function setup(opts: { remote?: boolean; userId?: number } = {}) {
  const tasks = ref<Task[]>([]);
  const statuses = ref<TaskStatus[]>([]);
  const boards = ref<Board[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const projectSlug = computed(() => "proj");
  const isRemote = computed(() => opts.remote ?? false);
  const currentUserId = computed(() => opts.userId ?? 1);
  const buildTaskParams = vi.fn(() => ({ search: "x" }) as TaskListParams);
  const listTasks = vi.fn().mockResolvedValue({ tasks: [] as Task[] });
  const getStatuses = vi.fn().mockResolvedValue([] as TaskStatus[]);
  const getBoards = vi.fn().mockResolvedValue([] as Board[]);
  const onLockTask = vi.fn();
  const onUnlockTask = vi.fn();
  const api = useBoardData({
    tasks,
    statuses,
    boards,
    loading,
    error,
    projectSlug,
    isRemote,
    currentUserId,
    buildTaskParams,
    listTasks,
    getStatuses,
    getBoards,
    onLockTask,
    onUnlockTask,
  });
  return {
    api,
    tasks,
    statuses,
    boards,
    loading,
    error,
    listTasks,
    getStatuses,
    getBoards,
    onLockTask,
    onUnlockTask,
  };
}

describe("loadData", () => {
  it("loads tasks, sorts statuses by position and toggles loading", async () => {
    const s = setup();
    s.listTasks.mockResolvedValue({ tasks: [task({ id: 1 })] });
    s.getStatuses.mockResolvedValue([status(2, 5), status(1, 0)]);
    s.getBoards.mockResolvedValue([{ id: 9, name: "B", position: 0 }]);
    await s.api.loadData();
    expect(s.tasks.value.map((t) => t.id)).toEqual([1]);
    expect(s.statuses.value.map((st) => st.id)).toEqual([1, 2]);
    expect(s.boards.value).toHaveLength(1);
    expect(s.loading.value).toBe(false);
    expect(s.error.value).toBeNull();
    expect(s.listTasks).toHaveBeenCalledWith("proj", { search: "x" });
  });

  it("maps errors to error ref", async () => {
    const s = setup();
    s.listTasks.mockRejectedValue(new Error("kaboom"));
    await s.api.loadData();
    expect(s.error.value).toBe("kaboom");
    expect(s.loading.value).toBe(false);
  });
});

describe("silentRefresh", () => {
  it("merges fresh tasks by id preserving order and drops removed ones", async () => {
    const s = setup();
    s.tasks.value = [
      task({ id: 1, title: "old1" }),
      task({ id: 2, title: "old2" }),
    ];
    s.listTasks.mockResolvedValue({
      tasks: [task({ id: 2, title: "new2" }), task({ id: 3 })],
    });
    await s.api.silentRefresh();
    expect(s.tasks.value.map((t) => `${t.id}:${t.title}`)).toEqual([
      "2:new2",
      "3:t",
    ]);
  });

  it("swallows errors silently", async () => {
    const s = setup();
    s.listTasks.mockRejectedValue(new Error("net down"));
    await expect(s.api.silentRefresh()).resolves.toBeUndefined();
    expect(s.error.value).toBeNull();
  });
});

describe("handleWSMessage", () => {
  it("task.updated replaces the task but keeps local order", () => {
    const s = setup();
    s.tasks.value = [task({ id: 1, title: "old", order: 7 })];
    s.api.handleWSMessage({
      type: "task.updated",
      data: { task: task({ id: 1, title: "new", order: 0 }) },
    });
    expect(s.tasks.value[0].title).toBe("new");
    expect(s.tasks.value[0].order).toBe(7);
  });

  it("task.updated syncs parent children checkboxes", () => {
    const s = setup();
    s.tasks.value = [
      task({
        id: 9,
        children: [
          {
            id: 1,
            shortId: "T-1",
            title: "c",
            statusIsEnd: false,
            priority: 1,
          },
        ],
      }),
      task({ id: 1 }),
    ];
    s.api.handleWSMessage({
      type: "task.updated",
      data: { task: task({ id: 1, status: status(5, 0, true) }) },
    });
    const child = s.tasks.value[0].children![0];
    expect(child.statusIsEnd).toBe(true);
    expect(child.statusName).toBe("S5");
  });

  it("task.created appends locally, refreshes remotely", async () => {
    const local = setup();
    local.api.handleWSMessage({
      type: "task.created",
      data: { task: task({ id: 5 }) },
    });
    await vi.waitFor(() =>
      expect(local.tasks.value.map((t) => t.id)).toEqual([5]),
    );

    const remote = setup({ remote: true });
    remote.api.handleWSMessage({
      type: "task.created",
      data: { task: task({ id: 5 }) },
    });
    await vi.waitFor(() => expect(remote.listTasks).toHaveBeenCalled());
    expect(remote.tasks.value).toEqual([]);
  });

  it("does not duplicate an existing task on task.created", () => {
    const s = setup();
    s.tasks.value = [task({ id: 5 })];
    s.api.handleWSMessage({
      type: "task.created",
      data: { task: task({ id: 5 }) },
    });
    expect(s.tasks.value).toHaveLength(1);
  });

  it("locks/unlocks tasks dragged by other users only", () => {
    const s = setup({ userId: 1 });
    s.api.handleWSMessage({
      type: "task.drag.start",
      data: { taskId: 7, userId: 1 },
    });
    expect(s.onLockTask).not.toHaveBeenCalled();
    s.api.handleWSMessage({
      type: "task.drag.start",
      data: { taskId: 7, userId: 2 },
    });
    expect(s.onLockTask).toHaveBeenCalledWith(7, 2);
    s.api.handleWSMessage({
      type: "task.drag.end",
      data: { taskId: 7, userId: 2 },
    });
    expect(s.onUnlockTask).toHaveBeenCalledWith(7);
  });

  it("task.reordered applies new order and status", () => {
    const s = setup();
    s.statuses.value = [status(3, 0, true)];
    s.tasks.value = [
      task({ id: 1, order: 0, status: status(1) }),
      task({ id: 2, order: 1, status: status(1) }),
      task({ id: 9, order: 0 }),
    ];
    s.api.handleWSMessage({
      type: "task.reordered",
      data: { statusId: 3, taskIds: [2, 1] },
    });
    const byId = new Map(s.tasks.value.map((t) => [t.id, t]));
    expect(byId.get(2)!.order).toBe(0);
    expect(byId.get(1)!.order).toBe(1);
    expect(byId.get(2)!.status?.id).toBe(3);
    expect(byId.get(9)!.order).toBe(0);
  });
});
