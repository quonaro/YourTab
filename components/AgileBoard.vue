<script setup lang="ts">
import { ref, computed, shallowRef, onMounted, onUnmounted, watch } from "vue";
import {
  Plus,
  Lock,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
  Minus,
  ChevronDown,
  ChevronRight,
  GripVertical,
  RotateCcw,
  RefreshCw,
  LayoutGrid,
  Columns3,
} from "lucide-vue-next";
import { useOrgData, type OrgType } from "@/composables/useOrgData";
import { useWebSocket, type WSMessage } from "@/composables/useWebSocket";
import { useAuth } from "@/composables/useAuth";
import { useI18n } from "@/composables/useI18n";
import { useSettings } from "@/composables/useSettings";
import { mapApiError } from "@/lib/apiErrors";
import TaskCard from "./TaskCard.vue";
import type { Task, TaskStatus, Board } from "@/lib/types";

const { t } = useI18n();
const { settings } = useSettings();

const props = defineProps<{
  orgSlug: string;
  projectSlug: string;
  readOnly?: boolean;
  orgType?: OrgType;
}>();

const orgTypeRef = computed<OrgType>(() => props.orgType ?? "local");
const orgSlugRef = computed(() => props.orgSlug);
const isRemote = computed(() => orgTypeRef.value === "remote");

const {
  listTasks,
  getStatuses,
  createStatus,
  updateStatus,
  deleteStatus,
  updateTask,
  createTask,
  dragTask,
  reorderTasks,
  getBoards,
  createBoard,
  deleteBoard,
} = useOrgData(orgTypeRef, orgSlugRef);

const { user } = useAuth();
const currentUserId = computed(() => user.value?.id ?? 0);
const {
  connect: wsConnect,
  disconnect: wsDisconnect,
  onMessage: wsOnMessage,
} = useWebSocket();

