import { schema, t, table } from "spacetimedb/server";

import { toScaled } from "@game/shared";

const spacetimedb = schema({
  marker: table(
    { public: true },
    {
      id: t.u32().primaryKey().autoInc(),
      x: t.i32(),
      y: t.i32(),
      z: t.i32(),
    },
  ),
});
export default spacetimedb;

export const init = spacetimedb.init((ctx) => {
  ctx.db.marker.insert({ id: 0, x: toScaled(0), y: toScaled(1), z: toScaled(0) });
});
