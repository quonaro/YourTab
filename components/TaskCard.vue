<script setup lang="ts">
import { computed } from "vue";
import { Flag } from "lucide-vue-next";
import { useI18n } from "@/composables/useI18n";
import { getApiDomain } from "@/lib/config";
import type { Task } from "@/lib/types";

const { t } = useI18n();

const props = defineProps<{
  task: Task;
  draggable?: boolean;
  orgSlug?: string;
  projectSlug?: string;
}>();

defineEmits<{
  dragstart: [task: Task];
  dragend: [];
}>();

const priorityColors: Record<number, string> = {
  1: "text-muted-foreground",
  2: "text-blue-500",
  3: "text-orange-500",
  4: "text-destructive",
};

const priorityColor = computed(
  () => priorityColors[props.task.priority] ?? priorityColors[1],
);
const priorityLabel = computed(() => {
  const labels: Record<number, string> = {
    1: t("taskCard.priority.low"),
    2: t("taskCard.priority.medium"),
    3: t("taskCard.priority.high"),
    4: t("taskCard.priority.urgent"),
  };
  return labels[props.task.priority] ?? t("taskCard.priority.low");
});
const assigneeInitials = computed(() => {
  if (!props.task.assignees || props.task.assignees.length === 0) return "";
  const a = props.task.assignees[0];
  const first = a.firstName?.[0] ?? "";
  const last = a.lastName?.[0] ?? "";
  return (first + last).toUpperCase();
});

const isRemote = computed(() => props.orgSlug && props.orgSlug !== "local");

function openTask() {
  if (!isRemote.value || !props.orgSlug || !props.projectSlug) return;
  const taskId = props.task.shortId || String(props.task.id);
  const url = `${getApiDomain()}/app/organizations/${props.orgSlug}/projects/${props.projectSlug}/tasks/${taskId}`;
  window.open(url, "_blank");
}
</script>

<template>
  <div
    class="card-xs bg-card transition hover:shadow-md"
    :class="[
      draggable ? 'cursor-grab active:cursor-grabbing' : '',
      isRemote ? 'cursor-pointer' : '',
    ]"
    :draggable="draggable ?? true"
    @click="openTask"
    @dragstart="$emit('dragstart', task)"
    @dragend="$emit('dragend')"
  >
    <div class="flex items-start justify-between gap-2">
      <span class="item-title flex-1">
        <span
          v-if="task.shortId"
          class="font-mono text-[0.833em] text-muted-foreground"
          >{{ task.shortId }}&nbsp;</span
        >{{ task.title }}
      </span>
      <div :class="priorityColor" class="flex items-center gap-0.5 text-xs">
        <Flag :size="12" />
      </div>
    </div>
    <div class="mt-2 flex items-center justify-between">
      <span v-if="task.endDate" class="text-xs text-muted-foreground">
        {{ new Date(task.endDate).toLocaleDateString() }}
      </span>
      <div
        v-if="assigneeInitials"
        class="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary"
      >
        {{ assigneeInitials }}
      </div>
    </div>
  </div>
</template>