// ─── State ───
const tasks = ref<Task[]>([]);
const statuses = ref<TaskStatus[]>([]);
const boards = ref<Board[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const draggedTaskId = ref<number | null>(null);
const dragOverTaskId = ref<number | null>(null);
const dragOverPosition = ref<"before" | "after">("before");
const lockedTaskIds = shallowRef<Map<number, number>>(new Map());
const newTaskInputs = ref<Record<string, string>>({});

function isLocked(taskId: number): boolean {
  return lockedTaskIds.value.has(taskId);
}

// ─── Column width & ordering ───
const COLUMN_MIN_WIDTH = 160;
const COLUMN_MAX_WIDTH = 400;
const COLUMN_WIDTH_STEP = 20;
const COLUMN_WIDTH = ref(220);

function zoomInColumns() {
  COLUMN_WIDTH.value = Math.min(
    COLUMN_MAX_WIDTH,
    COLUMN_WIDTH.value + COLUMN_WIDTH_STEP,
  );
}

function zoomOutColumns() {
  COLUMN_WIDTH.value = Math.max(
    COLUMN_MIN_WIDTH,
    COLUMN_WIDTH.value - COLUMN_WIDTH_STEP,
  );
}

const columnOrder = ref<number[]>([]);

watch(
  statuses,
  (newStatuses) => {
    if (newStatuses.length === 0) return;
    const knownIds = new Set(newStatuses.map((s) => s.id));
    columnOrder.value = columnOrder.value.filter((id) => knownIds.has(id));
    for (const s of newStatuses) {
      if (!columnOrder.value.includes(s.id)) {
        columnOrder.value.push(s.id);
      }
    }
  },
  { immediate: true },
);

const orderedStatuses = computed<TaskStatus[]>(() => {
  if (columnOrder.value.length === 0) return statuses.value;
  const orderMap = new Map(columnOrder.value.map((id, i) => [id, i]));
  return [...statuses.value].sort(
    (a, b) =>
      (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity),
  );
});

const columnOrderChanged = computed(() => {
  if (columnOrder.value.length === 0) return false;
  return columnOrder.value.some((id, i) => statuses.value[i]?.id !== id);
});

function resetColumnOrder() {
  columnOrder.value = [];
}

// ─── Status drag reorder ───
const draggedStatusId = ref<number | null>(null);

function onStatusDragStart(statusId: number) {
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
function onStatusDrop(e: DragEvent) {
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

// ─── Board collapse ───
const collapsedIds = ref<number[]>([]);
const collapsed = computed<Set<number>>(() => new Set(collapsedIds.value));

function toggleBoard(boardId: number) {
  const idx = collapsedIds.value.indexOf(boardId);
  if (idx !== -1) {
    collapsedIds.value = collapsedIds.value.filter((id) => id !== boardId);
  } else {
    collapsedIds.value = [...collapsedIds.value, boardId];
  }
}

// ─── Board drag reorder ───
const draggedBoardId = ref<number | null>(null);

function onBoardDragStart(boardId: number) {
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
  const fromIdx = boards.value.findIndex((b) => b.id === draggedBoardId.value);
  const toIdx = boards.value.findIndex((b) => b.id === boardId);
  if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
    const reordered = [...boards.value];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    boards.value = reordered;
  }
  draggedBoardId.value = null;
}

// ─── Scroll sync ───
const boardScrollRef = ref<HTMLElement | null>(null);
const boardContainerRef = ref<HTMLElement | null>(null);
let isSyncing = false;
let cachedRowScrollEls: HTMLElement[] = [];
let scrollElsDirty = true;

watch(
  [collapsed],
  () => {
    scrollElsDirty = true;
  },
  { flush: "post" },
);

function getRowScrollEls(): HTMLElement[] {
  if (scrollElsDirty) {
    cachedRowScrollEls = boardContainerRef.value
      ? Array.from(
          boardContainerRef.value.querySelectorAll<HTMLElement>(
            ".agile-row-scroll",
          ),
        )
      : [];
    scrollElsDirty = false;
  }
  return cachedRowScrollEls;
}

function syncScrollFrom(source: HTMLElement) {
  if (isSyncing) return;
  isSyncing = true;
  const sl = source.scrollLeft;
  if (boardScrollRef.value && boardScrollRef.value !== source) {
    boardScrollRef.value.scrollLeft = sl;
  }
  for (const el of getRowScrollEls()) {
    if (el !== source) el.scrollLeft = sl;
  }
  requestAnimationFrame(() => {
    isSyncing = false;
  });
}

// ─── Status CRUD UI ───
const showCreateStatus = ref(false);
const newStatusName = ref("");
const newStatusColor = ref("#3b82f6");
const editStatusTarget = ref<TaskStatus | null>(null);
const editStatusName = ref("");
const editStatusColor = ref("");
const deleteStatusTarget = ref<TaskStatus | null>(null);
const statusActionsOpen = ref<number | null>(null);

// ─── Board CRUD UI ───
const showCreateBoard = ref(false);
const newBoardName = ref("");
const fabOpen = ref(false);

function closeFabIfOutside(e: MouseEvent) {
  if (!fabOpen.value) return;
  const target = e.target as HTMLElement;
  const menu = document.querySelector("[data-fab-menu]");
  const trigger = document.querySelector("[data-fab-trigger]");
  if (!menu || !trigger) return;
  if (!menu.contains(target) && !trigger.contains(target)) {
    fabOpen.value = false;
  }
}

function closeStatusMenuIfOutside(e: MouseEvent) {
  if (statusActionsOpen.value === null) return;
  const target = e.target as HTMLElement;
  const id = statusActionsOpen.value;
  const menu = document.querySelector(`[data-status-menu="${id}"]`);
  const trigger = document.querySelector(`[data-status-trigger="${id}"]`);
  if (!menu || !trigger) return;
  if (!menu.contains(target) && !trigger.contains(target)) {
    statusActionsOpen.value = null;
  }
}

// ─── Derived data ───
const tasksByStatus = computed(() => {
  const map = new Map<number, Task[]>();
  for (const status of statuses.value) map.set(status.id, []);
  for (const task of tasks.value) {
    const sid = task.status?.id;
    if (sid == null) continue;
    const arr = map.get(sid);
    if (arr) arr.push(task);
  }
  for (const arr of map.values())
    arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return map;
});

function tasksForCell(boardId: number, statusId: number): Task[] {
  return (tasksByStatus.value.get(statusId) ?? []).filter(
    (t) => t.boardId === boardId,
  );
}

function pileTasksForCell(statusId: number): Task[] {
  return (tasksByStatus.value.get(statusId) ?? []).filter(
    (t) => t.boardId == null,
  );
}

const pileTasks = computed(() => tasks.value.filter((t) => t.boardId == null));

function boardTaskCount(boardId: number): number {
  return tasks.value.filter((t) => t.boardId === boardId).length;
}

const rows = computed(() =>
  boards.value.map((b) => ({
    id: b.id,
    name: b.name,
    tasks: tasks.value.filter((t) => t.boardId === b.id),
  })),
);

// ─── Data loading ───
async function loadData() {
  loading.value = true;
  error.value = null;
  try {
    const [taskResp, statusList, boardList] = await Promise.all([
      listTasks(props.projectSlug),
      getStatuses(props.projectSlug),
      getBoards(props.projectSlug),
    ]);
    tasks.value = taskResp.tasks;
    statuses.value = statusList.sort((a, b) => a.position - b.position);
    boards.value = boardList;
  } catch (e) {
    error.value = mapApiError(e, t);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadData();
  document.addEventListener("click", closeStatusMenuIfOutside, true);
  document.addEventListener("click", closeFabIfOutside, true);
  if (isRemote.value) {
    wsConnect();
    wsUnsub = wsOnMessage(handleWSMessage);
  }
});

onUnmounted(() => {
  document.removeEventListener("click", closeStatusMenuIfOutside, true);
  document.removeEventListener("click", closeFabIfOutside, true);
  if (wsUnsub) {
    wsUnsub();
    wsUnsub = null;
  }
  wsDisconnect();
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
});

watch(() => props.projectSlug, loadData);

let wsUnsub: (() => void) | null = null;

// ─── Auto-refresh ───
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
const nextRefreshIn = ref(0);
let nextRefreshAt = 0;

async function silentRefresh() {
  try {
    const [taskResp, statusList, boardList] = await Promise.all([
      listTasks(props.projectSlug),
      getStatuses(props.projectSlug),
      getBoards(props.projectSlug),
    ]);

    // Merge tasks by ID to avoid full re-render
    const newTaskMap = new Map(taskResp.tasks.map((tk) => [tk.id, tk]));
    const oldTaskMap = new Map(tasks.value.map((tk) => [tk.id, tk]));
    const merged: Task[] = [];
    const seen = new Set<number>();

    // Keep existing order, update in-place
    for (const old of tasks.value) {
      const fresh = newTaskMap.get(old.id);
      if (fresh) {
        merged.push({ ...old, ...fresh });
        seen.add(old.id);
      }
    }
    // Append new tasks not seen before
    for (const fresh of taskResp.tasks) {
      if (!seen.has(fresh.id)) {
        merged.push(fresh);
      }
    }
    // Remove deleted tasks
    tasks.value = merged;

    // Update statuses only if changed
    const sortedStatuses = statusList.sort((a, b) => a.position - b.position);
    if (JSON.stringify(sortedStatuses) !== JSON.stringify(statuses.value)) {
      statuses.value = sortedStatuses;
    }

    // Update boards only if changed
    if (JSON.stringify(boardList) !== JSON.stringify(boards.value)) {
      boards.value = boardList;
    }
  } catch {
    // silent — don't disrupt user on background refresh errors
  }
}

function setupAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  nextRefreshIn.value = 0;
  if (
    settings.value.autoRefreshEnabled &&
    settings.value.autoRefreshInterval > 0
  ) {
    nextRefreshAt = Date.now() + settings.value.autoRefreshInterval * 1000;
    nextRefreshIn.value = settings.value.autoRefreshInterval;
    refreshTimer = setInterval(() => {
      silentRefresh();
      nextRefreshAt = Date.now() + settings.value.autoRefreshInterval * 1000;
    }, settings.value.autoRefreshInterval * 1000);
    countdownTimer = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((nextRefreshAt - Date.now()) / 1000),
      );
      nextRefreshIn.value = remaining;
    }, 1000);
  }
}

