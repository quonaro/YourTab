import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
  refreshTokens: vi.fn(),
  logout: vi.fn(),
  tokens: { value: null as { accessToken: string } | null },
}));

vi.mock("@/composables/useAuth", () => ({
  useAuth: () => ({
    getValidAccessToken: mocks.getValidAccessToken,
    refreshTokens: mocks.refreshTokens,
    logout: mocks.logout,
    tokens: ref(mocks.tokens.value),
  }),
}));

import { useApi } from "@/composables/useApi";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("apiFetch", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    mocks.getValidAccessToken.mockReset().mockResolvedValue("tok");
    mocks.refreshTokens.mockReset();
    mocks.logout.mockReset();
    mocks.tokens.value = null;
  });

  it("throws when there is no access token", async () => {
    mocks.getValidAccessToken.mockResolvedValue(null);
    const api = useApi();
    await expect(api.apiFetch("/x")).rejects.toThrow("Not authenticated");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the bearer token and returns parsed json", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const api = useApi();
    const result = await api.apiFetch<{ ok: boolean }>("/x");
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://yourtask.app/api/v1/x");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("refreshes the token once on auth errors and retries", async () => {
    mocks.tokens.value = { accessToken: "tok2" };
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ detail: "auth.token_expired" }, 401),
      )
      .mockResolvedValueOnce(jsonResponse({ done: 1 }));
    mocks.refreshTokens.mockResolvedValue(true);
    const api = useApi();
    const result = await api.apiFetch<{ done: number }>("/x");
    expect(result.done).toBe(1);
    expect(mocks.refreshTokens).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Second attempt used the refreshed token.
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
      "Bearer tok2",
    );
  });

  it("logs out when refresh fails on an auth error", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "auth.token_expired" }, 401),
    );
    mocks.refreshTokens.mockResolvedValue(false);
    const api = useApi();
    await expect(api.apiFetch("/x")).rejects.toThrow("Session expired");
    expect(mocks.logout).toHaveBeenCalled();
  });

  it("throws the response detail for non-auth errors without retrying", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "tasks.readonly" }, 403),
    );
    const api = useApi();
    await expect(api.apiFetch("/x")).rejects.toThrow("tasks.readonly");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.refreshTokens).not.toHaveBeenCalled();
  });

  it("retries 5xx responses with backoff", async () => {
    vi.useFakeTimers();
    try {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({}, 502))
        .mockResolvedValueOnce(jsonResponse({}, 500))
        .mockResolvedValueOnce(jsonResponse({ ok: 1 }));
      const api = useApi();
      const p = api.apiFetch<{ ok: number }>("/x");
      p.catch(() => {});
      await vi.runAllTimersAsync();
      expect((await p).ok).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries network errors and eventually throws", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      const api = useApi();
      const p = api.apiFetch("/x");
      p.catch(() => {});
      await vi.runAllTimersAsync();
      await expect(p).rejects.toThrow("fetch failed");
      // 1 initial + 3 retries
      expect(fetchMock).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("endpoint helpers", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    mocks.getValidAccessToken.mockResolvedValue("tok");
  });

  it("listTasks builds the query string", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ tasks: [] }));
    const api = useApi();
    await api.listTasks("proj", {
      search: "q",
      assigneeIds: [1, 2],
      priority: 3,
      sort: "title-asc",
      includeArchived: true,
      parentOnly: true,
    });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/projects/proj/tasks?");
    expect(url).toContain("search=q");
    expect(url).toContain("assignee_ids=1%2C2");
    expect(url).toContain("priority=3");
    expect(url).toContain("sort=title-asc");
    expect(url).toContain("include_archived=true");
    expect(url).toContain("parent_only=true");
  });

  it("listTasks omits params entirely when none given", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ tasks: [] }));
    const api = useApi();
    await api.listTasks("proj");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://yourtask.app/api/v1/projects/proj/tasks",
    );
  });

  it("getWorkspace nests projects under their organizations", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        organizations: [
          { id: 1, slug: "a", name: "A" },
          { id: 2, slug: "b", name: "B" },
        ],
        projects: [
          { id: 10, slug: "p1", name: "P1", organizationId: 1 },
          { id: 11, slug: "p2", name: "P2", organizationId: 1 },
        ],
      }),
    );
    const api = useApi();
    const ws = await api.getWorkspace();
    expect(ws.organizations[0].projects.map((p) => p.id)).toEqual([10, 11]);
    expect(ws.organizations[1].projects).toEqual([]);
  });

  it("updateTask unwraps the task envelope", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ task: { id: 5, title: "t" } }));
    const api = useApi();
    const t = await api.updateTask("proj", "5", { title: "t" });
    expect(t.id).toBe(5);
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
  });

  it("reorderTasks posts taskIds", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const api = useApi();
    await api.reorderTasks("proj", 3, [9, 8, 7]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/projects/proj/tasks/reorder");
    expect(JSON.parse(init.body)).toEqual({ statusId: 3, taskIds: [9, 8, 7] });
  });
});
