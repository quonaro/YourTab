import { describe, it, expect, vi } from "vitest";
import { ref, computed } from "vue";
import { useBoardDragDrop } from "@/composables/useBoardDragDrop";
import type { Task, TaskStatus, Board } from "@/lib/types";

const status = (id: number, isEnd = false): TaskStatus => ({
  id,
  name: `S${id}`,
  color: "#000",
  isEnd,
  position: id,
});

const task = (over: Partial<Task> = {}): Task => ({
  id: 1,
  shortId: `T-${over.id ?? 1}`,
  title: "t",
  priority: 1,
  order: 0,
  ...over,
});

const fakeEvent = (over: Record<string, unknown> = {}) =>
  ({
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: { dropEffect: "" },
    ...over,
  }) as unknown as DragEvent;

function setup(opts: { remote?: boolean; readOnly?: boolean } = {}) {
  const tasks = ref<Task[]>([]);
  const statuses = ref<TaskStatus[]>([]);
  const boards = ref<Board[]>([]);
  const projectSlug = computed(() => "proj");
  const readOnly = computed(() => opts.readOnly ?? false);
  const isRemote = computed(() => opts.remote ?? false);
  const updateTask = vi.fn().mockResolvedValue(task());
  const dragTask = vi.fn().mockResolvedValue(undefined);
  const reorderTasks = vi.fn().mockResolvedValue(undefined);
  const api = useBoardDragDrop({
    tasks,
    statuses,
    boards,
    projectSlug,
    readOnly,
    isRemote,
    isLocked: (id) => api.isLocked(id),
    tasksForCell: (boardId, statusId) =>
      tasks.value.filter(
        (t) => t.boardId === boardId && t.status?.id === statusId,
      ),
    pileTasksForCell: (statusId) =>
      tasks.value.filter((t) => t.boardId == null && t.status?.id === statusId),
    updateTask,
    dragTask,
    reorderTasks,
  });
  return { api, tasks, statuses, boards, updateTask, dragTask, reorderTasks };
}

describe("task drag lifecycle", () => {
  it("tracks dragged task and notifies remote on start/end", () => {
    const { api, dragTask } = setup({ remote: true });
    api.onDragStart(5);
    expect(api.draggedTaskId.value).toBe(5);
    expect(dragTask).toHaveBeenCalledWith("proj", "5", "start");
    api.onDragEnd();
    expect(api.draggedTaskId.value).toBeNull();
    expect(dragTask).toHaveBeenCalledWith("proj", "5", "end");
  });

  it("does not call dragTask in local mode", () => {
    const { api, dragTask } = setup();
    api.onDragStart(5);
    api.onDragEnd();
    expect(dragTask).not.toHaveBeenCalled();
  });

  it("tracks drag-over position relative to midpoint", () => {
    const { api } = setup();
    api.onDragStart(1);
    const el = {
      getBoundingClientRect: () => ({ top: 0, height: 100 }),
    };
    api.onTaskDragOver(2, fakeEvent({ currentTarget: el, clientY: 10 }));
    expect(api.dragOverTaskId.value).toBe(2);
    expect(api.dragOverPosition.value).toBe("before");
    api.onTaskDragOver(2, fakeEvent({ currentTarget: el, clientY: 90 }));
    expect(api.dragOverPosition.value).toBe("after");
  });
});

describe("drop within the same cell (reorder)", () => {
  it("reorders tasks and assigns sequential order", async () => {
    const { api, tasks } = setup();
    tasks.value = [
      task({ id: 1, status: status(1), boardId: 10, order: 5 }),
      task({ id: 2, status: status(1), boardId: 10, order: 7 }),
      task({ id: 3, status: status(1), boardId: 10, order: 9 }),
    ];
    api.onDragStart(3);
    await api.onCellDrop(10, 1);
    const inCell = tasks.value
      .filter((t) => t.boardId === 10)
      .sort((a, b) => a.order - b.order);
    // No drag-over target → dropped task lands at the end of the cell.
    expect(inCell.map((t) => `${t.id}:${t.order}`)).toEqual([
      "1:0",
      "2:1",
      "3:2",
    ]);
  });

  it("honours drag-over position when reordering", async () => {
    const { api, tasks } = setup();
    tasks.value = [
      task({ id: 1, status: status(1), boardId: 10 }),
      task({ id: 2, status: status(1), boardId: 10 }),
      task({ id: 3, status: status(1), boardId: 10 }),
    ];
    api.onDragStart(1);
    api.dragOverTaskId.value = 2;
    api.dragOverPosition.value = "after";
    await api.onCellDrop(10, 1);
    const ids = tasks.value
      .filter((t) => t.boardId === 10)
      .sort((a, b) => a.order - b.order)
      .map((t) => t.id);
    expect(ids).toEqual([2, 1, 3]);
  });

  it("sends reordered ids to the backend in remote mode", async () => {
    const { api, tasks, reorderTasks } = setup({ remote: true });
    tasks.value = [
      task({ id: 1, status: status(1), boardId: 10 }),
      task({ id: 2, status: status(1), boardId: 10 }),
    ];
    api.onDragStart(2);
    api.dragOverTaskId.value = 1;
    api.dragOverPosition.value = "before";
    await api.onCellDrop(10, 1);
    expect(reorderTasks).toHaveBeenCalledWith("proj", 1, [2, 1]);
  });

  it("restores tasks and throws when remote reorder fails", async () => {
    const { api, tasks, reorderTasks } = setup({ remote: true });
    tasks.value = [
      task({ id: 1, status: status(1), boardId: 10, order: 0 }),
      task({ id: 2, status: status(1), boardId: 10, order: 1 }),
    ];
    reorderTasks.mockRejectedValue(new Error("nope"));
    api.onDragStart(2);
    await expect(api.onCellDrop(10, 1)).rejects.toThrow("nope");
    expect(tasks.value.find((t) => t.id === 2)?.order).toBe(1);
  });
});

