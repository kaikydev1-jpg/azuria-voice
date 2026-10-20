import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { SponsorFooter } from './sponsor-footer';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('keeps functional workspace navigation without sponsor, donation or social actions', () => {
  render(<SponsorFooter />);
  fireEvent.click(screen.getByRole('button', { name: 'integrationCatalog.title' }));
  expect(navigate).toHaveBeenCalledWith({ to: '/integrations' });
  fireEvent.click(screen.getByRole('button', { name: 'contact.channels_label' }));
  expect(navigate).toHaveBeenCalledWith({ to: '/settings/support' });
  expect(screen.queryByRole('button', { name: 'sponsorSlot.footer_brand' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'donate.title' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'contact.follow_cta' })).toBeNull();
  expect(screen.queryByRole('link')).toBeNull();
});

it('preserves the footer collapse and restore control', () => {
  render(<SponsorFooter />);
  fireEvent.click(screen.getByRole('button', { name: 'homeUi.collapseFooter' }));
  expect(screen.queryByRole('contentinfo')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'homeUi.expandFooter' }));
  expect(screen.getByRole('contentinfo')).toBeVisible();
});
