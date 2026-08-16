export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix timestamp in seconds
  user: {
    id: number;
    login: string;
    firstName?: string;
    lastName?: string;
  };
}

export interface Organization {
  id: number;
  slug: string;
  name: string;
  role?: string;
  permissions?: string[];
  subscriptionStatus?: string;
  planCode?: string;
  featureFlags?: Record<string, boolean>;
  limits?: Record<string, number>;
  memberAccessRestricted?: boolean;
}

export interface Project {
  id: number;
  slug: string;
  name: string;
  description?: string;
  organizationId: number;
  archived?: boolean;
  isFavorite?: boolean;
  role?: string;
  createdAt?: string;
}

export interface TaskStatus {
  id: number;
  name: string;
  color: string;
  isEnd: boolean;
  position: number;
  taskCount?: number;
}

export interface TaskAssignee {
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
}

export interface TaskStatusInfo {
  id: number;
  name: string;
  color: string;
  isEnd: boolean;
  position: number;
  taskCount?: number;
}

export interface ChildTaskInfo {
  id: number;
  shortId: string;
  title: string;
  statusIsEnd: boolean;
  statusName?: string;
  statusColor?: string;
  priority: number;
  endDate?: string | null;
}

export interface Task {
  id: number;
  shortId: string;
  title: string;
  description?: string;
  priority: number;
  endDate?: string;
  archived?: boolean;
  order: number;
  boardId?: number;
  parentTaskId?: number;
  childrenCount?: number;
  children?: ChildTaskInfo[];
  status?: TaskStatusInfo;
  assignees?: TaskAssignee[];
  responsibles?: TaskAssignee[];
  tags?: { id: number; name: string; color: string }[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Board {
  id: number;
  name: string;
  position: number;
}

export interface TaskListResponse {
  tasks: Task[];
}

export interface WorkspaceResponse {
  organizations: Organization[];
  projects: Project[];
}

export interface WorkspaceNested {
  organizations: (Organization & { projects: Project[] })[];
}

export interface UserInfo {
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
}

export interface TaskTag {
  id: number;
  name: string;
  color: string;
}

export interface SprintInfo {
  id: number;
  name: string;
  endDate?: string;
  isArchived?: boolean;
  isOrgSprint?: boolean;
}

export interface TaskFilters {
  search: string;
  assigneeIds: number[];
  responsibleIds: number[];
  createdByIds: number[];
  tagIds: number[];
  sprintIds: number[];
  priority: number | null;
  sort: string;
  includeArchived: boolean;
}

export interface TaskListParams {
  search?: string;
  assigneeIds?: number[];
  responsibleIds?: number[];
  createdByIds?: number[];
  tagIds?: number[];
  sprintIds?: number[];
  priority?: number | null;
  sort?: string;
  includeArchived?: boolean;
  parentOnly?: boolean;
}
