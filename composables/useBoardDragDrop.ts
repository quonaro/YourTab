import { ref, shallowRef, computed, type Ref, type ComputedRef } from "vue";
import type { Task, TaskStatus, Board } from "@/lib/types";
import { useI18n } from "@/composables/useI18n";
import { mapApiError } from "@/lib/apiErrors";

interface UseBoardDragDropOptions {
  tasks: Ref<Task[]>;
  statuses: Ref<TaskStatus[]>;
  boards: Ref<Board[]>;
  projectSlug: ComputedRef<string>;
  readOnly: ComputedRef<boolean>;
  isRemote: ComputedRef<boolean>;
  isLocked: (taskId: number) => boolean;
  tasksForCell: (boardId: number, statusId: number) => Task[];
  pileTasksForCell: (statusId: number) => Task[];
  updateTask: (
    slug: string,
    id: string,
    input: Record<string, unknown>,
  ) => Promise<Task>;
  dragTask: (
    slug: string,
    id: string,
    action: "start" | "end",
  ) => Promise<void>;
  reorderTasks: (
    slug: string,
    statusId: number | null,
    taskIds: number[],
  ) => Promise<void>;
}

export function useBoardDragDrop(opts: UseBoardDragDropOptions) {
  const { t } = useI18n();

  const draggedTaskId = ref<number | null>(null);
  const dragOverTaskId = ref<number | null>(null);
  const dragOverPosition = ref<"before" | "after">("before");
  const lockedTaskIds = shallowRef<Map<number, number>>(new Map());

  const draggedStatusId = ref<number | null>(null);
  const draggedBoardId = ref<number | null>(null);

  function isLocked(taskId: number): boolean {
    return lockedTaskIds.value.has(taskId);
  }

  // ─── Task drag ───

  function onDragStart(taskId: number) {
    draggedTaskId.value = taskId;
    if (opts.isRemote.value) {
      void opts.dragTask(opts.projectSlug.value, String(taskId), "start");
    }
  }

  function onDragEnd() {
    if (draggedTaskId.value != null && opts.isRemote.value) {
      void opts.dragTask(
        opts.projectSlug.value,
        String(draggedTaskId.value),
        "end",
      );
    }
    draggedTaskId.value = null;
    dragOverTaskId.value = null;
  }

  function onTaskDragOver(taskId: number, e: DragEvent) {
    if (draggedTaskId.value === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const newPosition = e.clientY < midpoint ? "before" : "after";
    if (
      dragOverTaskId.value !== taskId ||
      dragOverPosition.value !== newPosition
    ) {
      dragOverTaskId.value = taskId;
      dragOverPosition.value = newPosition;
    }
  }

  function onCellDragOver(e: DragEvent) {
    if (draggedTaskId.value === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  async function onCellDrop(boardId: number, statusId: number) {
    if (draggedTaskId.value == null) return;
    const taskId = draggedTaskId.value;
    const task = opts.tasks.value.find((tk) => tk.id === taskId);
    if (!task) return;
    if (opts.readOnly.value) {
      throw new Error(t("board.readOnlyError"));
    }
    if (isLocked(taskId)) return;
    if (task.boardId === boardId && task.status?.id === statusId) {
      await reorderInCell(boardId, statusId, taskId);
    } else {
      await onDropToCell(taskId, boardId, statusId);
    }
  }

  async function onPileCellDrop(statusId: number) {
    if (draggedTaskId.value == null) return;
    const taskId = draggedTaskId.value;
    const task = opts.tasks.value.find((tk) => tk.id === taskId);
    if (!task) return;
    if (opts.readOnly.value) {
      throw new Error(t("board.readOnlyError"));
    }
    if (isLocked(taskId)) return;
    if (task.boardId == null && task.status?.id === statusId) {
      await reorderInCell(null, statusId, taskId);
    } else {
      await onDropToCell(taskId, null, statusId);
    }
  }

  async function reorderInCell(
    boardId: number | null,
    statusId: number,
    taskId: number,
  ) {
    const cellTasks =
      boardId != null
        ? opts.tasksForCell(boardId, statusId)
        : opts.pileTasksForCell(statusId);
    const ids = cellTasks.map((tk) => tk.id);
    const filtered = ids.filter((id) => id !== taskId);

    let insertIdx = filtered.length;
    if (dragOverTaskId.value != null) {
      const overIdx = filtered.indexOf(dragOverTaskId.value);
      if (overIdx !== -1) {
        insertIdx = dragOverPosition.value === "before" ? overIdx : overIdx + 1;
      }
    }
    filtered.splice(insertIdx, 0, taskId);

    const cellTaskMap = new Map<number, Task>();
    for (const tk of cellTasks) cellTaskMap.set(tk.id, tk);

    const reorderedIds = new Set(filtered);
    const otherTasks = opts.tasks.value.filter(
      (tk) => !reorderedIds.has(tk.id),
    );
    const reorderedPart = filtered.map((id, i) => ({
      ...cellTaskMap.get(id)!,
      order: i,
    }));

    const savedTasks = opts.tasks.value;
    opts.tasks.value = [...otherTasks, ...reorderedPart];
    draggedTaskId.value = null;
    dragOverTaskId.value = null;

    if (opts.isRemote.value) {
      try {
        await opts.reorderTasks(opts.projectSlug.value, statusId, filtered);
      } catch (e) {
        opts.tasks.value = savedTasks;
        throw new Error(mapApiError(e, t));
      }
    }
  }

  async function onDropToCell(
    taskId: number,
    boardId: number | null,
    statusId: number,
  ) {
    const idx = opts.tasks.value.findIndex((tk) => tk.id === taskId);
    if (idx === -1) return;
    const oldTask = opts.tasks.value[idx];
    const status = opts.statuses.value.find((s) => s.id === statusId);
    if (oldTask.status?.id === statusId && oldTask.boardId === boardId) return;

    const updatedTask: Task = {
      ...oldTask,
      status,
      boardId: boardId ?? undefined,
    };

    const targetCellTasks = opts.tasks.value.filter(
      (tk) =>
        tk.status?.id === statusId && tk.boardId === boardId && tk.id !== taskId,
    );
    const filtered = targetCellTasks.map((tk) => tk.id);

    let insertIdx = filtered.length;
    if (dragOverTaskId.value != null) {
      const overIdx = filtered.indexOf(dragOverTaskId.value);
      if (overIdx !== -1) {
        insertIdx = dragOverPosition.value === "before" ? overIdx : overIdx + 1;
      }
    }
    filtered.splice(insertIdx, 0, taskId);

    const cellTaskMap = new Map<number, Task>();
    for (const tk of targetCellTasks) cellTaskMap.set(tk.id, tk);
    cellTaskMap.set(taskId, updatedTask);

    const reorderedIds = new Set(filtered);
    const otherTasks = opts.tasks.value.filter(
      (tk) => !reorderedIds.has(tk.id),
    );
    const reorderedPart = filtered.map((id, i) => ({
      ...cellTaskMap.get(id)!,
      order: i,
    }));

    const savedTasks = opts.tasks.value;
    opts.tasks.value = [...otherTasks, ...reorderedPart];
    draggedTaskId.value = null;
    dragOverTaskId.value = null;

    try {
      const input: Record<string, unknown> = { statusId };
      input.boardId = boardId ?? null;
      await opts.updateTask(opts.projectSlug.value, String(taskId), input);
      if (opts.isRemote.value) {
        try {
          await opts.reorderTasks(opts.projectSlug.value, statusId, filtered);
        } catch {
          // non-critical
        }
      }
    } catch (e) {
      opts.tasks.value = savedTasks;
      throw new Error(mapApiError(e, t));
    }
  }

  // ─── Status drag reorder ───

  function onStatusDragStart(statusId: number, e: DragEvent) {
    const target = e.target as HTMLElement;
    if (
      target.closest("[data-status-trigger]") ||
      target.closest("[data-status-menu]")
    ) {
      e.preventDefault();
      return;
    }
    draggedStatusId.value = statusId;
  }
  function onStatusDragEnd() {
    draggedStatusId.value = null;
  }
  function onStatusDragOver(_statusId: number, e: DragEvent) {
    if (draggedStatusId.value === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }
  function onStatusDrop(
    e: DragEvent,
    columnOrder: Ref<number[]>,
  ) {
    if (draggedStatusId.value === null) return;
    e.preventDefault();
    const targetEl = e.currentTarget as HTMLElement;
    const targetStatusId = Number(targetEl.dataset.statusId);
    const fromIdx = columnOrder.value.indexOf(draggedStatusId.value);
    const toIdx = columnOrder.value.indexOf(targetStatusId);
    if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
      const newOrder = [...columnOrder.value];
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, draggedStatusId.value);
      columnOrder.value = newOrder;
    }
    draggedStatusId.value = null;
  }

  // ─── Board drag reorder ───

  function onBoardDragStart(boardId: number, e: DragEvent) {
    const target = e.target as HTMLElement;
    if (
      target.closest("[data-board-trigger]") ||
      target.closest("[data-board-menu]")
    ) {
      e.preventDefault();
      return;
    }
    draggedBoardId.value = boardId;
  }
  function onBoardDragEnd() {
    draggedBoardId.value = null;
  }
  function onBoardDragOver(_boardId: number, e: DragEvent) {
    if (draggedBoardId.value === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }
  function onBoardDrop(boardId: number, e: DragEvent) {
    if (draggedBoardId.value === null) return;
    e.preventDefault();
    const fromIdx = opts.boards.value.findIndex(
      (b) => b.id === draggedBoardId.value,
    );
    const toIdx = opts.boards.value.findIndex((b) => b.id === boardId);
    if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
      const reordered = [...opts.boards.value];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      opts.boards.value = reordered;
    }
    draggedBoardId.value = null;
  }

  // ─── WS lock management ───

  function setLocked(taskId: number, userId: number) {
    const newMap = new Map(lockedTaskIds.value);
    newMap.set(taskId, userId);
    lockedTaskIds.value = newMap;
  }

  function unlock(taskId: number) {
    const newMap = new Map(lockedTaskIds.value);
    newMap.delete(taskId);
    lockedTaskIds.value = newMap;
  }

  return {
    draggedTaskId,
    dragOverTaskId,
    dragOverPosition,
    lockedTaskIds,
    draggedStatusId,
    draggedBoardId,
    isLocked,
    onDragStart,
    onDragEnd,
    onTaskDragOver,
    onCellDragOver,
    onCellDrop,
    onPileCellDrop,
    onStatusDragStart,
    onStatusDragEnd,
    onStatusDragOver,
    onStatusDrop,
    onBoardDragStart,
    onBoardDragEnd,
    onBoardDragOver,
    onBoardDrop,
    setLocked,
    unlock,
  };
}
