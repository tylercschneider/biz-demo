export const conversionRate = (from: number, to: number): number =>
  from === 0 ? 0 : to / from
