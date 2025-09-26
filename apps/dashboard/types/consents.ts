export type ConsentRecord = {
  id: string;
  beneficiaryId: string;
  type: string;
  textVersion: string;
  granted: boolean;
  grantedAt: string;
  revokedAt: string | null;
  evidence: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: string;
};
