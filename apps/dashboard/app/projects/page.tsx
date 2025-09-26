'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { useProjects } from '../../hooks/useProjects';
import { useCohorts } from '../../hooks/useCohorts';
import { useEnrollments } from '../../hooks/useEnrollments';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { LoadingState } from '../../components/LoadingState';
import type { Project } from '../../types/projects';
import type { Cohort } from '../../types/cohorts';
import type { Enrollment } from '../../types/enrollments';

export default function ProjectsPage() {
  const session = useRequirePermission(['projects:read', 'projects:manage']);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(null);
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [updatingEnrollmentId, setUpdatingEnrollmentId] = useState<string | null>(null);
  const [recordingAttendanceId, setRecordingAttendanceId] = useState<string | null>(null);

  const { data: projects, error: projectsError, isLoading: loadingProjects } = useProjects();
  const activeProjectId = selectedProjectId ?? projects?.[0]?.id ?? null;
