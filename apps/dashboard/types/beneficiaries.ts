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

export type HouseholdMember = {
  id: string;
  name: string | null;
  birthDate: string | null;
  works: boolean | null;
  income: string | null;
  schooling: string | null;
  relationship: string | null;
};

export type VulnerabilityTag = {
  slug: string;
  label: string | null;
};

export type BeneficiaryProfile = {
  id: string;
  code: string | null;
  fullName: string;
  birthDate: string | null;
  cpf: string | null;
  rg: string | null;
  rgIssuer: string | null;
  rgIssueDate: string | null;
  nis: string | null;
  phone1: string | null;
  phone2: string | null;
  email: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  reference: string | null;
  createdAt: string;
  updatedAt: string;
  householdMembers: HouseholdMember[];
  vulnerabilities: VulnerabilityTag[];
};
