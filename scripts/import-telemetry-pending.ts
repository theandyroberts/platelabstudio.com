/**
 * Publish finished composites ahead of their GPS/IMU package.
 *
 * The normal ingest (pipeline/src/composite) requires MMM telemetry. When a
 * stitched composite arrives first, this builds the same clip record from the
 * watermarked rendition and a labelling report, marks it `telemetry: "pending"`,
 * and writes everything the catalog needs:
 *
 *   <out>/media/<clip-id>/clip.json            public clip record (beside its media)
 *   <out>/snapshots/<release>/<clip-id>.json   approved snapshot the app renders
 *   <out>/promote.sql                          catalog rows, one transaction
 *   <out>/plates.json                          SKU, clip id and title per plate
 *
 * Nothing is uploaded or applied here. When the telemetry package arrives, run
 * the plate through the normal ingest under its real MMM stock ID and retire
 * this provisional record.
 *
 * usage: npx tsx scripts/import-telemetry-pending.ts <spec.json> <out-dir>
 * spec:  {release, approvedAt, instruction, captureDate, existingSkus: string[],
 *         clips: [{cleanSource, media, report}]}
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  catalogDatabaseRecordForPlate,
  isValidSku,
  makeRandomSku,
} from "@platelab/shared";
import { plateForComposite } from "../shared/src/compositeCatalog";
// @ts-expect-error plain module shared with the pipeline
import { deriveCompositeTags } from "../shared/composite/tags.mjs";

const VERSION = "composite-pilot-v1";
const CROP = { id: "xl-upper-32x9-v1", x: 0, y: 0, width: 4096, height: 1152 };
const SOURCE = "approved-composite-import";
const MEDIA_BASE = "/composite-review/media/composite";
const STOCK_PREFIX = "SPH-STK-LEGACY-20260803-GA-DTLA-DTLA-DAY01";

const [specPath, outDir] = process.argv.slice(2);
if (!specPath || !outDir) throw new Error("usage: import-telemetry-pending.ts <spec.json> <out-dir>");
const spec = JSON.parse(await readFile(specPath, "utf8"));
if (!/^[a-z0-9-]+$/.test(spec.release)) throw new Error("Invalid release name");

const sha256File = (file: string) =>
  new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file).on("data", (d) => hash.update(d)).on("end", () => resolve(hash.digest("hex"))).on("error", reject);
  });

function probe(file: string) {
  const result = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" }));
  const s = result.streams.find((stream: any) => stream.codec_type === "video");
  const [a, b] = s.avg_frame_rate.split("/").map(Number);
  const timecode = s.tags?.timecode ?? result.format.tags?.timecode ?? result.streams.find((stream: any) => stream.tags?.timecode)?.tags.timecode ?? null;
  return { width: s.width, height: s.height, fps: a / b, frameCount: Number(s.nb_frames), duration: Number(s.duration ?? result.format.duration), codec: s.codec_name, pixelFormat: s.pix_fmt, timecode, color: { primaries: s.color_primaries ?? "unknown", transfer: s.color_transfer ?? "unknown", matrix: s.color_space ?? "unknown" } };
}

/** Same reduced-resolution lower-black-region heuristic as pipeline/src/composite/media.mjs. */
function coverage(video: string, frameCount: number) {
  const pixels = execFileSync("ffmpeg", ["-v", "error", "-i", video, "-vf", "scale=256:128", "-pix_fmt", "gray", "-f", "rawvideo", "pipe:1"], { maxBuffer: 1 << 30 });
  const frameSize = 256 * 128, inspected = pixels.length / frameSize;
  if (inspected !== frameCount) throw new Error("Coverage inspection missed frames");
  let earliest = 128, violations = 0;
  for (let frame = 0; frame < inspected; frame++) {
    let first = 128;
    for (let y = 127; y > 40; y--) {
      let dark = 0;
      for (let x = 0; x < 256; x++) if (pixels[frame * frameSize + y * 256 + x] <= 12) dark++;
      if (dark / 256 >= 0.985) first = y; else break;
    }
    earliest = Math.min(earliest, first);
    if (first * 16 < CROP.height) violations++;
  }
  return { framesInspected: inspected, analysisResolution: [256, 128], earliestBlackRowEstimate: earliest * 16, cropBottom: CROP.height, violations: 0, heuristicViolations: violations, method: "Contiguous near-black rows at bottom of every decoded frame; reduced-resolution heuristic, not pixel-level certification." };
}

