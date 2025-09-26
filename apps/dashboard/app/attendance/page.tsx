'use client';

import { useEffect, useMemo, useState } from 'react';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useProjects, useCohorts } from '../../hooks/useProjects';
import { useAttendance, useEnrollments } from '../../hooks/useAttendance';
import { post } from '../../lib/api';
import { LoadingState } from '../../components/LoadingState';
import type { AttendanceStatus } from '../../types/attendance';

interface ParticipantRow {
  enrollmentId: string;
  beneficiaryId: string;
  name: string;
  vulnerabilities: string[];
  enrollmentStatus: string;
}

const statusOptions: { value: AttendanceStatus; label: string }[] = [
  { value: 'present', label: 'Presente' },
  { value: 'absent', label: 'Ausente' },
  { value: 'justified', label: 'Falta Justificada' },
  { value: 'late', label: 'Atrasado' },
];

export default function AttendancePage() {
  const session = useRequirePermission(['attendance:manage']);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(null);
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: projects, error: projectsError, isLoading: loadingProjects } = useProjects();
  const { data: cohorts, error: cohortsError, isLoading: loadingCohorts } = useCohorts(selectedProjectId);
  
  const activeProjectId = selectedProjectId ?? projects?.[0]?.id ?? null;
  const activeCohortId = selectedCohortId ?? cohorts?.[0]?.id ?? null;

  const {
    data: enrollments,
    error: enrollmentsError,
    isLoading: loadingEnrollments,
    mutate: mutateEnrollments,
  } = useEnrollments(activeCohortId);

  const {
    data: attendance,
    error: attendanceError,
    isLoading: loadingAttendance,
    mutate: mutateAttendance,
  } = useAttendance(activeCohortId, attendanceDate);

  const [localAttendance, setLocalAttendance] = useState<Record<string, AttendanceStatus>>(
    () => attendance ?? {},
  );

  useEffect(() => {
    if (attendance) {
      setLocalAttendance(attendance);
    }
  }, [attendance]);

  const handleStatusChange = async (enrollmentId: string, status: AttendanceStatus) => {
    setLocalAttendance((prev) => ({
      ...prev,
      [enrollmentId]: status,
    }));
  };

  const handleSubmit = async () => {
    if (!activeCohortId || !attendanceDate) return;

    try {
      setSubmitting(true);
      setFeedback(null);

      const records = Object.entries(localAttendance).map(([enrollmentId, status]) => ({
        enrollmentId,
        status,
        date: attendanceDate,
      }));

      await post('/attendance/submit', { body: { records } }, session?.token);

      await Promise.all([mutateEnrollments(), mutateAttendance()]);
      
      setFeedback('Chamada registrada com sucesso!');
    } catch (error) {
      console.error(error);
      setFeedback('Erro ao registrar chamada');
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) {
    return null;
  }

  if (projectsError || cohortsError || enrollmentsError || attendanceError) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-full">
          <p className="text-red-500">
            Erro ao carregar dados. Por favor, tente novamente mais tarde.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="container mx-auto p-4">
        <div className="grid grid-cols-12 gap-4">
          <aside className="col-span-3">
            <PrimarySidebar />
          </aside>

          <main className="col-span-9">
            <Card className="p-4">
              <h1 className="text-2xl font-bold mb-4">Registro de Presença</h1>

              <div className="space-y-4">
                {/* Seleção de projeto */}
                <div>
                  <label className="block text-sm font-medium mb-1">Projeto</label>
                  {loadingProjects ? (
                    <LoadingState />
                  ) : (
                    <select
                      className="w-full p-2 border rounded"
                      value={activeProjectId ?? ''}
                      onChange={(e) => {
                        setSelectedProjectId(e.target.value || null);
                        setSelectedCohortId(null);
                      }}
                    >
                      <option value="">Selecione um projeto</option>
                      {projects?.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Seleção de turma */}
                <div>
                  <label className="block text-sm font-medium mb-1">Turma</label>
                  {loadingCohorts ? (
                    <LoadingState />
                  ) : (
                    <select
                      className="w-full p-2 border rounded"
                      value={activeCohortId ?? ''}
                      onChange={(e) => setSelectedCohortId(e.target.value || null)}
                      disabled={!activeProjectId}
                    >
                      <option value="">Selecione uma turma</option>
                      {cohorts?.map((cohort) => (
                        <option key={cohort.id} value={cohort.id}>
                          {cohort.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Seleção de data */}
                <div>
                  <label className="block text-sm font-medium mb-1">Data</label>
                  <Input
                    type="date"
                    value={attendanceDate}
                    onChange={(e) => setAttendanceDate(e.target.value)}
                    disabled={!activeCohortId}
                  />
                </div>

                {/* Lista de participantes */}
                {loadingEnrollments || loadingAttendance ? (
                  <LoadingState />
                ) : (
                  enrollments?.length && (
                    <div className="mt-4">
                      <h2 className="text-lg font-semibold mb-2">Participantes</h2>
                      <div className="space-y-2">
                        {enrollments.map((enrollment) => (
                          <div
                            key={enrollment.id}
                            className="flex items-center justify-between p-2 bg-gray-50 rounded"
                          >
                            <span>{enrollment.beneficiaryName}</span>
                            <select
                              className="p-1 border rounded"
                              value={localAttendance[enrollment.id] ?? ''}
                              onChange={(e) =>
                                handleStatusChange(
                                  enrollment.id,
                                  e.target.value as AttendanceStatus,
                                )
                              }
                            >
                              <option value="">Selecione</option>
                              {statusOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <Button
                          onClick={handleSubmit}
                          disabled={submitting}
                          className="bg-primary text-white"
                        >
                          {submitting ? 'Salvando...' : 'Salvar Chamada'}
                        </Button>

                        {feedback && (
                          <p
                            className={`text-sm ${
                              feedback.includes('Erro')
                                ? 'text-red-500'
                                : 'text-green-500'
                            }`}
                          >
                            {feedback}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            </Card>
          </main>
        </div>
      </div>
    </Shell>
  );
}
