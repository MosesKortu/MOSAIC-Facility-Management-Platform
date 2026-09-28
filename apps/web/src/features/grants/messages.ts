import { ApiError } from '../../lib/api.ts';
import { formatMoney } from '../../lib/format.ts';

/** Specific, actionable wording for funding refusals (never a generic "failed"). */
export function fundingErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  const money = (key: string) => (typeof error.details[key] === 'string' ? formatMoney(error.details[key]) : '');
  switch (error.code) {
    case 'OVER_ALLOCATION':
      return `Only ${money('unallocated')} is still unallocated in this grant. Lower the amount or raise the grant budget first.`;
    case 'ALLOCATION_BELOW_CONSUMED':
      return `${money('consumed')} has already been spent from this allocation, so it cannot be set lower than that.`;
    case 'BUDGET_BELOW_ALLOCATED':
      return `${money('allocated_to_groups')} is already allocated to groups. Reduce those allocations before lowering the budget.`;
    case 'GROUP_INACTIVE':
      return 'This group is deactivated. Reactivate it before allocating funding to it.';
    case 'DUPLICATE':
      return error.details.field === 'group_id'
        ? 'This group already has an allocation from this grant. Adjust that allocation instead.'
        : error.message;
    default:
      return error.message;
  }
}
