<script setup lang="ts">
import { computed, ref, nextTick } from "vue";
import {
  IconFlame,
  IconLink,
  IconCheck,
  IconLock,
  IconCalendar,
} from "@tabler/icons-vue";
import { useI18n } from "@/composables/useI18n";
import { getApiDomain } from "@/lib/config";
import type { Task, ChildTaskInfo } from "@/lib/types";

const { t } = useI18n();

const showTooltip = ref(false);
const tooltipStyle = ref<Record<string, string>>({});
const cardRef = ref<HTMLElement | null>(null);

async function updateTooltipPosition() {
  if (!cardRef.value) return;
  const rect = cardRef.value.getBoundingClientRect();
  const tooltipWidth = 288;
  let left = rect.left + rect.width / 2 - tooltipWidth / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));
  tooltipStyle.value = {
    position: "fixed",
    left: `${left}px`,
    top: `${rect.bottom + 6}px`,
    width: `${tooltipWidth}px`,
  };
}

const props = defineProps<{
  task: Task;
  draggable?: boolean;
  locked?: boolean;
  orgSlug?: string;
  projectSlug?: string;
}>();

defineEmits<{
  dragstart: [task: Task];
  dragend: [];
}>();

const priorityColor = computed(() => {
  const p = props.task.priority;
  if (p <= 1) return "text-emerald-500/60";
  if (p === 2) return "text-amber-500/60";
  if (p === 3) return "text-rose-500/60";
  return "text-purple-500/60";
});

const priorityLabel = computed(() => {
  const p = props.task.priority;
  if (p <= 1) return t("taskCard.priority.low");
  if (p === 2) return t("taskCard.priority.medium");
  if (p === 3) return t("taskCard.priority.high");
  return t("taskCard.priority.urgent");
});

const allParticipants = computed(() => {
  const seen = new Set<number>();
  const result: {
    id: number;
    firstName?: string;
    lastName?: string;
    username?: string;
  }[] = [];
  for (const user of [
    ...(props.task.assignees ?? []),
    ...(props.task.responsibles ?? []),
  ]) {
    if (!seen.has(user.id)) {
      seen.add(user.id);
      result.push(user);
    }
  }
  return result;
});

const displayedUsers = computed(() => allParticipants.value.slice(0, 3));

function userInitials(user: { firstName?: string; lastName?: string }): string {
  const first = user.firstName?.[0] ?? "";
  const last = user.lastName?.[0] ?? "";
  return (first + last).toUpperCase() || "?";
}

const isRemote = computed(() => props.orgSlug && props.orgSlug !== "local");

