import { ref, type Ref, type ComputedRef } from "vue";
import type { Task } from "@/lib/types";
import { useI18n } from "@/composables/useI18n";
import { mapApiError } from "@/lib/apiErrors";

interface UseBoardTaskOpsOptions {
  tasks: Ref<Task[]>;
  projectSlug: ComputedRef<string>;
  readOnly: ComputedRef<boolean>;
  createTask: (
    slug: string,
    input: { title: string; statusId: number; boardId?: number },
  ) => Promise<Task>;
  updateTask: (
    slug: string,
    id: string,
    input: Record<string, unknown>,
  ) => Promise<Task>;
}

export function useBoardTaskOps(opts: UseBoardTaskOpsOptions) {
  const { t } = useI18n();
  const newTaskInputs = ref<Record<string, string>>({});

  async function handleCreateTask(
    boardId: number | null,
    statusId: number,
  ): Promise<string | null> {
    const key = `${boardId ?? "pile"}-${statusId}`;
    const title = newTaskInputs.value[key]?.trim();
    if (!title) return null;
    if (opts.readOnly.value) {
      return t("board.readOnlyError");
    }
    try {
      const created = await opts.createTask(opts.projectSlug.value, {
        title,
        statusId,
        boardId: boardId ?? undefined,
      });
      newTaskInputs.value[key] = "";
      if (!opts.tasks.value.some((tk) => tk.id === created.id)) {
        opts.tasks.value = [...opts.tasks.value, created];
      }
      return null;
    } catch (e) {
      return mapApiError(e, t);
    }
  }

  async function archiveTask(taskId: number): Promise<string | null> {
    if (opts.readOnly.value) {
      return t("board.readOnlyError");
    }
    try {
      await opts.updateTask(opts.projectSlug.value, String(taskId), {
        archived: true,
      });
      const idx = opts.tasks.value.findIndex((tk) => tk.id === taskId);
      if (idx !== -1) {
        opts.tasks.value[idx] = { ...opts.tasks.value[idx], archived: true };
      }
      return null;
    } catch (e) {
      return mapApiError(e, t);
    }
  }

  async function unarchiveTask(taskId: number): Promise<string | null> {
    if (opts.readOnly.value) {
      return t("board.readOnlyError");
    }
    try {
      await opts.updateTask(opts.projectSlug.value, String(taskId), {
        archived: false,
      });
      const idx = opts.tasks.value.findIndex((tk) => tk.id === taskId);
      if (idx !== -1) {
        opts.tasks.value[idx] = { ...opts.tasks.value[idx], archived: false };
      }
      return null;
    } catch (e) {
      return mapApiError(e, t);
    }
  }

  function updateNewTaskInput(key: string, value: string) {
    newTaskInputs.value[key] = value;
  }

  return {
    newTaskInputs,
    handleCreateTask,
    archiveTask,
    unarchiveTask,
    updateNewTaskInput,
  };
}
