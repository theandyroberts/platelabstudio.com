import assert from "node:assert/strict";
import test from "node:test";
import { plateSchema, stitchStatus, STITCH_STATUS_LABELS } from "@platelab/shared";

test("legacy and unrecognized stitch status never imply production readiness", () => {
  for (const status of [undefined, null, "", "live", "approved", "unknown"]) {
    assert.equal(stitchStatus(status), "rough");
  }
});

test("catalog preserves explicit stitch status separately from publication", () => {
  const schema = plateSchema.pick({ stitchStatus: true });
  for (const status of ["rough", "computer", "production-ready"] as const) {
    assert.equal(schema.parse({ stitchStatus: status }).stitchStatus, status);
    assert.equal(stitchStatus(status), status);
    assert.ok(STITCH_STATUS_LABELS[status]);
  }
  assert.equal(stitchStatus(schema.parse({}).stitchStatus), "rough");
  assert.equal(schema.safeParse({ stitchStatus: "approved" }).success, false);
});
