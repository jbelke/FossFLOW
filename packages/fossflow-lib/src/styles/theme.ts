import { createTheme, PaletteMode, ThemeOptions } from '@mui/material';
import {
  palettes,
  shadows,
  typography,
  radii,
  iconSizes,
  layout,
  SPACING_UNIT,
  DEFAULT_NODE_COLOR
} from './tokens';

interface CustomThemeVars {
  appPadding: {
    x: number;
    y: number;
  };
  toolMenu: {
    height: number;
  };
  customPalette: {
    [key in string]: string;
  };
}

declare module '@mui/material/styles' {
  interface Theme {
    customVars: CustomThemeVars;
  }

  interface ThemeOptions {
    customVars: CustomThemeVars;
  }
}

/**
 * Mode-dependent. Only `defaultColor` is stable across modes — it seeds
 * diagram content (data), while `diagramBg`/`gridLine` are canvas ground (chrome).
 */
export const customVarsFor = (mode: PaletteMode): CustomThemeVars => {
  return {
    appPadding: layout.appPadding,
    toolMenu: layout.toolMenu,
    customPalette: {
      diagramBg: palettes[mode].canvas.diagramBg,
      gridLine: palettes[mode].canvas.gridLine,
      defaultColor: DEFAULT_NODE_COLOR
    }
  };
};

export const themeConfigFor = (mode: PaletteMode): ThemeOptions => {
  const c = palettes[mode];

  return {
    customVars: customVarsFor(mode),
    spacing: SPACING_UNIT,
    shape: { borderRadius: radii.md },
    shadows: shadows(mode) as ThemeOptions['shadows'],
    typography,
    palette: {
      mode,
      primary: c.primary,
      secondary: c.secondary,
      error: c.error,
      warning: c.warning,
      success: c.success,
      info: c.info,
      background: c.background,
      text: c.text,
      divider: c.divider
    },
    components: {
      MuiCard: {
        defaultProps: {
          elevation: 0,
          variant: 'outlined'
        }
      },
      MuiToolbar: {
        styleOverrides: {
          root: {
            backgroundColor: c.background.paper
          }
        }
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
          variant: 'contained'
        },
        styleOverrides: {
          root: {
            textTransform: 'none'
          }
        }
      },
      MuiSvgIcon: {
        defaultProps: {
          color: 'action'
        },
        styleOverrides: {
          root: {
            width: iconSizes.md,
            height: iconSizes.md
          },
          fontSizeSmall: { width: iconSizes.sm, height: iconSizes.sm },
          fontSizeLarge: { width: iconSizes.lg, height: iconSizes.lg }
        }
      },
      MuiTextField: {
        defaultProps: {
          variant: 'outlined'
        }
      },
      MuiCssBaseline: {
        styleOverrides: {
          /**
           * Inline code / keycaps. Defined globally so no call site has to
           * hardcode a light-mode grey (which renders as an unreadable white
           * pill once the theme flips to dark).
           */
          'code, kbd': {
            backgroundColor: c.background.default,
            color: c.text.primary,
            border: `1px solid ${c.divider}`,
            padding: '2px 6px',
            borderRadius: radii.sm,
            fontFamily: 'monospace'
          },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              transitionDuration: '0.01ms !important',
              scrollBehavior: 'auto !important'
            }
          }
        }
      }
    }
  };
};

export const createAppTheme = (mode: PaletteMode) => {
  return createTheme(themeConfigFor(mode));
};

/**
 * Back-compat exports. Existing consumers import these at module scope
 * (`Renderer.tsx`, `IconButton.tsx`, `config.ts`, ...), so they must keep
 * working — but a module-level const cannot follow a mode change. Anything
 * that needs to react to dark mode must call `useTheme()` instead.
 */
export const customVars = customVarsFor('light');
export const themeConfig = themeConfigFor('light');
export const theme = createAppTheme('light');
