import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, computed, nextTick } from "vue";
import { useBoardFilters } from "@/composables/useBoardFilters";
import type { UserInfo, TaskTag, SprintInfo } from "@/lib/types";

function setup(opts: { remote?: boolean; slug?: string } = {}) {
  const isRemote = computed(() => opts.remote ?? true);
  const projectSlug = computed(() => opts.slug ?? "proj");
  const onDataChanged = vi.fn();
  const getProjectMembers = vi
    .fn<() => Promise<UserInfo[]>>()
    .mockResolvedValue([
      { id: 1, firstName: "Ann", lastName: "Lee" },
      { id: 2, username: "bob" },
      { id: 3, email: "c@x.io" },
      { id: 4 },
    ]);
  const getProjectTags = vi
    .fn<() => Promise<TaskTag[]>>()
    .mockResolvedValue([{ id: 7, name: "bug", color: "#f00" }]);
  const getProjectSprints = vi
    .fn<() => Promise<SprintInfo[]>>()
    .mockResolvedValue([
      { id: 5, name: "S1", isArchived: false },
      { id: 6, name: "Old", isArchived: true },
    ]);
  const api = useBoardFilters({
    isRemote,
    projectSlug,
    getProjectMembers,
    getProjectTags,
    getProjectSprints,
    onDataChanged,
  });
  return {
    api,
    onDataChanged,
    getProjectMembers,
    getProjectTags,
    getProjectSprints,
  };
}

describe("buildTaskParams", () => {
  beforeEach(() => localStorage.clear());

  it("returns undefined in local mode", () => {
    const { api } = setup({ remote: false });
    api.updateFilter({ priority: 3 });
    expect(api.buildTaskParams()).toBeUndefined();
  });

  it("omits empty fields in remote mode", () => {
    const { api } = setup();
    expect(api.buildTaskParams()).toEqual({
      search: undefined,
      assigneeIds: undefined,
      responsibleIds: undefined,
      createdByIds: undefined,
      tagIds: undefined,
      sprintIds: undefined,
      priority: undefined,
      sort: undefined,
      includeArchived: undefined,
    });
  });

  it("passes active filters through", () => {
    const { api } = setup();
    api.filters.value = {
      ...api.filters.value,
      search: "q",
      assigneeIds: [1, 2],
      tagIds: [7],
      priority: 4,
      sort: "title-asc",
      includeArchived: true,
    };
    expect(api.buildTaskParams()).toEqual({
      search: "q",
      assigneeIds: [1, 2],
      responsibleIds: undefined,
      createdByIds: undefined,
      tagIds: [7],
      sprintIds: undefined,
      priority: 4,
      sort: "title-asc",
      includeArchived: true,
    });
  });
});

describe("filter state", () => {
  beforeEach(() => localStorage.clear());

  it("reports hasActiveFilters and activeFilterCount", () => {
    const { api } = setup();
    expect(api.hasActiveFilters.value).toBe(false);
    expect(api.activeFilterCount.value).toBe(0);

    api.filters.value.assigneeIds = [1];
    api.filters.value.priority = 2;
    api.filters.value.includeArchived = true;
    expect(api.hasActiveFilters.value).toBe(true);
    expect(api.activeFilterCount.value).toBe(3);

    api.filters.value.sort = "priority-desc";
    expect(api.activeFilterCount.value).toBe(4);
    api.filters.value.sort = "default";
    expect(api.activeFilterCount.value).toBe(3);
  });

  it("updateFilter merges patch and notifies in remote mode", () => {
    const { api, onDataChanged } = setup();
    api.updateFilter({ priority: 1 });
    expect(api.filters.value.priority).toBe(1);
    expect(onDataChanged).toHaveBeenCalledTimes(1);
  });

  it("updateFilter does not notify in local mode", () => {
    const { api, onDataChanged } = setup({ remote: false });
    api.updateFilter({ priority: 1 });
    expect(onDataChanged).not.toHaveBeenCalled();
  });

  it("clearAllFilters resets everything", () => {
    const { api } = setup();
    api.filters.value.priority = 4;
    api.filters.value.assigneeIds = [1];
    api.searchQuery.value = "abc";
    api.clearAllFilters();
    expect(api.filters.value.priority).toBeNull();
    expect(api.filters.value.assigneeIds).toEqual([]);
    expect(api.searchQuery.value).toBe("");
  });
});

describe("filter data loading", () => {
  beforeEach(() => localStorage.clear());

  it("openFilterSidebar loads members, tags and sprints once", async () => {
    const { api, getProjectMembers } = setup();
    api.openFilterSidebar();
    await vi.waitFor(() => expect(api.members.value).toHaveLength(4));
    expect(api.tags.value).toHaveLength(1);
    expect(api.sprints.value).toHaveLength(2);

    api.openFilterSidebar();
    expect(getProjectMembers).toHaveBeenCalledTimes(1);
  });

  it("does not load filter data in local mode", async () => {
    const { api, getProjectMembers } = setup({ remote: false });
    api.openFilterSidebar();
    await nextTick();
    expect(getProjectMembers).not.toHaveBeenCalled();
    expect(api.members.value).toEqual([]);
  });

  it("tolerates load failures", async () => {
    const { api, getProjectMembers } = setup();
    getProjectMembers.mockRejectedValue(new Error("boom"));
    api.openFilterSidebar();
    await new Promise((r) => setTimeout(r, 0));
    expect(api.members.value).toEqual([]);
  });
});

describe("options", () => {
  beforeEach(() => localStorage.clear());

  it("builds member labels from name, username, email or id", async () => {
    const { api } = setup();
    api.openFilterSidebar();
    await vi.waitFor(() => expect(api.members.value).toHaveLength(4));
    expect(api.memberOptions.value.map((o) => o.label)).toEqual([
      "Ann Lee",
      "bob",
      "c@x.io",
      "4",
    ]);
  });

  it("excludes archived sprints from options", async () => {
    const { api } = setup();
    api.openFilterSidebar();
    await vi.waitFor(() => expect(api.sprints.value).toHaveLength(2));
    expect(api.sprintOptions.value.map((o) => o.value)).toEqual([5]);
  });

  it("hides deadline sorts in local mode", () => {
    const { api } = setup({ remote: false });
    const values = api.sortOptions.value.map((o) => o.value);
    expect(values.some((v) => v.startsWith("deadline-"))).toBe(false);
    const remote = setup();
    expect(
      remote.api.sortOptions.value.some((o) => o.value.startsWith("deadline-")),
    ).toBe(true);
  });
});

describe("persistence and debounced search", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists filters per project slug and restores them", async () => {
    const { api } = setup({ slug: "one" });
    api.updateFilter({ priority: 2, includeArchived: true });
    await nextTick();
    expect(
      JSON.parse(localStorage.getItem("yourtask-filters-one")!),
    ).toMatchObject({ priority: 2, includeArchived: true });

    const other = setup({ slug: "one" });
    await nextTick();
    expect(other.api.filters.value.priority).toBe(2);
    expect(other.api.filters.value.includeArchived).toBe(true);
    expect(other.api.searchQuery.value).toBe(
      other.api.filters.value.search ?? "",
    );
  });

  it("debounces search input into filters and triggers reload", async () => {
    const { api, onDataChanged } = setup();
    api.searchQuery.value = "typ";
    await nextTick();
    expect(api.filters.value.search).toBe("");
    await vi.advanceTimersByTimeAsync(400);
    expect(api.filters.value.search).toBe("typ");
    expect(onDataChanged).toHaveBeenCalledTimes(1);
  });
});
