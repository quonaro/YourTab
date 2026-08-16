<script setup lang="ts">
import { IconX } from "@tabler/icons-vue";
import { useI18n } from "@/composables/useI18n";
import MultiSelectFilter from "./MultiSelectFilter.vue";
import type { TaskFilters } from "@/lib/types";

const { t } = useI18n();

defineProps<{
  open: boolean;
  filters: TaskFilters;
  isRemote: boolean;
  memberOptions: { value: number; label: string }[];
  tagOptions: { value: number; label: string }[];
  sprintOptions: { value: number; label: string }[];
  priorityOptions: { value: number; label: string }[];
  sortOptions: { value: string; label: string }[];
  hasActiveFilters: boolean;
  animationsEnabled: boolean;
}>();

const emit = defineEmits<{
  close: [];
  update: [patch: Partial<TaskFilters>];
  clear: [];
}>();

function updateFilter(patch: Partial<TaskFilters>) {
  emit("update", patch);
}
</script>

<template>
  <Teleport to="body">
    <Transition :name="animationsEnabled ? 'filter-sidebar' : 'no-anim-filter-sidebar'">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex justify-end bg-black/50"
        @click.self="emit('close')"
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
              @click="emit('close')"
            >
              <IconX :size="18" />
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto px-5 py-4">
            <div class="flex flex-col gap-4">
              <!-- Assignee -->
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

              <!-- Responsible -->
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

              <!-- Creator -->
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

              <!-- Tags -->
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

              <!-- Sprints -->
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
              @click="emit('clear')"
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
