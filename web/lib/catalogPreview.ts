import type { Plate } from "@platelab/shared";

/** Local design preview; never changes the shared catalog or production quality. */
export function withCatalogPreview(plate: Plate): Plate {
  if (
    process.env.NODE_ENV === "development" &&
    plate.sku === process.env.PLATELAB_PREVIEW_PRODUCTION_STITCH_SKU
  ) {
    return { ...plate, stitchStatus: "production-ready" };
  }
  return plate;
}
