import { ref, computed, watch, type ComputedRef } from "vue";
import type {
  UserInfo,
  TaskTag,
  SprintInfo,
  TaskFilters,
  TaskListParams,
} from "@/lib/types";
import { useI18n } from "@/composables/useI18n";

interface UseBoardFiltersOptions {
  isRemote: ComputedRef<boolean>;
  projectSlug: ComputedRef<string>;
  getProjectMembers: (slug: string) => Promise<UserInfo[]>;
  getProjectTags: (slug: string) => Promise<TaskTag[]>;
  getProjectSprints: (slug: string) => Promise<SprintInfo[]>;
  onDataChanged: () => void;
}

const FILTERS_STORAGE_KEY = "yourtask-filters";

const defaultFilters: TaskFilters = {
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

export function useBoardFilters(opts: UseBoardFiltersOptions) {
  const { t } = useI18n();

  const searchQuery = ref("");
  const filters = ref<TaskFilters>({ ...defaultFilters });
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
        label: s.name,
      })),
  );

  const priorityOptions = computed(() => [
    { value: 1, label: t("taskCard.priority.low") },
    { value: 2, label: t("taskCard.priority.medium") },
    { value: 3, label: t("taskCard.priority.high") },
    { value: 4, label: t("taskCard.priority.urgent") },
  ]);

  const sortOptions = computed(() => {
    const opts2 = [
      { value: "default", label: t("boardFilters.sortDefault") },
      { value: "deadline-asc", label: t("boardFilters.sortDeadlineAsc") },
      { value: "deadline-desc", label: t("boardFilters.sortDeadlineDesc") },
      { value: "priority-desc", label: t("boardFilters.sortPriorityDesc") },
      { value: "priority-asc", label: t("boardFilters.sortPriorityAsc") },
      { value: "title-asc", label: t("boardFilters.sortTitleAsc") },
      { value: "title-desc", label: t("boardFilters.sortTitleDesc") },
    ];
    if (!opts.isRemote.value) {
      return opts2.filter((o) => !o.value.startsWith("deadline-"));
    }
    return opts2;
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
    if (!opts.isRemote.value) return undefined;
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
    filters.value = { ...defaultFilters };
    searchQuery.value = "";
    if (opts.isRemote.value) opts.onDataChanged();
  }

  async function loadFilterData() {
    if (!opts.isRemote.value) return;
    try {
      const [m, tg, sp] = await Promise.all([
        opts.getProjectMembers(opts.projectSlug.value),
        opts.getProjectTags(opts.projectSlug.value),
        opts.getProjectSprints(opts.projectSlug.value),
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
    if (opts.isRemote.value) opts.onDataChanged();
  }

  function resetFilters() {
    searchQuery.value = "";
    filters.value = { ...defaultFilters };
    members.value = [];
    tags.value = [];
    sprints.value = [];
  }

  let isRestoring = false;

  function storageKey() {
    const slug = opts.projectSlug.value;
    return slug ? `${FILTERS_STORAGE_KEY}-${slug}` : "";
  }

  function saveFilters() {
    const key = storageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(filters.value));
    } catch {
      // ignore
    }
  }

  function loadSavedFilters() {
    isRestoring = true;
    members.value = [];
    tags.value = [];
    sprints.value = [];
    const key = storageKey();
    try {
      if (key) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<TaskFilters>;
          filters.value = { ...defaultFilters, ...parsed };
        } else {
          filters.value = { ...defaultFilters };
        }
      } else {
        filters.value = { ...defaultFilters };
      }
      searchQuery.value = filters.value.search ?? "";
    } catch {
      filters.value = { ...defaultFilters };
      searchQuery.value = "";
    }
    isRestoring = false;
  }

  // Persist filters on every change
  watch(
    filters,
    () => {
      if (!isRestoring) {
        saveFilters();
      }
    },
    { deep: true },
  );

  // Load saved filters when project changes
  watch(
    () => opts.projectSlug.value,
    (newSlug, oldSlug) => {
      if (newSlug !== oldSlug) {
        loadSavedFilters();
      }
    },
    { immediate: true },
  );

  // Debounced search → backend
  watch(searchQuery, (val) => {
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      if (filters.value.search === val) return;
      filters.value = { ...filters.value, search: val };
      if (opts.isRemote.value) opts.onDataChanged();
    }, 400);
  });

  return {
    searchQuery,
    filters,
    filterSidebarOpen,
    members,
    tags,
    sprints,
    memberOptions,
    tagOptions,
    sprintOptions,
    priorityOptions,
    sortOptions,
    hasActiveFilters,
    activeFilterCount,
    buildTaskParams,
    clearAllFilters,
    loadFilterData,
    openFilterSidebar,
    updateFilter,
    resetFilters,
  };
}
