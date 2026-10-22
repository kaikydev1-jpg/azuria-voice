import { useTranslation } from 'react-i18next';
import { ShieldCheckIcon } from 'lucide-react';
import type { HistoryItem } from '@/lib/api/types';

interface Provenance {
  recorded: true;
  model: { repo_id: string; revision: string };
  license: { class: string; name: string | null };
  declared_use: { purpose: string; conditions_acknowledged: boolean };
  parameters: { profile: string; seed: number };
  runtime?: { device?: string | null };
}

const CLASS_KEYS: Record<string, string> = {
  commercial: 'audiogen.license.commercial',
  commercial_conditions: 'audiogen.license.conditions',
  noncommercial: 'audiogen.license.noncommercial',
  unconfirmed: 'audiogen.license.unconfirmed',
};

/** The stored record, or null for takes made before it existed (nothing is inferred for those). */
export function parseProvenance(raw: string | null | undefined): Provenance | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Provenance> & { schema?: number };
    if (value.schema !== 1 || !value.model || !value.license || !value.declared_use || !value.parameters)
      return null;
    return value as Provenance;
  } catch {
    return null;
  }
}

export function TakeProvenance({ item }: { item: HistoryItem }) {
  const { t } = useTranslation();
  const record = parseProvenance(item.provenance);
  return (
    <section className="space-y-2 rounded-xl border border-border/60 bg-muted/15 p-3 text-sm">
      <h3 className="flex items-center gap-2 font-medium">
        <ShieldCheckIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        {t('audiogen.provenance.title')}
      </h3>
      {record ? (
        <dl className="space-y-1.5 text-xs">
          {[
            [t('audiogen.model'), record.model.repo_id],
            [t('audiogen.provenance.revision'), record.model.revision.slice(0, 12)],
            [
              t('audiogen.provenance.license'),
              `${record.license.name ?? '?'} · ${t(CLASS_KEYS[record.license.class] ?? CLASS_KEYS.unconfirmed)}`,
            ],
            [
              t('audiogen.provenance.declaredUse'),
              t(`audiogen.purposes.${record.declared_use.purpose === 'commercial' ? 'commercial' : 'personal'}`) +
                (record.declared_use.conditions_acknowledged ? ` · ${t('audiogen.provenance.acknowledged')}` : ''),
            ],
            [t('audiogen.quality'), `${record.parameters.profile} · ${t('audiogen.seed')} ${record.parameters.seed}`],
          ].map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-all text-right">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs text-muted-foreground">{t('audiogen.provenance.notRecorded')}</p>
      )}
    </section>
  );
}
