import type { Mobility } from './Tile';

/**
 * What the ground under a tile is made of. It never blocks anything; it changes how well tracks
 * grip, how fast things move, and how the AI likes to route.
 */
export const Surface = {
  Grass: 0,
  Sand: 1,
  Moss: 2,
  Snow: 3,
  Paving: 4,
  /** An unpaved dirt road: good grip, but the ruts and mud cost some speed. */
  Road: 5,
} as const;

export type SurfaceType = (typeof Surface)[keyof typeof Surface];

export interface SurfaceProperties {
  readonly name: string;
  /**
   * Friction coefficient of tracks on this ground, relative to dry grass (1). It caps how hard a
   * tank can accelerate, brake and resist sliding sideways: on snow a tank spins its tracks,
   * takes much longer to stop, and drifts after turning.
   */
  readonly grip: number;
  /** Share of a tank's top speed it can reach here. */
  readonly trackedSpeed: number;
  /** Share of walking speed for crews on foot. */
  readonly footSpeed: number;
  /** Relative route cost for AI drivers (2 = ordinary ground); they avoid slippery going. */
  readonly trackedCost: number;
  readonly footCost: number;
}

export const SURFACE_PROPERTIES: Readonly<Record<SurfaceType, SurfaceProperties>> = {
  [Surface.Grass]: { name: 'grass', grip: 1, trackedSpeed: 1, footSpeed: 1, trackedCost: 2, footCost: 2 },
  [Surface.Sand]: { name: 'sand', grip: 0.72, trackedSpeed: 0.9, footSpeed: 0.88, trackedCost: 2, footCost: 2 },
  [Surface.Moss]: { name: 'moss', grip: 0.8, trackedSpeed: 0.95, footSpeed: 0.95, trackedCost: 2, footCost: 2 },
  [Surface.Snow]: { name: 'snow', grip: 0.2, trackedSpeed: 1, footSpeed: 0.78, trackedCost: 4, footCost: 3 },
  [Surface.Paving]: { name: 'paving', grip: 1, trackedSpeed: 1, footSpeed: 1, trackedCost: 2, footCost: 2 },
  [Surface.Road]: { name: 'road', grip: 0.9, trackedSpeed: 0.8, footSpeed: 1, trackedCost: 2, footCost: 2 },
};

export function surfaceProperties(surface: SurfaceType): SurfaceProperties {
  return SURFACE_PROPERTIES[surface];
}

export function surfaceCost(surface: SurfaceType, mobility: Mobility): number {
  const props = SURFACE_PROPERTIES[surface];
  return mobility === 'tracked' ? props.trackedCost : props.footCost;
}
