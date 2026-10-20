import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/app-shell/workspace-header', () => ({
  WorkspaceHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
}));
vi.mock('@/features/settings/support-settings', () => ({
  SupportSettings: () => <section aria-label="help" />,
}));
import { ProPage } from './pro-page';

it('keeps the bookmarked route useful without commercial purchase promotions', () => {
  render(<ProPage />);
  expect(screen.getByRole('heading', { name: 'contact.channels_label' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'help' })).toBeVisible();
  expect(screen.queryByRole('link')).toBeNull();
  expect(screen.queryByRole('button', { name: 'proPage.increase_users' })).toBeNull();
});
