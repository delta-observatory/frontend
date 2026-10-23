import type { Dataset } from "../api/types";

/** Document views from the API. These are not observation or scientific result records. */
export interface DatasetDescription {
  id: string; name: string; description: string; kind: string; category: string;
  bands: string[]; formats: string[]; grain: string; coverage: string;
  acquisition: { status: string; scope: string };
  access: { provider: string; url: string; method: string };
  documentation_reviewed_on: string | null;
  metadata_sha256: string; document_url: string; source_url: string;
}
export interface ExperimentDescription {
  id: string; title: string; status: string; result: string;
  datasets: { dataset_id: string; role: string | null }[];
  methods: { method_id: string; scope: string | null }[];
  manifest_sha256: string; document_url: string; source_url: string;
}
export interface Source<T> { available: boolean; items: T[]; issues: string[]; source_sha256?: string }
export interface Catalog { datasets: Source<DatasetDescription>; experiments: Source<ExperimentDescription> }
export interface Entry { id: string; description?: DatasetDescription; indexed?: Dataset; experiments: ExperimentDescription[] }

export function entries(catalog: Catalog | null, indexed: Dataset[]): Entry[] {
  const byId = new Map<string, Entry>();
  for (const description of catalog?.datasets.items ?? []) byId.set(description.id, { id: description.id, description, experiments: [] });
  for (const dataset of indexed) {
    const entry = byId.get(dataset.id) ?? { id: dataset.id, experiments: [] };
    entry.indexed = dataset; byId.set(dataset.id, entry);
  }
  for (const experiment of catalog?.experiments.items ?? []) {
    for (const id of new Set(experiment.datasets.map((d) => d.dataset_id))) {
      const entry = byId.get(id);
      if (entry) entry.experiments.push(experiment);
    }
  }
  return [...byId.values()].sort((a, b) => Number(!!b.indexed) - Number(!!a.indexed) || a.id.localeCompare(b.id));
}

export function safeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try { const parsed = new URL(url); return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : undefined; }
  catch { return undefined; }
}
