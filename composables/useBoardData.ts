import { type Ref, type ComputedRef } from "vue";
import type { Task, TaskStatus, Board, TaskListParams } from "@/lib/types";
import type { WSMessage } from "@/composables/useWebSocket";
import { useI18n } from "@/composables/useI18n";
import { mapApiError } from "@/lib/apiErrors";

interface UseBoardDataOptions {
  tasks: Ref<Task[]>;
  statuses: Ref<TaskStatus[]>;
  boards: Ref<Board[]>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  projectSlug: ComputedRef<string>;
  isRemote: ComputedRef<boolean>;
  currentUserId: ComputedRef<number>;
  buildTaskParams: () => TaskListParams | undefined;
  listTasks: (
    slug: string,
    params?: TaskListParams,
  ) => Promise<{ tasks: Task[] }>;
  getStatuses: (slug: string) => Promise<TaskStatus[]>;
  getBoards: (slug: string) => Promise<Board[]>;
  onLockTask: (taskId: number, userId: number) => void;
  onUnlockTask: (taskId: number) => void;
}

export function useBoardData(opts: UseBoardDataOptions) {
  const { t } = useI18n();

  async function loadData() {
    opts.loading.value = true;
    opts.error.value = null;
    try {
      const params = opts.buildTaskParams();
      const [taskResp, statusList, boardList] = await Promise.all([
        opts.listTasks(opts.projectSlug.value, params),
        opts.getStatuses(opts.projectSlug.value),
        opts.getBoards(opts.projectSlug.value),
      ]);
      opts.tasks.value = taskResp.tasks;
      opts.statuses.value = statusList.sort((a, b) => a.position - b.position);
      opts.boards.value = boardList;
    } catch (e) {
      opts.error.value = mapApiError(e, t);
    } finally {
      opts.loading.value = false;
    }
  }

  async function silentRefresh() {
    try {
      const params = opts.buildTaskParams();
      const [taskResp, statusList, boardList] = await Promise.all([
        opts.listTasks(opts.projectSlug.value, params),
        opts.getStatuses(opts.projectSlug.value),
        opts.getBoards(opts.projectSlug.value),
      ]);

      // Merge tasks by ID to avoid full re-render
      const newTaskMap = new Map(taskResp.tasks.map((tk) => [tk.id, tk]));
      const merged: Task[] = [];
      const seen = new Set<number>();

      for (const old of opts.tasks.value) {
        const fresh = newTaskMap.get(old.id);
        if (fresh) {
          merged.push({ ...old, ...fresh });
          seen.add(old.id);
        }
      }
      for (const fresh of taskResp.tasks) {
        if (!seen.has(fresh.id)) {
          merged.push(fresh);
        }
      }
      opts.tasks.value = merged;

      const sortedStatuses = statusList.sort((a, b) => a.position - b.position);
      if (
        sortedStatuses.length !== opts.statuses.value.length ||
        sortedStatuses.some((s, i) => {
          const o = opts.statuses.value[i];
          return (
            !o ||
            o.id !== s.id ||
            o.name !== s.name ||
            o.color !== s.color ||
            o.isEnd !== s.isEnd ||
            o.position !== s.position
          );
        })
      ) {
        opts.statuses.value = sortedStatuses;
      }

      if (
        boardList.length !== opts.boards.value.length ||
        boardList.some((b, i) => {
          const o = opts.boards.value[i];
          return (
            !o ||
            o.id !== b.id ||
            o.name !== b.name ||
            o.position !== b.position
          );
        })
      ) {
        opts.boards.value = boardList;
      }
    } catch {
      // silent
    }
  }

  function handleWSMessage(msg: WSMessage) {
    switch (msg.type) {
      case "task.updated": {
        const task = msg.data.task as Task;
        const idx = opts.tasks.value.findIndex((tk) => tk.id === task.id);
        if (idx !== -1) {
          opts.tasks.value[idx] = {
            ...task,
            order: opts.tasks.value[idx].order,
          };
        }
        break;
      }
      case "task.created": {
        const task = msg.data.task as Task;
        if (!opts.tasks.value.some((tk) => tk.id === task.id)) {
          opts.tasks.value = [...opts.tasks.value, task];
        }
        break;
      }
      case "task.drag.start": {
        if (msg.data.userId !== opts.currentUserId.value) {
          opts.onLockTask(msg.data.taskId as number, msg.data.userId as number);
        }
        break;
      }
      case "task.drag.end": {
        if (msg.data.userId !== opts.currentUserId.value) {
          opts.onUnlockTask(msg.data.taskId as number);
        }
        break;
      }
      case "task.reordered": {
        const { statusId, taskIds } = msg.data as {
          statusId: number | null;
          taskIds: number[];
        };
        const sid = statusId ?? null;
        const taskMap = new Map(opts.tasks.value.map((tk) => [tk.id, tk]));
        const statusObj =
          sid != null
            ? (opts.statuses.value.find((s) => s.id === sid) ?? null)
            : null;
        const reorderedIds = new Set(taskIds as number[]);
        const otherTasks = opts.tasks.value.filter(
          (tk) => !reorderedIds.has(tk.id),
        );
        const reorderedPart: Task[] = [];
        for (let i = 0; i < taskIds.length; i++) {
          const task = taskMap.get(taskIds[i]);
          if (task) {
            reorderedPart.push({
              ...task,
              order: i,
              status: sid != null ? (statusObj as Task["status"]) : task.status,
            });
          }
        }
        opts.tasks.value = [...otherTasks, ...reorderedPart];
        break;
      }
    }
  }

  return {
    loadData,
    silentRefresh,
    handleWSMessage,
  };
}
