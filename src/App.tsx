import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  Compass,
  Database,
  ExternalLink,
  Layers,
  Moon,
  RotateCcw,
  Scale,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import { categories, categoryById, resources } from "./data";
import {
  filterCatalog,
  type CatalogFilterInput,
} from "./catalogFilter";
import { CategoryIcon } from "./components/CategoryIcon";
import {
  loadCatalogEngine,
  type CatalogEngine,
} from "./wasm/catalogFilter";
import type {
  Access,
  CategoryId,
  Kind,
  LicenseClass,
  Resource,
} from "./types";

type KindFilter = "all" | Kind;
type SortKey = "curated" | "newest" | "name" | "category";
type Theme = "light" | "dark";
type EngineBadge = "loading" | "wasm" | "fallback";

const PAGE_SIZE = 24;
const SAVED_KEY = "open-atlas-saved";
const THEME_KEY = "open-atlas-theme";

const licenseOrder: LicenseClass[] = [
  "permissive",
  "conditional",
  "noncommercial",
  "research",
];

const licenseMeta: Record<
  LicenseClass,
  { label: string; short: string; blurb: string; examples: string }
> = {
  permissive: {
    label: "Permissive",
    short: "Permissive",
    blurb:
      "Standard open licenses that usually allow commercial use, modification, and redistribution with attribution.",
    examples: "Apache 2.0 · MIT · CC BY 4.0",
  },
  conditional: {
    label: "Conditional",
    short: "Conditional",
    blurb:
      "Free to use, but with strings attached: acceptable-use policies, registration, or commercial thresholds.",
    examples: "Open weights + usage policy · custom terms",
  },
  noncommercial: {
    label: "Non-commercial",
    short: "Non-comm.",
    blurb:
      "Fine for research, learning, and personal projects. Commercial use needs separate permission.",
    examples: "CC BY-NC 4.0 · CC BY-NC-SA",
  },
  research: {
    label: "Research-only",
    short: "Research",
    blurb:
      "Usually gated and limited to non-commercial research. Expect an application and a signed agreement.",
    examples: "Research agreements · access committees",
  },
};

const accessMeta: Record<Access, { label: string; short: string }> = {
  open: { label: "Open download", short: "Open" },
  gated: { label: "Free with account", short: "Sign-in" },
  application: { label: "Free by application", short: "Apply" },
};

const sortOptions: { value: SortKey; label: string }[] = [
  { value: "curated", label: "Curated" },
  { value: "newest", label: "Newest" },
  { value: "name", label: "A–Z" },
  { value: "category", label: "Category" },
];

const engineBadgeMeta: Record<
  EngineBadge,
  { label: string; title: string }
> = {
  loading: {
    label: "WASM loading",
    title: "Loading the local WebAssembly search core.",
  },
  wasm: {
    label: "WASM search",
    title:
      "Search and filters run in WebAssembly inside this page. No query leaves your browser.",
  },
  fallback: {
    label: "JS fallback",
    title:
      "The WebAssembly core is unavailable, so search is using the built-in JavaScript fallback. It still runs entirely in your browser.",
  },
};

const DATASET_COUNT = resources.filter((item) => item.kind === "dataset").length;
const MODEL_COUNT = resources.filter((item) => item.kind === "model").length;
const FEATURED_COUNT = resources.filter((item) => item.featured).length;

const categoryCounts = Object.fromEntries(
  categories.map((category) => [
    category.id,
    resources.filter((item) => item.category === category.id).length,
  ]),
) as Record<CategoryId, number>;

const licenseCounts = Object.fromEntries(
  licenseOrder.map((license) => [
    license,
    resources.filter((item) => item.licenseClass === license).length,
  ]),
) as Record<LicenseClass, number>;

const accessCounts = Object.fromEntries(
  (["open", "gated", "application"] as Access[]).map((access) => [
    access,
    resources.filter((item) => item.access === access).length,
  ]),
) as Record<Access, number>;

