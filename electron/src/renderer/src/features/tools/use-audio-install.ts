import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiJson, describeError } from '@/lib/api/client';
import {
  TERMINAL_MODEL_INSTALL_STATES,
  type ModelInstallJobsResponse,
} from '@/hooks/use-model-install-sync';

type InstallTarget = { kind: 'runtime' | 'weights'; id: string };
interface RuntimeStatus {
  installed: boolean;
  job: null | { state: string; error?: string | null; remediation?: string | null };
}

/** Follow the admitted background job, not the currently selected model. */
export function useAudioInstall(failureText: string) {
  const client = useQueryClient();
  const active = useRef<InstallTarget | null>(null);
  const [starting, setStarting] = useState(false);
  const [target, setTarget] = useState<InstallTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { active.current = null; }, []);

  useEffect(() => {
    if (!target) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        let running: boolean;
        let failure: string | null = null;
        if (target.kind === 'runtime') {
          const status = await apiJson<RuntimeStatus>(
            `/engines/sidecar/${encodeURIComponent(target.id)}/install/status`,
          );
          running = status.job?.state === 'running';
          if (status.job?.state === 'failed') {
            failure = [status.job.error, status.job.remediation].filter(Boolean).join('\n\n') || failureText;
          }
        } else {
          const status = await apiJson<ModelInstallJobsResponse>('/models/install/status');
          const job = status.jobs.find((item) => item.repo_id === target.id);
          // Completed/cancelled downloads disappear from this endpoint. The
          // POST publishes admission before resolving, even for very fast jobs.
          running = Boolean(job && !TERMINAL_MODEL_INSTALL_STATES.has(job.state));
          if (job?.state === 'failed') failure = job.error || failureText;
        }
        if (stopped) return;
        if (running) {
          timer = setTimeout(() => void poll(), 3_000);
          return;
        }
        setError(failure);
      } catch (reason) {
        if (stopped) return;
        setError(describeError(reason));
      }
      active.current = null;
      setTarget(null);
      void client.invalidateQueries({ queryKey: ['audio-gen-catalog'] });
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [target, client, failureText]);

  const start = async (next: InstallTarget) => {
    if (active.current) return;
    active.current = next;
    setError(null);
    setStarting(true);
    try {
      if (next.kind === 'runtime') {
        await apiJson(`/engines/sidecar/${encodeURIComponent(next.id)}/install`, { method: 'POST' });
      } else {
        await apiJson('/models/install', { method: 'POST', body: JSON.stringify({ repo_id: next.id }) });
      }
      if (active.current !== next) return;
      setTarget(next);
      setStarting(false);
    } catch (reason) {
      if (active.current !== next) return;
      active.current = null;
      setStarting(false);
      setError(describeError(reason));
    }
  };

  return { start, installing: starting || target !== null, error, clearError: () => setError(null) };
}
