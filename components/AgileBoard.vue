<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { IconLock } from "@tabler/icons-vue";
import { useOrgData, type OrgType } from "@/composables/useOrgData";
import { useWebSocket } from "@/composables/useWebSocket";
import { useAuth } from "@/composables/useAuth";
import { useI18n } from "@/composables/useI18n";
import { useSettings } from "@/composables/useSettings";
import { useRefreshCountdown } from "@/composables/useRefreshCountdown";
import { useBoardFilters } from "@/composables/useBoardFilters";
import { useBoardDragDrop } from "@/composables/useBoardDragDrop";
import { useBoardData } from "@/composables/useBoardData";
import { useBoardDerived } from "@/composables/useBoardDerived";
import { useScrollSync } from "@/composables/useScrollSync";
import { useActionsMenu } from "@/composables/useActionsMenu";
import { useBoardTaskOps } from "@/composables/useBoardTaskOps";
import BoardToolbar from "./BoardToolbar.vue";
import StatusHeaderRow from "./StatusHeaderRow.vue";
import PileRow from "./PileRow.vue";
import BoardRow from "./BoardRow.vue";
import StatusModals from "./StatusModals.vue";
import BoardModals from "./BoardModals.vue";
import FilterSidebar from "./FilterSidebar.vue";
import type { Task, TaskStatus, Board } from "@/lib/types";

const { t } = useI18n();
const { settings } = useSettings();
const { setupAutoRefresh, teardownAutoRefresh } = useRefreshCountdown();

const props = defineProps<{
  orgSlug: string;
  projectSlug: string;
  readOnly?: boolean;
  orgType?: OrgType;
}>();

const orgTypeRef = computed<OrgType>(() => props.orgType ?? "local");
const orgSlugRef = computed(() => props.orgSlug);
const isRemote = computed(() => orgTypeRef.value === "remote");
const readOnlyRef = computed(() => props.readOnly ?? false);
const projectSlugRef = computed(() => props.projectSlug);

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

