/** A resident's diet for the kitchen; null (or missing) is "Not set", counted as neither. */
export type Diet = 'VEG' | 'NON_VEG'

export const dietLabels: Record<Diet, string> = { VEG: 'Veg', NON_VEG: 'Non-veg' }
