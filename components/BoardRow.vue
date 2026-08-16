<script setup lang="ts">
import {
  IconGripVertical,
  IconChevronDown,
  IconChevronRight,
  IconDotsVertical,
  IconPencil,
  IconTrash,
} from "@tabler/icons-vue";
import { useI18n } from "@/composables/useI18n";
import TaskCell from "./TaskCell.vue";
import type { Task, TaskStatus, Board } from "@/lib/types";

const { t } = useI18n();

const props = defineProps<{
  board: Board;
  statuses: TaskStatus[];
  tasksByStatus: Map<number, Task[]>;
  columnWidth: number;
  readOnly: boolean;
  isRemote: boolean;
  orgSlug: string;
  projectSlug: string;
  orgType: string;
  collapsed: boolean;
  draggedBoardId: number | null;
  draggedTaskId: number | null;
  dragOverTaskId: number | null;
  dragOverPosition: "before" | "after";
  lockedTaskIds: Map<number, number>;
  newTaskInputs: Record<string, string>;
  animationsEnabled: boolean;
  boardActionsOpen: number | null;
  boardMenuPos: { top: number; left: number } | null;
}>();

const emit = defineEmits<{
  scroll: [element: HTMLElement];
  toggle: [boardId: number];
  "board-drag-start": [boardId: number, event: DragEvent];
  "board-drag-end": [];
  "board-drag-over": [boardId: number, event: DragEvent];
  "board-drop": [boardId: number, event: DragEvent];
  "toggle-board-menu": [boardId: number];
  "start-edit-board": [board: Board];
  "start-delete-board": [board: Board];
  "update:new-task-input": [key: string, value: string];
  "create-task": [boardId: number | null, statusId: number];
  "drag-start": [taskId: number];
  "drag-end": [];
  "task-drag-over": [taskId: number, event: DragEvent];
  "cell-drag-over": [event: DragEvent];
  "cell-drop": [boardId: number | null, statusId: number];
  "archive-task": [taskId: number];
  "unarchive-task": [taskId: number];
}>();

function tasksForCell(statusId: number): Task[] {
  return (props.tasksByStatus.get(statusId) ?? []).filter(
    (t) => t.boardId === props.board.id,
  );
}
</script>

<template>
  <div
    class="flex flex-col gap-2"
    :class="{ 'opacity-40': draggedBoardId === board.id }"
    @dragover="emit('board-drag-over', board.id, $event)"
    @drop="emit('board-drop', board.id, $event)"
  >
    <!-- Board header -->
    <div
      class="agile-scroll agile-row-scroll overflow-x-auto"
      @scroll="emit('scroll', $event.target as HTMLElement)"
    >
      <div
        role="button"
        tabindex="0"
        class="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-left transition hover:bg-muted/70"
        :class="!readOnly ? 'cursor-grab active:cursor-grabbing' : ''"
        :style="{ width: `${statuses.length * columnWidth}px` }"
        :draggable="!readOnly"
        @dragstart="emit('board-drag-start', board.id, $event)"
        @dragend="emit('board-drag-end')"
        @click="emit('toggle', board.id)"
        @keydown.enter="emit('toggle', board.id)"
      >
        <IconGripVertical
          v-if="!readOnly"
          :size="16"
          class="shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
        />
        <component
          :is="collapsed ? IconChevronRight : IconChevronDown"
          :size="16"
          class="shrink-0 text-muted-foreground"
        />
        <h3 class="flex-1 text-sm text-foreground">{{ board.name }}</h3>
        <button
          v-if="!readOnly && orgType === 'local'"
          :data-board-trigger="board.id"
          draggable="false"
          :aria-label="t('board.boardActions')"
          aria-haspopup="true"
          class="relative shrink-0 rounded p-1 text-muted-foreground/60 transition hover:bg-muted hover:text-foreground"
          @click.stop="emit('toggle-board-menu', board.id)"
        >
          <IconDotsVertical :size="14" />
        </button>
      </div>
    </div>

    <!-- Board cells -->
    <div
      v-show="!collapsed"
      class="agile-scroll agile-row-scroll overflow-x-auto"
      @scroll="emit('scroll', $event.target as HTMLElement)"
    >
      <div
        class="flex"
        :style="{ minWidth: `${statuses.length * columnWidth}px` }"
      >
        <TaskCell
          v-for="(status, idx) in statuses"
          :key="status.id"
          :tasks="tasksForCell(status.id)"
          :status="status"
          :column-width="columnWidth"
          :read-only="readOnly"
          :is-remote="isRemote"
          :org-slug="orgSlug"
          :project-slug="projectSlug"
          :cell-key="`${board.id}-${status.id}`"
          :board-id="board.id"
          :dragged-task-id="draggedTaskId"
          :drag-over-task-id="dragOverTaskId"
          :drag-over-position="dragOverPosition"
          :locked-task-ids="lockedTaskIds"
          :new-task-input="newTaskInputs[`${board.id}-${status.id}`] ?? ''"
          :animations-enabled="animationsEnabled"
          :class="
            idx === 0
              ? 'rounded-l-lg'
              : idx === statuses.length - 1
                ? 'rounded-r-lg'
                : ''
          "
          @update:new-task-input="
            emit('update:new-task-input', `${board.id}-${status.id}`, $event)
          "
          @create-task="emit('create-task', board.id, status.id)"
          @drag-start="emit('drag-start', $event)"
          @drag-end="emit('drag-end')"
          @task-drag-over="
            (taskId: number, e: DragEvent) => emit('task-drag-over', taskId, e)
          "
          @cell-drag-over="emit('cell-drag-over', $event)"
          @cell-drop="emit('cell-drop', board.id, status.id)"
          @archive-task="emit('archive-task', $event)"
          @unarchive-task="emit('unarchive-task', $event)"
        />
      </div>
    </div>

    <!-- Board actions dropdown -->
    <Teleport to="body">
      <div
        v-if="boardActionsOpen === board.id && boardMenuPos"
        :data-board-menu="board.id"
        :style="{
          position: 'fixed',
          top: `${boardMenuPos.top}px`,
          left: `${boardMenuPos.left}px`,
        }"
        class="z-50 w-44 rounded-lg border border-foreground/10 bg-background p-2 shadow-lg"
      >
        <button
          class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground/80 transition hover:bg-muted"
          @click.stop="emit('start-edit-board', board)"
        >
          <IconPencil :size="13" aria-hidden="true" />
          {{ t("board.editBoard") }}
        </button>
        <button
          class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-destructive transition hover:bg-destructive/10"
          @click.stop="emit('start-delete-board', board)"
        >
          <IconTrash :size="13" aria-hidden="true" />
          {{ t("board.deleteBoard") }}
        </button>
      </div>
    </Teleport>
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
</style>