// ─── Core state ───
const tasks = ref<Task[]>([]);
const statuses = ref<TaskStatus[]>([]);
const boards = ref<Board[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const pileCollapsed = ref(false);

const animationsEnabled = computed(() => settings.value.animationsEnabled);

// ─── Filters ───
const filters = useBoardFilters({
  isRemote,
  projectSlug: projectSlugRef,
  getProjectMembers,
  getProjectTags,
  getProjectSprints,
  onDataChanged: () => loadData(),
});

// ─── Data loading ───
const { loadData, silentRefresh, handleWSMessage } = useBoardData({
  tasks,
  statuses,
  boards,
  loading,
  error,
  projectSlug: projectSlugRef,
  isRemote,
  currentUserId,
  buildTaskParams: filters.buildTaskParams,
  listTasks,
  getStatuses,
  getBoards,
  onLockTask: (taskId, userId) => dnd.setLocked(taskId, userId),
  onUnlockTask: (taskId) => dnd.unlock(taskId),
});

// ─── Column width ───
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

// ─── Column ordering ───
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

// ─── Scroll sync ───
const boardScrollRef = ref<HTMLElement | null>(null);
const boardContainerRef = ref<HTMLElement | null>(null);
const { syncScrollFrom } = useScrollSync(
  boardScrollRef,
  boardContainerRef,
  collapsed,
);

// ─── Derived data ───
const { tasksByStatus, tasksForCell, pileTasksForCell, pileTasks, rows } =
  useBoardDerived({
    tasks,
    statuses,
    boards,
    isRemote,
    filters: filters.filters,
  });

// ─── Drag & drop ───
const dnd = useBoardDragDrop({
  tasks,
  statuses,
  boards,
  projectSlug: projectSlugRef,
  readOnly: readOnlyRef,
  isRemote,
  isLocked: (taskId) => dnd.isLocked(taskId),
  tasksForCell,
  pileTasksForCell,
  updateTask,
  dragTask,
  reorderTasks,
});

async function handleCellDrop(boardId: number | null, statusId: number) {
  try {
    if (boardId != null) {
      await dnd.onCellDrop(boardId, statusId);
    } else {
      await dnd.onPileCellDrop(statusId);
    }
  } catch (e) {
    error.value = (e as Error).message;
  }
}

function handleStatusDrop(e: DragEvent) {
  dnd.onStatusDrop(e, columnOrder);
}

// ─── Task operations ───
const taskOps = useBoardTaskOps({
  tasks,
  projectSlug: projectSlugRef,
  readOnly: readOnlyRef,
  createTask,
  updateTask,
});

async function handleCreateTask(boardId: number | null, statusId: number) {
  const err = await taskOps.handleCreateTask(boardId, statusId);
  if (err) error.value = err;
}

async function archiveTask(taskId: number) {
  const err = await taskOps.archiveTask(taskId);
  if (err) error.value = err;
}

async function unarchiveTask(taskId: number) {
  const err = await taskOps.unarchiveTask(taskId);
  if (err) error.value = err;
}

// ─── Status menu state ───
const statusModalsRef = ref<InstanceType<typeof StatusModals> | null>(null);
const statusMenu = useActionsMenu("data-status-trigger", "data-status-menu");

function startEditStatus(status: TaskStatus) {
  statusModalsRef.value?.startEdit(status);
  statusMenu.close();
}

function startDeleteStatus(status: TaskStatus) {
  statusModalsRef.value?.startDelete(status);
  statusMenu.close();
}

// ─── Board menu state ───
const boardModalsRef = ref<InstanceType<typeof BoardModals> | null>(null);
const boardMenu = useActionsMenu("data-board-trigger", "data-board-menu");

function startEditBoard(board: Board) {
  boardModalsRef.value?.startEdit(board);
  boardMenu.close();
}

function startDeleteBoard(board: Board) {
  boardModalsRef.value?.startDelete(board);
  boardMenu.close();
}

// ─── Lifecycle ───
let wsUnsub: (() => void) | null = null;

onMounted(() => {
  loadData();
  if (isRemote.value) {
    wsConnect();
    wsUnsub = wsOnMessage(handleWSMessage);
  }
});

onUnmounted(() => {
  if (wsUnsub) {
    wsUnsub();
    wsUnsub = null;
  }
  wsDisconnect();
  teardownAutoRefresh();
});

watch(() => props.projectSlug, loadData);

setupAutoRefresh(silentRefresh);
defineExpose({
  openCreateStatusModal: () => statusModalsRef.value?.openCreateModal(),
  openCreateBoardModal: () => boardModalsRef.value?.openCreateModal(),
});
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
      class="agile-board flex min-w-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto p-4"
    >
      <BoardToolbar
        :search-query="filters.searchQuery.value"
        :has-active-filters="filters.hasActiveFilters.value"
        :active-filter-count="filters.activeFilterCount.value"
        :column-width="COLUMN_WIDTH"
        :column-min-width="COLUMN_MIN_WIDTH"
        :column-max-width="COLUMN_MAX_WIDTH"
        :read-only="readOnly ?? false"
        :org-type="orgType ?? 'local'"
        @update:search-query="filters.searchQuery.value = $event"
        @clear-filters="filters.clearAllFilters"
        @open-filters="filters.openFilterSidebar"
        @zoom-in="zoomInColumns"
        @zoom-out="zoomOutColumns"
        @create-status="statusModalsRef?.openCreateModal()"
        @create-board="boardModalsRef?.openCreateModal()"
      />

      <StatusHeaderRow
        ref="boardScrollRef"
        :statuses="orderedStatuses"
        :column-width="COLUMN_WIDTH"
        :read-only="readOnly ?? false"
        :is-remote="isRemote"
        :dragged-status-id="dnd.draggedStatusId.value"
        :animations-enabled="animationsEnabled"
        :status-actions-open="statusMenu.actionsOpen.value"
        :status-menu-pos="statusMenu.menuPos.value"
        @scroll="syncScrollFrom"
        @status-drag-start="dnd.onStatusDragStart"
        @status-drag-end="dnd.onStatusDragEnd"
        @status-drag-over="dnd.onStatusDragOver"
        @status-drop="handleStatusDrop"
        @toggle-status-menu="statusMenu.toggle"
        @start-edit-status="startEditStatus"
        @start-delete-status="startDeleteStatus"
      />

      <!-- Pile section -->
      <PileRow
        v-if="pileTasks.length > 0"
        :statuses="orderedStatuses"
        :tasks-by-status="tasksByStatus"
        :column-width="COLUMN_WIDTH"
        :read-only="readOnly ?? false"
        :is-remote="isRemote"
        :org-slug="orgSlug"
        :project-slug="projectSlug"
        :collapsed="pileCollapsed"
        :dragged-task-id="dnd.draggedTaskId.value"
        :drag-over-task-id="dnd.dragOverTaskId.value"
        :drag-over-position="dnd.dragOverPosition.value"
        :locked-task-ids="dnd.lockedTaskIds.value"
        :new-task-inputs="taskOps.newTaskInputs.value"
        :animations-enabled="animationsEnabled"
        @scroll="syncScrollFrom"
        @toggle-pile="pileCollapsed = !pileCollapsed"
        @update:new-task-input="taskOps.updateNewTaskInput"
        @create-task="handleCreateTask"
        @drag-start="dnd.onDragStart"
        @drag-end="dnd.onDragEnd"
        @task-drag-over="dnd.onTaskDragOver"
        @cell-drag-over="dnd.onCellDragOver"
        @cell-drop="handleCellDrop"
        @archive-task="archiveTask"
        @unarchive-task="unarchiveTask"
      />

      <!-- Board rows -->
      <TransitionGroup
        tag="div"
        :name="animationsEnabled ? 'board' : 'no-anim-board'"
        class="flex flex-col gap-2"
      >
        <BoardRow
          v-for="row in rows"
          :key="row.id"
          :board="row.board"
          :statuses="orderedStatuses"
          :tasks-by-status="tasksByStatus"
          :column-width="COLUMN_WIDTH"
          :read-only="readOnly ?? false"
          :is-remote="isRemote"
          :org-slug="orgSlug"
          :project-slug="projectSlug"
          :org-type="orgType ?? 'local'"
          :collapsed="collapsed.has(row.id)"
          :dragged-board-id="dnd.draggedBoardId.value"
          :dragged-task-id="dnd.draggedTaskId.value"
          :drag-over-task-id="dnd.dragOverTaskId.value"
          :drag-over-position="dnd.dragOverPosition.value"
          :locked-task-ids="dnd.lockedTaskIds.value"
          :new-task-inputs="taskOps.newTaskInputs.value"
          :animations-enabled="animationsEnabled"
          :board-actions-open="boardMenu.actionsOpen.value"
          :board-menu-pos="boardMenu.menuPos.value"
          @scroll="syncScrollFrom"
          @toggle="toggleBoard"
          @board-drag-start="dnd.onBoardDragStart"
          @board-drag-end="dnd.onBoardDragEnd"
          @board-drag-over="dnd.onBoardDragOver"
          @board-drop="dnd.onBoardDrop"
          @toggle-board-menu="boardMenu.toggle"
          @start-edit-board="startEditBoard"
          @start-delete-board="startDeleteBoard"
          @update:new-task-input="taskOps.updateNewTaskInput"
          @create-task="handleCreateTask"
          @drag-start="dnd.onDragStart"
          @drag-end="dnd.onDragEnd"
          @task-drag-over="dnd.onTaskDragOver"
          @cell-drag-over="dnd.onCellDragOver"
          @cell-drop="handleCellDrop"
          @archive-task="archiveTask"
          @unarchive-task="unarchiveTask"
        />
      </TransitionGroup>
    </div>

    <!-- Empty state -->
    <div
      v-else
      class="flex flex-1 items-center justify-center text-muted-foreground"
    >
      {{ t("board.noStatuses") }}
    </div>

    <!-- Modals -->
    <StatusModals
      ref="statusModalsRef"
      :read-only="readOnly ?? false"
      :project-slug="projectSlug"
      :statuses="statuses"
      :create-status="createStatus"
      :update-status="updateStatus"
      :delete-status="deleteStatus"
      @error="error = $event"
      @data-changed="loadData"
    />
    <BoardModals
      ref="boardModalsRef"
      :read-only="readOnly ?? false"
      :project-slug="projectSlug"
      :boards="boards"
      :create-board="createBoard"
      :update-board="updateBoard"
      :delete-board="deleteBoard"
      @error="error = $event"
      @data-changed="loadData"
    />

    <!-- Filter sidebar -->
    <FilterSidebar
      :open="filters.filterSidebarOpen.value"
      :filters="filters.filters.value"
      :is-remote="isRemote"
      :member-options="filters.memberOptions.value"
      :tag-options="filters.tagOptions.value"
      :sprint-options="filters.sprintOptions.value"
      :priority-options="filters.priorityOptions.value"
      :sort-options="filters.sortOptions.value"
      :has-active-filters="filters.hasActiveFilters.value"
      :animations-enabled="animationsEnabled"
      @close="filters.filterSidebarOpen.value = false"
      @update="filters.updateFilter"
      @clear="filters.clearAllFilters"
    />
  </div>
</template>

<style scoped>
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
.board-move {
  transition: transform 0.3s ease;
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
</style>
