export type ActionPlanItem = {
  id: string;
  actionPlanId: string;
  title: string;
  responsible: string | null;
  dueDate: string | null;
  status: string;
  support: string | null;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActionPlan = {
  id: string;
  beneficiaryId: string;
  status: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  items: ActionPlanItem[];
};
