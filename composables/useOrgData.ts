import { computed, type Ref } from "vue";
import { useApi } from "./useApi";
import { useLocalApi } from "./useLocalApi";
import type {
  Task,
  TaskStatus,
  Project,
  Board,
  TaskListResponse,
  UserInfo,
  TaskTag,
  SprintInfo,
  TaskListParams,
} from "@/lib/types";

export type OrgType = "local" | "remote";

export interface OrgEntry {
  type: OrgType;
  slug: string;
  name: string;
}

export function useOrgData(
  orgType: Ref<OrgType>,
  _orgSlug: Ref<string | null>,
) {
  const remoteApi = useApi();
  const localApi = useLocalApi();

  const isLocal = computed(() => orgType.value === "local");

  async function loadProjects(): Promise<Project[]> {
    if (isLocal.value) {
      return localApi.loadProjects();
    }
    // Remote projects are loaded via getWorkspace in Breadcrumbs
    return [];
  }

  async function listTasks(
    projectSlug: string,
    params?: TaskListParams,
  ): Promise<TaskListResponse> {
    if (isLocal.value) return localApi.listTasks(projectSlug);
    return remoteApi.listTasks(projectSlug, params);
  }

  async function getStatuses(projectSlug: string): Promise<TaskStatus[]> {
    if (isLocal.value) return localApi.getStatuses(projectSlug);
    return remoteApi.getStatuses(projectSlug);
  }

  async function createStatus(
    projectSlug: string,
    name: string,
    color: string,
    position: number,
    isEnd = false,
  ): Promise<TaskStatus> {
    if (isLocal.value)
      return localApi.createStatus(projectSlug, name, color, position, isEnd);
    return remoteApi.createStatus(projectSlug, name, color, position, isEnd);
  }

  async function updateStatus(
    projectSlug: string,
    statusId: number,
    name: string,
    color: string,
    position: number,
    isEnd = false,
  ): Promise<TaskStatus> {
    if (isLocal.value)
      return localApi.updateStatus(
        projectSlug,
        statusId,
        name,
        color,
        position,
        isEnd,
      );
    return remoteApi.updateStatus(projectSlug, statusId, {
      name,
      color,
      isEnd,
      position,
    });
  }

  async function deleteStatus(
    projectSlug: string,
    statusId: number,
  ): Promise<void> {
    if (isLocal.value) return localApi.deleteStatus(projectSlug, statusId);
    const statuses = await remoteApi.getStatuses(projectSlug);
    const fallback = statuses.find((s) => s.id !== statusId);
    if (!fallback) throw new Error("Cannot delete the only remaining status");
    await remoteApi.deleteStatus(projectSlug, statusId, fallback.id);
  }

  async function updateTask(
    projectSlug: string,
    taskId: string,
    input: Record<string, unknown>,
  ): Promise<Task> {
    if (isLocal.value) return localApi.updateTask(projectSlug, taskId, input);
    return remoteApi.updateTask(projectSlug, taskId, input);
  }

  async function createTask(
    projectSlug: string,
    input: { title: string; statusId?: number; boardId?: number },
  ): Promise<Task> {
    if (isLocal.value) return localApi.createTask(projectSlug, input);
    return remoteApi.createTask(projectSlug, input);
  }

  async function getBoards(projectSlug: string): Promise<Board[]> {
    if (isLocal.value) return localApi.getBoards(projectSlug);
    return remoteApi.getBoards(projectSlug);
  }

  async function getProjectMembers(projectSlug: string): Promise<UserInfo[]> {
    if (isLocal.value) return [];
    return remoteApi.getProjectMembers(projectSlug);
  }

  async function getProjectTags(projectSlug: string): Promise<TaskTag[]> {
    if (isLocal.value) return [];
    return remoteApi.getProjectTags(projectSlug);
  }

  async function getProjectSprints(projectSlug: string): Promise<SprintInfo[]> {
    if (isLocal.value) return [];
    return remoteApi.getProjectSprints(projectSlug);
  }

  async function createBoard(
    projectSlug: string,
    name: string,
  ): Promise<Board> {
    if (isLocal.value) return localApi.createBoard(projectSlug, name);
    return remoteApi.createBoard(projectSlug, name, 0);
  }

  async function updateBoard(
    projectSlug: string,
    boardId: number,
    name: string,
  ): Promise<Board> {
    if (isLocal.value) return localApi.updateBoard(projectSlug, boardId, name);
    return remoteApi.updateBoard(projectSlug, boardId, name);
  }

  async function deleteBoard(
    projectSlug: string,
    boardId: number,
  ): Promise<void> {
    if (isLocal.value) return localApi.deleteBoard(projectSlug, boardId);
    await remoteApi.deleteBoard(projectSlug, boardId);
  }

  async function dragTask(
    projectSlug: string,
    taskId: string,
    action: "start" | "end",
  ): Promise<void> {
    if (isLocal.value) return;
    return remoteApi.dragTask(projectSlug, taskId, action);
  }

  async function reorderTasks(
    projectSlug: string,
    statusId: number | null,
    taskIds: number[],
  ): Promise<void> {
    if (isLocal.value) return;
    return remoteApi.reorderTasks(projectSlug, statusId, taskIds);
  }

  async function createProject(name: string): Promise<Project> {
    if (isLocal.value) return localApi.createProject(name);
    // Remote project creation is handled via the web app, not the extension API
    throw new Error(
      "Remote project creation is not available in the extension",
    );
  }

  async function updateProject(
    id: number,
    name: string,
    slug?: string,
  ): Promise<Project> {
    if (isLocal.value) return localApi.updateProject(id, name);
    if (!slug) throw new Error("Project slug is required for remote update");
    return remoteApi.updateProject(slug, name);
  }

  async function deleteProject(id: number, slug?: string): Promise<void> {
    if (isLocal.value) return localApi.deleteProject(id);
    if (!slug) throw new Error("Project slug is required for remote deletion");
    await remoteApi.deleteProject(slug);
  }

  async function seedIfEmpty(): Promise<void> {
    if (isLocal.value) return localApi.seedIfEmpty();
  }

  async function seedDevIfEmpty(): Promise<void> {
    if (isLocal.value) return localApi.seedDevIfEmpty();
  }

  return {
    isLocal,
    projects: localApi.projects,
    projectsLoading: localApi.projectsLoading,
    loadProjects,
    createProject,
    updateProject,
    deleteProject,
    listTasks,
    getStatuses,
    createStatus,
    updateStatus,
    deleteStatus,
    updateTask,
    createTask,
    getBoards,
    getProjectMembers,
    getProjectTags,
    getProjectSprints,
    createBoard,
    updateBoard,
    deleteBoard,
    dragTask,
    reorderTasks,
    seedIfEmpty,
    seedDevIfEmpty,
  };
}
