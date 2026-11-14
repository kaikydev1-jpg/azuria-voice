import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { SettingsRow } from './settings-layout';

function desktopApp() {
  if (typeof window === 'undefined') return null;
  return (window as { voicestudio?: Window['voicestudio'] }).voicestudio?.app ?? null;
}

/**
 * Settings → General: closing the window keeps Azúria in the tray (on by
 * default on Windows and Linux, so dictation and voice keep working). macOS
 * keeps the app in the Dock either way, so the row is not shown there.
 */
export function CloseToTraySettings() {
  const { t } = useTranslation();
  const app = desktopApp();
  const supported = Boolean(app?.closeToTray) && app?.platform !== 'darwin';
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    if (!supported) return;
    void app!.closeToTray().then(setEnabled, () => setEnabled(true));
  }, [app, supported]);
  if (!supported || enabled === null) return null;
  return (
    <SettingsRow id="close-to-tray-label" title={t('windowControls.tray_title')} description={t('windowControls.tray_desc')}>
      <Switch
        aria-labelledby="close-to-tray-label"
        checked={enabled}
        onCheckedChange={(value) => {
          setEnabled(value);
          void app!.setCloseToTray(value).then(setEnabled, () => setEnabled(!value));
        }}
      />
    </SettingsRow>
  );
}
