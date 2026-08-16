<script setup lang="ts">
import { ref, computed, shallowRef, onMounted, onUnmounted, watch } from "vue";
import {
  IconPlus,
  IconLock,
  IconPencil,
  IconTrash,
  IconX,
  IconAlertTriangle,
  IconMinus,
  IconChevronDown,
  IconChevronRight,
  IconGripVertical,
  IconRotateClockwise,
  IconLayoutGrid,
  IconColumns3,
  IconSearch,
  IconAdjustmentsHorizontal,
  IconArchive,
  IconDotsVertical,
} from "@tabler/icons-vue";
import { useOrgData, type OrgType } from "@/composables/useOrgData";
import { useWebSocket, type WSMessage } from "@/composables/useWebSocket";
import { useAuth } from "@/composables/useAuth";
import { useI18n } from "@/composables/useI18n";
import { useSettings } from "@/composables/useSettings";
import { useRefreshCountdown } from "@/composables/useRefreshCountdown";
import { mapApiError } from "@/lib/apiErrors";
import TaskCard from "./TaskCard.vue";
import MultiSelectFilter from "./MultiSelectFilter.vue";
import Form from "@/components/Form.vue";
import type {
  Task,
  TaskStatus,
  Board,
  UserInfo,
  TaskTag,
  SprintInfo,
  TaskFilters,
  TaskListParams,
} from "@/lib/types";

const STATUS_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#64748b",
];

const { t } = useI18n();
const { settings } = useSettings();
const { nextRefreshIn, setupAutoRefresh, teardownAutoRefresh } =
  useRefreshCountdown();

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
  getProjectMembers,
  getProjectTags,
  getProjectSprints,
  createBoard,
  updateBoard,
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

// ─── Animation transition names ───
const taskAnimName = computed(() =>
  settings.value.animationsEnabled ? "task" : "no-anim-task",
);
const statusAnimName = computed(() =>
  settings.value.animationsEnabled ? "status" : "no-anim-status",
);
const boardAnimName = computed(() =>
  settings.value.animationsEnabled ? "board" : "no-anim-board",
);
const filterSidebarAnimName = computed(() =>
  settings.value.animationsEnabled
    ? "filter-sidebar"
    : "no-anim-filter-sidebar",
);

// ─── Search & Filters (remote only) ───
const searchQuery = ref("");
const filters = ref<TaskFilters>({
  search: "",
  assigneeIds: [],
  responsibleIds: [],
  createdByIds: [],
  tagIds: [],
  sprintIds: [],
  priority: null,
  sort: "default",
  includeArchived: false,
});
const filterSidebarOpen = ref(false);
const members = ref<UserInfo[]>([]);
const tags = ref<TaskTag[]>([]);
const sprints = ref<SprintInfo[]>([]);
let searchDebounce: ReturnType<typeof setTimeout> | null = null;

const memberOptions = computed(() =>
  members.value.map((m) => {
    const parts = [m.firstName, m.lastName].filter(
      (s): s is string => !!s?.trim(),
    );
    return {
      value: m.id,
      label: parts.length
        ? parts.join(" ")
        : m.username || m.email || String(m.id),
    };
  }),
);

const tagOptions = computed(() =>
  tags.value.map((tag) => ({ value: tag.id, label: tag.name })),
);

const sprintOptions = computed(() =>
  sprints.value
    .filter((s) => !s.isArchived)
    .map((s) => ({
      value: s.id,
      label: s.isOrgSprint ? `${s.name}` : s.name,
    })),
);

const priorityOptions = computed(() => [
  { value: 1, label: t("taskCard.priority.low") },
  { value: 2, label: t("taskCard.priority.medium") },
  { value: 3, label: t("taskCard.priority.high") },
  { value: 4, label: t("taskCard.priority.urgent") },
]);

const sortOptions = computed(() => {
  const opts = [
    { value: "default", label: t("boardFilters.sortDefault") },
    { value: "deadline-asc", label: t("boardFilters.sortDeadlineAsc") },
    { value: "deadline-desc", label: t("boardFilters.sortDeadlineDesc") },
    { value: "priority-desc", label: t("boardFilters.sortPriorityDesc") },
    { value: "priority-asc", label: t("boardFilters.sortPriorityAsc") },
    { value: "title-asc", label: t("boardFilters.sortTitleAsc") },
    { value: "title-desc", label: t("boardFilters.sortTitleDesc") },
  ];
  if (!isRemote.value) {
    return opts.filter((o) => !o.value.startsWith("deadline-"));
  }
  return opts;
});

const hasActiveFilters = computed(() => {
  const f = filters.value;
  return (
    f.assigneeIds.length > 0 ||
    f.responsibleIds.length > 0 ||
    f.createdByIds.length > 0 ||
    f.tagIds.length > 0 ||
    f.sprintIds.length > 0 ||
    f.priority != null ||
    (f.sort != null && f.sort !== "default") ||
    f.includeArchived
  );
});

const activeFilterCount = computed(() => {
  const f = filters.value;
  let count = 0;
  if (f.assigneeIds.length > 0) count++;
  if (f.responsibleIds.length > 0) count++;
  if (f.createdByIds.length > 0) count++;
  if (f.tagIds.length > 0) count++;
  if (f.sprintIds.length > 0) count++;
  if (f.priority != null) count++;
  if (f.sort != null && f.sort !== "default") count++;
  if (f.includeArchived) count++;
  return count;
});

