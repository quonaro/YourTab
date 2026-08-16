<script setup lang="ts">
import { IconArchive, IconRotateClockwise } from "@tabler/icons-vue";
import { useI18n } from "@/composables/useI18n";
import TaskCard from "./TaskCard.vue";
import type { Task, TaskStatus } from "@/lib/types";

const { t } = useI18n();

const props = defineProps<{
  tasks: Task[];
  status: TaskStatus;
  columnWidth: number;
  readOnly: boolean;
  isRemote: boolean;
  orgSlug: string;
  projectSlug: string;
  cellKey: string;
  boardId: number | null;
  draggedTaskId: number | null;
  dragOverTaskId: number | null;
  dragOverPosition: "before" | "after";
  lockedTaskIds: Map<number, number>;
  newTaskInput: string;
  animationsEnabled: boolean;
}>();

const emit = defineEmits<{
  "update:new-task-input": [value: string];
  "create-task": [boardId: number | null, statusId: number];
  "drag-start": [taskId: number];
  "drag-end": [];
  "task-drag-over": [taskId: number, event: DragEvent];
  "cell-drag-over": [event: DragEvent];
  "cell-drop": [boardId: number | null, statusId: number];
  "archive-task": [taskId: number];
  "unarchive-task": [taskId: number];
}>();

function isLocked(taskId: number): boolean {
  return props.lockedTaskIds.has(taskId);
}
</script>

<template>
  <div
    class="shrink-0 border border-foreground/10 bg-muted/20 p-2"
    :style="{ width: `${columnWidth}px` }"
    @dragover="emit('cell-drag-over', $event)"
    @drop="emit('cell-drop', boardId, status.id)"
  >
    <div v-if="!readOnly" class="mb-2">
      <input
        :value="newTaskInput"
        class="input-base h-8 text-xs"
        :placeholder="t('board.newTaskInCell')"
        @input="
          emit(
            'update:new-task-input',
            ($event.target as HTMLInputElement).value,
          )
        "
        @keyup.enter="emit('create-task', boardId, status.id)"
        @blur="emit('update:new-task-input', '')"
      />
    </div>
    <TransitionGroup
      :name="animationsEnabled ? 'task' : 'no-anim-task'"
      tag="div"
      class="relative flex flex-col gap-2"
    >
      <div
        v-for="task in tasks"
        :key="task.id"
        :data-id="task.id"
        class="group/task relative cursor-grab active:cursor-grabbing"
        :class="{
          'pointer-events-none opacity-50': lockedTaskIds.has(task.id),
          'agile-drag-origin': draggedTaskId === task.id,
        }"
        :draggable="!readOnly && !isLocked(task.id)"
        @dragstart="emit('drag-start', task.id)"
        @dragend="emit('drag-end')"
        @dragover="emit('task-drag-over', task.id, $event)"
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
          @dragstart="emit('drag-start', task.id)"
          @dragend="emit('drag-end')"
        />
        <button
          v-if="!readOnly && !isRemote"
          draggable="false"
          class="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-card/80 text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition hover:bg-muted hover:text-foreground group-hover/task:opacity-100"
          :title="
            task.archived ? t('board.unarchiveTask') : t('board.archiveTask')
          "
          @click.stop="
            task.archived
              ? emit('unarchive-task', task.id)
              : emit('archive-task', task.id)
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
      v-if="tasks.length === 0"
      class="flex min-h-[120px] items-center justify-center text-xs text-muted-foreground/50"
    >
      —
    </div>
  </div>
</template>

<style scoped>
.agile-drag-origin {
  opacity: 0.35;
  transition: opacity 0.15s ease;
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
