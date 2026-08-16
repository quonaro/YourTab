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
  };
}