watch(
  () => [settings.value.autoRefreshEnabled, settings.value.autoRefreshInterval],
  setupAutoRefresh,
  { immediate: true },
);

function handleWSMessage(msg: WSMessage) {
  switch (msg.type) {
    case "task.updated": {
      const task = msg.data.task as Task;
      const idx = tasks.value.findIndex((tk) => tk.id === task.id);
      if (idx !== -1) {
        tasks.value[idx] = { ...task, order: tasks.value[idx].order };
      }
      break;
    }
    case "task.created": {
      const task = msg.data.task as Task;
      if (!tasks.value.some((tk) => tk.id === task.id)) {
        tasks.value = [...tasks.value, task];
      }
      break;
    }
    case "task.drag.start": {
      if (msg.data.userId !== currentUserId.value) {
        const newMap = new Map(lockedTaskIds.value);
        newMap.set(msg.data.taskId, msg.data.userId);
        lockedTaskIds.value = newMap;
      }
      break;
    }
    case "task.drag.end": {
      if (msg.data.userId !== currentUserId.value) {
        const newMap = new Map(lockedTaskIds.value);
        newMap.delete(msg.data.taskId);
        lockedTaskIds.value = newMap;
      }
      break;
    }
    case "task.reordered": {
      const { statusId, taskIds } = msg.data;
      const sid = statusId ?? null;
      const taskMap = new Map(tasks.value.map((tk) => [tk.id, tk]));
      const statusObj =
        sid != null ? (statuses.value.find((s) => s.id === sid) ?? null) : null;
      const reorderedIds = new Set(taskIds as number[]);
      const otherTasks = tasks.value.filter((tk) => !reorderedIds.has(tk.id));
      const reorderedPart: Task[] = [];
      for (let i = 0; i < taskIds.length; i++) {
        const task = taskMap.get(taskIds[i]);
        if (task) {
          reorderedPart.push({
            ...task,
            order: i,
            status: sid != null ? (statusObj as Task["status"]) : task.status,
          });
        }
      }
      tasks.value = [...otherTasks, ...reorderedPart];
      break;
    }
  }
}

