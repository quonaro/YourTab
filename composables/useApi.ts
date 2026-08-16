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

    let response = await fetch(`${getApiBase()}${path}`, { ...options, headers });

    // Retry on expired/invalid access token
    if (response.status === 401 || response.status === 403) {
      const body = await response.json().catch(() => ({}));
      if (AUTH_ERRORS.has(body.detail)) {
        const refreshed = await refreshTokens();
        if (refreshed && tokens.value) {
          token = tokens.value.accessToken;
          headers["Authorization"] = `Bearer ${token}`;
          response = await fetch(`${getApiBase()}${path}`, { ...options, headers });
        } else {
          logout();
          throw new Error("Session expired");
        }
      }
    }

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

  async function listTasks(projectSlug: string): Promise<TaskListResponse> {
    return apiFetch<TaskListResponse>(`/projects/${projectSlug}/tasks`);
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

  return {
    apiFetch,
    getWorkspace,
    listTasks,
    updateTask,
    createTask,
    getBoards,
    getStatuses,
  };
}
