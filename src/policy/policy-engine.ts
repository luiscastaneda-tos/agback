/** Internal classification of interactive approval requirements. */
export type PolicyResult = 'AUTO' | 'HUMAN_APPROVAL_REQUIRED' | 'FORBIDDEN';

const ACTION_POLICIES: Readonly<Record<string, PolicyResult>> = Object.freeze({
  search_hotels: 'AUTO',
  add_reservation_to_cart: 'HUMAN_APPROVAL_REQUIRED',
  confirm_booking: 'HUMAN_APPROVAL_REQUIRED',
  cancel_booking: 'HUMAN_APPROVAL_REQUIRED',
});

/**
 * AUTO classifies interactive approval only; it grants no identity authorization.
 * Traveler action identifiers are not yet defined and remain undeclared here.
 */
export class PolicyEngine {
  evaluate(action: string, _args: unknown): PolicyResult {
    return Object.hasOwn(ACTION_POLICIES, action)
      ? ACTION_POLICIES[action]
      : 'FORBIDDEN';
  }
}
