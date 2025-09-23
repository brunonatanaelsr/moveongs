import { fetchTimeline } from './repository';

export async function listTimelineEntries(params: {
  beneficiaryId: string;
  limit: number;
  offset: number;
}) {
  return fetchTimeline(params.beneficiaryId, params.limit, params.offset);
}
