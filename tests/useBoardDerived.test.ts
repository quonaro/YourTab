import { describe, it, expect } from "vitest";
import { ref, computed } from "vue";
import { useBoardDerived } from "@/composables/useBoardDerived";
import type { Task, TaskStatus, Board, TaskFilters } from "@/lib/types";

const status = (id: number, name = `S${id}`, position = id): TaskStatus => ({
  id,
  name,
  color: "#000",
  isEnd: false,
  position,
});

const task = (over: Partial<Task> = {}): Task => ({
  id: 1,
  shortId: "T-1",
  title: "task",
  priority: 1,
  order: 0,
  ...over,
});

const defaultFilters = (): TaskFilters => ({
  search: "",
  assigneeIds: [],
  responsibleIds: [],
  createdByIds: [],
  tagIds: [],
  sprintIds: [],
  priority: null,
  sort: "default",
  includeArchived: false,
});

function setup(
  opts: { remote?: boolean; filters?: Partial<TaskFilters> } = {},
) {
  const tasks = ref<Task[]>([]);
  const statuses = ref<TaskStatus[]>([]);
  const boards = ref<Board[]>([]);
  const isRemote = computed(() => opts.remote ?? false);
  const filters = ref<TaskFilters>({ ...defaultFilters(), ...opts.filters });
  const derived = useBoardDerived({
    tasks,
    statuses,
    boards,
    isRemote,
    filters,
  });
  return { tasks, statuses, boards, filters, ...derived };
}

describe("displayTasks", () => {
  it("returns all tasks unfiltered in remote mode", () => {
    const s = setup({ remote: true, filters: { search: "nope", priority: 4 } });
    s.tasks.value = [task({ id: 1, title: "alpha" })];
    expect(s.displayTasks.value).toHaveLength(1);
  });

  it("excludes archived tasks unless includeArchived", () => {
    const s = setup();
    s.tasks.value = [task({ id: 1 }), task({ id: 2, archived: true })];
    expect(s.displayTasks.value.map((t) => t.id)).toEqual([1]);
    s.filters.value.includeArchived = true;
    expect(s.displayTasks.value).toHaveLength(2);
  });

  it("filters by priority", () => {
    const s = setup({ filters: { priority: 3 } });
    s.tasks.value = [
      task({ id: 1, priority: 3 }),
      task({ id: 2, priority: 1 }),
    ];
    expect(s.displayTasks.value.map((t) => t.id)).toEqual([1]);
  });

  it("matches search against title, shortId, description and status name", () => {
    const s = setup();
    s.statuses.value = [status(1, "Backlog")];
    s.tasks.value = [
      task({ id: 1, title: "Fix login page" }),
      task({ id: 2, title: "x", shortId: "WEB-77" }),
      task({ id: 3, title: "x", description: "deep dive" }),
      task({ id: 4, title: "x", status: status(1, "Backlog") }),
      task({ id: 5, title: "unrelated" }),
    ];

    s.filters.value.search = "login";
    expect(s.displayTasks.value.map((t) => t.id)).toEqual([1]);
    s.filters.value.search = "web-77";
    expect(s.displayTasks.value.map((t) => t.id)).toEqual([2]);
    s.filters.value.search = "deep";
    expect(s.displayTasks.value.map((t) => t.id)).toEqual([3]);
    s.filters.value.search = "backlog";
    expect(s.displayTasks.value.map((t) => t.id)).toEqual([4]);
  });

  it("matches search against assignees, responsibles and tags", () => {
    const s = setup();
    s.tasks.value = [
      task({
        id: 1,
        assignees: [{ id: 9, firstName: "Anna", lastName: "Smith" }],
      }),
      task({ id: 2, responsibles: [{ id: 8, username: "bob_dev" }] }),
      task({ id: 3, tags: [{ id: 5, name: "urgent", color: "#f00" }] }),
    ];
    s.filters.value.search = "anna";
    expect(s.displayTasks.value.map((t) => t.id)).toEqual([1]);
    s.filters.value.search = "bob_";
    expect(s.displayTasks.value.map((t) => t.id)).toEqual([2]);
    s.filters.value.search = "urgent";
    expect(s.displayTasks.value.map((t) => t.id)).toEqual([3]);
  });
});

