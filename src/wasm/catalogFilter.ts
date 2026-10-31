import {
  normalizeSearchQuery,
  resourceSearchText,
  type CatalogFilterInput,
} from "../catalogFilter";
import { categories, resources } from "../data";
import type {
  Access,
  Kind,
  LicenseClass,
  Resource,
} from "../types";

const ABI_VERSION = 1;
const QUERY_CAPACITY = 16 * 1024;

const KIND_CODE: Record<Kind, number> = {
  dataset: 1,
  model: 2,
};

const ACCESS_CODE: Record<Access, number> = {
  open: 0,
  gated: 1,
  application: 2,
};

const LICENSE_CODE: Record<LicenseClass, number> = {
  permissive: 0,
  conditional: 1,
  noncommercial: 2,
  research: 3,
};

const categoryCode = new Map(
  categories.map((category, index) => [category.id, index]),
);

interface CatalogWasmExports {
  memory: WebAssembly.Memory;
  alloc: (size: number) => number;
  init: (
    count: number,
    kinds: number,
    categories: number,
    licenses: number,
    access: number,
    saved: number,
    offsets: number,
    lengths: number,
    corpus: number,
    query: number,
    results: number,
  ) => void;
  filter: (
    kind: number,
    category: number,
    licenseMask: number,
    access: number,
    savedOnly: number,
    queryLength: number,
  ) => number;
  abi_version: () => number;
}

export interface CatalogEngine {
  /**
   * Returns matching resources in catalog order, or null when the query is
   * too large for the preallocated WASM buffer so the caller can fall back.
   */
  filter(input: CatalogFilterInput): Resource[] | null;
}

const encoder = new TextEncoder();

function allocateWith(wasm: CatalogWasmExports, size: number): number {
  const pointer = wasm.alloc(size);
  if (!Number.isInteger(pointer) || pointer < 0) {
    throw new Error("WASM search core could not allocate catalog memory.");
  }
  return pointer;
}

async function buildCatalogEngine(): Promise<CatalogEngine> {
  const response = await fetch(`${import.meta.env.BASE_URL}wasm/catalog.wasm`);
  if (!response.ok) {
    throw new Error(
      `Could not load the WASM search core (${response.status}).`,
    );
  }

  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const wasm = instance.exports as unknown as CatalogWasmExports;

  if (
    typeof wasm.memory !== "object" ||
    typeof wasm.alloc !== "function" ||
    typeof wasm.init !== "function" ||
    typeof wasm.filter !== "function" ||
    wasm.abi_version() !== ABI_VERSION
  ) {
    throw new Error("The WASM search core has an incompatible interface.");
  }

  const count = resources.length;
  const encodedTexts = resources.map((resource) =>
    encoder.encode(resourceSearchText(resource)),
  );
  const corpusLength = encodedTexts.reduce(
    (total, text) => total + text.byteLength,
    0,
  );

  const kindPtr = allocateWith(wasm, count);
  const categoryPtr = allocateWith(wasm, count);
  const licensePtr = allocateWith(wasm, count);
  const accessPtr = allocateWith(wasm, count);
  const savedPtr = allocateWith(wasm, count);
  const offsetsPtr = allocateWith(wasm, count * 4);
  const lengthsPtr = allocateWith(wasm, count * 4);
  const corpusPtr = allocateWith(wasm, corpusLength);
  const queryPtr = allocateWith(wasm, QUERY_CAPACITY);
  const resultsPtr = allocateWith(wasm, count * 4);

  const memory = wasm.memory;
  const kinds = new Uint8Array(memory.buffer, kindPtr, count);
  const categoryCodes = new Uint8Array(memory.buffer, categoryPtr, count);
  const licenseCodes = new Uint8Array(memory.buffer, licensePtr, count);
  const accessCodes = new Uint8Array(memory.buffer, accessPtr, count);
  const offsets = new Uint32Array(memory.buffer, offsetsPtr, count);
  const lengths = new Uint32Array(memory.buffer, lengthsPtr, count);
  const corpus = new Uint8Array(memory.buffer, corpusPtr, corpusLength);

  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const resource = resources[index];
    const searchText = encodedTexts[index];
    const code = categoryCode.get(resource.category);

    if (code === undefined) {
      throw new Error(`Unknown category "${resource.category}".`);
    }

    kinds[index] = KIND_CODE[resource.kind];
    categoryCodes[index] = code;
    licenseCodes[index] = LICENSE_CODE[resource.licenseClass];
    accessCodes[index] = ACCESS_CODE[resource.access];
    offsets[index] = cursor;
    lengths[index] = searchText.byteLength;
    corpus.set(searchText, cursor);
    cursor += searchText.byteLength;
  }

  wasm.init(
    count,
    kindPtr,
    categoryPtr,
    licensePtr,
    accessPtr,
    savedPtr,
    offsetsPtr,
    lengthsPtr,
    corpusPtr,
    queryPtr,
    resultsPtr,
  );

  const saved = new Uint8Array(memory.buffer, savedPtr, count);

  return {
    filter(input) {
      const query = normalizeSearchQuery(input.query);
      const queryBytes = encoder.encode(query);
      if (queryBytes.byteLength > QUERY_CAPACITY) return null;

      for (let index = 0; index < count; index += 1) {
        saved[index] = input.savedIds.has(resources[index].id) ? 1 : 0;
      }

      let licenseMask = 0;
      for (const license of input.licenses) {
        licenseMask |= 1 << LICENSE_CODE[license];
      }

      const kind = input.kind === "all" ? 0 : KIND_CODE[input.kind];
      const category =
        input.category === "all"
          ? -1
          : (categoryCode.get(input.category) ?? -1);
      const access =
        input.access === "all" ? 0 : ACCESS_CODE[input.access] + 1;

      if (queryBytes.byteLength > 0) {
        new Uint8Array(
          memory.buffer,
          queryPtr,
          queryBytes.byteLength,
        ).set(queryBytes);
      }

      const resultCount = wasm.filter(
        kind,
        category,
        licenseMask,
        access,
        input.savedOnly ? 1 : 0,
        queryBytes.byteLength,
      );

      if (
        !Number.isInteger(resultCount) ||
        resultCount < 0 ||
        resultCount > count
      ) {
        throw new Error("The WASM search core returned an invalid result.");
      }

      const resultIndices = new Uint32Array(
        memory.buffer,
        resultsPtr,
        resultCount,
      );
      const matches: Resource[] = [];

      for (let index = 0; index < resultIndices.length; index += 1) {
        const resource = resources[resultIndices[index]];
        if (!resource) {
          throw new Error("The WASM search core returned an unknown record.");
        }
        matches.push(resource);
      }

      return matches;
    },
  };
}

let enginePromise: Promise<CatalogEngine> | null = null;

/** Load and initialize the WASM search core once per page session. */
export function loadCatalogEngine(): Promise<CatalogEngine> {
  enginePromise ??= buildCatalogEngine();
  return enginePromise;
}
