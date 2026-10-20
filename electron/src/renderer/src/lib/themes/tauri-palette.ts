import { GROVE_THEME, type ThemeColors, type ThemeDefinition } from './t3-palettes';

// Azúria Voice silver and blue palette with the existing heritage identity.
// The light variant is a complementary adaptation; the original default is dark.
function colors(light: boolean): ThemeColors {
  const canvas = light ? '#F1F5F9' : '#0B1220';
  const chrome = light ? '#E2E8F0' : '#0B1220';
  const surface = light ? '#FFFFFF' : '#111D30';
  const text = light ? '#0B1220' : '#E2E8F0';
  const muted = light ? '#64748B' : '#CBD5E1';
  const action = '#2563EB';
  const border = light ? '#CBD5E1' : 'rgb(203 213 225 / 14%)';
  const hover = light ? '#DBEAFE' : '#1E293B';
  return {
    ...(light ? GROVE_THEME.colors : GROVE_THEME.variants!.dark!),
    canvas,
    chrome,
    toolbar: chrome,
    toolbarForeground: text,
    toolbarBorder: border,
    toolbarControl: surface,
    toolbarControlForeground: text,
    toolbarControlHover: hover,
    surface,
    surfaceRaised: light ? '#FFFFFF' : '#1E293B',
    surfaceOverlay: light ? '#FFFFFF' : '#1E293B',
    text,
    textMuted: muted,
    border,
    input: border,
    focus: action,
    accent: action,
    accentForeground: '#FFFFFF',
    secondary: hover,
    secondaryForeground: text,
    muted: hover,
    mutedForeground: muted,
    placeholder: muted,
    secondaryLabel: muted,
    iconMuted: muted,
    error: light ? '#9d0006' : '#fb4934',
    errorForeground: light ? '#9d0006' : '#fb4934',
    errorSurface: surface,
    warning: light ? '#af3a03' : '#fabd2f',
    warningForeground: light ? '#af3a03' : '#fabd2f',
    warningSurface: surface,
    update: action,
    updateForeground: action,
    updateSurface: hover,
    accentSurface: hover,
    accentSurfaceForeground: text,
    messageSurface: surface,
    messageForeground: text,
    messageAction: action,
    messageActionForeground: '#FFFFFF',
    messageActionHover: light ? '#1D4ED8' : '#3B82F6',
    codeBackground: chrome,
    codeForeground: text,
    sidebar: chrome,
    sidebarForeground: text,
    sidebarMutedForeground: muted,
    sidebarControlSurface: surface,
    sidebarRowHover: hover,
    sidebarRowActive: light ? '#BFDBFE' : '#172F50',
    sidebarRowSelected: surface,
    sidebarBorder: border,
    terminalBackground: canvas,
    terminalForeground: text,
    terminalCursor: action,
    terminalSelection: hover,
    terminalScrollbar: border,
    terminalScrollbarHover: muted,
  };
}
export const TAURI_THEME: ThemeDefinition = {
  id: 'heritage',
  label: 'Azúria Voice Classic',
  appearance: 'dark',
  colors: colors(false),
  variants: { light: colors(true) },
  sidebarArtwork: true,
};
