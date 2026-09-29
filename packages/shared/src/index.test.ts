import { expect, test } from "vite-plus/test";

import { fromScaled, POSITION_SCALE, toScaled } from "./index";

test("scaled integers round-trip to millimetre precision", () => {
  expect(toScaled(1.5)).toBe(1.5 * POSITION_SCALE);
  expect(fromScaled(toScaled(-12.345))).toBeCloseTo(-12.345, 3);
});