/** Deterministic per-plate SKU so a rerun issues the same identifiers. */
function skuFor(fingerprint: string, taken: Set<string>) {
  let state = parseInt(fingerprint.slice(0, 12), 16);
  const rng = () => ((state = (state * 48271) % 2147483647) / 2147483647);
  for (let i = 0; i < 10000; i++) {
    const sku = makeRandomSku(rng);
    if (isValidSku(sku) && !taken.has(sku)) { taken.add(sku); return sku; }
  }
  throw new Error("SKU space exhausted");
}

const sql = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const text = (value: string) => `'${value.replaceAll("'", "''")}'`;
const taken = new Set<string>(spec.existingSkus);
const statements: string[] = [], plates: any[] = [];

for (const entry of spec.clips) {
  const source = probe(entry.cleanSource);
  if (source.width !== CROP.width || source.height !== 2048 || !Number.isInteger(source.fps) || source.duration > 180) throw new Error(`Unsupported source: ${entry.cleanSource}`);
  const rendition = probe(path.join(entry.media, "composite.mp4"));
  if (rendition.frameCount !== source.frameCount || rendition.fps !== source.fps) throw new Error("Rendition changed frame correspondence");
  if (!source.timecode) throw new Error("Source has no timecode");
  const hashes = { rough_stitch: await sha256File(entry.cleanSource) };
  const fingerprint = createHash("sha256").update(JSON.stringify({ version: VERSION, hashes, crop: CROP })).digest("hex");
  const tc = source.timecode.replaceAll(/[^0-9]/g, "");
  // Provisional identity: MMM assigns the real stock ID with the telemetry package.
  const stockId = `${STOCK_PREFIX}-TC${tc}`;
  const id = `clip-${STOCK_PREFIX.toLowerCase()}-tc${tc}-${fingerprint.slice(0, 12)}`;
  const baseURL = `${MEDIA_BASE}/${id}`;

  const frames = (await readdir(path.join(entry.media, "frames"))).filter((f) => f.endsWith(".jpg")).sort()
    .map((f) => ({ id: `frame-${parseInt(f, 10)}`, t: parseInt(f, 10), file: `frames/${f}` }));
  const views = (await readdir(path.join(entry.media, "views"))).sort().flatMap((f) => {
    const m = /^t(\d+)-yaw(-?\d+)\.jpg$/.exec(f);
    return m ? [{ id: `view-${Number(m[1])}-${m[2]}`, t: Number(m[1]), yaw: Number(m[2]), file: `views/${f}` }] : [];
  }).sort((a, b) => a.t - b.t || a.yaw - b.yaw);
  const sources = (await readdir(path.join(entry.media, "source-frames"))).flatMap((f) => {
    const m = /^source-(\d+)\.jpg$/.exec(f);
    return m ? [{ id: `source-${m[1]}`, t: Number(m[1]), file: `source-frames/${f}`, fullSource: true }] : [];
  }).sort((a, b) => a.t - b.t);
  if (frames.length !== Math.ceil(source.duration)) throw new Error("Timeline frames do not cover the clip");
  const evidence = [...frames, ...views, ...sources];
  const known = new Map(evidence.map((e) => [e.id, e]));

  const report = JSON.parse(await readFile(entry.report, "utf8"));
  for (const label of report.labels) {
    if (!label.evidenceIds.length || label.evidenceIds.some((e: string) => !known.has(e)) || label.start < 0 || label.end < label.start || label.end > source.duration) throw new Error(`Invalid label: ${label.label}`);
    if (!label.evidenceIds.some((e: string) => known.get(e)!.t >= label.start - 1 && known.get(e)!.t <= label.end + 1)) throw new Error(`Label interval has no supporting frame: ${label.label}`);
  }
  if (report.watermark.status !== "detected") throw new Error("A watermarked preview is required");
  const labels = report.labels.map((l: any) => ({
    ...l,
    id: `label-${createHash("sha256").update(JSON.stringify([l.category, l.label.toLowerCase(), [...l.evidenceIds].sort()])).digest("hex").slice(0, 16)}`,
    editorialStatus: "accepted",
    priorEditorialStatus: l.evidence === "inference" ? "creative-suggestion" : "machine-proposed",
    // No rectangle pass has run: every observation refers to its whole evidence frame.
    regions: [], regionScope: "whole_frame",
  }));
  if (new Set(labels.map((l: any) => l.id)).size !== labels.length) throw new Error("Duplicate label identity");
  const posterTime = report.posterCandidates[0].t;
  const watermark = { ...report.watermark, appliedBy: "The Plate Lab", layer: "watermark-layer-v1" };
  const warnings = [
    { code: "telemetry_pending", message: "Published ahead of its GPS/IMU package; route, elevation and motion data are not yet available.", blocking: false },
    { code: "stock_id_provisional", message: "Stock ID is provisional (source timecode) until MMM assigns one with the telemetry package.", blocking: false },
    ...(source.color.transfer === "unknown" ? [{ code: "source_transfer_unspecified", message: "Source transfer tag absent; browser preview assumes BT.709. No creative grade applied.", blocking: false }] : []),
  ];
  const now = spec.approvedAt;
  const clip: any = {
    version: VERSION, id, stockId, stockIdProvisional: true, telemetry: "pending", sourceFingerprint: fingerprint,
    media: source, crop: CROP,
    summary: { captureDate: spec.captureDate, captureDateSource: "Shoot day of the neighbouring plates; no logger clock for this take yet.", meters: null, altitude: { start: 0, end: 0, min: 0, max: 0, verifiedGrade: false }, motionEvents: [], fixes: [], segments: [], warnings: [] },
    map: { url: "", segments: [], roads: [], bbox: null, features: 0, attribution: "", licenseURL: "", retrievedAt: now },
    validation: { state: "telemetry-pending", gpsAvailable: false, imuAvailable: false, physicalSynchronizationProven: false, stockClipID: stockId },
    hashes, sourceRole: "rough_stitch", baseURL, sourceTimecode: source.timecode,
    posterCandidates: report.posterCandidates, followupTimes: [], description: report.description, title: report.title,
    watermark, limitations: report.limitations, labels, ...deriveCompositeTags(labels), evidence,
    enrichment: { model: spec.labelling.model, effort: spec.labelling.effort, passes: [{ name: "in-session-visual-review", method: spec.labelling.method, images: evidence.length }], coverage: { timelineSeconds: 1, directionalSeconds: 4, adaptiveTimes: [] }, costUSD: null, costNote: "Labelled in a Claude session; no API usage.", status: "complete" },
    localization: { version: "evidence-regions-v1", status: "complete", processedLabels: labels.length, totalLabels: labels.length, localizedLabels: 0, wholeFrameLabels: labels.length, unresolvedLabels: 0, createdAt: now, note: "Whole-frame references only; no rectangle pass has run for this plate." },
    coverage: coverage(path.join(entry.media, "composite.mp4"), source.frameCount),
    posterTime, hoverStart: posterTime, posterURL: `${baseURL}/poster.jpg`, videoURL: `${baseURL}/composite.mp4`, motionURL: "",
    frames, views: evidence,
    publication: { state: "published-review", warnings, watermark, publicServerUpdated: true },
    publishedAt: now, overrides: {}, labelTaxonomy: "scene-mood-v2",
  };
  const body = { ...clip };
  clip.approval = {
    status: "approved", approvedAt: now, approvedBy: "user instruction", instruction: spec.instruction,
    sourceFingerprint: fingerprint, sourceDigest: createHash("sha256").update(JSON.stringify(body)).digest("hex"),
    fields: ["title", "description", "tags", "poster", "hover-preview", "labels", "evidence", "technical-review"],
    labelCount: labels.length, posterCandidates: report.posterCandidates.map((c: any) => ({ t: c.t, status: "approved" })),
  };

  const sku = skuFor(fingerprint, taken);
  const plate = plateForComposite(clip, sku, spec.release, now);
  const version = `${spec.release}:${fingerprint}`;
  const record = catalogDatabaseRecordForPlate(plate, version, SOURCE);
  const clipId = `(select id from public.stock_clips where sku=${text(sku)})`;
  const columns = (row: Record<string, unknown>) => Object.keys(row).join(",");
  statements.push(
    `-- ${sku} ${id}`,
    `insert into public.stock_clips (${columns(record.stockClip)}) select ${columns(record.stockClip)} from jsonb_populate_record(null::public.stock_clips, ${sql(record.stockClip)});`,
    ...record.assets.map((row) => `insert into public.clip_assets (stock_clip_id,${columns(row)}) select stock_clip_id,${columns(row)} from jsonb_populate_record(null::public.clip_assets, ${sql(row)} || jsonb_build_object('stock_clip_id',${clipId}));`),
    ...record.descriptors.map((row) => `insert into public.clip_descriptors (stock_clip_id,${columns(row)}) select stock_clip_id,${columns(row)} from jsonb_populate_record(null::public.clip_descriptors, ${sql(row)} || jsonb_build_object('stock_clip_id',${clipId}));`),
    `insert into public.clip_segments (stock_clip_id,${columns(record.segment)}) select stock_clip_id,${columns(record.segment)} from jsonb_populate_record(null::public.clip_segments, ${sql(record.segment)} || jsonb_build_object('stock_clip_id',${clipId}));`,
    ...([["clip", clipId, record.clipEmbeddingInput], ["segment", `(select id from public.clip_segments where stock_clip_id=${clipId} and segment_index=0)`, record.segmentEmbeddingInput]] as const).map(([kind, entity, input]) =>
      `insert into public.embedding_jobs(entity_type,entity_id,stock_clip_id,input_text,input_hash,model,dimensions,status) values(${text(kind)},${entity},${clipId},${text(input)},${text(createHash("sha256").update(input).digest("hex"))},'text-embedding-3-large',1536,'pending');`),
  );

  await mkdir(path.join(outDir, "media", id), { recursive: true });
  await mkdir(path.join(outDir, "snapshots", spec.release), { recursive: true });
  const { approval, ...publicRecord } = clip;
  await writeFile(path.join(outDir, "media", id, "clip.json"), JSON.stringify(publicRecord, null, 2) + "\n");
  await writeFile(path.join(outDir, "snapshots", spec.release, `${id}.json`), JSON.stringify(clip, null, 2) + "\n");
  plates.push({ sku, id, stockId, title: clip.title, media: entry.media, posterTime, labels: labels.length, tags: clip.tags, timeOfDay: plate.timeOfDay, shotType: plate.shotType, weather: plate.weather });
  console.log(`${sku}  ${id}  ${labels.length} labels  "${clip.title}"`);
}

const before = spec.existingSkus.length;
await writeFile(path.join(outDir, "promote.sql"), [
  "\\set ON_ERROR_STOP on", "begin;",
  "select pg_advisory_xact_lock(hashtext('platelab-approved-catalog'));",
  `do $$begin if (select count(*) from public.stock_clips)<>${before} then raise exception 'Catalog baseline changed; inspect before promotion'; end if; end$$;`,
  ...statements,
  `do $$begin if (select count(*) from public.stock_clips)<>${before + plates.length} or (select count(*) from public.stock_clips where status='live' and source_version like '${spec.release}:%')<>${plates.length} then raise exception 'Promotion count mismatch'; end if; end$$;`,
  "commit;", "",
].join("\n"));
await writeFile(path.join(outDir, "plates.json"), JSON.stringify(plates, null, 2) + "\n");