describe("drop into another cell", () => {
  it("moves the task and patches status + board", async () => {
    const { api, tasks, statuses, updateTask } = setup();
    statuses.value = [status(1), status(2)];
    tasks.value = [task({ id: 1, status: status(1), boardId: 10 })];
    api.onDragStart(1);
    await api.onCellDrop(20, 2);
    expect(updateTask).toHaveBeenCalledWith("proj", "1", {
      statusId: 2,
      boardId: 20,
    });
    const moved = tasks.value.find((t) => t.id === 1)!;
    expect(moved.status?.id).toBe(2);
    expect(moved.boardId).toBe(20);
  });

  it("moves a task into the pile", async () => {
    const { api, tasks, statuses, updateTask } = setup();
    statuses.value = [status(1), status(2)];
    tasks.value = [task({ id: 1, status: status(1), boardId: 10 })];
    api.onDragStart(1);
    await api.onPileCellDrop(2);
    expect(updateTask).toHaveBeenCalledWith("proj", "1", {
      statusId: 2,
      boardId: null,
    });
    expect(tasks.value[0].boardId).toBeUndefined();
  });

  it("updates parent children checkboxes when task lands on end status", async () => {
    const { api, tasks, statuses } = setup();
    statuses.value = [status(1), status(2, true)];
    tasks.value = [
      task({
        id: 9,
        status: status(1),
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
      task({ id: 1, status: status(1), boardId: 10 }),
    ];
    api.onDragStart(1);
    await api.onCellDrop(10, 2);
    const parent = tasks.value.find((t) => t.id === 9)!;
    expect(parent.children![0].statusIsEnd).toBe(true);
    expect(parent.children![0].statusName).toBe("S2");
  });

  it("rejects drops in read-only mode", async () => {
    const { api, tasks } = setup({ readOnly: true });
    tasks.value = [task({ id: 1, status: status(1) })];
    api.onDragStart(1);
    await expect(api.onCellDrop(10, 1)).rejects.toThrow();
  });

  it("ignores drops on locked tasks", async () => {
    const { api, tasks, statuses, updateTask } = setup();
    statuses.value = [status(1), status(2)];
    tasks.value = [task({ id: 1, status: status(1), boardId: 10 })];
    api.onDragStart(1);
    api.setLocked(1, 99);
    await api.onCellDrop(20, 2);
    expect(updateTask).not.toHaveBeenCalled();
  });
});

describe("locks", () => {
  it("setLocked/unlock manage locked task ids", () => {
    const { api } = setup();
    api.setLocked(1, 5);
    expect(api.isLocked(1)).toBe(true);
    expect(api.isLocked(2)).toBe(false);
    api.unlock(1);
    expect(api.isLocked(1)).toBe(false);
  });
});

describe("status and board drag reorder", () => {
  it("reorders column order on status drop", () => {
    const { api } = setup();
    const columnOrder = ref([1, 2, 3]);
    const div = document.createElement("div");
    api.onStatusDragStart(1, fakeEvent({ target: div }));
    api.onStatusDrop(
      fakeEvent({ currentTarget: { dataset: { statusId: "3" } } }),
      columnOrder,
    );
    expect(columnOrder.value).toEqual([2, 3, 1]);
  });

  it("aborts status drag from trigger/menu elements", () => {
    const { api } = setup();
    const menu = document.createElement("div");
    menu.setAttribute("data-status-menu", "");
    const child = document.createElement("span");
    menu.appendChild(child);
    api.onStatusDragStart(1, fakeEvent({ target: child }));
    expect(api.draggedStatusId.value).toBeNull();
  });

  it("reorders boards on drop", () => {
    const { api, boards } = setup();
    boards.value = [
      { id: 1, name: "a", position: 0 },
      { id: 2, name: "b", position: 1 },
      { id: 3, name: "c", position: 2 },
    ];
    const div = document.createElement("div");
    api.onBoardDragStart(3, fakeEvent({ target: div }));
    api.onBoardDrop(1, fakeEvent());
    expect(boards.value.map((b) => b.id)).toEqual([3, 1, 2]);
  });
});
