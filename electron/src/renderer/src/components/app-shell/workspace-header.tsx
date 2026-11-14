import { SupportShortcut } from './support-shortcut';
import { SidebarToggle } from './sidebar-toggle';
import type { ReactNode } from 'react';
import { SearchIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isMac } from '@/components/bridge';

export function WorkspaceHeader({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <header
      className={cn(
        'workspace-titlebar flex shrink-0 items-center gap-3 border-b border-border/50 px-5',
        !isMac() && 'native-controls-right',
      )}
    >
      {!isMac() && <SidebarToggle />}
      {children}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <SupportShortcut />
        <Button
          variant="ghost"
          size="sm"
          className="group h-8 shrink-0 gap-2 rounded-full border border-transparent px-3 text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground hover:shadow-(--shadow-card)"
          aria-label={t('preferences.search')}
          title={isMac() ? 'Command + K' : 'Ctrl + K'}
          onClick={() => window.dispatchEvent(new Event('voicestudio:commands'))}
        >
          <SearchIcon className="transition-colors duration-150" />
          <span className="hidden text-xs lg:inline">{isMac() ? '⌘K' : 'Ctrl K'}</span>
        </Button>
      </div>
    </header>
  );
}
