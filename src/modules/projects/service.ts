import { AppError, NotFoundError } from '../../shared/errors';
import {
  CohortRecord,
  ProjectRecord,
  createCohort as createCohortRepository,
  createProject as createProjectRepository,
  getProject,
  listCohortsByProject,
  listProjects as listProjectsRepository,
  updateProject as updateProjectRepository,
} from './repository';

export async function createProject(input: {
  name: string;
  slug?: string | null;
  description?: string | null;
  active?: boolean;
}): Promise<ProjectRecord> {
  return createProjectRepository(input);
}

export async function updateProject(id: string, input: {
  name?: string;
  slug?: string | null;
  description?: string | null;
  active?: boolean;
}): Promise<ProjectRecord> {
  return updateProjectRepository(id, input);
}

export async function listProjects(params: { includeInactive?: boolean }): Promise<ProjectRecord[]> {
  return listProjectsRepository(params);
}

export async function getProjectOrFail(id: string): Promise<ProjectRecord> {
  const project = await getProject(id);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  return project;
}

export async function createCohort(projectId: string, input: {
  code?: string | null;
  weekday: number;
  shift: string;
  startTime: string;
  endTime: string;
  capacity?: number | null;
  location?: string | null;
  educatorIds: string[];
}): Promise<CohortRecord> {
  if (input.startTime >= input.endTime) {
    throw new AppError('endTime must be after startTime', 400);
  }

  return createCohortRepository(projectId, input);
}

export async function listCohorts(projectId: string): Promise<CohortRecord[]> {
  return listCohortsByProject(projectId);
}
