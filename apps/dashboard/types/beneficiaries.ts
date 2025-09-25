export type BeneficiarySummary = {
  id: string;
  code: string | null;
  fullName: string;
  birthDate: string | null;
  cpf: string | null;
  phone1: string | null;
  createdAt: string;
  updatedAt: string;
  vulnerabilities: string[];
};
