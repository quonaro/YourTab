<script setup lang="ts">
import {
  IconPlus,
  IconMinus,
  IconX,
  IconSearch,
  IconAdjustmentsHorizontal,
  IconColumns3,
  IconLayoutGrid,
} from "@tabler/icons-vue";
import { useI18n } from "@/composables/useI18n";

const { t } = useI18n();

defineProps<{
  searchQuery: string;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  columnWidth: number;
  columnMinWidth: number;
  columnMaxWidth: number;
  readOnly: boolean;
  orgType: string;
}>();

const emit = defineEmits<{
  "update:search-query": [value: string];
  "clear-filters": [];
  "open-filters": [];
  "zoom-in": [];
  "zoom-out": [];
  "create-status": [];
  "create-board": [];
}>();
</script>

<template>
  <div class="flex flex-wrap items-end gap-2">
    <!-- Search & Filters -->
    <div class="flex items-center gap-2">
      <div class="relative flex items-center">
        <IconSearch
          :size="15"
          class="pointer-events-none absolute left-2.5 text-muted-foreground"
        />
        <input
          :value="searchQuery"
          type="text"
          class="input-base h-9 w-48 pl-8 text-sm"
          :placeholder="t('boardFilters.searchPlaceholder')"
          @input="emit('update:search-query', ($event.target as HTMLInputElement).value)"
        />
        <button
          v-if="searchQuery"
          class="absolute right-2 text-muted-foreground transition hover:text-foreground"
          @click="emit('update:search-query', '')"
        >
          <IconX :size="14" />
        </button>
      </div>

      <button
        v-if="hasActiveFilters"
        type="button"
        class="flex h-9 items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 text-sm font-medium text-destructive transition hover:bg-destructive/20"
        @click="emit('clear-filters')"
      >
        <IconX :size="15" />
        {{ t("boardFilters.clear") }}
      </button>

      <button
        type="button"
        class="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
        @click="emit('open-filters')"
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
          :disabled="columnWidth <= columnMinWidth"
          :aria-label="t('board.zoomOutColumns')"
          :title="t('board.zoomOutColumns')"
          @click="emit('zoom-out')"
        >
          <IconMinus :size="16" />
        </button>
        <span
          class="min-w-[3ch] text-center text-xs font-medium text-muted-foreground"
        >
          {{ columnWidth }}
        </span>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
          :disabled="columnWidth >= columnMaxWidth"
          :aria-label="t('board.zoomInColumns')"
          :title="t('board.zoomInColumns')"
          @click="emit('zoom-in')"
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
        @click="emit('create-status')"
      >
        <IconColumns3 :size="15" />
        {{ t("board.createColumn") }}
      </button>
      <button
        type="button"
        class="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
        @click="emit('create-board')"
      >
        <IconLayoutGrid :size="15" />
        {{ t("board.createBoard") }}
      </button>
    </div>
  </div>
</template>