function buildTaskParams(): TaskListParams | undefined {
  if (!isRemote.value) return undefined;
  const f = filters.value;
  return {
    search: f.search || undefined,
    assigneeIds: f.assigneeIds.length ? f.assigneeIds : undefined,
    responsibleIds: f.responsibleIds.length ? f.responsibleIds : undefined,
    createdByIds: f.createdByIds.length ? f.createdByIds : undefined,
    tagIds: f.tagIds.length ? f.tagIds : undefined,
    sprintIds: f.sprintIds.length ? f.sprintIds : undefined,
    priority: f.priority ?? undefined,
    sort: f.sort && f.sort !== "default" ? f.sort : undefined,
    includeArchived: f.includeArchived || undefined,
  };
}

function clearAllFilters() {
  filters.value = {
    search: "",
    assigneeIds: [],
    responsibleIds: [],
    createdByIds: [],
    tagIds: [],
    sprintIds: [],
    priority: null,
    sort: "default",
    includeArchived: false,
  };
  searchQuery.value = "";
  if (isRemote.value) loadData();
}

async function loadFilterData() {
  if (!isRemote.value) return;
  try {
    const [m, tg, sp] = await Promise.all([
      getProjectMembers(props.projectSlug),
      getProjectTags(props.projectSlug),
      getProjectSprints(props.projectSlug),
    ]);
    members.value = m;
    tags.value = tg;
    sprints.value = sp;
  } catch {
    // non-critical
  }
}

function openFilterSidebar() {
  filterSidebarOpen.value = true;
  if (members.value.length === 0) loadFilterData();
}

function updateFilter(patch: Partial<TaskFilters>) {
  filters.value = { ...filters.value, ...patch };
  if (isRemote.value) loadData();
}

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
const statusMenuPos = ref<{ top: number; left: number } | null>(null);

function toggleStatusMenu(statusId: number) {
  if (statusActionsOpen.value === statusId) {
    statusActionsOpen.value = null;
    statusMenuPos.value = null;
    return;
  }
  const trigger = document.querySelector<HTMLElement>(
    `[data-status-trigger="${statusId}"]`,
  );
  if (trigger) {
    const rect = trigger.getBoundingClientRect();
    statusMenuPos.value = { top: rect.bottom + 4, left: rect.right - 176 };
  }
  statusActionsOpen.value = statusId;
}

// ─── Board CRUD UI ───
const showCreateBoard = ref(false);
const newBoardName = ref("");
const boardActionsOpen = ref<number | null>(null);
const boardMenuPos = ref<{ top: number; left: number } | null>(null);

function toggleBoardMenu(boardId: number) {
  if (boardActionsOpen.value === boardId) {
    boardActionsOpen.value = null;
    boardMenuPos.value = null;
    return;
  }
  const trigger = document.querySelector<HTMLElement>(
    `[data-board-trigger="${boardId}"]`,
  );
  if (trigger) {
    const rect = trigger.getBoundingClientRect();
    boardMenuPos.value = { top: rect.bottom + 4, left: rect.right - 176 };
  }
  boardActionsOpen.value = boardId;
}
const editBoardTarget = ref<Board | null>(null);
const editBoardName = ref("");
const deleteBoardTarget = ref<Board | null>(null);

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

function closeBoardMenuIfOutside(e: MouseEvent) {
  if (boardActionsOpen.value === null) return;
  const target = e.target as HTMLElement;
  const id = boardActionsOpen.value;
  const menu = document.querySelector(`[data-board-menu="${id}"]`);
  const trigger = document.querySelector(`[data-board-trigger="${id}"]`);
  if (!menu || !trigger) return;
  if (!menu.contains(target) && !trigger.contains(target)) {
    boardActionsOpen.value = null;
  }
}

// ─── Client-side filtering (local) ───
function getSortComparator(sort: string): (a: Task, b: Task) => number {
  switch (sort) {
    case "deadline-asc":
      return (a, b) => {
        if (!a.endDate && !b.endDate) return 0;
        if (!a.endDate) return 1;
        if (!b.endDate) return -1;
        return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
      };
    case "deadline-desc":
      return (a, b) => {
        if (!a.endDate && !b.endDate) return 0;
        if (!a.endDate) return -1;
        if (!b.endDate) return 1;
        return new Date(b.endDate).getTime() - new Date(a.endDate).getTime();
      };
    case "priority-desc":
      return (a, b) => b.priority - a.priority;
    case "priority-asc":
      return (a, b) => a.priority - b.priority;
    case "title-asc":
      return (a, b) => a.title.localeCompare(b.title);
    case "title-desc":
      return (a, b) => b.title.localeCompare(a.title);
    default:
      return (a, b) => (a.order ?? 0) - (b.order ?? 0);
  }
}

