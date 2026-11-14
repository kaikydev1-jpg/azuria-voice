import { CpuIcon, LoaderCircleIcon, RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ExternalLink } from '@/components/external-link';
import { ConfirmDialog } from '@/features/clone/confirm-dialog';
import { apiJson, describeError } from '@/lib/api/client';
import { queryKeys } from '@/lib/query';
import { SettingsActionError } from './settings-action-error';
import { SettingsRow, SettingsSection } from './settings-layout';

/** `GET /api/settings/ignis/status` (backend/services/ignis_mode.py). */
export interface IgnisStatus {
  open: boolean;
  enabled: boolean;
  version: string | null;
  gpu: string | null;
  base_url: string;
  voice: {
    ready: boolean;
    backend: string | null;
    missing_bytes: number;
    license: string | null;
    commercial_use: boolean | null;
  };
  transcription: { ready: boolean; missing_bytes: number };
  download_url: string;
  platform_supported: boolean;
}

export const IGNIS_STATUS_KEY = ['ignis-status'] as const;
const STATUS_PATH = '/api/settings/ignis/status';

/** Ignis state; polls only while a preparation the person started is running. */
/** True for a well-formed status; an older or remote backend may answer otherwise. */
export function isIgnisStatus(value: unknown): value is IgnisStatus {
  const status = value as Partial<IgnisStatus> | null;
  return (
    typeof status?.open === 'boolean' &&
    typeof status.platform_supported === 'boolean' &&
    typeof status.voice?.ready === 'boolean' &&
    typeof status.transcription?.ready === 'boolean'
  );
}

export function useIgnisStatus(preparing = false) {
  return useQuery({
    queryKey: IGNIS_STATUS_KEY,
    queryFn: async ({ signal }) => {
      const status = await apiJson<unknown>(STATUS_PATH, { signal });
      return isIgnisStatus(status) ? status : null;
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      return preparing && data?.open && !(data.voice.ready && data.transcription.ready)
        ? 5000
        : false;
    },
  });
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

/**
 * "Use the GPU through Ignis": the owner's local engine runs voice, transcription
 * and the language model on AMD, NVIDIA or Intel GPUs (docs/engines/ignis.md).
 * Shown in first-run setup and in Settings → Performance; nothing changes for
 * people without Ignis.
 */
export function IgnisCard({ variant }: { variant: 'setup' | 'settings' }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [preparing, setPreparing] = useState(false);
  const status = useIgnisStatus(preparing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmPrepare, setConfirmPrepare] = useState(false);
  const data = status.data ?? null;

  const refreshChoices = async (next?: IgnisStatus) => {
    if (next) queryClient.setQueryData(IGNIS_STATUS_KEY, next);
    await Promise.all(
      [queryKeys.engines, ['llm-providers'], ['asr-openai-compat'], ['translation-engines']].map(
        (queryKey) => queryClient.invalidateQueries({ queryKey }),
      ),
    );
  };

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    setError('');
    try {
      const next = await apiJson<IgnisStatus>(
        enabled ? '/api/settings/ignis/enable' : '/api/settings/ignis/disable',
        { method: 'POST' },
      );
      await refreshChoices(next);
    } catch (reason) {
      setError(describeError(reason));
      void status.refetch();
    } finally {
      setBusy(false);
    }
  };

  const missingFamilies = data
    ? [
        ...(data.voice.ready ? [] : ['voz']),
        ...(data.transcription.ready ? [] : ['transcricao']),
      ]
    : [];
  const missingBytes = data
    ? (data.voice.ready ? 0 : data.voice.missing_bytes) +
      (data.transcription.ready ? 0 : data.transcription.missing_bytes)
    : 0;

  const prepare = async () => {
    setError('');
    try {
      await apiJson('/api/settings/ignis/prepare', {
        method: 'POST',
        body: JSON.stringify({ families: missingFamilies }),
      });
      setPreparing(true);
      void status.refetch();
    } catch (reason) {
      setError(describeError(reason));
    }
  };

  const recommended = variant === 'setup' && data?.gpu && !/nvidia/i.test(data.gpu);

  // A backend without these routes (older or remote) or a malformed answer
  // hides the option instead of showing an error the person cannot act on.
  if (status.isError || (status.isSuccess && !data)) return null;

  return (
    <SettingsSection icon={CpuIcon} title={t('ignis.title')}>
      {status.isPending && (
        <SettingsRow id="ignis-loading" title={t('ignis.description')}>
          <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" />
        </SettingsRow>
      )}
      {data && !data.platform_supported && (
        <SettingsRow id="ignis-unsupported" title={t('ignis.mac_unsupported')}>
          <span />
        </SettingsRow>
      )}
      {data && data.platform_supported && !data.open && (
        <SettingsRow
          id="ignis-closed"
          title={t('ignis.closed_title')}
          description={t('ignis.closed_desc')}
        >
          <div className="flex flex-wrap items-center gap-2">
            <ExternalLink href={data.download_url}>{t('ignis.download')}</ExternalLink>
            <Button variant="ghost" size="sm" onClick={() => void status.refetch()}>
              <RefreshCwIcon className={status.isFetching ? 'animate-spin' : undefined} />
              {t('ignis.check_again')}
            </Button>
          </div>
        </SettingsRow>
      )}
      {data && data.platform_supported && data.open && (
        <>
          <SettingsRow
            id="ignis-switch"
            title={
              <span className="inline-flex flex-wrap items-center gap-2">
                <span id="ignis-switch-label">{t('ignis.switch_title')}</span>
                {recommended && <Badge variant="secondary">{t('ignis.recommended')}</Badge>}
              </span>
            }
            description={
              <>
                {data.gpu ? t('ignis.gpu', { gpu: data.gpu }) : t('ignis.description')}{' '}
                {t('ignis.switch_desc')}
              </>
            }
          >
            <div className="flex items-center gap-2">
              {busy && <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" />}
              <Switch
                aria-labelledby="ignis-switch-label"
                checked={data.enabled}
                disabled={busy}
                onCheckedChange={(checked) => void toggle(checked)}
              />
            </div>
          </SettingsRow>
          <SettingsRow
            id="ignis-state"
            title={t('ignis.state_title')}
            description={
              <>
                {data.voice.ready
                  ? t('ignis.voice_ready', { backend: data.voice.backend ?? 'GPU' })
                  : t('ignis.voice_not_ready')}{' '}
                ·{' '}
                {data.transcription.ready
                  ? t('ignis.transcription_ready')
                  : t('ignis.transcription_not_ready')}
              </>
            }
          >
            {missingFamilies.length > 0 &&
              (preparing ? (
                <span role="status" className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <LoaderCircleIcon className="size-3.5 animate-spin" />
                  {t('ignis.preparing')}
                </span>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setConfirmPrepare(true)}>
                  {t('ignis.prepare')}
                </Button>
              ))}
          </SettingsRow>
        </>
      )}
      {error && (
        <div className="p-4">
          <SettingsActionError
            title={t('ignis.error')}
            detail={error}
            onDismiss={() => setError('')}
          />
        </div>
      )}
      <ConfirmDialog
        open={confirmPrepare}
        onOpenChange={setConfirmPrepare}
        title={t('ignis.prepare_title')}
        description={t('ignis.prepare_desc', {
          size: formatBytes(missingBytes),
          license: data?.voice.license ?? 'CC BY-NC 4.0',
        })}
        confirmLabel={t('ignis.prepare_confirm')}
        onConfirm={prepare}
      />
    </SettingsSection>
  );
}
