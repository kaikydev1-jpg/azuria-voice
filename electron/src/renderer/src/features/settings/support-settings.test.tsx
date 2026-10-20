import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const open = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/components/bridge', () => ({
  getBridge: () => ({ files: { openExternal: open } }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('./donation-goal', () => ({ DonationGoal: () => null }));
vi.mock('@/components/report-bug', () => ({ ReportBug: () => <button>report bug</button> }));

import { SupportSettings } from './support-settings';
import { ISSUES_URL, REPO_URL, SECURITY_URL } from '@shared/utils/contactLinks';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('keeps issue, source and private security help without purchase or donation controls', () => {
  render(<SupportSettings />);
  expect(open).not.toHaveBeenCalled();
  const issues = screen.getByRole('link', { name: 'contact.feature_cta' });
  expect(issues).toHaveAttribute('href', ISSUES_URL);
  expect(screen.getByRole('link', { name: 'contact.website' })).toHaveAttribute('href', REPO_URL);
  expect(screen.getByRole('link', { name: 'contact.security_cta' })).toHaveAttribute(
    'href',
    SECURITY_URL,
  );
  expect(screen.getByRole('button', { name: 'report bug' })).toBeVisible();
  expect(screen.queryByRole('link', { name: 'PayPal' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'GitHub Sponsors' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'supportPlans.get_pro' })).toBeNull();
  expect(screen.queryByRole('group', { name: 'donate.choose_method' })).toBeNull();
  fireEvent.click(issues);
  expect(open).toHaveBeenCalledWith(ISSUES_URL);
});
