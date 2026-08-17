<script setup lang="ts">
import { IconChevronDown, IconChevronRight } from "@tabler/icons-vue";
import { useI18n } from "@/composables/useI18n";
import TaskCell from "./TaskCell.vue";
import type { Task, TaskStatus } from "@/lib/types";

const { t } = useI18n();

const props = defineProps<{
  statuses: TaskStatus[];
  tasksByStatus: Map<number, Task[]>;
  columnWidth: number;
  readOnly: boolean;
  isRemote: boolean;
  orgSlug: string;
  projectSlug: string;
  collapsed: boolean;
  draggedTaskId: number | null;
  dragOverTaskId: number | null;
  dragOverPosition: "before" | "after";
  lockedTaskIds: Map<number, number>;
  newTaskInputs: Record<string, string>;
  animationsEnabled: boolean;
}>();

const emit = defineEmits<{
  scroll: [element: HTMLElement];
  "toggle-pile": [];
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

function pileTasksForCell(statusId: number): Task[] {
  return (props.tasksByStatus.get(statusId) ?? []).filter(
    (t) => t.boardId == null,
  );
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div
      class="agile-scroll agile-row-scroll min-w-0 overflow-x-auto"
      @scroll="emit('scroll', $event.target as HTMLElement)"
    >
      <button
        type="button"
        class="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-left transition hover:bg-muted/70"
        :style="{ width: `${statuses.length * columnWidth}px` }"
        @click="emit('toggle-pile')"
      >
        <component
          :is="collapsed ? IconChevronRight : IconChevronDown"
          :size="16"
          class="shrink-0 text-muted-foreground"
        />
        <h3 class="flex-1 text-sm text-foreground">
          {{ t("board.pile") }}
        </h3>
      </button>
    </div>
    <div
      v-show="!collapsed"
      class="agile-scroll agile-row-scroll min-w-0 overflow-x-auto"
      @scroll="emit('scroll', $event.target as HTMLElement)"
    >
      <div
        class="flex"
        :style="{ minWidth: `${statuses.length * columnWidth}px` }"
      >
        <TaskCell
          v-for="(status, idx) in statuses"
          :key="status.id"
          :tasks="pileTasksForCell(status.id)"
          :status="status"
          :column-width="columnWidth"
          :read-only="readOnly"
          :is-remote="isRemote"
          :org-slug="orgSlug"
          :project-slug="projectSlug"
          :cell-key="`pile-${status.id}`"
          :board-id="null"
          :dragged-task-id="draggedTaskId"
          :drag-over-task-id="dragOverTaskId"
          :drag-over-position="dragOverPosition"
          :locked-task-ids="lockedTaskIds"
          :new-task-input="newTaskInputs[`pile-${status.id}`] ?? ''"
          :animations-enabled="animationsEnabled"
          :class="
            idx === 0
              ? 'rounded-l-lg'
              : idx === statuses.length - 1
                ? 'rounded-r-lg'
                : ''
          "
          @update:new-task-input="
            emit('update:new-task-input', `pile-${status.id}`, $event)
          "
          @create-task="emit('create-task', null, status.id)"
          @drag-start="emit('drag-start', $event)"
          @drag-end="emit('drag-end')"
          @task-drag-over="
            (taskId: number, e: DragEvent) => emit('task-drag-over', taskId, e)
          "
          @cell-drag-over="emit('cell-drag-over', $event)"
          @cell-drop="emit('cell-drop', null, status.id)"
          @archive-task="emit('archive-task', $event)"
          @unarchive-task="emit('unarchive-task', $event)"
        />
      </div>
    </div>
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
