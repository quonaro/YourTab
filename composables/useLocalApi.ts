import { ref } from "vue";
import * as db from "@/lib/localDb";
import { seedDevData } from "@/lib/seedDev";
import type {
  Task,
  TaskStatus,
  Project,
  Board,
  TaskListResponse,
} from "@/lib/types";

export function useLocalApi() {
  const projects = ref<Project[]>([]);
  const projectsLoading = ref(false);

  async function loadProjects(): Promise<Project[]> {
    projectsLoading.value = true;
    try {
      projects.value = await db.listProjects();
      return projects.value;
    } finally {
      projectsLoading.value = false;
    }
  }

  async function createProject(name: string): Promise<Project> {
    const project = await db.createProject(name);
    projects.value = [...projects.value, project];
    return project;
  }

  async function updateProject(id: number, name: string): Promise<Project> {
    const updated = await db.updateProject(id, name);
    projects.value = projects.value.map((p) => (p.id === id ? updated : p));
    return updated;
  }

  async function deleteProject(id: number): Promise<void> {
    await db.deleteProject(id);
    projects.value = projects.value.filter((p) => p.id !== id);
  }

  async function listTasks(projectSlug: string): Promise<TaskListResponse> {
    const project = await db.getProjectBySlug(projectSlug);
    if (!project) return { tasks: [] };
    return db.listTasks(project.id);
  }

  async function getStatuses(projectSlug: string): Promise<TaskStatus[]> {
    const project = await db.getProjectBySlug(projectSlug);
    if (!project) return [];
    return db.listStatuses(project.id);
  }

  async function createStatus(
    projectSlug: string,
    name: string,
    color: string,
    position: number,
    isEnd = false,
  ): Promise<TaskStatus> {
    const project = await db.getProjectBySlug(projectSlug);
    if (!project) throw new Error("Project not found");
    return db.createStatus(project.id, name, color, position, isEnd);
  }

  async function updateStatus(
    projectSlug: string,
    statusId: number,
    name: string,
    color: string,
    position: number,
    isEnd = false,
  ): Promise<TaskStatus> {
    const project = await db.getProjectBySlug(projectSlug);
    if (!project) throw new Error("Project not found");
    return db.updateStatus(project.id, statusId, name, color, position, isEnd);
  }

  async function deleteStatus(
    projectSlug: string,
    statusId: number,
  ): Promise<void> {
    const project = await db.getProjectBySlug(projectSlug);
    if (!project) throw new Error("Project not found");
    await db.deleteStatus(statusId);
  }

  async function updateTask(
    projectSlug: string,
    taskId: string,
    input: Record<string, unknown>,
  ): Promise<Task> {
    const project = await db.getProjectBySlug(projectSlug);
    if (!project) throw new Error("Project not found");
    return db.updateTask(project.id, Number(taskId), input);
  }

  async function createTask(
    projectSlug: string,
    input: { title: string; statusId?: number; boardId?: number },
  ): Promise<Task> {
    const project = await db.getProjectBySlug(projectSlug);
    if (!project) throw new Error("Project not found");
    if (!input.statusId) throw new Error("Status ID required");
    return db.createTask(
      project.id,
      input.title,
      input.statusId,
      input.boardId,
    );
  }

  async function getBoards(projectSlug: string): Promise<Board[]> {
    const project = await db.getProjectBySlug(projectSlug);
    if (!project) return [];
    await db.ensureDefaultBoard(project.id);
    return db.listBoards(project.id);
  }

  async function createBoard(
    projectSlug: string,
    name: string,
  ): Promise<Board> {
    const project = await db.getProjectBySlug(projectSlug);
    if (!project) throw new Error("Project not found");
    const existing = await db.listBoards(project.id);
    return db.createBoard(project.id, name, existing.length);
  }

  async function updateBoard(
    projectSlug: string,
    boardId: number,
    name: string,
  ): Promise<Board> {
    const project = await db.getProjectBySlug(projectSlug);
    if (!project) throw new Error("Project not found");
    return db.updateBoard(boardId, name);
  }

  async function deleteBoard(
    projectSlug: string,
    boardId: number,
  ): Promise<void> {
    const project = await db.getProjectBySlug(projectSlug);
    if (!project) throw new Error("Project not found");
    await db.deleteBoard(boardId);
  }

  async function seedIfEmpty(): Promise<void> {
    await db.seedDefaultData();
    await loadProjects();
  }

  async function seedDevIfEmpty(): Promise<void> {
    await seedDevData();
    await loadProjects();
  }

  return {
    projects,
    projectsLoading,
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
    createBoard,
    updateBoard,
    deleteBoard,
    seedIfEmpty,
    seedDevIfEmpty,
  };
}
