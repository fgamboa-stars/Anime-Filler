import type { ContributorName, Distribution } from '../domain/types.js';

/** One layer's opinion. `strength` is how much evidence backs it: 0 means this layer has nothing to say. */
export interface ContributorResult {
  name: ContributorName;
  distribution: Distribution;
  strength: number;
  reasons: string[];
}

/** Evidence saturates: the tenth agreeing example should add far less than the second. */
export function saturate(amount: number, scale: number): number {
  return amount <= 0 ? 0 : 1 - Math.exp(-amount / scale);
}
