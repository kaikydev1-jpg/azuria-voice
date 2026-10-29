export interface IntegrationCatalogEntry {
  name: string;
  /** Explicit route when it differs from the name (kept after a rename). */
  slug?: string;
  url: string;
  logoUrl: string;
  category: string;
  featured: boolean;
}

export const INTEGRATION_CATALOG: IntegrationCatalogEntry[];
export function entrySlug(entry: { name: string; slug?: string }): string;
export function integrationSlug(name: string): string;
export function getIntegrationBySlug(slug: string): IntegrationCatalogEntry | undefined;
