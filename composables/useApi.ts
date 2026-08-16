import { useAuth } from "./useAuth";
import { getApiBase } from "@/lib/config";
import type {
  Task,
  TaskListResponse,
  WorkspaceResponse,
  WorkspaceNested,
  Board,
  TaskStatus,
  Project,
  UserInfo,
  TaskTag,
  SprintInfo,
  TaskListParams,
} from "@/lib/types";

const AUTH_ERRORS = new Set([
  "auth.invalid_token",
  "auth.token_expired",
  "auth.no_access_token",
  "auth.invalid_access_token",
  "auth.refresh_token_not_found",
  "auth.refresh_token_revoked",
  "auth.refresh_token_expired",
  "auth.refresh_failed",
  "auth.user_inactive",
  "auth.unauthorized",
]);

export function useApi() {
  const { getValidAccessToken, refreshTokens, tokens, logout } = useAuth();

  const MAX_RETRIES = 3;
  const BASE_DELAY = 500;

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    let token = await getValidAccessToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    };

    let response: Response | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        response = await fetch(`${getApiBase()}${path}`, { ...options, headers });
      } catch (err) {
        // Network error — retry with backoff
        if (attempt < MAX_RETRIES) {
          await sleep(BASE_DELAY * 2 ** attempt);
          continue;
        }
        throw new Error(err instanceof Error ? err.message : "Network error");
      }

      // Retry on expired/invalid access token (only on first attempt)
      if ((response.status === 401 || response.status === 403) && attempt === 0) {
        const body = await response.json().catch(() => ({}));
        if (AUTH_ERRORS.has(body.detail)) {
          const refreshed = await refreshTokens();
          if (refreshed && tokens.value) {
            token = tokens.value.accessToken;
            headers["Authorization"] = `Bearer ${token}`;
            continue;
          } else {
            logout();
            throw new Error("Session expired");
          }
        }
      }

      // Retry on 5xx with backoff
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await sleep(BASE_DELAY * 2 ** attempt);
        continue;
      }

      break;
    }

    if (!response) throw new Error("Request failed");

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || body.title || `API error: ${response.status}`);
    }

    return response.json();
  }

  async function getWorkspace(): Promise<WorkspaceNested> {
    const resp = await apiFetch<WorkspaceResponse>("/workspace");
    const projectsByOrg = new Map<number, Project[]>();
    for (const p of resp.projects) {
      const arr = projectsByOrg.get(p.organizationId) ?? [];
      arr.push(p);
      projectsByOrg.set(p.organizationId, arr);
    }
    return {
      organizations: resp.organizations.map((o) => ({
        ...o,
        projects: projectsByOrg.get(o.id) ?? [],
      })),
    };
  }

  async function listTasks(
    projectSlug: string,
    params?: TaskListParams,
  ): Promise<TaskListResponse> {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.assigneeIds?.length)
      query.set("assignee_ids", params.assigneeIds.join(","));
    if (params?.responsibleIds?.length)
      query.set("responsible_ids", params.responsibleIds.join(","));
    if (params?.createdByIds?.length)
      query.set("created_by_ids", params.createdByIds.join(","));
    if (params?.tagIds?.length)
      query.set("tag_ids", params.tagIds.join(","));
    if (params?.sprintIds?.length)
      query.set("sprint_ids", params.sprintIds.join(","));
    if (params?.priority != null)
      query.set("priority", String(params.priority));
    if (params?.sort && params.sort !== "default")
      query.set("sort", params.sort);
    if (params?.includeArchived) query.set("include_archived", "true");
    if (params?.parentOnly) query.set("parent_only", "true");
    const qs = query.toString();
    return apiFetch<TaskListResponse>(
      `/projects/${projectSlug}/tasks${qs ? `?${qs}` : ""}`,
    );
  }

  async function updateTask(
    projectSlug: string,
    taskId: string,
    input: Record<string, unknown>,
  ): Promise<Task> {
    const resp = await apiFetch<{ task: Task } & Record<string, unknown>>(
      `/projects/${projectSlug}/tasks/${taskId}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
    return resp.task ?? resp;
  }

  async function createTask(
    projectSlug: string,
    input: { title: string; statusId?: number; boardId?: number },
  ): Promise<Task> {
    const resp = await apiFetch<{ task: Task }>(
      `/projects/${projectSlug}/tasks`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
    return resp.task;
  }

  async function getBoards(projectSlug: string): Promise<Board[]> {
    const resp = await apiFetch<{ boards: Board[] }>(`/projects/${projectSlug}/boards`);
    return resp.boards ?? [];
  }

  async function getStatuses(projectSlug: string): Promise<TaskStatus[]> {
    const resp = await apiFetch<{ statuses: TaskStatus[] }>(`/projects/${projectSlug}/statuses`);
    return resp.statuses ?? [];
  }

  async function getProjectMembers(projectSlug: string): Promise<UserInfo[]> {
    const resp = await apiFetch<{ members: UserInfo[] }>(
      `/projects/${projectSlug}/members`,
    );
    return resp.members ?? [];
  }

  async function getProjectTags(projectSlug: string): Promise<TaskTag[]> {
    const resp = await apiFetch<{ tags: TaskTag[] }>(
      `/projects/${projectSlug}/tags`,
    );
    return resp.tags ?? [];
  }

  async function getProjectSprints(projectSlug: string): Promise<SprintInfo[]> {
    const resp = await apiFetch<{ sprints: SprintInfo[] }>(
      `/projects/${projectSlug}/sprints`,
    );
    return resp.sprints ?? [];
  }

  async function reorderTasks(
    projectSlug: string,
    statusId: number | null,
    taskIds: number[],
  ): Promise<void> {
    await apiFetch(`/projects/${projectSlug}/tasks/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ statusId, taskIds }),
    });
  }

  async function dragTask(
    projectSlug: string,
    taskId: string,
    action: "start" | "end",
  ): Promise<void> {
    await apiFetch(`/projects/${projectSlug}/tasks/${taskId}/drag`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
  }

  async function createStatus(
    projectSlug: string,
    name: string,
    color: string,
    position: number,
    isEnd = false,
  ): Promise<TaskStatus> {
    const resp = await apiFetch<{ status: TaskStatus }>(
      `/projects/${projectSlug}/statuses`,
      {
        method: "POST",
        body: JSON.stringify({ name, color, isEnd }),
      },
    );
    return resp.status;
  }

  async function updateStatus(
    projectSlug: string,
    statusId: number,
    input: { name?: string; color?: string; isEnd?: boolean; position?: number },
  ): Promise<TaskStatus> {
    const resp = await apiFetch<{ status: TaskStatus }>(
      `/projects/${projectSlug}/statuses/${statusId}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
    return resp.status;
  }

  async function deleteStatus(
    projectSlug: string,
    statusId: number,
    moveToStatusId: number,
  ): Promise<void> {
    await apiFetch(`/projects/${projectSlug}/statuses/${statusId}`, {
      method: "DELETE",
      body: JSON.stringify({ moveToStatusId }),
    });
  }

  async function createBoard(
    projectSlug: string,
    name: string,
    _position: number,
  ): Promise<Board> {
    const resp = await apiFetch<{ board: Board }>(
      `/projects/${projectSlug}/boards`,
      {
        method: "POST",
        body: JSON.stringify({ name }),
      },
    );
    return resp.board;
  }

  async function updateBoard(
    projectSlug: string,
    boardId: number,
    name: string,
  ): Promise<Board> {
    const resp = await apiFetch<{ board: Board }>(
      `/projects/${projectSlug}/boards/${boardId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ name }),
      },
    );
    return resp.board;
  }

  async function deleteBoard(
    projectSlug: string,
    boardId: number,
    moveToBoardId?: number,
  ): Promise<void> {
    await apiFetch(`/projects/${projectSlug}/boards/${boardId}`, {
      method: "DELETE",
      body: JSON.stringify(moveToBoardId ? { moveToBoardId } : {}),
    });
  }

  async function updateProject(
    projectSlug: string,
    name: string,
    description?: string,
  ): Promise<Project> {
    const resp = await apiFetch<Project>(
      `/projects/${projectSlug}`,
      {
        method: "PATCH",
        body: JSON.stringify({ name, description }),
      },
    );
    return resp;
  }

  async function deleteProject(projectSlug: string): Promise<void> {
    await apiFetch(`/projects/${projectSlug}`, {
      method: "DELETE",
      body: JSON.stringify({ confirmName: projectSlug }),
    });
  }

  return {
    apiFetch,
    getWorkspace,
    listTasks,
    updateTask,
    createTask,
    getBoards,
    getStatuses,
    getProjectMembers,
    getProjectTags,
    getProjectSprints,
    reorderTasks,
    dragTask,
    createStatus,
    updateStatus,
    deleteStatus,
    createBoard,
    updateBoard,
    deleteBoard,
    updateProject,
    deleteProject,
  };
}
