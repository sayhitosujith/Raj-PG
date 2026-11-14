/** A resident's membership tier, lowest first; staff set it and everyone starts on Silver. */
export type MemberTier = 'SILVER' | 'GOLD' | 'PEARL'

export const memberTiers: readonly MemberTier[] = ['SILVER', 'GOLD', 'PEARL']

export const memberTierLabels: Record<MemberTier, string> = { SILVER: 'Silver', GOLD: 'Gold', PEARL: 'Pearl' }
