import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChromePreference } from '../../../../preload/index.d';
import { Button } from '@/components/ui/button';
import { useWindowChrome } from '@/components/app-shell/window-controls';
import { SettingsRow } from './settings-layout';

const OPTIONS: { value: ChromePreference; label: string }[] = [
  { value: 'auto', label: 'windowControls.style_auto' },
  { value: 'windows', label: 'Windows' },
  { value: 'gnome', label: 'GNOME' },
  { value: 'kde', label: 'KDE' },
  { value: 'mac', label: 'Mac' },
];

function desktopWindow() {
  if (typeof window === 'undefined') return null;
  return (window as { voicestudio?: Window['voicestudio'] }).voicestudio ?? null;
}

/**
 * Settings → Appearance: window-button style (Windows and Linux). Automatic
 * follows the system (and gives Matsu OS its own dots); macOS keeps its native
 * traffic lights, so the row is not shown there.
 */
export function WindowStyleSettings() {
  const { t } = useTranslation();
  const chrome = useWindowChrome();
  const [pending, setPending] = useState<ChromePreference | null>(null);
  const [restartHint, setRestartHint] = useState(false);
  const bridge = desktopWindow();
  if (!bridge?.window?.setChromePreference || bridge.app.platform === 'darwin' || !chrome) return null;
  const current = pending ?? chrome.preference;
  const choose = async (value: ChromePreference) => {
    setPending(value);
    try {
      const result = await bridge.window.setChromePreference(value);
      setRestartHint(result.restartRequired);
    } catch {
      setPending(null);
    }
  };
  return (
    <SettingsRow
      id="window-style-label"
      title={t('windowControls.style_title')}
      description={restartHint ? t('windowControls.restart_hint') : t('windowControls.style_desc')}
    >
      <div className="flex flex-wrap gap-1" role="group" aria-labelledby="window-style-label">
        {OPTIONS.map(({ value, label }) => (
          <Button
            key={value}
            size="sm"
            variant={current === value ? 'secondary' : 'ghost'}
            aria-pressed={current === value}
            onClick={() => void choose(value)}
          >
            {label.startsWith('windowControls.') ? t(label) : label}
          </Button>
        ))}
      </div>
    </SettingsRow>
  );
}
