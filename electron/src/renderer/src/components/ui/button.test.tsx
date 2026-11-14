import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button (Azúria 2)', () => {
  it('draws the primary action as a pill on the shared transition scale', () => {
    render(<Button>Gerar</Button>);
    const button = screen.getByRole('button', { name: 'Gerar' });
    expect(button.className).toContain('rounded-full');
    expect(button.className).toContain('transition-ui');
  });

  it('presses in slightly when clicked', () => {
    render(<Button>Gerar</Button>);
    expect(screen.getByRole('button', { name: 'Gerar' }).className).toContain('active:scale-[0.98]');
  });

  it('keeps the outline border and rounded-lg corners for secondary actions', () => {
    render(<Button variant="outline">Cancelar</Button>);
    const button = screen.getByRole('button', { name: 'Cancelar' });
    expect(button.className).toContain('border-border');
    expect(button.className).toContain('rounded-lg');
    expect(button.className).not.toContain('rounded-full');
  });

  it('still dims and blocks pointer input when disabled', () => {
    render(<Button disabled>Gerar</Button>);
    const button = screen.getByRole('button', { name: 'Gerar' });
    expect(button.className).toContain('disabled:opacity-50');
    expect(button.className).toContain('disabled:pointer-events-none');
  });

  it('lets a caller override the corner radius', () => {
    render(<Button className="rounded-md">Abrir</Button>);
    const button = screen.getByRole('button', { name: 'Abrir' });
    expect(button.className).toContain('rounded-md');
    expect(button.className).not.toContain('rounded-full');
  });
});
