import { useTranslation } from 'react-i18next';
import { WorkspaceHeader } from '@/components/app-shell/workspace-header';
import { SupportSettings } from '@/features/settings/support-settings';

/** Existing bookmarks lead to help; account entitlements remain in Account settings. */
export function ProPage() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkspaceHeader>
        <h1 className="text-sm font-medium">{t('contact.channels_label')}</h1>
      </WorkspaceHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SupportSettings />
      </div>
    </div>
  );
}
