import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { BlocksIcon, ChevronDownIcon, ChevronUpIcon, CircleHelpIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { runRendererTask } from '@/lib/global-error-recovery';
import './sponsor-footer.css';

/** Keep the existing content-column footer and its collapse behavior. */
export function SponsorFooter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed)
    return (
      <div className="flex h-6 shrink-0 justify-end border-t border-border/50 bg-sidebar px-2">
        <button
          type="button"
          aria-label={t('homeUi.expandFooter')}
          title={t('homeUi.expandFooter')}
          aria-expanded={false}
          onClick={() => setCollapsed(false)}
          className="flex w-8 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronUpIcon className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    );

  return (
    <div className="sponsor-footer-host">
      <footer aria-label={t('app.name')} className="sponsor-strip">
        <button
          type="button"
          className="sponsor-footer-action"
          onClick={() =>
            runRendererTask('Open integrations', () => navigate({ to: '/integrations' }))
          }
        >
          <BlocksIcon aria-hidden="true" className="size-4" />
          <span>{t('integrationCatalog.title')}</span>
        </button>
        <span className="ml-auto truncate px-2 text-xs text-muted-foreground" translate="no">
          {t('app.name')}
        </span>
        <button
          type="button"
          className="sponsor-footer-action"
          onClick={() => runRendererTask('Open help', () => navigate({ to: '/settings/support' }))}
        >
          <CircleHelpIcon aria-hidden="true" className="size-4" />
          <span>{t('contact.channels_label')}</span>
        </button>
        <button
          type="button"
          className="sponsor-footer-action"
          aria-label={t('homeUi.collapseFooter')}
          title={t('homeUi.collapseFooter')}
          aria-expanded={true}
          onClick={() => setCollapsed(true)}
        >
          <ChevronDownIcon aria-hidden="true" className="size-4" />
        </button>
      </footer>
    </div>
  );
}