function hexToRgb(hex: string): [number, number, number] | null {
  const cleaned = hex.replace(/^#/, "");
  if (cleaned.length === 3) {
    return [
      parseInt(cleaned[0] + cleaned[0], 16),
      parseInt(cleaned[1] + cleaned[1], 16),
      parseInt(cleaned[2] + cleaned[2], 16),
    ];
  }
  if (cleaned.length === 6) {
    return [
      parseInt(cleaned.slice(0, 2), 16),
      parseInt(cleaned.slice(2, 4), 16),
      parseInt(cleaned.slice(4, 6), 16),
    ];
  }
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const linearize = (c: number) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function tagStyle(tagColor: string): {
  backgroundColor: string;
  color: string;
  border: string;
} {
  const rgb = hexToRgb(tagColor);
  if (!rgb) {
    return {
      backgroundColor: `${tagColor}15`,
      color: tagColor,
      border: `1px solid ${tagColor}25`,
    };
  }
  const [r, g, b] = rgb;
  const lum = relativeLuminance(r, g, b);
  let adjusted = tagColor;
  if (lum < 0.08) {
    const w = 0.65;
    adjusted = rgbToHex(
      r * (1 - w) + 107 * w,
      g * (1 - w) + 114 * w,
      b * (1 - w) + 128 * w,
    );
  } else if (lum > 0.92) {
    const w = 0.65;
    adjusted = rgbToHex(
      r * (1 - w) + 75 * w,
      g * (1 - w) + 85 * w,
      b * (1 - w) + 99 * w,
    );
  }
  return {
    backgroundColor: `${adjusted}15`,
    color: adjusted,
    border: `1px solid ${adjusted}25`,
  };
}

const isOverdue = computed(
  () => !!props.task.endDate && new Date(props.task.endDate) < new Date(),
);

const deadlineLabel = computed(() => {
  if (!props.task.endDate) return "";
  const diffMs = new Date(props.task.endDate).getTime() - Date.now();
  if (diffMs <= 0) {
    const overdueMs = -diffMs;
    const overdueD = Math.floor(overdueMs / 86400000);
    const overdueH = Math.floor(overdueMs / 3600000);
    if (overdueD > 0)
      return t("taskCard.daysOverdue").replace("{n}", String(overdueD));
    if (overdueH > 0)
      return t("taskCard.hoursOverdue").replace("{n}", String(overdueH));
    return t("taskCard.minutesOverdue").replace(
      "{n}",
      String(Math.floor(overdueMs / 60000)),
    );
  }
  const diffD = Math.floor(diffMs / 86400000);
  const diffH = Math.floor(diffMs / 3600000);
  if (diffD > 0) return t("taskCard.daysLeft").replace("{n}", String(diffD));
  if (diffH > 0) return t("taskCard.hoursLeft").replace("{n}", String(diffH));
  return t("taskCard.minutesLeft").replace(
    "{n}",
    String(Math.floor(diffMs / 60000)),
  );
});

const dateTooltip = computed(() => {
  if (!props.task.endDate) return "";
  return new Date(props.task.endDate).toLocaleDateString();
});

function openTask() {
  if (!isRemote.value || !props.orgSlug || !props.projectSlug) return;
  const taskId = props.task.shortId || String(props.task.id);
  const url = `${getApiDomain()}/app/organizations/${props.orgSlug}/projects/${props.projectSlug}/tasks/${taskId}`;
  window.open(url, "_blank");
}

function openChildTask(child: ChildTaskInfo, e: MouseEvent) {
  e.stopPropagation();
  if (!isRemote.value || !props.orgSlug || !props.projectSlug) return;
  const url = `${getApiDomain()}/app/organizations/${props.orgSlug}/projects/${props.projectSlug}/tasks/${child.shortId}`;
  window.open(url, "_blank");
}
</script>

<template>
  <div
    class="group relative flex cursor-pointer flex-col gap-1 rounded-xl border border-black/20 bg-card p-3 transition hover:shadow-sm dark:border-white/20 [container-type:inline-size]"
    :style="{ fontSize: 'var(--task-card-font-size, 12px)' }"
    :class="[
      draggable ? 'cursor-grab active:cursor-grabbing' : '',
      {
        'opacity-60': task.archived,
        'opacity-40 grayscale': locked,
      },
    ]"
    :draggable="draggable ?? true"
    :title="dateTooltip"
    ref="cardRef"
    @click="openTask"
    @mouseenter="
      showTooltip = true;
      nextTick(updateTooltipPosition);
    "
    @mouseleave="showTooltip = false"
    @dragstart="$emit('dragstart', task)"
    @dragend="$emit('dragend')"
  >
    <!-- Lock overlay -->
    <div
      v-if="locked"
      class="absolute inset-0 z-10 flex items-center justify-center"
      @click.stop
    >
      <IconLock :size="20" class="text-muted-foreground/60" />
    </div>

    <!-- Title row -->
    <div class="flex items-start gap-1.5">
      <span
        class="min-w-0 flex-1 text-[1em] font-normal text-foreground line-clamp-3 break-words"
        :class="{ 'line-through': task.archived }"
      >
        <span
          v-if="task.shortId"
          class="font-mono text-[0.833em] text-muted-foreground"
          >{{ task.shortId }}&nbsp;</span
        >{{ task.title }}
      </span>
      <div class="flex shrink-0 items-center gap-0.5">
        <span
          v-if="task.archived"
          class="rounded bg-muted px-1.5 py-0.5 text-[0.833em] font-medium text-muted-foreground"
        >
          {{ t("taskCard.archived") }}
        </span>
      </div>
    </div>

    <!-- Tags -->
    <div
      v-if="task.tags?.length"
      class="flex flex-wrap gap-0.5 overflow-hidden"
    >
      <span
        v-for="tag in task.tags.slice(0, 3)"
        :key="tag.id"
        class="inline-flex max-w-[70px] shrink-0 items-center gap-0.5 rounded px-0.5 py-px text-[0.75em] font-medium"
        :style="tagStyle(tag.color)"
        :title="tag.name"
      >
        <span class="truncate">{{ tag.name }}</span>
      </span>
      <span
        v-if="task.tags.length > 3"
        class="inline-flex shrink-0 items-center text-[0.75em] font-medium text-muted-foreground"
      >
        +{{ task.tags.length - 3 }}
      </span>
    </div>

    <!-- Children tasks -->
    <div v-if="task.children?.length" class="flex flex-col gap-0.5 pt-0.5">
      <div
        class="flex items-center gap-0.5 text-[0.833em] text-muted-foreground"
      >
        <IconLink :size="12" class="shrink-0" />
        <span>{{ t("taskCard.children") }}</span>
      </div>
      <div
        v-for="child in task.children"
        :key="child.id"
        class="flex items-center gap-1 rounded px-1 py-0.5 transition hover:bg-muted/50"
        @click="openChildTask(child, $event)"
      >
        <span
          class="flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border"
          :class="
            child.statusIsEnd
              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-foreground/20'
          "
        >
          <IconCheck v-if="child.statusIsEnd" :size="10" />
        </span>
        <span
          class="min-w-0 flex-1 truncate text-[0.833em] text-foreground"
          :class="child.statusIsEnd && 'line-through text-muted-foreground'"
        >
          <span class="font-mono text-muted-foreground">{{
            child.shortId
          }}</span>
          {{ child.title }}
        </span>
      </div>
    </div>

    <!-- Bottom row: priority + deadline + avatars -->
    <div class="mt-auto flex items-center gap-2 pt-0.5">
      <IconFlame
        :size="12"
        class="shrink-0"
        :class="priorityColor"
        :title="priorityLabel"
      />

      <span
        v-if="deadlineLabel"
        class="inline-flex items-center gap-0.5 text-[0.833em]"
        :class="isOverdue ? 'text-rose-500' : 'text-muted-foreground'"
        :title="dateTooltip"
      >
        <IconCalendar :size="12" />
        {{ deadlineLabel }}
      </span>

      <!-- Avatars -->
      <div v-if="displayedUsers.length" class="ml-auto flex items-center">
        <div
          v-for="(user, idx) in displayedUsers"
          :key="user.id"
          class="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary ring-2 ring-card"
          :class="{ '-ml-2': idx > 0 }"
          :style="{ zIndex: displayedUsers.length - idx }"
        >
          {{ userInitials(user) }}
        </div>
        <span
          v-if="allParticipants.length > 3"
          class="ml-1 text-[0.833em] font-medium text-muted-foreground"
        >
          +{{ allParticipants.length - 3 }}
        </span>
      </div>
    </div>
  </div>

  <!-- Description tooltip (teleported to body to escape overflow clipping) -->
  <Teleport to="body">
    <div
      v-if="showTooltip && task.description"
      :style="tooltipStyle"
      class="pointer-events-none z-[9999] rounded-lg border border-black/10 bg-card p-2.5 text-[12px] leading-relaxed text-foreground shadow-lg dark:border-white/10"
    >
      <div
        class="line-clamp-5 whitespace-pre-wrap break-words text-muted-foreground"
        v-text="task.description"
      />
    </div>
  </Teleport>
</template>
