import { categoryById, resources } from "./data";
import type {
  Access,
  CategoryId,
  Kind,
  LicenseClass,
  Resource,
} from "./types";

export interface CatalogFilterInput {
  query: string;
  kind: "all" | Kind;
  category: CategoryId | "all";
  licenses: ReadonlySet<LicenseClass>;
  access: Access | "all";
  savedOnly: boolean;
  savedIds: ReadonlySet<string>;
}

/** Normalize whitespace and case exactly the same way for both engines. */
export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

/**
 * Fields indexed by the search core. Keep this in sync with the fallback
 * filter below; the WebAssembly module receives one concatenated corpus built
 * from these strings.
 */
export function resourceSearchText(resource: Resource): string {
  return [
    resource.name,
    resource.maker,
    resource.summary,
    resource.scale,
    resource.license,
    resource.year,
    categoryById[resource.category].label,
    ...resource.tags,
    ...resource.bestFor,
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Server-free fallback used before the WebAssembly module is ready, or when
 * WebAssembly is unavailable in the browser.
 */
export function filterCatalog(input: CatalogFilterInput): Resource[] {
  const words = normalizeSearchQuery(input.query).split(" ").filter(Boolean);

  return resources.filter((resource) => {
    if (input.kind !== "all" && resource.kind !== input.kind) return false;
    if (
      input.category !== "all" &&
      resource.category !== input.category
    ) {
      return false;
    }
    if (
      input.licenses.size > 0 &&
      !input.licenses.has(resource.licenseClass)
    ) {
      return false;
    }
    if (input.access !== "all" && resource.access !== input.access) {
      return false;
    }
    if (input.savedOnly && !input.savedIds.has(resource.id)) return false;
    if (words.length === 0) return true;

    const haystack = resourceSearchText(resource);
    return words.every((word) => haystack.includes(word));
  });
}
