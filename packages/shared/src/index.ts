export const DATABASE_NAME = "browser-game";
export const LOCAL_HOST = "ws://127.0.0.1:3000";

// Float columns cannot be indexed in SpacetimeDB, so positions are stored as scaled integers.
export const POSITION_SCALE = 1000;

export function toScaled(value: number): number {
  return Math.round(value * POSITION_SCALE);
}

export function fromScaled(scaled: number): number {
  return scaled / POSITION_SCALE;
}