const displayTasks = computed<Task[]>(() => {
  if (isRemote.value) return tasks.value;
  const f = filters.value;
  let result = tasks.value;
  if (f.search) {
    const q = f.search.toLowerCase();
    result = result.filter((t) => {
      if (t.title.toLowerCase().includes(q)) return true;
      if (t.shortId?.toLowerCase().includes(q)) return true;
      if (t.description?.toLowerCase().includes(q)) return true;
      if (t.status?.name.toLowerCase().includes(q)) return true;
      const people = [...(t.assignees ?? []), ...(t.responsibles ?? [])];
      if (
        people.some((p) =>
          [p.firstName, p.lastName, p.username]
            .filter((s): s is string => !!s)
            .some((s) => s.toLowerCase().includes(q)),
        )
      )
        return true;
      if (t.tags?.some((tag) => tag.name.toLowerCase().includes(q)))
        return true;
      return false;
    });
  }
  if (f.priority != null) {
    result = result.filter((t) => t.priority === f.priority);
  }
  if (!f.includeArchived) {
    result = result.filter((t) => !t.archived);
  }
  return result;
});

// ─── Derived data ───
const tasksByStatus = computed(() => {
  const map = new Map<number, Task[]>();
  for (const status of statuses.value) map.set(status.id, []);
  for (const task of displayTasks.value) {
    const sid = task.status?.id;
    if (sid == null) continue;
    const arr = map.get(sid);
    if (arr) arr.push(task);
  }
  const sort = filters.value.sort;
  for (const arr of map.values()) {
    if (!isRemote.value && sort && sort !== "default") {
      arr.sort(getSortComparator(sort));
    } else {
      arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
  }
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

const pileTasks = computed(() =>
  displayTasks.value.filter((t) => t.boardId == null),
);

function boardTaskCount(boardId: number): number {
  return displayTasks.value.filter((t) => t.boardId === boardId).length;
}

const rows = computed(() =>
  boards.value.map((b) => ({
    id: b.id,
    name: b.name,
    board: b,
    tasks: displayTasks.value.filter((t) => t.boardId === b.id),
  })),
);

// ─── Data loading ───
async function loadData() {
  loading.value = true;
  error.value = null;
  try {
    const params = buildTaskParams();
    const [taskResp, statusList, boardList] = await Promise.all([
      listTasks(props.projectSlug, params),
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
  document.addEventListener("click", closeBoardMenuIfOutside, true);
  if (isRemote.value) {
    wsConnect();
    wsUnsub = wsOnMessage(handleWSMessage);
  }
});

onUnmounted(() => {
  document.removeEventListener("click", closeStatusMenuIfOutside, true);
  document.removeEventListener("click", closeBoardMenuIfOutside, true);
  if (wsUnsub) {
    wsUnsub();
    wsUnsub = null;
  }
  wsDisconnect();
  teardownAutoRefresh();
});

watch(() => props.projectSlug, loadData);

// Reset filters when switching projects
watch(
  () => props.projectSlug,
  () => {
    searchQuery.value = "";
    filters.value = {
      search: "",
      assigneeIds: [],
      responsibleIds: [],
      createdByIds: [],
      tagIds: [],
      sprintIds: [],
      priority: null,
      sort: "default",
      includeArchived: false,
    };
    members.value = [];
    tags.value = [];
    sprints.value = [];
  },
);

// Debounced search → backend
watch(searchQuery, (val) => {
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    filters.value = { ...filters.value, search: val };
    if (isRemote.value) loadData();
  }, 400);
});

let wsUnsub: (() => void) | null = null;

// ─── Auto-refresh ───
async function silentRefresh() {
  try {
    const params = buildTaskParams();
    const [taskResp, statusList, boardList] = await Promise.all([
      listTasks(props.projectSlug, params),
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

// Auto-refresh is a fallback that activates when WebSocket is disconnected.
setupAutoRefresh(silentRefresh);

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
        newMap.set(msg.data.taskId as number, msg.data.userId as number);
        lockedTaskIds.value = newMap;
      }
      break;
    }
    case "task.drag.end": {
      if (msg.data.userId !== currentUserId.value) {
        const newMap = new Map(lockedTaskIds.value);
        newMap.delete(msg.data.taskId as number);
        lockedTaskIds.value = newMap;
      }
      break;
    }
    case "task.reordered": {
      const { statusId, taskIds } = msg.data as {
        statusId: number | null;
        taskIds: number[];
      };
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
  const status = statuses.value.find((s) => s.id === statusId);
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
  statusMenuPos.value = null;
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
  statusMenuPos.value = null;
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
    const created = await createTask(props.projectSlug, {
      title,
      statusId,
      boardId: boardId ?? undefined,
    });
    newTaskInputs.value[key] = "";
    if (!tasks.value.some((tk) => tk.id === created.id)) {
      tasks.value = [...tasks.value, created];
    }
  } catch (e) {
    error.value = mapApiError(e, t);
  }
}

async function archiveTask(taskId: number) {
  if (props.readOnly) {
    error.value = t("board.readOnlyError");
    return;
  }
  try {
    await updateTask(props.projectSlug, String(taskId), { archived: true });
    const idx = tasks.value.findIndex((tk) => tk.id === taskId);
    if (idx !== -1) {
      tasks.value[idx] = { ...tasks.value[idx], archived: true };
    }
  } catch (e) {
    error.value = mapApiError(e, t);
  }
}

async function unarchiveTask(taskId: number) {
  if (props.readOnly) {
    error.value = t("board.readOnlyError");
    return;
  }
  try {
    await updateTask(props.projectSlug, String(taskId), { archived: false });
    const idx = tasks.value.findIndex((tk) => tk.id === taskId);
    if (idx !== -1) {
      tasks.value[idx] = { ...tasks.value[idx], archived: false };
    }
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
    await loadData();
  } catch (e) {
    error.value = mapApiError(e, t);
  }
}

function startEditBoard(board: Board) {
  editBoardTarget.value = board;
  editBoardName.value = board.name;
  boardActionsOpen.value = null;
  boardMenuPos.value = null;
}

function cancelEditBoard() {
  editBoardTarget.value = null;
  editBoardName.value = "";
}

async function handleUpdateBoard() {
  if (!editBoardTarget.value || !editBoardName.value.trim()) return;
  if (props.readOnly) {
    error.value = t("board.readOnlyError");
    return;
  }
  try {
    await updateBoard(
      props.projectSlug,
      editBoardTarget.value.id,
      editBoardName.value.trim(),
    );
    cancelEditBoard();
    await loadData();
  } catch (e) {
    error.value = mapApiError(e, t);
  }
}

function startDeleteBoard(board: Board) {
  deleteBoardTarget.value = board;
  boardActionsOpen.value = null;
  boardMenuPos.value = null;
}

function cancelDeleteBoard() {
  deleteBoardTarget.value = null;
}

async function handleDeleteBoardConfirm() {
  if (!deleteBoardTarget.value) return;
  if (props.readOnly) {
    error.value = t("board.readOnlyError");
    return;
  }
  try {
    await deleteBoard(props.projectSlug, deleteBoardTarget.value.id);
    deleteBoardTarget.value = null;
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
      <IconLock :size="14" class="shrink-0" />
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
      class="agile-board flex flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto p-4"
    >
      <!-- Toolbar -->
      <div class="flex flex-wrap items-end gap-2">
        <!-- Search & Filters -->
        <div class="flex items-center gap-2">
          <div class="relative flex items-center">
            <IconSearch
              :size="15"
              class="pointer-events-none absolute left-2.5 text-muted-foreground"
            />
            <input
              v-model="searchQuery"
              type="text"
              class="input-base h-9 w-48 pl-8 text-sm"
              :placeholder="t('boardFilters.searchPlaceholder')"
            />
            <button
              v-if="searchQuery"
              class="absolute right-2 text-muted-foreground transition hover:text-foreground"
              @click="searchQuery = ''"
            >
              <IconX :size="14" />
            </button>
          </div>

          <button
            v-if="hasActiveFilters"
            type="button"
            class="flex h-9 items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 text-sm font-medium text-destructive transition hover:bg-destructive/20"
            @click="clearAllFilters"
          >
            <IconX :size="15" />
            {{ t("boardFilters.clear") }}
          </button>

          <button
            type="button"
            class="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            @click="openFilterSidebar"
          >
            <IconAdjustmentsHorizontal :size="15" />
            {{ t("boardFilters.button") }}
            <span
              v-if="activeFilterCount > 0"
              class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-foreground/20 px-1.5 text-xs font-semibold text-primary-foreground"
            >
              {{ activeFilterCount }}
            </span>
          </button>
        </div>

        <!-- Column width controls -->
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
              <IconMinus :size="16" />
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
              <IconPlus :size="16" />
            </button>
          </div>
        </div>

        <div
          v-if="!readOnly && orgType === 'local'"
          class="ml-auto flex items-center gap-2"
        >
          <button
            type="button"
            class="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            @click="showCreateStatus = true"
          >
            <IconColumns3 :size="15" />
            {{ t("board.createColumn") }}
          </button>
          <button
            type="button"
            class="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            @click="showCreateBoard = true"
          >
            <IconLayoutGrid :size="15" />
            {{ t("board.createBoard") }}
          </button>
        </div>
      </div>

      <!-- Status header row -->
      <div
        ref="boardScrollRef"
        class="agile-scroll sticky top-0 z-10 overflow-x-auto bg-background"
        @scroll="syncScrollFrom($event.target as HTMLElement)"
      >
        <TransitionGroup
          :name="statusAnimName"
          tag="div"
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
            @dragstart="onStatusDragStart(status.id, $event)"
            @dragend="onStatusDragEnd"
            @dragover="onStatusDragOver(status.id, $event)"
            @drop="onStatusDrop"
          >
            <IconGripVertical
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
            <button
              v-if="!readOnly && !isRemote"
              :data-status-trigger="status.id"
              draggable="false"
              class="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
              @click.stop="toggleStatusMenu(status.id)"
            >
              <IconDotsVertical :size="14" />
            </button>
          </div>
        </TransitionGroup>
      </div>

      <!-- Status actions dropdown (teleported to body) -->
      <Teleport to="body">
        <div
          v-if="statusActionsOpen !== null && statusMenuPos"
          :data-status-menu="statusActionsOpen"
          :style="{
            position: 'fixed',
            top: `${statusMenuPos.top}px`,
            left: `${statusMenuPos.left}px`,
          }"
          class="z-50 w-44 rounded-lg border border-foreground/10 bg-background p-2 shadow-lg"
        >
          <button
            class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground/80 transition hover:bg-muted"
            @click.stop="
              startEditStatus(statuses.find((s) => s.id === statusActionsOpen)!)
            "
          >
            <IconPencil :size="13" />
            {{ t("board.editStatus") }}
          </button>
          <button
            class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-destructive transition hover:bg-destructive/10"
            @click.stop="
              startDeleteStatus(
                statuses.find((s) => s.id === statusActionsOpen)!,
              )
            "
          >
            <IconTrash :size="13" />
            {{ t("board.deleteStatus") }}
          </button>
        </div>
      </Teleport>

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
              :is="pileCollapsed ? IconChevronRight : IconChevronDown"
              :size="16"
              class="shrink-0 text-muted-foreground"
            />
            <h3 class="flex-1 text-sm text-foreground">
              {{ t("board.pile") }}
            </h3>
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
              <TransitionGroup
                :name="taskAnimName"
                tag="div"
                class="relative flex flex-col gap-2"
              >
                <div
                  v-for="task in pileTasksForCell(status.id)"
                  :key="task.id"
                  :data-id="task.id"
                  class="group/task relative cursor-grab active:cursor-grabbing"
                  :class="{
                    'pointer-events-none opacity-50': lockedTaskIds.has(
                      task.id,
                    ),
                    'agile-drag-origin': draggedTaskId === task.id,
                  }"
                  :draggable="!readOnly && !isLocked(task.id)"
                  @dragstart="onDragStart(task.id)"
                  @dragend="onDragEnd"
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
                    :org-slug="orgSlug"
                    :project-slug="projectSlug"
                    @dragstart="onDragStart(task.id)"
                    @dragend="onDragEnd"
                  />
                  <button
                    v-if="!readOnly && !isRemote"
                    draggable="false"
                    class="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-card/80 text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition hover:bg-muted hover:text-foreground group-hover/task:opacity-100"
                    :title="
                      task.archived
                        ? t('board.unarchiveTask')
                        : t('board.archiveTask')
                    "
                    @click.stop="
                      task.archived
                        ? unarchiveTask(task.id)
                        : archiveTask(task.id)
                    "
                  >
                    <IconArchive v-if="!task.archived" :size="13" />
                    <IconRotateClockwise v-else :size="13" />
                  </button>
                  <div
                    v-if="
                      dragOverTaskId === task.id &&
                      dragOverPosition === 'after' &&
                      draggedTaskId !== task.id
                    "
                    class="agile-insertion-line"
                  />
                </div>
              </TransitionGroup>
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

      <!-- Board rows -->
      <TransitionGroup
        tag="div"
        :name="boardAnimName"
        class="flex flex-col gap-2"
      >
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
            <div
              role="button"
              tabindex="0"
              class="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-left transition hover:bg-muted/70"
              :class="!readOnly ? 'cursor-grab active:cursor-grabbing' : ''"
              :style="{ width: `${orderedStatuses.length * COLUMN_WIDTH}px` }"
              :draggable="!readOnly"
              @dragstart="onBoardDragStart(row.id, $event)"
              @dragend="onBoardDragEnd"
              @click="toggleBoard(row.id)"
              @keydown.enter="toggleBoard(row.id)"
            >
              <IconGripVertical
                v-if="!readOnly"
                :size="16"
                class="shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
              />
              <component
                :is="collapsed.has(row.id) ? IconChevronRight : IconChevronDown"
                :size="16"
                class="shrink-0 text-muted-foreground"
              />
              <h3 class="flex-1 text-sm text-foreground">{{ row.name }}</h3>
              <button
                v-if="!readOnly && orgType === 'local'"
                :data-board-trigger="row.id"
                draggable="false"
                class="relative shrink-0 rounded p-1 text-muted-foreground/60 transition hover:bg-muted hover:text-foreground"
                @click.stop="toggleBoardMenu(row.id)"
              >
                <IconDotsVertical :size="14" />
              </button>
            </div>
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
                <TransitionGroup
                  :name="taskAnimName"
                  tag="div"
                  class="relative flex flex-col gap-2"
                >
                  <div
                    v-for="task in tasksForCell(row.id, status.id)"
                    :key="task.id"
                    :data-id="task.id"
                    class="group/task relative cursor-grab active:cursor-grabbing"
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
                      :org-slug="orgSlug"
                      :project-slug="projectSlug"
                      @dragstart="onDragStart(task.id)"
                      @dragend="onDragEnd"
                    />
                    <button
                      v-if="!readOnly && !isRemote"
                      draggable="false"
                      class="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-card/80 text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition hover:bg-muted hover:text-foreground group-hover/task:opacity-100"
                      :title="
                        task.archived
                          ? t('board.unarchiveTask')
                          : t('board.archiveTask')
                      "
                      @click.stop="
                        task.archived
                          ? unarchiveTask(task.id)
                          : archiveTask(task.id)
                      "
                    >
                      <IconArchive v-if="!task.archived" :size="13" />
                      <IconRotateClockwise v-else :size="13" />
                    </button>
                    <div
                      v-if="
                        dragOverTaskId === task.id &&
                        dragOverPosition === 'after' &&
                        draggedTaskId !== task.id
                      "
                      class="agile-insertion-line"
                    />
                  </div>
                </TransitionGroup>
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
      </TransitionGroup>

      <!-- Board actions dropdown (teleported to body) -->
      <Teleport to="body">
        <div
          v-if="boardActionsOpen !== null && boardMenuPos"
          :data-board-menu="boardActionsOpen"
          :style="{
            position: 'fixed',
            top: `${boardMenuPos.top}px`,
            left: `${boardMenuPos.left}px`,
          }"
          class="z-50 w-44 rounded-lg border border-foreground/10 bg-background p-2 shadow-lg"
        >
          <button
            class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground/80 transition hover:bg-muted"
            @click.stop="
              startEditBoard(boards.find((b) => b.id === boardActionsOpen)!)
            "
          >
            <IconPencil :size="13" />
            {{ t("board.editBoard") }}
          </button>
          <button
            class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-destructive transition hover:bg-destructive/10"
            @click.stop="
              startDeleteBoard(boards.find((b) => b.id === boardActionsOpen)!)
            "
          >
            <IconTrash :size="13" />
            {{ t("board.deleteBoard") }}
          </button>
        </div>
      </Teleport>
    </div>

    <!-- Empty state -->
    <div
      v-else
      class="flex flex-1 items-center justify-center text-muted-foreground"
    >
      {{ t("board.noStatuses") }}
    </div>
  </div>

  <!-- Create board modal -->
  <Form
    as="modal"
    :open="showCreateBoard"
    @update:open="(v) => (showCreateBoard = v)"
    @submit="handleCreateBoard"
  >
    <template #header>
      <h2 class="text-sm font-semibold">{{ t("board.addBoard") }}</h2>
    </template>
    <div class="space-y-3">
      <div>
        <label class="form-hint">{{ t("board.boardName") }}</label>
        <input
          v-model="newBoardName"
          class="input-base mt-1 text-sm"
          :placeholder="t('board.boardName')"
        />
      </div>
    </div>
    <template #submit>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="btn-small"
          @click="showCreateBoard = false"
        >
          {{ t("board.cancel") }}
        </button>
        <button
          type="submit"
          class="btn-primary btn-small"
          :disabled="!newBoardName.trim()"
        >
          {{ t("board.create") }}
        </button>
      </div>
    </template>
  </Form>

  <!-- Create status modal -->
  <Form
    as="modal"
    :open="showCreateStatus"
    @update:open="(v) => (showCreateStatus = v)"
    @submit="handleCreateStatus"
  >
    <template #header>
      <h2 class="text-sm font-semibold">{{ t("board.addStatus") }}</h2>
    </template>
    <div class="space-y-3">
      <div>
        <label class="form-hint">{{ t("board.statusName") }}</label>
        <input
          v-model="newStatusName"
          class="input-base mt-1 text-sm"
          :placeholder="t('board.statusName')"
        />
      </div>
      <div>
        <label class="form-hint">{{ t("board.statusColor") }}</label>
        <div class="mt-2 grid grid-cols-9 gap-1.5">
          <button
            v-for="color in STATUS_COLORS"
            :key="color"
            type="button"
            class="h-7 w-7 rounded-md border-2 transition-transform hover:scale-110"
            :class="
              newStatusColor.toLowerCase() === color
                ? 'border-zinc-900 dark:border-zinc-100'
                : 'border-transparent'
            "
            :style="{ backgroundColor: color }"
            @click="newStatusColor = color"
          />
        </div>
      </div>
    </div>
    <template #submit>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="btn-small"
          @click="showCreateStatus = false"
        >
          {{ t("board.cancel") }}
        </button>
        <button
          type="submit"
          class="btn-primary btn-small"
          :disabled="!newStatusName.trim()"
        >
          {{ t("board.create") }}
        </button>
      </div>
    </template>
  </Form>

  <!-- Edit status modal -->
  <Form
    as="modal"
    :open="!!editStatusTarget"
    @update:open="
      (v) => {
        if (!v) cancelEditStatus();
      }
    "
    @submit="handleUpdateStatus"
  >
    <template #header>
      <h2 class="text-sm font-semibold">{{ t("board.editStatus") }}</h2>
    </template>
    <div class="space-y-3">
      <div>
        <label class="form-hint">{{ t("board.statusName") }}</label>
        <input v-model="editStatusName" class="input-base mt-1 text-sm" />
      </div>
      <div>
        <label class="form-hint">{{ t("board.statusColor") }}</label>
        <div class="mt-2 grid grid-cols-9 gap-1.5">
          <button
            v-for="color in STATUS_COLORS"
            :key="color"
            type="button"
            class="h-7 w-7 rounded-md border-2 transition-transform hover:scale-110"
            :class="
              editStatusColor.toLowerCase() === color
                ? 'border-zinc-900 dark:border-zinc-100'
                : 'border-transparent'
            "
            :style="{ backgroundColor: color }"
            @click="editStatusColor = color"
          />
        </div>
      </div>
    </div>
    <template #submit>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-small" @click="cancelEditStatus">
          {{ t("board.cancel") }}
        </button>
        <button
          type="submit"
          class="btn-primary btn-small"
          :disabled="!editStatusName.trim()"
        >
          {{ t("board.save") }}
        </button>
      </div>
    </template>
  </Form>

  <!-- Delete status modal -->
  <Form
    as="modal"
    destructive
    :open="!!deleteStatusTarget"
    @update:open="
      (v) => {
        if (!v) cancelDeleteStatus();
      }
    "
    @submit="handleDeleteStatus"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <IconAlertTriangle :size="18" class="text-destructive" />
        <h2 class="text-sm font-semibold">{{ t("board.deleteStatus") }}</h2>
      </div>
    </template>
    <p class="text-sm text-muted-foreground">
      {{ t("board.deleteStatusConfirm") }}
    </p>
    <template #submit>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-small" @click="cancelDeleteStatus">
          {{ t("board.cancel") }}
        </button>
        <button
          type="submit"
          class="btn-small bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {{ t("board.delete") }}
        </button>
      </div>
    </template>
  </Form>

  <!-- Edit board modal -->
  <Form
    as="modal"
    :open="!!editBoardTarget"
    @update:open="
      (v) => {
        if (!v) cancelEditBoard();
      }
    "
    @submit="handleUpdateBoard"
  >
    <template #header>
      <h2 class="text-sm font-semibold">{{ t("board.editBoard") }}</h2>
    </template>
    <div class="space-y-3">
      <div>
        <label class="form-hint">{{ t("board.boardName") }}</label>
        <input v-model="editBoardName" class="input-base mt-1 text-sm" />
      </div>
    </div>
    <template #submit>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-small" @click="cancelEditBoard">
          {{ t("board.cancel") }}
        </button>
        <button
          type="submit"
          class="btn-primary btn-small"
          :disabled="!editBoardName.trim()"
        >
          {{ t("board.save") }}
        </button>
      </div>
    </template>
  </Form>

  <!-- Delete board modal -->
  <Form
    as="modal"
    destructive
    :open="!!deleteBoardTarget"
    @update:open="
      (v) => {
        if (!v) cancelDeleteBoard();
      }
    "
    @submit="handleDeleteBoardConfirm"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <IconAlertTriangle :size="18" class="text-destructive" />
        <h2 class="text-sm font-semibold">{{ t("board.deleteBoard") }}</h2>
      </div>
    </template>
    <p class="text-sm text-muted-foreground">
      {{ t("board.deleteBoardConfirm") }}
    </p>
    <template #submit>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-small" @click="cancelDeleteBoard">
          {{ t("board.cancel") }}
        </button>
        <button
          type="submit"
          class="btn-small bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {{ t("board.delete") }}
        </button>
      </div>
    </template>
  </Form>

  <!-- Filter sidebar (remote only) -->
  <Teleport to="body">
    <Transition :name="filterSidebarAnimName">
      <div
        v-if="filterSidebarOpen"
        class="fixed inset-0 z-50 flex justify-end bg-black/50"
        @click.self="filterSidebarOpen = false"
      >
        <div
          class="filter-sidebar-panel flex h-full w-80 flex-col dropdown-panel rounded-none border-l border-foreground/10"
        >
          <!-- Header -->
          <div
            class="flex items-center justify-between border-b border-foreground/10 px-5 py-4"
          >
            <h2 class="text-base font-semibold text-foreground">
              {{ t("boardFilters.title") }}
            </h2>
            <button
              class="rounded-lg p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              @click="filterSidebarOpen = false"
            >
              <IconX :size="18" />
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto px-5 py-4">
            <div class="flex flex-col gap-4">
              <!-- Assignee (remote only) -->
              <div v-if="isRemote" class="flex w-full flex-col gap-1.5">
                <label class="text-xs font-medium text-foreground/70">{{
                  t("boardFilters.assigneeLabel")
                }}</label>
                <MultiSelectFilter
                  :model-value="filters.assigneeIds"
                  :options="memberOptions"
                  :placeholder="t('boardFilters.allAssignees')"
                  @update:model-value="updateFilter({ assigneeIds: $event })"
                />
              </div>

              <!-- Responsible (remote only) -->
              <div v-if="isRemote" class="flex w-full flex-col gap-1.5">
                <label class="text-xs font-medium text-foreground/70">{{
                  t("boardFilters.responsibleLabel")
                }}</label>
                <MultiSelectFilter
                  :model-value="filters.responsibleIds"
                  :options="memberOptions"
                  :placeholder="t('boardFilters.allResponsibles')"
                  @update:model-value="updateFilter({ responsibleIds: $event })"
                />
              </div>

              <!-- Creator (remote only) -->
              <div v-if="isRemote" class="flex w-full flex-col gap-1.5">
                <label class="text-xs font-medium text-foreground/70">{{
                  t("boardFilters.creatorLabel")
                }}</label>
                <MultiSelectFilter
                  :model-value="filters.createdByIds"
                  :options="memberOptions"
                  :placeholder="t('boardFilters.allCreators')"
                  @update:model-value="updateFilter({ createdByIds: $event })"
                />
              </div>

              <!-- Tags (remote only) -->
              <div v-if="isRemote" class="flex w-full flex-col gap-1.5">
                <label class="text-xs font-medium text-foreground/70">{{
                  t("boardFilters.tagLabel")
                }}</label>
                <MultiSelectFilter
                  :model-value="filters.tagIds"
                  :options="tagOptions"
                  :placeholder="t('boardFilters.allTags')"
                  @update:model-value="updateFilter({ tagIds: $event })"
                />
              </div>

              <!-- Sprints (remote only) -->
              <div v-if="isRemote" class="flex w-full flex-col gap-1.5">
                <label class="text-xs font-medium text-foreground/70">{{
                  t("boardFilters.sprintLabel")
                }}</label>
                <MultiSelectFilter
                  :model-value="filters.sprintIds"
                  :options="sprintOptions"
                  :placeholder="t('boardFilters.allSprints')"
                  @update:model-value="updateFilter({ sprintIds: $event })"
                />
              </div>

              <!-- Priority -->
              <div class="flex w-full flex-col gap-1.5">
                <label class="text-xs font-medium text-foreground/70">{{
                  t("boardFilters.priorityLabel")
                }}</label>
                <select
                  :value="filters.priority ?? ''"
                  class="input-base h-9 text-sm"
                  @change="
                    updateFilter({
                      priority: ($event.target as HTMLSelectElement).value
                        ? Number(($event.target as HTMLSelectElement).value)
                        : null,
                    })
                  "
                >
                  <option value="">
                    {{ t("boardFilters.allPriorities") }}
                  </option>
                  <option
                    v-for="p in priorityOptions"
                    :key="p.value"
                    :value="p.value"
                  >
                    {{ p.label }}
                  </option>
                </select>
              </div>

              <!-- Include archived -->
              <div class="flex w-full flex-col gap-1.5">
                <label class="text-xs font-medium text-foreground/70">{{
                  t("boardFilters.archivedLabel")
                }}</label>
                <label
                  class="flex h-9 items-center gap-2 whitespace-nowrap text-sm text-foreground cursor-pointer"
                >
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-foreground/20"
                    :checked="filters.includeArchived"
                    @change="
                      updateFilter({
                        includeArchived: !filters.includeArchived,
                      })
                    "
                  />
                  <span>{{ t("boardFilters.includeArchived") }}</span>
                </label>
              </div>

              <!-- Sort -->
              <div class="flex w-full flex-col gap-1.5">
                <label class="text-xs font-medium text-foreground/70">{{
                  t("boardFilters.sortLabel")
                }}</label>
                <select
                  :value="filters.sort"
                  class="input-base h-9 text-sm"
                  @change="
                    updateFilter({
                      sort:
                        ($event.target as HTMLSelectElement).value || 'default',
                    })
                  "
                >
                  <option
                    v-for="s in sortOptions"
                    :key="s.value"
                    :value="s.value"
                  >
                    {{ s.label }}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <!-- Footer: reset -->
          <div
            v-if="hasActiveFilters"
            class="border-t border-foreground/10 px-5 py-4"
          >
            <button
              class="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-destructive bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition hover:bg-destructive/90"
              @click="clearAllFilters"
            >
              <IconX :size="16" />
              {{ t("boardFilters.clear") }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dropdown-panel {
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
.task-move {
  transition: transform 0.3s ease;
}
.task-enter-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.task-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.task-enter-from {
  opacity: 0;
  transform: scale(0.92) translateY(-8px);
}
.task-leave-to {
  opacity: 0;
  transform: scale(0.92);
}
.status-move {
  transition: transform 0.3s ease;
}
.filter-sidebar-enter-active,
.filter-sidebar-leave-active {
  transition: opacity 0.25s ease;
}
.filter-sidebar-enter-active .filter-sidebar-panel,
.filter-sidebar-leave-active .filter-sidebar-panel {
  transition: transform 0.25s ease;
}
.filter-sidebar-enter-from,
.filter-sidebar-leave-to {
  opacity: 0;
}
.filter-sidebar-enter-from .filter-sidebar-panel,
.filter-sidebar-leave-to .filter-sidebar-panel {
  transform: translateX(100%);
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

/* ─── No-animation variants (when animationsEnabled is false) ─── */
.no-anim-task-move,
.no-anim-task-enter-active,
.no-anim-task-leave-active {
  transition: none;
}
.no-anim-task-enter-from,
.no-anim-task-leave-to {
  opacity: 1;
  transform: none;
}
.no-anim-status-move,
.no-anim-status-enter-active,
.no-anim-status-leave-active {
  transition: none;
}
.no-anim-status-enter-from,
.no-anim-status-leave-to {
  opacity: 1;
  transform: none;
}
.no-anim-board-move,
.no-anim-board-enter-active,
.no-anim-board-leave-active {
  transition: none;
}
.no-anim-board-enter-from,
.no-anim-board-leave-to {
  opacity: 1;
  transform: none;
}
.no-anim-filter-sidebar-enter-active,
.no-anim-filter-sidebar-leave-active {
  transition: none;
}
.no-anim-filter-sidebar-enter-from,
.no-anim-filter-sidebar-leave-to {
  opacity: 1;
}
.no-anim-filter-sidebar-enter-from .filter-sidebar-panel,
.no-anim-filter-sidebar-leave-to .filter-sidebar-panel {
  transform: none;
}
</style>