// ─── Drag & drop ───
async function onCellDrop(boardId: number, statusId: number) {
  if (draggedTaskId.value == null) return;
  const taskId = draggedTaskId.value;
  const task = tasks.value.find((tk) => tk.id === taskId);
  if (!task) return;
  if (props.readOnly) {
    error.value = t("board.readOnlyError");
    draggedTaskId.value = null;
    return;
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
  const task = tasks.value.find((tk) => tk.id === taskId);
  if (!task) return;
  if (props.readOnly) {
    error.value = t("board.readOnlyError");
    draggedTaskId.value = null;
    return;
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
      ? tasksForCell(boardId, statusId)
      : pileTasksForCell(statusId);
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
  const otherTasks = tasks.value.filter((tk) => !reorderedIds.has(tk.id));
  const reorderedPart = filtered.map((id, i) => ({
    ...cellTaskMap.get(id)!,
    order: i,
  }));

  const savedTasks = tasks.value;
  tasks.value = [...otherTasks, ...reorderedPart];
  draggedTaskId.value = null;
  dragOverTaskId.value = null;

  if (isRemote.value) {
    try {
      await reorderTasks(props.projectSlug, statusId, filtered);
    } catch (e) {
      tasks.value = savedTasks;
      error.value = mapApiError(e, t);
    }
  }
}

async function onDropToCell(
  taskId: number,
  boardId: number | null,
  statusId: number,
) {
  const idx = tasks.value.findIndex((tk) => tk.id === taskId);
  if (idx === -1) return;
  const oldTask = tasks.value[idx];
  const status = statuses.value.find((s) => s.id === statusId) ?? null;
  if (oldTask.status?.id === statusId && oldTask.boardId === boardId) return;

  const updatedTask: Task = {
    ...oldTask,
    status,
    boardId: boardId ?? undefined,
  };

  const targetCellTasks = tasks.value.filter(
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
  const otherTasks = tasks.value.filter((tk) => !reorderedIds.has(tk.id));
  const reorderedPart = filtered.map((id, i) => ({
    ...cellTaskMap.get(id)!,
    order: i,
  }));

  const savedTasks = tasks.value;
  tasks.value = [...otherTasks, ...reorderedPart];
  draggedTaskId.value = null;
  dragOverTaskId.value = null;

  try {
    const input: Record<string, unknown> = { statusId };
    input.boardId = boardId ?? null;
    await updateTask(props.projectSlug, String(taskId), input);
    if (isRemote.value) {
      try {
        await reorderTasks(props.projectSlug, statusId, filtered);
      } catch {
        // non-critical
      }
    }
  } catch (e) {
    tasks.value = savedTasks;
    error.value = mapApiError(e, t);
  }
}

function onDragStart(taskId: number) {
  draggedTaskId.value = taskId;
  if (isRemote.value) {
    void dragTask(props.projectSlug, String(taskId), "start");
  }
}

function onDragEnd() {
  if (draggedTaskId.value != null && isRemote.value) {
    void dragTask(props.projectSlug, String(draggedTaskId.value), "end");
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

// ─── Status CRUD handlers ───
async function handleCreateStatus() {
  if (!newStatusName.value.trim()) return;
  if (props.readOnly) {
    error.value = t("board.readOnlyError");
    return;
  }
  try {
    const position = statuses.value.length;
    await createStatus(
      props.projectSlug,
      newStatusName.value.trim(),
      newStatusColor.value,
      position,
      false,
    );
    newStatusName.value = "";
    newStatusColor.value = "#3b82f6";
    showCreateStatus.value = false;
    await loadData();
  } catch (e) {
    error.value = mapApiError(e, t);
  }
}

function startEditStatus(status: TaskStatus) {
  editStatusTarget.value = status;
  editStatusName.value = status.name;
  editStatusColor.value = status.color;
  statusActionsOpen.value = null;
}

function cancelEditStatus() {
  editStatusTarget.value = null;
  editStatusName.value = "";
  editStatusColor.value = "";
}

async function handleUpdateStatus() {
  if (!editStatusTarget.value || !editStatusName.value.trim()) return;
  if (props.readOnly) {
    error.value = t("board.readOnlyError");
    return;
  }
  try {
    await updateStatus(
      props.projectSlug,
      editStatusTarget.value.id,
      editStatusName.value.trim(),
      editStatusColor.value,
      editStatusTarget.value.position,
      false,
    );
    cancelEditStatus();
    await loadData();
  } catch (e) {
    error.value = mapApiError(e, t);
  }
}

function startDeleteStatus(status: TaskStatus) {
  deleteStatusTarget.value = status;
  statusActionsOpen.value = null;
}

function cancelDeleteStatus() {
  deleteStatusTarget.value = null;
}

async function handleDeleteStatus() {
  if (!deleteStatusTarget.value) return;
  if (props.readOnly) {
    error.value = t("board.readOnlyError");
    return;
  }
  try {
    await deleteStatus(props.projectSlug, deleteStatusTarget.value.id);
    deleteStatusTarget.value = null;
    await loadData();
  } catch (e) {
    error.value = mapApiError(e, t);
  }
}

// ─── Task creation ───
async function handleCreateTask(boardId: number | null, statusId: number) {
  const key = `${boardId ?? "pile"}-${statusId}`;
  const title = newTaskInputs.value[key]?.trim();
  if (!title) return;
  if (props.readOnly) {
    error.value = t("board.readOnlyError");
    return;
  }
  try {
    await createTask(props.projectSlug, {
      title,
      statusId,
      boardId: boardId ?? undefined,
    });
    newTaskInputs.value[key] = "";
    if (!isRemote.value) await loadData();
  } catch (e) {
    error.value = mapApiError(e, t);
  }
}

const pileCollapsed = ref(false);

// ─── Board CRUD handlers ───
async function handleCreateBoard() {
  if (!newBoardName.value.trim()) return;
  if (props.readOnly) {
    error.value = t("board.readOnlyError");
    return;
  }
  try {
    await createBoard(props.projectSlug, newBoardName.value.trim());
    newBoardName.value = "";
    showCreateBoard.value = false;
    fabOpen.value = false;
    await loadData();
  } catch (e) {
    error.value = mapApiError(e, t);
  }
}

async function handleDeleteBoard(boardId: number) {
  if (props.readOnly) {
    error.value = t("board.readOnlyError");
    return;
  }
  try {
    await deleteBoard(props.projectSlug, boardId);
    await loadData();
  } catch (e) {
    error.value = mapApiError(e, t);
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Read-only banner -->
    <div
      v-if="readOnly"
      class="mx-4 mt-2 flex items-center gap-2 rounded-lg bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-400"
    >
      <Lock :size="14" class="shrink-0" />
      {{ t("board.readOnlyBanner") }}
    </div>

    <!-- Error banner -->
    <div
      v-if="error"
      class="mx-4 mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {{ error }}
      <button class="ml-2 underline" @click="error = null">
        {{ t("board.dismiss") }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex flex-1 items-center justify-center">
      <div class="animate-pulse text-muted-foreground">
        {{ t("board.loading") }}
      </div>
    </div>

    <!-- Board grid -->
    <div
      v-else-if="statuses.length > 0"
      ref="boardContainerRef"
      class="agile-board flex flex-1 flex-col gap-2 overflow-hidden p-4"
    >
      <!-- Toolbar -->
      <div class="flex flex-wrap items-end gap-4">
        <div class="flex items-center gap-1.5">
          <div
            class="flex items-center gap-0.5 rounded-lg border border-foreground/10 bg-muted/50 p-0.5"
          >
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
              :disabled="COLUMN_WIDTH <= COLUMN_MIN_WIDTH"
              :aria-label="t('board.zoomOutColumns')"
              :title="t('board.zoomOutColumns')"
              @click="zoomOutColumns"
            >
              <Minus :size="16" />
            </button>
            <span
              class="min-w-[3ch] text-center text-xs font-medium text-muted-foreground"
            >
              {{ COLUMN_WIDTH }}
            </span>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
              :disabled="COLUMN_WIDTH >= COLUMN_MAX_WIDTH"
              :aria-label="t('board.zoomInColumns')"
              :title="t('board.zoomInColumns')"
              @click="zoomInColumns"
            >
              <Plus :size="16" />
            </button>
          </div>
          <button
            v-if="columnOrderChanged"
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-lg border border-destructive bg-destructive text-destructive-foreground transition hover:bg-destructive/90"
            :aria-label="t('board.resetColumnOrder')"
            :title="t('board.resetColumnOrder')"
            @click="resetColumnOrder"
          >
            <RotateCcw :size="16" />
          </button>
        </div>

        <!-- Auto-refresh countdown -->
        <div
          v-if="settings.autoRefreshEnabled && nextRefreshIn > 0"
          class="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <RefreshCw :size="12" class="shrink-0" />
          <span>{{ t("settings.nextRefreshIn") }} {{ nextRefreshIn }}s</span>
        </div>
      </div>

      <!-- Status header row -->
      <div
        ref="boardScrollRef"
        class="agile-scroll sticky top-0 z-10 overflow-x-auto bg-background"
        @scroll="syncScrollFrom($event.target as HTMLElement)"
      >
        <div
          class="flex"
          :style="{ minWidth: `${orderedStatuses.length * COLUMN_WIDTH}px` }"
        >
          <div
            v-for="(status, idx) in orderedStatuses"
            :key="status.id"
            :data-status-id="status.id"
            class="relative flex shrink-0 cursor-grab items-center gap-2 bg-muted px-3 py-2 text-foreground transition-opacity active:cursor-grabbing"
            :class="[
              idx === 0
                ? 'rounded-l-lg'
                : idx === orderedStatuses.length - 1
                  ? 'rounded-r-lg'
                  : '',
              { 'opacity-40': draggedStatusId === status.id },
            ]"
            :style="{ width: `${COLUMN_WIDTH}px` }"
            draggable="true"
            @dragstart="onStatusDragStart(status.id)"
            @dragend="onStatusDragEnd"
            @dragover="onStatusDragOver(status.id, $event)"
            @drop="onStatusDrop"
          >
            <GripVertical
              :size="14"
              class="shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
            />
            <span
              class="h-2.5 w-2.5 shrink-0 rounded-full"
              :style="{ backgroundColor: status.color }"
            />
            <span class="flex-1 truncate text-sm font-semibold">{{
              status.name
            }}</span>
            <span class="shrink-0 text-xs text-muted-foreground">
              {{ tasksByStatus.get(status.id)?.length ?? 0 }}
            </span>
            <button
              v-if="!readOnly"
              :data-status-trigger="status.id"
              class="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
              @click="
                statusActionsOpen =
                  statusActionsOpen === status.id ? null : status.id
              "
            >
              <Pencil :size="13" />
            </button>
            <!-- Status actions dropdown -->
            <div
              v-if="statusActionsOpen === status.id"
              :data-status-menu="status.id"
              class="dropdown-panel absolute right-0 top-full z-20 mt-1 w-44 p-2"
            >
              <button
                class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground/80 transition hover:bg-muted"
                @click="startEditStatus(status)"
              >
                <Pencil :size="13" />
                {{ t("board.editStatus") }}
              </button>
              <button
                class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-destructive transition hover:bg-destructive/10"
                @click="startDeleteStatus(status)"
              >
                <Trash2 :size="13" />
                {{ t("board.deleteStatus") }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Pile section (tasks without a board) -->
      <div v-if="pileTasks.length > 0" class="flex flex-col gap-2">
        <div
          class="agile-scroll agile-row-scroll overflow-x-auto"
          @scroll="syncScrollFrom($event.target as HTMLElement)"
        >
          <button
            type="button"
            class="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-left transition hover:bg-muted/70"
            :style="{ width: `${orderedStatuses.length * COLUMN_WIDTH}px` }"
            @click="pileCollapsed = !pileCollapsed"
          >
            <component
              :is="pileCollapsed ? ChevronRight : ChevronDown"
              :size="16"
              class="shrink-0 text-muted-foreground"
            />
            <h3 class="flex-1 text-sm text-foreground">
              {{ t("board.pile") }}
            </h3>
            <span
              class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
            >
              {{ pileTasks.length }}
            </span>
          </button>
        </div>
        <div
          v-show="!pileCollapsed"
          class="agile-scroll agile-row-scroll overflow-x-auto"
          @scroll="syncScrollFrom($event.target as HTMLElement)"
        >
          <div
            class="flex"
            :style="{ minWidth: `${orderedStatuses.length * COLUMN_WIDTH}px` }"
          >
            <div
              v-for="(status, idx) in orderedStatuses"
              :key="status.id"
              class="shrink-0 border border-foreground/10 bg-muted/20 p-2"
              :style="{ width: `${COLUMN_WIDTH}px` }"
              :class="
                idx === 0
                  ? 'rounded-l-lg'
                  : idx === orderedStatuses.length - 1
                    ? 'rounded-r-lg'
                    : ''
              "
              @dragover="onCellDragOver($event)"
              @drop="onPileCellDrop(status.id)"
            >
              <div v-if="!readOnly" class="mb-2">
                <input
                  v-model="newTaskInputs[`pile-${status.id}`]"
                  class="input-base h-8 text-xs"
                  :placeholder="t('board.newTaskInCell')"
                  @keyup.enter="handleCreateTask(null, status.id)"
                  @blur="newTaskInputs[`pile-${status.id}`] = ''"
                />
              </div>
              <div class="relative flex flex-col gap-2">
                <div
                  v-for="task in pileTasksForCell(status.id)"
                  :key="task.id"
                  :data-id="task.id"
                  class="cursor-grab active:cursor-grabbing"
                  :class="{
                    'pointer-events-none opacity-50': lockedTaskIds.has(
                      task.id,
                    ),
                    'agile-drag-origin': draggedTaskId === task.id,
                  }"
                  :draggable="!readOnly && !isLocked(task.id)"
                  @dragstart="onDragStart(task.id)"
                  @dragend="onDragEnd"
                  @dragover="onTaskDragOver(task.id, $event)"
                >
                  <div
                    v-if="
                      dragOverTaskId === task.id &&
                      dragOverPosition === 'before' &&
                      draggedTaskId !== task.id
                    "
                    class="agile-insertion-line"
                  />
                  <TaskCard
                    :task="task"
                    :draggable="!readOnly && !isLocked(task.id)"
                    :locked="isLocked(task.id)"
                    @dragstart="onDragStart(task.id)"
                    @dragend="onDragEnd"
                    @dragover="onTaskDragOver(task.id, $event)"
                  />
                  <div
                    v-if="
                      dragOverTaskId === task.id &&
                      dragOverPosition === 'after' &&
                      draggedTaskId !== task.id
                    "
                    class="agile-insertion-line"
                  />
                </div>
                <div
                  v-if="pileTasksForCell(status.id).length === 0"
                  class="flex min-h-[120px] items-center justify-center text-xs text-muted-foreground/50"
                >
                  —
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Board rows -->
      <TransitionGroup tag="div" name="board" class="flex flex-col gap-2">
        <div
          v-for="row in rows"
          :key="row.id"
          class="flex flex-col gap-2"
          :class="{ 'opacity-40': draggedBoardId === row.id }"
          @dragover="onBoardDragOver(row.id, $event)"
          @drop="onBoardDrop(row.id, $event)"
        >
          <!-- Board header -->
          <div
            class="agile-scroll agile-row-scroll overflow-x-auto"
            @scroll="syncScrollFrom($event.target as HTMLElement)"
          >
            <button
              type="button"
              class="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-left transition hover:bg-muted/70"
              :class="!readOnly ? 'cursor-grab active:cursor-grabbing' : ''"
              :style="{ width: `${orderedStatuses.length * COLUMN_WIDTH}px` }"
              :draggable="!readOnly"
              @dragstart="onBoardDragStart(row.id)"
              @dragend="onBoardDragEnd"
              @click="toggleBoard(row.id)"
            >
              <GripVertical
                v-if="!readOnly"
                :size="16"
                class="shrink-0 cursor-grab text-muted-foreground/40 active:cursor-grabbing"
              />
              <component
                :is="collapsed.has(row.id) ? ChevronRight : ChevronDown"
                :size="16"
                class="shrink-0 text-muted-foreground"
              />
              <h3 class="flex-1 text-sm text-foreground">{{ row.name }}</h3>
              <span
                class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
              >
                {{ boardTaskCount(row.id) }}
              </span>
              <button
                v-if="!readOnly && orgType === 'local'"
                class="shrink-0 rounded p-1 text-muted-foreground/40 transition hover:bg-destructive/10 hover:text-destructive"
                :title="t('board.deleteBoard')"
                @click.stop="handleDeleteBoard(row.id)"
              >
                <Trash2 :size="13" />
              </button>
            </button>
          </div>
          <!-- Board cells -->
          <div
            v-show="!collapsed.has(row.id)"
            class="agile-scroll agile-row-scroll overflow-x-auto"
            @scroll="syncScrollFrom($event.target as HTMLElement)"
          >
            <div
              class="flex"
              :style="{
                minWidth: `${orderedStatuses.length * COLUMN_WIDTH}px`,
              }"
            >
              <div
                v-for="(status, idx) in orderedStatuses"
                :key="status.id"
                class="shrink-0 border border-foreground/10 bg-muted/20 p-2"
                :style="{ width: `${COLUMN_WIDTH}px` }"
                :class="
                  idx === 0
                    ? 'rounded-l-lg'
                    : idx === orderedStatuses.length - 1
                      ? 'rounded-r-lg'
                      : ''
                "
                @dragover="onCellDragOver($event)"
                @drop="onCellDrop(row.id, status.id)"
              >
                <div v-if="!readOnly" class="mb-2">
                  <input
                    v-model="newTaskInputs[`${row.id}-${status.id}`]"
                    class="input-base h-8 text-xs"
                    :placeholder="t('board.newTaskInCell')"
                    @keyup.enter="handleCreateTask(row.id, status.id)"
                    @blur="newTaskInputs[`${row.id}-${status.id}`] = ''"
                  />
                </div>
                <div class="relative flex flex-col gap-2">
                  <div
                    v-for="task in tasksForCell(row.id, status.id)"
                    :key="task.id"
                    :data-id="task.id"
                    class="cursor-grab active:cursor-grabbing"
                    :class="{
                      'pointer-events-none opacity-50': lockedTaskIds.has(
                        task.id,
                      ),
                      'agile-drag-origin': draggedTaskId === task.id,
                    }"
                    :draggable="!readOnly && !isLocked(task.id)"
                    @dragstart="onDragStart(task.id)"
                    @dragend="onDragEnd"
                    @dragover="onTaskDragOver(task.id, $event)"
                  >
                    <div
                      v-if="
                        dragOverTaskId === task.id &&
                        dragOverPosition === 'before' &&
                        draggedTaskId !== task.id
                      "
                      class="agile-insertion-line"
                    />
                    <TaskCard
                      :task="task"
                      :draggable="!readOnly && !isLocked(task.id)"
                      :locked="isLocked(task.id)"
                      @dragstart="onDragStart(task.id)"
                      @dragend="onDragEnd"
                      @dragover="onTaskDragOver(task.id, $event)"
                    />
                    <div
                      v-if="
                        dragOverTaskId === task.id &&
                        dragOverPosition === 'after' &&
                        draggedTaskId !== task.id
                      "
                      class="agile-insertion-line"
                    />
                  </div>
                  <div
                    v-if="tasksForCell(row.id, status.id).length === 0"
                    class="flex min-h-[120px] items-center justify-center text-xs text-muted-foreground/50"
                  >
                    —
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </TransitionGroup>
    </div>

    <!-- Empty state -->
    <div
      v-else
      class="flex flex-1 items-center justify-center text-muted-foreground"
    >
      {{ t("board.noStatuses") }}
    </div>
  </div>

  <!-- Composite FAB: Add status or board (local only) -->
  <div
    v-if="!readOnly && orgType === 'local'"
    class="fixed bottom-6 right-6 z-10 flex flex-col items-end gap-2"
  >
    <!-- Dropdown menu -->
    <div
      v-if="fabOpen"
      data-fab-menu
      class="dropdown-panel mb-1 w-48 rounded-xl p-2"
    >
      <button
        class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground/80 transition hover:bg-muted"
        @click="
          showCreateBoard = true;
          fabOpen = false;
        "
      >
        <LayoutGrid :size="16" />
        {{ t("board.addBoard") }}
      </button>
      <button
        class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground/80 transition hover:bg-muted"
        @click="
          showCreateStatus = true;
          fabOpen = false;
        "
      >
        <Columns3 :size="16" />
        {{ t("board.addStatus") }}
      </button>
    </div>
    <!-- FAB trigger -->
    <button
      data-fab-trigger
      class="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:bg-primary/90"
      :title="fabOpen ? '' : t('board.addStatus')"
      @click="fabOpen = !fabOpen"
    >
      <Plus
        :size="20"
        class="transition-transform duration-200"
        :class="fabOpen ? 'rotate-45' : ''"
      />
    </button>
  </div>

  <!-- Create board modal -->
  <div
    v-if="showCreateBoard"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    @click.self="showCreateBoard = false"
  >
    <div class="dropdown-panel w-80 rounded-xl p-4">
      <div class="mb-3 flex items-center justify-between">
        <span class="text-sm font-semibold">{{ t("board.addBoard") }}</span>
        <button
          class="rounded p-1 text-muted-foreground transition hover:bg-muted"
          @click="showCreateBoard = false"
        >
          <X :size="14" />
        </button>
      </div>
      <div class="space-y-3">
        <div>
          <label class="form-hint">{{ t("board.boardName") }}</label>
          <input
            v-model="newBoardName"
            class="input-base mt-1 text-sm"
            :placeholder="t('board.boardName')"
            @keyup.enter="handleCreateBoard"
          />
        </div>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <button class="btn-small" @click="showCreateBoard = false">
          {{ t("board.cancel") }}
        </button>
        <button
          class="btn-primary btn-small"
          :disabled="!newBoardName.trim()"
          @click="handleCreateBoard"
        >
          {{ t("board.create") }}
        </button>
      </div>
    </div>
  </div>

  <!-- Create status modal -->
  <div
    v-if="showCreateStatus"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    @click.self="showCreateStatus = false"
  >
    <div class="dropdown-panel w-80 rounded-xl p-4">
      <div class="mb-3 flex items-center justify-between">
        <span class="text-sm font-semibold">{{ t("board.addStatus") }}</span>
        <button
          class="rounded p-1 text-muted-foreground transition hover:bg-muted"
          @click="showCreateStatus = false"
        >
          <X :size="14" />
        </button>
      </div>
      <div class="space-y-3">
        <div>
          <label class="form-hint">{{ t("board.statusName") }}</label>
          <input
            v-model="newStatusName"
            class="input-base mt-1 text-sm"
            :placeholder="t('board.statusName')"
            @keyup.enter="handleCreateStatus"
          />
        </div>
        <div>
          <label class="form-hint">{{ t("board.statusColor") }}</label>
          <div class="mt-1 flex items-center gap-2">
            <input
              v-model="newStatusColor"
              type="color"
              class="h-9 w-14 rounded border-0 bg-transparent p-0"
            />
            <input
              v-model="newStatusColor"
              class="input-base flex-1 text-sm"
              @keyup.enter="handleCreateStatus"
            />
          </div>
        </div>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <button class="btn-small" @click="showCreateStatus = false">
          {{ t("board.cancel") }}
        </button>
        <button
          class="btn-primary btn-small"
          :disabled="!newStatusName.trim()"
          @click="handleCreateStatus"
        >
          {{ t("board.create") }}
        </button>
      </div>
    </div>
  </div>

  <!-- Edit status modal -->
  <div
    v-if="editStatusTarget"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    @click.self="cancelEditStatus"
  >
    <div class="dropdown-panel w-80 rounded-xl p-4">
      <div class="mb-3 flex items-center justify-between">
        <span class="text-sm font-semibold">{{ t("board.editStatus") }}</span>
        <button
          class="rounded p-1 text-muted-foreground transition hover:bg-muted"
          @click="cancelEditStatus"
        >
          <X :size="14" />
        </button>
      </div>
      <div class="space-y-3">
        <div>
          <label class="form-hint">{{ t("board.statusName") }}</label>
          <input
            v-model="editStatusName"
            class="input-base mt-1 text-sm"
            @keyup.enter="handleUpdateStatus"
          />
        </div>
        <div>
          <label class="form-hint">{{ t("board.statusColor") }}</label>
          <div class="mt-1 flex items-center gap-2">
            <input
              v-model="editStatusColor"
              type="color"
              class="h-9 w-14 rounded border-0 bg-transparent p-0"
            />
            <input
              v-model="editStatusColor"
              class="input-base flex-1 text-sm"
              @keyup.enter="handleUpdateStatus"
            />
          </div>
        </div>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <button class="btn-small" @click="cancelEditStatus">
          {{ t("board.cancel") }}
        </button>
        <button
          class="btn-primary btn-small"
          :disabled="!editStatusName.trim()"
          @click="handleUpdateStatus"
        >
          {{ t("board.save") }}
        </button>
      </div>
    </div>
  </div>

  <!-- Delete status modal -->
  <div
    v-if="deleteStatusTarget"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    @click.self="cancelDeleteStatus"
  >
    <div class="dropdown-panel w-80 rounded-xl p-4">
      <div class="mb-3 flex items-center gap-2">
        <AlertTriangle :size="18" class="text-destructive" />
        <span class="text-sm font-semibold">{{ t("board.deleteStatus") }}</span>
      </div>
      <p class="mb-4 text-sm text-muted-foreground">
        {{ t("board.deleteStatusConfirm") }}
      </p>
      <div class="flex justify-end gap-2">
        <button class="btn-small" @click="cancelDeleteStatus">
          {{ t("board.cancel") }}
        </button>
        <button
          class="btn-small bg-destructive text-destructive-foreground hover:bg-destructive/90"
          @click="handleDeleteStatus"
        >
          {{ t("board.delete") }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dropdown-panel {
  border: 1px solid hsl(var(--border, 240 5% 90%));
  border-radius: 0.5rem;
  background: hsl(var(--background, 0 0% 100%));
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15);
}
.agile-scroll {
  scrollbar-width: none;
  overflow-anchor: none;
}
.agile-scroll::-webkit-scrollbar {
  display: none;
}
.agile-board {
  user-select: none;
}
.agile-board :deep(input),
.agile-board :deep(textarea) {
  user-select: text;
}
.agile-drag-origin {
  opacity: 0.35;
  transition: opacity 0.15s ease;
}
.board-move {
  transition: transform 0.3s ease;
}
.agile-insertion-line {
  height: 2px;
  margin: -1px 0;
  border-radius: 1px;
  background: hsl(var(--primary));
  box-shadow: 0 0 4px 0 hsl(var(--primary));
  animation: agile-insertion-pulse 0.6s ease-in-out infinite alternate;
}
@keyframes agile-insertion-pulse {
  from {
    opacity: 0.6;
  }
  to {
    opacity: 1;
  }
}
</style>
