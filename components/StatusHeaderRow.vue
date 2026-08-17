<script setup lang="ts">
import {
  IconGripVertical,
  IconDotsVertical,
  IconPencil,
  IconTrash,
} from "@tabler/icons-vue";
import { useI18n } from "@/composables/useI18n";
import type { TaskStatus } from "@/lib/types";

const { t } = useI18n();

defineProps<{
  statuses: TaskStatus[];
  columnWidth: number;
  readOnly: boolean;
  isRemote: boolean;
  draggedStatusId: number | null;
  animationsEnabled: boolean;
  statusActionsOpen: number | null;
  statusMenuPos: { top: number; left: number } | null;
}>();

const emit = defineEmits<{
  scroll: [element: HTMLElement];
  "status-drag-start": [statusId: number, event: DragEvent];
  "status-drag-end": [];
  "status-drag-over": [statusId: number, event: DragEvent];
  "status-drop": [event: DragEvent];
  "toggle-status-menu": [statusId: number];
  "start-edit-status": [status: TaskStatus];
  "start-delete-status": [status: TaskStatus];
}>();
</script>

<template>
  <div
    class="agile-scroll sticky top-0 z-10 min-w-0 shrink-0 overflow-x-auto bg-background"
    @scroll="emit('scroll', $event.target as HTMLElement)"
  >
    <TransitionGroup
      :name="animationsEnabled ? 'status' : 'no-anim-status'"
      tag="div"
      class="flex"
      :style="{ minWidth: `${statuses.length * columnWidth}px` }"
    >
      <div
        v-for="(status, idx) in statuses"
        :key="status.id"
        :data-status-id="status.id"
        role="button"
        tabindex="0"
        :aria-label="status.name"
        class="relative flex shrink-0 cursor-grab items-center gap-2 bg-muted px-3 py-2 text-foreground transition-opacity active:cursor-grabbing"
        :class="[
          idx === 0
            ? 'rounded-l-lg'
            : idx === statuses.length - 1
              ? 'rounded-r-lg'
              : '',
          { 'opacity-40': draggedStatusId === status.id },
        ]"
        :style="{ width: `${columnWidth}px` }"
        draggable="true"
        @dragstart="emit('status-drag-start', status.id, $event)"
        @dragend="emit('status-drag-end')"
        @dragover="emit('status-drag-over', status.id, $event)"
        @drop="emit('status-drop', $event)"
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
          :aria-label="t('board.statusActions')"
          aria-haspopup="true"
          class="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
          @click.stop="emit('toggle-status-menu', status.id)"
        >
          <IconDotsVertical :size="14" />
        </button>
      </div>
    </TransitionGroup>
  </div>

  <!-- Status actions dropdown -->
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
          emit(
            'start-edit-status',
            statuses.find((s) => s.id === statusActionsOpen)!,
          )
        "
      >
        <IconPencil :size="13" aria-hidden="true" />
        {{ t("board.editStatus") }}
      </button>
      <button
        class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-destructive transition hover:bg-destructive/10"
        @click.stop="
          emit(
            'start-delete-status',
            statuses.find((s) => s.id === statusActionsOpen)!,
          )
        "
      >
        <IconTrash :size="13" aria-hidden="true" />
        {{ t("board.deleteStatus") }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.agile-scroll {
  scrollbar-width: none;
  overflow-anchor: none;
}
.agile-scroll::-webkit-scrollbar {
  display: none;
}
.status-move {
  transition: transform 0.3s ease;
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
</style>
