import { describe, it, expect, vi } from "vitest";
import { ref } from "vue";

const remote = vi.hoisted(() => ({
  listTasks: vi.fn(),
  getStatuses: vi.fn(),
  createStatus: vi.fn(),
  updateStatus: vi.fn(),
  deleteStatus: vi.fn(),
  updateTask: vi.fn(),
  createTask: vi.fn(),
  getBoards: vi.fn(),
  getProjectMembers: vi.fn(),
  getProjectTags: vi.fn(),
  getProjectSprints: vi.fn(),
  createBoard: vi.fn(),
  updateBoard: vi.fn(),
  deleteBoard: vi.fn(),
  dragTask: vi.fn(),
  reorderTasks: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}));

const local = vi.hoisted(() => ({
  listTasks: vi.fn(),
  getStatuses: vi.fn(),
  createStatus: vi.fn(),
  updateStatus: vi.fn(),
  deleteStatus: vi.fn(),
  updateTask: vi.fn(),
  createTask: vi.fn(),
  getBoards: vi.fn(),
  createBoard: vi.fn(),
  updateBoard: vi.fn(),
  deleteBoard: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  loadProjects: vi.fn(),
  seedIfEmpty: vi.fn(),
  seedDevIfEmpty: vi.fn(),
  projects: { value: [] },
  projectsLoading: { value: false },
}));

vi.mock("@/composables/useApi", () => ({ useApi: () => remote }));
vi.mock("@/composables/useLocalApi", () => ({ useLocalApi: () => local }));

import { useOrgData, type OrgType } from "@/composables/useOrgData";
import { beforeEach } from "vitest";

beforeEach(() => {
  for (const f of Object.values(remote)) f.mockReset?.();
  for (const f of Object.values(local)) f.mockReset?.();
});

function setup(type: OrgType = "local") {
  const orgType = ref<OrgType>(type);
  const orgSlug = ref<string | null>("acme");
  const api = useOrgData(orgType, orgSlug);
  return { api, orgType };
}

describe("local / remote dispatch", () => {
  it("routes reads to local in local mode", async () => {
    const { api } = setup("local");
    await api.listTasks("p");
    await api.getStatuses("p");
    await api.getBoards("p");
    expect(local.listTasks).toHaveBeenCalledWith("p");
    expect(local.getStatuses).toHaveBeenCalledWith("p");
    expect(local.getBoards).toHaveBeenCalledWith("p");
    expect(remote.listTasks).not.toHaveBeenCalled();
  });

  it("routes reads to remote in remote mode and passes filter params", async () => {
    const { api } = setup("remote");
    const params = { search: "x", priority: 1 };
    await api.listTasks("p", params);
    expect(remote.listTasks).toHaveBeenCalledWith("p", params);
    expect(local.listTasks).not.toHaveBeenCalled();
  });

  it("members/tags/sprints are empty locally", async () => {
    const { api } = setup("local");
    expect(await api.getProjectMembers("p")).toEqual([]);
    expect(await api.getProjectTags("p")).toEqual([]);
    expect(await api.getProjectSprints("p")).toEqual([]);
    expect(remote.getProjectMembers).not.toHaveBeenCalled();
  });

  it("members/tags/sprints delegate remotely", async () => {
    const { api } = setup("remote");
    await api.getProjectMembers("p");
    await api.getProjectTags("p");
    await api.getProjectSprints("p");
    expect(remote.getProjectMembers).toHaveBeenCalledWith("p");
    expect(remote.getProjectTags).toHaveBeenCalledWith("p");
    expect(remote.getProjectSprints).toHaveBeenCalledWith("p");
  });

  it("dragTask and reorderTasks are no-ops locally", async () => {
    const { api } = setup("local");
    await api.dragTask("p", "1", "start");
    await api.reorderTasks("p", 1, [1, 2]);
    expect(remote.dragTask).not.toHaveBeenCalled();
    expect(remote.reorderTasks).not.toHaveBeenCalled();
  });
});

describe("status updates and deletion", () => {
  it("updateStatus maps positional signature for remote", async () => {
    const { api } = setup("remote");
    await api.updateStatus("p", 5, "N", "#fff", 2, true);
    expect(remote.updateStatus).toHaveBeenCalledWith("p", 5, {
      name: "N",
      color: "#fff",
      isEnd: true,
      position: 2,
    });
  });

  it("deleteStatus picks a fallback status remotely", async () => {
    remote.getStatuses.mockResolvedValue([
      { id: 5, name: "a", color: "", isEnd: false, position: 0 },
      { id: 6, name: "b", color: "", isEnd: false, position: 1 },
    ]);
    const { api } = setup("remote");
    await api.deleteStatus("p", 5);
    expect(remote.deleteStatus).toHaveBeenCalledWith("p", 5, 6);
  });

  it("deleteStatus refuses to delete the only remaining status", async () => {
    remote.getStatuses.mockResolvedValue([
      { id: 5, name: "a", color: "", isEnd: false, position: 0 },
    ]);
    const { api } = setup("remote");
    await expect(api.deleteStatus("p", 5)).rejects.toThrow(
      "Cannot delete the only remaining status",
    );
    expect(remote.deleteStatus).not.toHaveBeenCalled();
  });
});

describe("project operations", () => {
  it("createProject throws in remote mode", async () => {
    const { api } = setup("remote");
    await expect(api.createProject("X")).rejects.toThrow(
      "Remote project creation is not available",
    );
  });

  it("updateProject/deleteProject need a slug remotely", async () => {
    const { api } = setup("remote");
    await expect(api.updateProject(1, "X")).rejects.toThrow("slug is required");
    await expect(api.deleteProject(1)).rejects.toThrow("slug is required");
    await api.updateProject(1, "X", "slug-x");
    await api.deleteProject(1, "slug-x");
    expect(remote.updateProject).toHaveBeenCalledWith("slug-x", "X");
    expect(remote.deleteProject).toHaveBeenCalledWith("slug-x");
  });

  it("project ops use the numeric id locally", async () => {
    const { api } = setup("local");
    await api.createProject("X");
    await api.updateProject(1, "X2");
    await api.deleteProject(1);
    expect(local.createProject).toHaveBeenCalledWith("X");
    expect(local.updateProject).toHaveBeenCalledWith(1, "X2");
    expect(local.deleteProject).toHaveBeenCalledWith(1);
  });

  it("seeds only in local mode", async () => {
    const l = setup("local");
    await l.api.seedIfEmpty();
    await l.api.seedDevIfEmpty();
    expect(local.seedIfEmpty).toHaveBeenCalled();
    expect(local.seedDevIfEmpty).toHaveBeenCalled();

    const r = setup("remote");
    await r.api.seedIfEmpty();
    await r.api.seedDevIfEmpty();
    // still exactly one call — remote never triggers seeds
    expect(local.seedIfEmpty).toHaveBeenCalledTimes(1);
  });
});
