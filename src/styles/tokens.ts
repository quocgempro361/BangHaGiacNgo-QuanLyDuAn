/**
 * Centralized Design Tokens for TBHGN ("Từ Băng Hà Đến Giác Ngộ")
 * Palette: Huyền Lam — Minh Kim — Chu Sa
 *
 * Business task status colors (#BDD7EE, #FFE699, #FFC7CE, #A9D08E, #EDEDED)
 * live in src/utils/taskHelpers.ts and MUST remain unchanged.
 */

export const TBHGN_COLORS = {
  // Primary & Secondary Brand
  huyenLam: '#14243F',
  huyenLamDeep: '#0D192E',
  huyenLamLogoBg: '#233957',
  lamTriTue: '#274467',
  headerInkMuted: '#E6EAF2',

  // Gold Light Accents
  minhKim: '#C9A14B',
  minhKimInk: '#78530E', // WCAG AA dark gold ink on light surfaces (>6:1 contrast)
  minhKimSoft: '#FBF6E8',
  minhKimBorder: '#DFC787',
  kimQuang: '#F1D58B', // Luminous gold on dark Huyền Lam surfaces

  // Restrained Vermilion Accent (5-8% visual budget, never for errors)
  chuSa: '#913F3D',
  chuSaSoft: '#F8EFEF',
  chuSaBorder: '#D9B6B5',

  // Serene Light Canvas & Neutrals
  ngaThien: '#FAF8F3',
  ngaXam: '#E6E2D8',
  surface: '#FFFFFF',
  surfaceMuted: '#F3EFE6',
  inkBody: '#1E293B',
  inkMuted: '#5A6270',
} as const;

export const TBHGN_ICON = {
  strokeWidth: 1.75,
  sizes: {
    inline: 'w-3.5 h-3.5',
    nav: 'w-[18px] h-[18px]',
    button: 'w-4 h-4',
    callout: 'w-5 h-5',
  },
} as const;
