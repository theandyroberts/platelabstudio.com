"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MagnifyingGlass, SlidersHorizontal } from "@phosphor-icons/react";
import type { Plate } from "@platelab/shared";
import { PlateCard } from "./PlateCard";
import {
  availableBrowseFacets,
  browseFiltersFromParams,
  browsePageFromParams,
  browseParams,
  browseSortFromParams,
  paginateBrowseResults,
  searchParamsForFilters,
  sortBrowseResults,
  summarizeBrowseFilters,
  type BrowseFilters,
  type BrowseSort,
} from "@/lib/browseSearch";
import styles from "./BrowseClient.module.css";
import { BrowseSceneTools, useBrowseSceneLibrary } from "./BrowseSceneTools";
import { sceneBrowseParams } from "@/lib/sceneSearch";

/**
 * Faceted hybrid search. The initial database catalog renders immediately,
 * then active filters are ranked through the server-side Postgres/pgvector
 * search endpoint.
 */

const STAGE_LABELS: Record<string, string> = {
  "led-volume": "LED Volume",
  "green-screen": "Green Screen",
  projection: "Projection",
};

function FacetGroup({
  label,
  options,
  value,
  onChange,
  display,
}: {
  label: string;
  options: readonly string[];
  value: string | null;
  onChange: (v: string | null) => void;
  display?: Record<string, string>;
}) {
  if (options.length === 0) return null;

  return (
    <div className="filter-group">
      <span className="mono">{label}</span>
      <div className="filter-options">
        {options.map((opt) => (
          <button
            key={opt}
            className="filter-chip"
            data-on={value === opt}
            onClick={() => onChange(value === opt ? null : opt)}
          >
            {display?.[opt] ?? opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BrowseClient({ plates }: { plates: Plate[] }) {
  const params = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const facets = useMemo(() => availableBrowseFacets(plates), [plates]);

  // Arriving from the home hero search (focus=1): take focus so the user's
  // keystrokes flow straight into this field, cursor parked after any text
  // already carried over via ?q=.
  useEffect(() => {
    if (params.get("focus") !== "1") return;
    const el = searchRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filters = useMemo(() => browseFiltersFromParams(params), [params]);
  const sort = browseSortFromParams(params);
  const page = browsePageFromParams(params);
  const sceneId = params.get("scene") || "";
  const pendingSku = params.get("save");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const replaceParams = (next: URLSearchParams) => {
    window.history.replaceState(null, "", `/browse${next.size ? `?${next}` : ""}`);
  };
  const setPage = (nextPage: number) => replaceParams(sceneBrowseParams(browseParams({ filters, sort, page: nextPage }), sceneId, pendingSku));
  const setSort = (nextSort: BrowseSort) => replaceParams(sceneBrowseParams(browseParams({ filters, sort: nextSort }), sceneId, pendingSku));
  const setSceneId = (id: string) => {
    try { if (id) sessionStorage.setItem("platelab-search-scene", id); else sessionStorage.removeItem("platelab-search-scene"); } catch { /* Storage is optional. */ }
    replaceParams(sceneBrowseParams(new URLSearchParams(params), id, pendingSku));
  };
  const setPendingSku = (sku: string | null) => replaceParams(sceneBrowseParams(new URLSearchParams(params), sceneId, sku));
  const returnPath = `/browse${params.size ? `?${params}` : ""}`;
  const sceneLibrary = useBrowseSceneLibrary(sceneId, returnPath, setPendingSku);
  const showSaved = params.get("saved") === "1";
  useEffect(() => { if (showSaved) sceneLibrary.setOpen(true); }, [showSaved, sceneLibrary.setOpen]);
  useEffect(() => {
    if (!sceneLibrary.library?.authenticated) return;
    try {
      if (sceneId) sessionStorage.setItem("platelab-search-scene", sceneId);
      else {
        const lastScene = sessionStorage.getItem("platelab-search-scene");
        if (lastScene && sceneLibrary.library.scenes.some(scene => scene.id === lastScene)) setSceneId(lastScene);
      }
    } catch { /* The URL still carries the scene when browser storage is unavailable. */ }
  }, [sceneId, sceneLibrary.library]);
  const [results, setResults] = useState(plates);
  const [searching, setSearching] = useState(false);
  const [semantic, setSemantic] = useState(false);
  const [degraded, setDegraded] = useState<{
    message: string;
    retryable: boolean;
  } | null>(null);
  const [searchAttempt, setSearchAttempt] = useState(0);

  const set = (patch: Partial<BrowseFilters>) => {
    replaceParams(sceneBrowseParams(browseParams({ filters: { ...filters, ...patch }, sort }), sceneId, pendingSku));
  };

  const active =
    !!filters.q ||
    !!filters.shotType ||
    !!filters.timeOfDay ||
    !!filters.weather ||
    !!filters.speedBand ||
    !!filters.stage ||
    !!filters.tag ||
    filters.imuOnly;

  useEffect(() => {
    if (!active) {
      setResults(plates);
      setSemantic(false);
      setDegraded(null);
      setSearching(false);
      return;
    }

    const abortController = new AbortController();
    setSearching(true);
    setDegraded(null);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/catalog/search?${searchParamsForFilters(filters)}`,
          { signal: abortController.signal },
        );
        if (!response.ok) throw new Error("search failed");
        const body = (await response.json()) as {
          plates: Plate[];
          semantic: boolean;
          degraded?: boolean;
        };
        if (abortController.signal.aborted) return;
        setResults(body.plates);
        setSemantic(body.semantic);
        setDegraded(
          body.degraded
            ? {
                message:
                  "Semantic matching is temporarily unavailable. Results use exact words and metadata filters.",
                retryable: false,
              }
            : null,
        );
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.warn(error);
          setSemantic(false);
          setDegraded({
            message:
              "Live search is temporarily unavailable. The catalog remains visible; try again in a moment.",
            retryable: true,
          });
          setResults(plates);
        }
      } finally {
        if (!abortController.signal.aborted) setSearching(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      abortController.abort();
    };
  }, [active, filters, plates, searchAttempt]);

  const sortedResults = useMemo(
    () => sortBrowseResults(results, sort),
    [results, sort],
  );
  const paginated = useMemo(
    () => paginateBrowseResults(sortedResults, page),
    [page, sortedResults],
  );
  const activeFilterSummaries = useMemo(
    () => summarizeBrowseFilters(filters),
    [filters],
  );
  const browseReturnParams = sceneBrowseParams(browseParams({
    filters,
    sort,
    page: paginated.page,
  }), sceneId, pendingSku);
  const browseReturnPath = `/browse${
    browseReturnParams.size ? `?${browseReturnParams}` : ""
  }`;

  useEffect(() => {
    if (!searching && page !== paginated.page) setPage(paginated.page);
  });

  const clearAll = () => {
    set({
      q: "",
      shotType: null,
      timeOfDay: null,
      weather: null,
      speedBand: null,
      stage: null,
      imuOnly: false,
      tag: null,
    });
  };

  const clearFilter = (key: keyof BrowseFilters) => {
    if (key === "q") return set({ q: "" });
    if (key === "imuOnly") return set({ imuOnly: false });
    set({ [key]: null } as Partial<BrowseFilters>);
  };

  return (
    <div className={styles.workspace}>
      <h1 className="sr-only">Search plates</h1>
      {params.get("error") && <p className="auth-alert error" role="alert">{params.get("error")}</p>}
      <BrowseSceneTools state={sceneLibrary} sceneId={sceneId} pendingSku={pendingSku}
        onSceneChange={setSceneId} onPendingSave={setPendingSku}
        onSearchScene={scene => {
          const next = new URLSearchParams({ q: scene.brief || scene.name, scene: scene.id });
          if (pendingSku) next.set("save", pendingSku);
          replaceParams(next);
        }} />
      <div className={styles.searchBar}>
        <MagnifyingGlass size={24} aria-hidden="true" />
        <input
          ref={searchRef}
          className="search-input"
          placeholder="Describe the footage you need..."
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          aria-label="Search plates"
        />
        <button className="secondary-button" aria-expanded={filtersOpen} aria-controls="plate-search-filters" onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal size={18} /> Filters</button>
      </div>
      <div className={styles.searchLayout} data-filters-open={filtersOpen}>
      <aside id="plate-search-filters" className={styles.filters} hidden={!filtersOpen}>
        <FacetGroup
          label="Shot type"
          options={facets.shotType}
          value={filters.shotType}
          onChange={(v) => set({ shotType: v })}
        />
        <FacetGroup
          label="Time of day"
          options={facets.timeOfDay}
          value={filters.timeOfDay}
          onChange={(v) => set({ timeOfDay: v })}
        />
        <FacetGroup
          label="Weather"
          options={facets.weather}
          value={filters.weather}
          onChange={(v) => set({ weather: v })}
        />
        <FacetGroup
          label="Speed"
          options={facets.speedBand}
          value={filters.speedBand}
          onChange={(v) => set({ speedBand: v })}
        />
        <FacetGroup
          label="Stage compatibility"
          options={facets.stage}
          value={filters.stage}
          onChange={(v) => set({ stage: v })}
          display={STAGE_LABELS}
        />
        {(facets.imuOnly || filters.imuOnly) && (
          <div className="filter-group">
            <span className="mono">Telemetry</span>
            <div className="filter-options">
              <button
                className="filter-chip"
                data-on={filters.imuOnly}
                onClick={() => set({ imuOnly: !filters.imuOnly })}
              >
                IMU collected
              </button>
            </div>
          </div>
        )}
        {filters.tag && (
          <div className="filter-group">
            <span className="mono">Tag</span>
            <div className="filter-options">
              <button
                className="filter-chip"
                data-on
                onClick={() => set({ tag: null })}
              >
                {filters.tag} ✕
              </button>
            </div>
          </div>
        )}
      </aside>

      <div>
        <div className={`results-head ${styles.resultsHead}`}>
          <div>
            <span className="mono dim">
              {sortedResults.length
                ? `${paginated.start}–${paginated.end} of `
                : ""}
              {sortedResults.length} plate{sortedResults.length === 1 ? "" : "s"}
              {active ? " · filtered" : ""}
              {semantic ? " · semantic" : ""}
            </span>
            <span className="sr-only" aria-live="polite">
              {searching
                ? "Searching plates"
                : `${sortedResults.length} plates found`}
            </span>
            {searching && (
              <span className={`${styles.status} mono`} aria-hidden="true">
                <span className={styles.spinner} /> Searching
              </span>
            )}
          </div>
          <div className={styles.toolbar}>
            <label className={`${styles.sortLabel} mono`}>
              Sort
              <select
                className={styles.sortSelect}
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as BrowseSort);
                }}
                aria-label="Sort plate results"
              >
                <option value="relevance">Best match</option>
                <option value="newest">Newest shoot</option>
                <option value="duration-shortest">Shortest duration</option>
                <option value="duration-longest">Longest duration</option>
              </select>
            </label>
            {active && (
              <button className="mono dim clear-filters" onClick={clearAll}>
                Clear all ✕
              </button>
            )}
          </div>
        </div>
        {activeFilterSummaries.length > 0 && (
          <div className={styles.activeFilters} aria-label="Active filters">
            <span className="mono dimmer">Active</span>
            {activeFilterSummaries.map((summary) => (
              <button
                key={summary.key}
                className={`${styles.activeFilterChip} mono`}
                onClick={() => clearFilter(summary.key)}
                aria-label={`Remove ${summary.label} filter: ${summary.value}`}
              >
                <span>{summary.label}</span> {summary.value} ×
              </button>
            ))}
          </div>
        )}
        {filters.stage && (
          <p className={styles.stageNote} role="note">
            <strong>Stage guidance:</strong> Compatibility labels narrow the
            catalog, but they are not final technical approval. Confirm wall
            coverage, resolution, horizon, and playback requirements in Studio.
          </p>
        )}
        {degraded && (
          <div className={styles.notice} role="status">
            <span>
              <strong>Limited search:</strong> {degraded.message}
            </span>
            {degraded.retryable && (
              <button
                className={styles.retryButton}
                onClick={() => setSearchAttempt((attempt) => attempt + 1)}
              >
                Retry search
              </button>
            )}
          </div>
        )}
        {sortedResults.length ? (
          <div
            className={styles.resultRegion}
            data-loading={searching}
            aria-busy={searching}
          >
            <div className="plate-collection"><div className="plate-grid">
              {paginated.items.map((p) => (
                <PlateCard
                  key={p.sku}
                  plate={p}
                  browseReturnPath={browseReturnPath}
                />
              ))}
            </div></div>
            {paginated.pageCount > 1 && (
              <nav className={styles.pagination} aria-label="Plate result pages">
                <button
                  className={styles.pageButton}
                  disabled={paginated.page === 1}
                  onClick={() => setPage(paginated.page - 1)}
                >
                  Previous
                </button>
                {Array.from({ length: paginated.pageCount }, (_, index) => {
                  const pageNumber = index + 1;
                  return (
                    <button
                      key={pageNumber}
                      className={styles.pageButton}
                      data-current={pageNumber === paginated.page}
                      aria-current={
                        pageNumber === paginated.page ? "page" : undefined
                      }
                      aria-label={`Page ${pageNumber}`}
                      onClick={() => setPage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  );
                })}
                <button
                  className={styles.pageButton}
                  disabled={paginated.page === paginated.pageCount}
                  onClick={() => setPage(paginated.page + 1)}
                >
                  Next
                </button>
              </nav>
            )}
          </div>
        ) : (
          <div className="empty-state" role="status">
            <p className="mono">No plates match</p>
            <p style={{ marginTop: 10 }}>
              Try fewer words or remove a filter. The Plate Lab can also plan a
              route when the catalog does not yet cover the shot.
            </p>
            <div className={styles.emptyActions}>
              <button className="secondary-button" onClick={clearAll}>
                Clear search and filters
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