function readSaved(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function readTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage can be unavailable in private contexts.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function scrollToCatalog() {
  document
    .getElementById("catalog")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function trapTabFocus(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function ResourceCard({
  resource,
  saved,
  onToggleSave,
  onSelect,
}: {
  resource: Resource;
  saved: boolean;
  onToggleSave: (id: string) => void;
  onSelect: (resource: Resource) => void;
}) {
  const category = categoryById[resource.category];

  return (
    <article
      className={`resource-card ${saved ? "is-saved" : ""}`}
      style={{ "--cat": category.color } as CSSProperties}
    >
      <div className="resource-card__top">
        <span className={`kind-pill kind-pill--${resource.kind}`}>
          {resource.kind === "dataset" ? (
            <Database size={10} strokeWidth={2.2} />
          ) : (
            <Layers size={10} strokeWidth={2.2} />
          )}
          {resource.kind}
        </span>
        {resource.featured && (
          <span className="field-pick">
            <Sparkles size={10} />
            Field pick
          </span>
        )}
        <button
          className={`save-button ${saved ? "is-saved" : ""}`}
          type="button"
          onClick={() => onToggleSave(resource.id)}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${resource.name} from saved` : `Save ${resource.name}`}
        >
          <Bookmark size={15} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="resource-card__category">
        <span className="category-dot" />
        {category.label}
        <span className="resource-card__year">{resource.year}</span>
      </div>

      <h3 className="resource-card__title">{resource.name}</h3>
      <p className="resource-card__maker">{resource.maker}</p>
      <p className="resource-card__summary">{resource.summary}</p>

      <div className="resource-card__tags">
        {resource.tags.slice(0, 3).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>

      <div className="resource-card__footer">
        <span className={`license-badge lc-${resource.licenseClass}`}>
          {licenseMeta[resource.licenseClass].label}
        </span>
        <span className={`access-badge access-${resource.access}`}>
          <span className="access-dot" />
          {accessMeta[resource.access].short}
        </span>
        <span className="resource-card__scale" title={resource.scale}>
          {resource.scale}
        </span>
      </div>

      <button
        className="resource-card__hit"
        type="button"
        onClick={() => onSelect(resource)}
        aria-label={`View details for ${resource.name}`}
      />
    </article>
  );
}

function DetailDrawer({
  resource,
  saved,
  onClose,
  onToggleSave,
}: {
  resource: Resource;
  saved: boolean;
  onClose: () => void;
  onToggleSave: (id: string) => void;
}) {
  const category = categoryById[resource.category];
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => closeRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="drawer-layer">
      <button
        className="overlay-scrim"
        type="button"
        aria-label="Close details"
        onClick={onClose}
      />
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onKeyDown={trapTabFocus}
        style={
          {
            "--cat": category.color,
            background: `linear-gradient(145deg, ${category.color}55, var(--paper-elevated) 62%)`,
          } as CSSProperties
        }
      >
        <div className="drawer__top">
          <span className="drawer__record">
            {resource.kind} record ·{" "}
            {String(resources.indexOf(resource) + 1).padStart(3, "0")} /{" "}
            {resources.length}
          </span>
          <div className="drawer__top-actions">
            <button
              className={`drawer__save ${saved ? "is-saved" : ""}`}
              type="button"
              onClick={() => onToggleSave(resource.id)}
              aria-pressed={saved}
            >
              <Bookmark size={14} fill={saved ? "currentColor" : "none"} />
              {saved ? "Saved" : "Save"}
            </button>
            <button
              ref={closeRef}
              className="icon-button"
              type="button"
              onClick={onClose}
              aria-label="Close details"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="drawer__scroll">
          <header className="drawer__hero">
            <div className="drawer__icon">
              <CategoryIcon category={resource.category} size={26} />
            </div>
            <div className="drawer__eyebrow">
              <span className="category-dot" />
              {category.label}
              <span className="mid-dot">·</span>
              {resource.year}
            </div>
            <h2 id="drawer-title">{resource.name}</h2>
            <p className="drawer__maker">By {resource.maker}</p>
            <div className="drawer__hero-tags">
              <span className={`kind-pill kind-pill--${resource.kind}`}>
                {resource.kind === "dataset" ? (
                  <Database size={10} strokeWidth={2.2} />
                ) : (
                  <Layers size={10} strokeWidth={2.2} />
                )}
                {resource.kind}
              </span>
              {resource.featured && (
                <span className="field-pick">
                  <Sparkles size={10} />
                  Field pick
                </span>
              )}
            </div>
          </header>

          <div className="drawer__body">
            <section>
              <span className="detail-label">01 / The gist</span>
              <p className="drawer__summary">{resource.summary}</p>
            </section>

            <section>
              <span className="detail-label">02 / Best for</span>
              <ul className="best-for">
                {resource.bestFor.map((item, index) => (
                  <li key={item}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <span className="detail-label">03 / At a glance</span>
              <dl className="meta-grid">
                <div>
                  <dt>License</dt>
                  <dd>
                    <span className={`license-badge lc-${resource.licenseClass}`}>
                      {licenseMeta[resource.licenseClass].label}
                    </span>
                    <span>{resource.license}</span>
                  </dd>
                </div>
                <div>
                  <dt>Access</dt>
                  <dd>
                    <span className={`access-badge access-${resource.access}`}>
                      <span className="access-dot" />
                      {accessMeta[resource.access].label}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Scale</dt>
                  <dd>{resource.scale}</dd>
                </div>
                <div>
                  <dt>Maker</dt>
                  <dd>{resource.maker}</dd>
                </div>
                <div>
                  <dt>Released</dt>
                  <dd>{resource.year}</dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{category.label}</dd>
                </div>
              </dl>
            </section>

            {(resource.licenseNote || resource.accessNote) && (
              <section className="drawer__notes">
                {resource.licenseNote && (
                  <div className="drawer-note">
                    <Scale size={15} />
                    <div>
                      <strong>License note</strong>
                      <p>{resource.licenseNote}</p>
                    </div>
                  </div>
                )}
                {resource.accessNote && (
                  <div className="drawer-note">
                    <ExternalLink size={15} />
                    <div>
                      <strong>Access note</strong>
                      <p>{resource.accessNote}</p>
                    </div>
                  </div>
                )}
              </section>
            )}

            <section>
              <span className="detail-label">Tags</span>
              <div className="detail-tags">
                {resource.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </section>

            <div className="drawer__source">
              <span>Source</span>
              <span>{hostOf(resource.url)}</span>
            </div>
          </div>
        </div>

        <div className="drawer__footer">
          <button
            className={`btn btn--outline ${saved ? "is-saved" : ""}`}
            type="button"
            onClick={() => onToggleSave(resource.id)}
          >
            <Bookmark size={14} fill={saved ? "currentColor" : "none"} />
            {saved ? "Saved" : "Save for later"}
          </button>
          <a
            className="btn btn--dark"
            href={resource.url}
            target="_blank"
            rel="noreferrer"
          >
            Open at source
            <ArrowUpRight size={15} />
          </a>
        </div>
      </aside>
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [category, setCategory] = useState<CategoryId | "all">("all");
  const [licenseFilters, setLicenseFilters] = useState<Set<LicenseClass>>(
    new Set(),
  );
  const [access, setAccess] = useState<Access | "all">("all");
  const [savedOnly, setSavedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("curated");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(readSaved);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [engine, setEngine] = useState<CatalogEngine | null>(null);
  const [engineLoadFailed, setEngineLoadFailed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  function openDrawer(resource: Resource) {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSelected(resource);
  }

  function closeDrawer() {
    const target = returnFocusRef.current;
    setSelected(null);
    if (target) {
      window.requestAnimationFrame(() =>
        target.focus({ preventScroll: true }),
      );
    }
  }

  const focusSearch = () => {
    const input = searchRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  useEffect(() => {
    let cancelled = false;

    loadCatalogEngine()
      .then((loaded) => {
        if (!cancelled) setEngine(loaded);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.warn(
          "WASM search core unavailable; continuing with the JS fallback.",
          error,
        );
        setEngineLoadFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusSearch();
        return;
      }

      if (
        event.key === "/" &&
        !isTyping &&
        !selected &&
        !mobileFilters
      ) {
        event.preventDefault();
        focusSearch();
        return;
      }

      if (event.key === "Escape") {
        if (mobileFilters) setMobileFilters(false);
        else if (selected) closeDrawer();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // focusSearch only reads a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, mobileFilters]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SAVED_KEY,
        JSON.stringify(Array.from(saved)),
      );
    } catch {
      // Saving still works for this session.
    }
  }, [saved]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Theme still applies for this session.
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", theme === "dark" ? "#12130f" : "#f2efe5");
  }, [theme]);

  useEffect(() => {
    if (!selected && !mobileFilters) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [selected, mobileFilters]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 981px)");
    const onChange = () => {
      if (media.matches) setMobileFilters(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, kind, category, licenseFilters, access, savedOnly, sort]);

  const toggleSaved = (id: string) => {
    setSaved((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleLicense = (license: LicenseClass) => {
    setLicenseFilters((current) => {
      const next = new Set(current);
      if (next.has(license)) next.delete(license);
      else next.add(license);
      return next;
    });
  };

  const clearFilters = () => {
    setKind("all");
    setCategory("all");
    setLicenseFilters(new Set());
    setAccess("all");
    setSavedOnly(false);
  };

  const resetEverything = () => {
    clearFilters();
    setQuery("");
  };

  const showSaved = () => {
    clearFilters();
    setQuery("");
    setSavedOnly(true);
    setMobileFilters(false);
    scrollToCatalog();
  };

  const quickSearch = (term: string) => {
    setQuery(term);
    scrollToCatalog();
  };

  const filterInput = useMemo<CatalogFilterInput>(
    () => ({
      query,
      kind,
      category,
      licenses: licenseFilters,
      access,
      savedOnly,
      savedIds: saved,
    }),
    [query, kind, category, licenseFilters, access, savedOnly, saved],
  );

  const applied = useMemo<{
    matches: Resource[];
    backend: "wasm" | "js";
  }>(() => {
    if (engine) {
      try {
        const matches = engine.filter(filterInput);
        if (matches !== null) return { matches, backend: "wasm" };
      } catch (error) {
        console.warn(
          "WASM search failed; continuing with the JS fallback.",
          error,
        );
      }
    }

    return { matches: filterCatalog(filterInput), backend: "js" };
  }, [engine, filterInput]);

  const filtered = useMemo(() => {
    const sorted = [...applied.matches];
    if (sort === "newest") {
      sorted.sort(
        (a, b) => b.year - a.year || a.name.localeCompare(b.name),
      );
    } else if (sort === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "category") {
      sorted.sort((a, b) => {
        const rankA = categories.findIndex((item) => item.id === a.category);
        const rankB = categories.findIndex((item) => item.id === b.category);
        return rankA - rankB || a.name.localeCompare(b.name);
      });
    }

    return sorted;
  }, [applied, sort]);

  const engineBadge: EngineBadge = engine
    ? applied.backend === "wasm"
      ? "wasm"
      : "fallback"
    : engineLoadFailed
      ? "fallback"
      : "loading";
  const engineMeta = engineBadgeMeta[engineBadge];

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const filterCount =
    (kind !== "all" ? 1 : 0) +
    (category !== "all" ? 1 : 0) +
    licenseFilters.size +
    (access !== "all" ? 1 : 0) +
    (savedOnly ? 1 : 0);

  const chips: { key: string; label: string; remove: () => void }[] = [];

  if (kind !== "all") {
    chips.push({
      key: `kind-${kind}`,
      label: kind === "dataset" ? "Datasets" : "Open-weight models",
      remove: () => setKind("all"),
    });
  }
  if (category !== "all") {
    chips.push({
      key: `category-${category}`,
      label: categoryById[category].label,
      remove: () => setCategory("all"),
    });
  }
  licenseOrder.forEach((license) => {
    if (licenseFilters.has(license)) {
      chips.push({
        key: `license-${license}`,
        label: licenseMeta[license].label,
        remove: () => toggleLicense(license),
      });
    }
  });
  if (access !== "all") {
    chips.push({
      key: `access-${access}`,
      label: accessMeta[access].label,
      remove: () => setAccess("all"),
    });
  }
  if (savedOnly) {
    chips.push({
      key: "saved",
      label: "Saved only",
      remove: () => setSavedOnly(false),
    });
  }
  if (query.trim()) {
    chips.push({
      key: "query",
      label: `“${query.trim()}”`,
      remove: () => setQuery(""),
    });
  }

  const renderFilters = (compact = false) => (
    <div className={`filters ${compact ? "filters--sheet" : ""}`}>
      <div className="filters__head">
        <div>
          <span className="mini-label">Refine</span>
          <h3>Filters</h3>
        </div>
        <div className="filters__head-actions">
          {filterCount > 0 && (
            <button className="text-button" type="button" onClick={clearFilters}>
              <RotateCcw size={12} />
              Reset
            </button>
          )}
          {compact && (
            <button
              className="icon-button"
              type="button"
              onClick={() => setMobileFilters(false)}
              aria-label="Close filters"
              autoFocus
            >
              <X size={17} />
            </button>
          )}
        </div>
      </div>

      <div className="filters__scroll">
        <div className="filter-group">
          <div className="filter-label">
            <span>01</span> Type
          </div>
          <div className="segmented" role="group" aria-label="Resource type">
            {(
              [
                ["all", "All", resources.length],
                ["dataset", "Data", DATASET_COUNT],
                ["model", "Models", MODEL_COUNT],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                className={kind === value ? "is-active" : ""}
                type="button"
                onClick={() => setKind(value)}
                aria-pressed={kind === value}
              >
                <span>{label}</span>
                <span className="segmented__count">{count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <div className="filter-label">
            <span>02</span> Category
          </div>
          <div className="category-chips">
            <button
              className={`category-chip ${category === "all" ? "is-active" : ""}`}
              type="button"
              onClick={() => setCategory("all")}
              aria-pressed={category === "all"}
            >
              <span className="category-dot category-dot--all" />
              All
              <span className="category-chip__count">{resources.length}</span>
            </button>
            {categories.map((item) => (
              <button
                key={item.id}
                className={`category-chip ${category === item.id ? "is-active" : ""}`}
                style={{ "--cat": item.color } as CSSProperties}
                type="button"
                onClick={() =>
                  setCategory(category === item.id ? "all" : item.id)
                }
                aria-pressed={category === item.id}
                title={item.label}
              >
                <span className="category-dot" />
                {item.short}
                <span className="category-chip__count">
                  {categoryCounts[item.id]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <div className="filter-label">
            <span>03</span> License
          </div>
          <div className="license-toggles">
            {licenseOrder.map((license) => {
              const active = licenseFilters.has(license);
              return (
                <button
                  key={license}
                  className={`license-toggle lc-${license} ${active ? "is-active" : ""}`}
                  type="button"
                  onClick={() => toggleLicense(license)}
                  aria-pressed={active}
                >
                  <span className="license-toggle__check">
                    {active && <Check size={9} strokeWidth={3} />}
                  </span>
                  <span>{licenseMeta[license].short}</span>
                  <span className="license-toggle__count">
                    {licenseCounts[license]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="filter-group">
          <div className="filter-label">
            <span>04</span> Access
          </div>
          <div className="select-wrap">
            <select
              value={access}
              onChange={(event) =>
                setAccess(event.target.value as Access | "all")
              }
              aria-label="Filter by access type"
            >
              <option value="all">Any access</option>
              <option value="open">
                Open download ({accessCounts.open})
              </option>
              <option value="gated">
                Free with account ({accessCounts.gated})
              </option>
              {accessCounts.application > 0 && (
                <option value="application">
                  Free by application ({accessCounts.application})
                </option>
              )}
            </select>
            <ChevronDown size={14} />
          </div>
        </div>

        <label className="saved-filter">
          <input
            type="checkbox"
            checked={savedOnly}
            onChange={(event) => setSavedOnly(event.target.checked)}
          />
          <span className="switch" aria-hidden="true" />
          <span>Saved only</span>
          <span className="saved-filter__count">{saved.size}</span>
        </label>

        <div className="filters__note">
          New to licensing?{" "}
          <a href="#licenses" onClick={() => setMobileFilters(false)}>
            Read the decoder <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>

      {compact && (
        <div className="sheet-footer">
          <button
            className="btn btn--primary btn--full"
            type="button"
            onClick={() => {
              setMobileFilters(false);
              scrollToCatalog();
            }}
          >
            Show {filtered.length}{" "}
            {filtered.length === 1 ? "resource" : "resources"}
            <ArrowRight size={15} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div id="top">
      <a className="skip-link" href="#catalog">
        Skip to the catalog
      </a>

      <header className="site-header">
        <div className="container header-inner">
          <a className="brand" href="#top" aria-label="Open Atlas home">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
            </span>
            <span className="brand-word">Open Atlas</span>
            <span className="brand-sub">field guide</span>
          </a>

          <nav className="site-nav" aria-label="Primary">
            <a href="#catalog">Catalog</a>
            <a href="#licenses">Licenses</a>
            <a href="#hubs">Go deeper</a>
          </nav>

          <div className="header-actions">
            <button
              className="saved-link"
              type="button"
              onClick={showSaved}
              aria-label={`View saved resources, ${saved.size} saved`}
            >
              <Bookmark size={14} />
              <span className="saved-link__label">Saved</span>
              <span className="saved-link__count">{saved.size}</span>
            </button>
            <button
              className="icon-button theme-toggle"
              type="button"
              onClick={() =>
                setTheme((current) => (current === "dark" ? "light" : "dark"))
              }
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="hero container">
          <div className="hero__main">
            <div className="eyebrow">
              <span className="status-dot" />
              Edition 01 · October 2026
              <span className="eyebrow__rule" aria-hidden="true" />
              {resources.length} hand-picked resources
            </div>

            <h1>
              A field guide to the <em>open</em> AI ecosystem.
            </h1>

            <p className="hero__lede">
              Public datasets and open-weight models you can actually get
              your hands on — across language, vision, audio, science, and
              more. Every entry says what it is, what it&rsquo;s good for, and
              how it&rsquo;s licensed.
            </p>

            <div className="search-box">
              <Search size={19} className="search-box__icon" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    if (query) setQuery("");
                    else event.currentTarget.blur();
                  }
                }}
                placeholder="Search datasets, models, makers, tags…"
                aria-label="Search the atlas"
                spellCheck={false}
              />
              {query ? (
                <button
                  className="search-clear"
                  type="button"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              ) : (
                <kbd className="search-kbd">/</kbd>
              )}
            </div>

            <div className="quick-links">
              <span>Popular trails</span>
              {["Speech", "Proteins", "Robotics", "Tabular"].map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => quickSearch(term)}
                >
                  {term}
                </button>
              ))}
            </div>
          </div>

          <aside className="hero__aside" aria-label="About this guide">
            <div className="field-note">
              <span className="field-note__tape" aria-hidden="true" />
              <div className="field-note__top">
                <span>Field note 001</span>
                <span aria-hidden="true">✳</span>
              </div>
              <p className="field-note__title">
                &ldquo;Free to use&rdquo;
                <br />
                <em>is a spectrum.</em>
              </p>
              <p className="field-note__body">
                Every record carries its license class and access route, so
                there are no surprises after the download button.
              </p>
              <ul className="field-note__list">
                <li>
                  <Check size={12} strokeWidth={2.6} /> Direct links to source
                </li>
                <li>
                  <Check size={12} strokeWidth={2.6} /> Gated access flagged
                </li>
                <li>
                  <Check size={12} strokeWidth={2.6} /> {resources.length}{" "}
                  hand-checked records
                </li>
              </ul>
              <a className="field-note__link" href="#licenses">
                Read the license decoder
                <ArrowRight size={13} />
              </a>
            </div>
            <div className="hero__aside-foot">
              <span>Est. 2026</span>
              <span>Free to access ≠ free to remix.</span>
            </div>
          </aside>
        </section>

        <section className="stats-band" aria-label="Collection at a glance">
          <div className="container stats-grid">
            <div className="stat">
              <span className="stat__number">{resources.length}</span>
              <span className="stat__label">Curated resources</span>
            </div>
            <div className="stat">
              <span className="stat__number">{DATASET_COUNT}</span>
              <span className="stat__label">Public datasets</span>
            </div>
            <div className="stat">
              <span className="stat__number">{MODEL_COUNT}</span>
              <span className="stat__label">Open-weight models</span>
            </div>
            <div className="stat">
              <span className="stat__number">{categories.length}</span>
              <span className="stat__label">Major categories</span>
            </div>
            <div className="stats-note">
              <span className="mini-label">A note on scope</span>
              <p>
                <strong>Curated, not exhaustive.</strong> Includes{" "}
                {FEATURED_COUNT} field picks — then follow the links to go
                deeper.
              </p>
            </div>
          </div>
        </section>

        <section id="catalog" className="catalog container">
          <div className="section-heading">
            <div>
              <span className="kicker">The catalog</span>
              <h2>
                Browse the <em>atlas.</em>
              </h2>
            </div>
            <p>
              Filter by type, category, license, or access. Open any record
              for the full field note and a direct route to the source.
            </p>
          </div>

          <div className="catalog-layout">
            <aside className="filter-rail" aria-label="Catalog filters">
              {renderFilters()}
            </aside>

            <div className="catalog-main">
              <div className="results-toolbar">
                <div className="results-summary">
                  <p className="result-count" aria-live="polite">
                    <span className="result-count__number">{filtered.length}</span>
                    <span>{filtered.length === 1 ? "resource" : "resources"}</span>
                    <span className="result-count__of">
                      / {resources.length}
                    </span>
                  </p>
                  <span
                    className={`engine-badge engine-badge--${engineBadge}`}
                    title={engineMeta.title}
                    aria-label={`Search engine: ${engineMeta.title}`}
                  >
                    <span className="engine-badge__dot" aria-hidden="true" />
                    {engineMeta.label}
                  </span>
                </div>

                <div className="toolbar-controls">
                  <button
                    className={`saved-toggle ${savedOnly ? "is-active" : ""}`}
                    type="button"
                    onClick={() => setSavedOnly((current) => !current)}
                    aria-pressed={savedOnly}
                  >
                    <Bookmark
                      size={13}
                      fill={savedOnly ? "currentColor" : "none"}
                    />
                    Saved
                    <span className="saved-toggle__count">{saved.size}</span>
                  </button>

                  <label className="sort-control">
                    <span>Sort</span>
                    <select
                      value={sort}
                      onChange={(event) =>
                        setSort(event.target.value as SortKey)
                      }
                      aria-label="Sort resources"
                    >
                      {sortOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} />
                  </label>

                  <button
                    className="filter-button"
                    type="button"
                    onClick={() => setMobileFilters(true)}
                  >
                    <SlidersHorizontal size={14} />
                    Filters
                    {filterCount > 0 && (
                      <span className="filter-button__count">
                        {filterCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {chips.length > 0 && (
                <div className="active-filters">
                  <span className="active-filters__label">Filtering by</span>
                  {chips.map((chip) => (
                    <span className="filter-chip" key={chip.key}>
                      {chip.label}
                      <button
                        type="button"
                        onClick={chip.remove}
                        aria-label={`Remove ${chip.label} filter`}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  <button
                    className="clear-link"
                    type="button"
                    onClick={resetEverything}
                  >
                    Clear all
                  </button>
                </div>
              )}

              {visible.length > 0 ? (
                <>
                  <div className="card-grid">
                    {visible.map((resource) => (
                      <ResourceCard
                        key={resource.id}
                        resource={resource}
                        saved={saved.has(resource.id)}
                        onToggleSave={toggleSaved}
                        onSelect={openDrawer}
                      />
                    ))}
                  </div>

                  <div className="load-more">
                    <div
                      className="load-progress"
                      role="progressbar"
                      aria-label="Resources shown"
                      aria-valuemin={0}
                      aria-valuemax={filtered.length}
                      aria-valuenow={visible.length}
                    >
                      <span
                        style={{
                          width: `${(visible.length / filtered.length) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="load-copy">
                      Showing <strong>{visible.length}</strong> of{" "}
                      {filtered.length}
                    </span>
                    {hasMore ? (
                      <button
                        className="btn btn--outline"
                        type="button"
                        onClick={() =>
                          setVisibleCount(
                            (current) => current + PAGE_SIZE,
                          )
                        }
                      >
                        Load{" "}
                        {Math.min(PAGE_SIZE, filtered.length - visibleCount)}{" "}
                        more
                        <ArrowRight size={14} />
                      </button>
                    ) : (
                      <span className="end-note">End of this trail ✳</span>
                    )}
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <span className="empty-state__mark">
                    <Compass size={25} />
                  </span>
                  <span className="kicker">No trail found</span>
                  <h3>
                    {savedOnly && saved.size === 0
                      ? "Your shortlist is still empty."
                      : "Nothing matches that combination."}
                  </h3>
                  <p>
                    {savedOnly && saved.size === 0
                      ? "Tap the bookmark on any record to start a shortlist. It stays in this browser for next time."
                      : `Try a broader search, remove a filter, or reset the atlas to see all ${resources.length} resources.`}
                  </p>
                  <button
                    className="btn btn--primary"
                    type="button"
                    onClick={resetEverything}
                  >
                    Reset the atlas
                    <RotateCcw size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section id="licenses" className="license-section">
          <div className="container">
            <div className="section-heading section-heading--light">
              <div>
                <span className="kicker">The fine print</span>
                <h2>
                  Four labels.
                  <br />
                  <em>Zero surprises.</em>
                </h2>
              </div>
              <p>
                &ldquo;Open&rdquo; is not one thing. These four classes tell
                you what you can generally do with a resource before you
                commit a line of code to it.
              </p>
            </div>

            <div className="license-grid">
              {licenseOrder.map((license, index) => (
                <article
                  className={`license-card lc-${license}`}
                  key={license}
                >
                  <div className="license-card__top">
                    <span>0{index + 1}</span>
                    <span>{licenseCounts[license]} records</span>
                  </div>
                  <span className="license-card__letter" aria-hidden="true">
                    {["P", "C", "N", "R"][index]}
                  </span>
                  <h3>{licenseMeta[license].label}</h3>
                  <p>{licenseMeta[license].blurb}</p>
                  <span className="license-card__examples">
                    {licenseMeta[license].examples}
                  </span>
                </article>
              ))}
            </div>

            <div className="license-callout">
              <span className="license-callout__mark" aria-hidden="true">
                !
              </span>
              <p>
                <strong>A label is a start, not legal advice.</strong> Always
                open the source license before you ship. Terms can change, and
                some open-weight models add acceptable-use rules or commercial
                thresholds. Gated access is still free — it just asks who you
                are first.
              </p>
            </div>
          </div>
        </section>

        <section id="hubs" className="hubs container">
          <div className="section-heading">
            <div>
              <span className="kicker">Keep digging</span>
              <h2>
                The atlas has edges.
                <br />
                <em>These don&rsquo;t.</em>
              </h2>
            </div>
            <p>
              This guide is intentionally hand-picked. When you need the
              exhaustive long tail, these are the shelves worth browsing.
            </p>
          </div>

          <div className="hub-grid">
            {[
              {
                name: "Hugging Face Hub",
                tag: "Datasets & models",
                description:
                  "The default public square for open datasets, model weights, and community notebooks.",
                href: "https://huggingface.co/datasets",
              },
              {
                name: "Kaggle Datasets",
                tag: "Applied data",
                description:
                  "Domain collections, competition data, and notebooks with a strong community around them.",
                href: "https://www.kaggle.com/datasets",
              },
              {
                name: "Common Crawl",
                tag: "Web-scale corpus",
                description:
                  "Petabytes of archived web pages, refreshed monthly, for language and retrieval research.",
                href: "https://commoncrawl.org/",
              },
              {
                name: "OpenML",
                tag: "Tabular ML",
                description:
                  "Thousands of structured datasets paired with tasks, runs, and reproducible benchmarks.",
                href: "https://www.openml.org/",
              },
              {
                name: "Data.gov",
                tag: "Public sector",
                description:
                  "Open data from US federal, state, and local agencies across health, climate, and civic life.",
                href: "https://data.gov/",
              },
              {
                name: "Zenodo",
                tag: "Research archive",
                description:
                  "CERN-backed repository for research datasets, software, and papers across disciplines.",
                href: "https://zenodo.org/",
              },
            ].map((hub, index) => (
              <a
                className="hub-card"
                key={hub.name}
                href={hub.href}
                target="_blank"
                rel="noreferrer"
              >
                <span className="hub-card__index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="hub-card__body">
                  <span className="hub-card__tag">{hub.tag}</span>
                  <h3>{hub.name}</h3>
                  <p>{hub.description}</p>
                </div>
                <ArrowUpRight className="hub-card__arrow" size={17} />
              </a>
            ))}
          </div>
        </section>

        <section className="footer-cta">
          <div className="container footer-cta__inner">
            <div>
              <span className="kicker">One last thing</span>
              <h2>
                Use the good stuff.
                <br />
                <em>Credit the source.</em>
              </h2>
            </div>
            <div className="footer-cta__actions">
              <a className="btn btn--primary" href="#catalog">
                Back to the catalog
                <ArrowRight size={15} />
              </a>
              <a className="footer-cta__link" href="#licenses">
                How licenses work
                <ArrowUpRight size={14} />
              </a>
            </div>
          </div>
          <span className="footer-cta__mark" aria-hidden="true">
            ✳
          </span>
        </section>
      </main>

      {mobileFilters && (
        <div className="sheet-layer">
          <button
            className="overlay-scrim"
            type="button"
            aria-label="Close filters"
            onClick={() => setMobileFilters(false)}
          />
          <div
            className="filter-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Catalog filters"
            onKeyDown={trapTabFocus}
          >
            {renderFilters(true)}
          </div>
        </div>
      )}

      {selected && (
        <DetailDrawer
          resource={selected}
          saved={saved.has(selected.id)}
          onClose={closeDrawer}
          onToggleSave={toggleSaved}
        />
      )}

      <footer className="site-footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <a className="brand" href="#top" aria-label="Open Atlas home">
                <span className="brand-mark" aria-hidden="true">
                  <span />
                  <span />
                </span>
                <span className="brand-word">Open Atlas</span>
              </a>
              <p>
                An independent, hand-curated field guide to free-to-access AI
                resources. Not affiliated with any dataset or model maker.
              </p>
              <p className="footer-disclaimer">
                Free to access does not mean unrestricted. Gated and
                application-only resources are still free, but terms vary.
                This guide is informational, not legal advice.
              </p>
            </div>

            <div className="footer-cols">
              <div>
                <h4>Browse</h4>
                <a href="#catalog">All resources</a>
                <button
                  className="footer-text-link"
                  type="button"
                  onClick={showSaved}
                >
                  Saved shortlist
                </button>
                <a href="#licenses">License decoder</a>
                <a href="#hubs">Where to go deeper</a>
              </div>

              <div>
                <h4>Shortcuts</h4>
                <span className="shortcut-row">
                  <kbd>/</kbd> Focus search
                </span>
                <span className="shortcut-row">
                  <kbd>⌘ K</kbd> Focus search
                </span>
                <span className="shortcut-row">
                  <kbd>Esc</kbd> Close panels
                </span>
              </div>

              <div>
                <h4>Colophon</h4>
                <p>Last reviewed October 2026.</p>
                <p>
                  {resources.length} records across {categories.length}{" "}
                  categories.
                </p>
                <p>Always verify the license at source.</p>
              </div>
            </div>
          </div>

          <div className="footer-bottom">
            <span>© 2026 Open Atlas</span>
            <span>Independent. Unofficial. Curious.</span>
            <a href="#top">Back to top ↑</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

