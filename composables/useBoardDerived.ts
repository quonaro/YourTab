import { ref, computed, watch, type Ref, type ComputedRef } from "vue";
import type { Task, TaskStatus, Board, TaskFilters } from "@/lib/types";

interface UseBoardDerivedOptions {
  tasks: Ref<Task[]>;
  statuses: Ref<TaskStatus[]>;
  boards: Ref<Board[]>;
  isRemote: ComputedRef<boolean>;
  filters: Ref<TaskFilters>;
}

export function useBoardDerived(opts: UseBoardDerivedOptions) {
  function getSortComparator(sort: string): (a: Task, b: Task) => number {
    switch (sort) {
      case "deadline-asc":
        return (a, b) => {
          if (!a.endDate && !b.endDate) return 0;
          if (!a.endDate) return 1;
          if (!b.endDate) return -1;
          return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
        };
      case "deadline-desc":
        return (a, b) => {
          if (!a.endDate && !b.endDate) return 0;
          if (!a.endDate) return -1;
          if (!b.endDate) return 1;
          return new Date(b.endDate).getTime() - new Date(a.endDate).getTime();
        };
      case "priority-desc":
        return (a, b) => b.priority - a.priority;
      case "priority-asc":
        return (a, b) => a.priority - b.priority;
      case "title-asc":
        return (a, b) => a.title.localeCompare(b.title);
      case "title-desc":
        return (a, b) => b.title.localeCompare(a.title);
      default:
        return (a, b) => (a.order ?? 0) - (b.order ?? 0);
    }
  }

  const displayTasks = computed<Task[]>(() => {
    if (opts.isRemote.value) return opts.tasks.value;
    const f = opts.filters.value;
    let result = opts.tasks.value;
    if (f.search) {
      const q = f.search.toLowerCase();
      result = result.filter((t) => {
        if (t.title.toLowerCase().includes(q)) return true;
        if (t.shortId?.toLowerCase().includes(q)) return true;
        if (t.description?.toLowerCase().includes(q)) return true;
        if (t.status?.name.toLowerCase().includes(q)) return true;
        const people = [...(t.assignees ?? []), ...(t.responsibles ?? [])];
        if (
          people.some((p) =>
            [p.firstName, p.lastName, p.username]
              .filter((s): s is string => !!s)
              .some((s) => s.toLowerCase().includes(q)),
          )
        )
          return true;
        if (t.tags?.some((tag) => tag.name.toLowerCase().includes(q)))
          return true;
        return false;
      });
    }
    if (f.priority != null) {
      result = result.filter((t) => t.priority === f.priority);
    }
    if (!f.includeArchived) {
      result = result.filter((t) => !t.archived);
    }
    return result;
  });

  const tasksByStatus = computed(() => {
    const map = new Map<number, Task[]>();
    for (const status of opts.statuses.value) map.set(status.id, []);
    for (const task of displayTasks.value) {
      const sid = task.status?.id;
      if (sid == null) continue;
      const arr = map.get(sid);
      if (arr) arr.push(task);
    }
    const sort = opts.filters.value.sort;
    for (const arr of map.values()) {
      if (!opts.isRemote.value && sort && sort !== "default") {
        arr.sort(getSortComparator(sort));
      } else {
        arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      }
    }
    return map;
  });

  function tasksForCell(boardId: number, statusId: number): Task[] {
    return (tasksByStatus.value.get(statusId) ?? []).filter(
      (t) => t.boardId === boardId,
    );
  }

  function pileTasksForCell(statusId: number): Task[] {
    return (tasksByStatus.value.get(statusId) ?? []).filter(
      (t) => t.boardId == null,
    );
  }

  const pileTasks = computed(() =>
    displayTasks.value.filter((t) => t.boardId == null),
  );

  const rows = computed(() =>
    opts.boards.value.map((b) => ({
      id: b.id,
      name: b.name,
      board: b,
      tasks: displayTasks.value.filter((t) => t.boardId === b.id),
    })),
  );

  return {
    displayTasks,
    tasksByStatus,
    tasksForCell,
    pileTasksForCell,
    pileTasks,
    rows,
  };
}