describe("tasksByStatus / cells", () => {
  it("groups tasks by status and sorts by order", () => {
    const s = setup();
    s.statuses.value = [status(1), status(2)];
    s.tasks.value = [
      task({ id: 1, status: status(1), order: 5 }),
      task({ id: 2, status: status(1), order: 1 }),
      task({ id: 3, status: status(2), order: 0 }),
    ];
    expect(s.tasksByStatus.value.get(1)!.map((t) => t.id)).toEqual([2, 1]);
    expect(s.tasksByStatus.value.get(2)!.map((t) => t.id)).toEqual([3]);
  });

  it("ignores tasks with missing or unknown status", () => {
    const s = setup();
    s.statuses.value = [status(1)];
    s.tasks.value = [task({ id: 1 }), task({ id: 2, status: status(99) })];
    expect(s.tasksByStatus.value.get(1)).toEqual([]);
  });

  it("sorts with the chosen comparator in local mode only", () => {
    const s = setup({ filters: { sort: "title-asc" } });
    s.statuses.value = [status(1)];
    s.tasks.value = [
      task({ id: 1, title: "b", status: status(1), order: 0 }),
      task({ id: 2, title: "a", status: status(1), order: 1 }),
    ];
    expect(s.tasksByStatus.value.get(1)!.map((t) => t.title)).toEqual([
      "a",
      "b",
    ]);

    const r = setup({ remote: true, filters: { sort: "title-asc" } });
    r.statuses.value = [status(1)];
    r.tasks.value = [
      task({ id: 1, title: "b", status: status(1), order: 0 }),
      task({ id: 2, title: "a", status: status(1), order: 1 }),
    ];
    expect(r.tasksByStatus.value.get(1)!.map((t) => t.title)).toEqual([
      "b",
      "a",
    ]);
  });

  it("sort comparators cover deadline, priority and title", () => {
    const cases: Array<[string, string[]]> = [
      ["deadline-asc", ["a", "b", "c"]],
      // NOTE: deadline-desc currently sorts tasks without endDate first.
      ["deadline-desc", ["c", "b", "a"]],
      ["priority-desc", ["c", "a", "b"]],
      ["priority-asc", ["b", "a", "c"]],
      ["title-desc", ["c", "b", "a"]],
    ];
    for (const [sort, expected] of cases) {
      const s = setup({ filters: { sort } });
      s.statuses.value = [status(1)];
      s.tasks.value = [
        task({
          id: 1,
          title: "a",
          priority: 2,
          endDate: "2026-01-01",
          status: status(1),
        }),
        task({
          id: 2,
          title: "b",
          priority: 1,
          endDate: "2026-03-01",
          status: status(1),
        }),
        task({ id: 3, title: "c", priority: 3, status: status(1) }),
      ];
      expect(
        s.tasksByStatus.value.get(1)!.map((t) => t.title),
        sort,
      ).toEqual(expected);
    }
  });

  it("deadline sort puts tasks without endDate last", () => {
    const s = setup({ filters: { sort: "deadline-asc" } });
    s.statuses.value = [status(1)];
    s.tasks.value = [
      task({ id: 1, status: status(1) }),
      task({ id: 2, endDate: "2026-01-01", status: status(1) }),
      task({ id: 3, endDate: "2025-01-01", status: status(1) }),
    ];
    expect(s.tasksByStatus.value.get(1)!.map((t) => t.id)).toEqual([3, 2, 1]);
  });

  it("splits cell tasks and pile tasks by boardId", () => {
    const s = setup();
    s.statuses.value = [status(1)];
    s.boards.value = [{ id: 10, name: "B", position: 0 }];
    s.tasks.value = [
      task({ id: 1, status: status(1), boardId: 10 }),
      task({ id: 2, status: status(1) }),
    ];
    expect(s.tasksForCell(10, 1).map((t) => t.id)).toEqual([1]);
    expect(s.pileTasksForCell(1).map((t) => t.id)).toEqual([2]);
    expect(s.pileTasks.value.map((t) => t.id)).toEqual([2]);
  });

  it("builds board rows with their tasks", () => {
    const s = setup();
    s.statuses.value = [status(1)];
    s.boards.value = [
      { id: 10, name: "A", position: 0 },
      { id: 11, name: "B", position: 1 },
    ];
    s.tasks.value = [
      task({ id: 1, status: status(1), boardId: 11 }),
      task({ id: 2, status: status(1), boardId: 10 }),
    ];
    const rows = s.rows.value;
    expect(rows).toHaveLength(2);
    expect(rows[0].tasks.map((t) => t.id)).toEqual([2]);
    expect(rows[1].tasks.map((t) => t.id)).toEqual([1]);
  });
});
