import { AppError, NotFoundError } from '../../shared/errors';
import {
  CreateBeneficiaryParams,
  UpdateBeneficiaryParams,
  createBeneficiary as createBeneficiaryRepository,
  getBeneficiaryById,
  listBeneficiaries,
  updateBeneficiary as updateBeneficiaryRepository,
} from './repository';

export async function createBeneficiary(input: CreateBeneficiaryParams) {
  return createBeneficiaryRepository(input);
}

export async function updateBeneficiary(id: string, input: UpdateBeneficiaryParams) {
  return updateBeneficiaryRepository(id, input);
}

export async function getBeneficiary(id: string) {
  const record = await getBeneficiaryById(id);

  if (!record) {
    throw new NotFoundError('Beneficiary not found');
  }

  return record;
}

export async function listBeneficiarySummaries(params: { search?: string; limit?: number; offset?: number }) {
  const limit = Math.min(params.limit ?? 25, 100);
  const offset = params.offset ?? 0;

  if (limit < 1) {
    throw new AppError('limit must be positive', 400);
  }

  if (offset < 0) {
    throw new AppError('offset cannot be negative', 400);
  }

  return listBeneficiaries({ search: params.search, limit, offset });
}
