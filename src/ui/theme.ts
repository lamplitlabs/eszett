// Eszett's design tokens. The app is an exercise book under a desk lamp: the learner writes in royal-blue
// ink (Königsblau, the German school fountain-pen ink), the tutor corrects in red pen, and whatever the
// app has verified carries the lamp's amber light. Every noun wears its gender colour (der, die, das).
// German is always set in Vollkorn; the interface is Fira Sans.

import { createContext, useContext } from 'react';
import type { TextStyle } from 'react-native';

export interface Palette {
  paper: string;
  sheet: string;
  sheetAlt: string;
  rule: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  royal: string;
  onRoyal: string;
  royalTint: string;
  red: string;
  redTint: string;
  amber: string;
  amberInk: string;
  amberTint: string;
  green: string;
  greenTint: string;
  der: string;
  die: string;
  das: string;
  derTint: string;
  dieTint: string;
  dasTint: string;
  scrim: string;
}

export const light: Palette = {
  paper: '#F5F6F9',
  sheet: '#FFFFFF',
  sheetAlt: '#ECEFF5',
  rule: '#D8DFEB',
  ink: '#182033',
  inkSoft: '#566075',
  inkFaint: '#8A93A6',
  royal: '#2442C6',
  onRoyal: '#FFFFFF',
  royalTint: '#E7EBFB',
  red: '#CF3427',
  redTint: '#FCEBE8',
  amber: '#E89B12',
  amberInk: '#8A5900',
  amberTint: '#FDF2DC',
  green: '#1C8556',
  greenTint: '#E4F3EB',
  der: '#2A73E0',
  die: '#D2336A',
  das: '#11906A',
  derTint: '#E5EFFD',
  dieTint: '#FBE8EF',
  dasTint: '#E2F4EE',
  scrim: 'rgba(24, 32, 51, 0.38)',
};

export const dark: Palette = {
  paper: '#0E1322',
  sheet: '#161C2E',
  sheetAlt: '#1E2539',
  rule: '#2A3249',
  ink: '#E9EDF5',
  inkSoft: '#A3ACBF',
  inkFaint: '#6F788D',
  royal: '#8197FF',
  onRoyal: '#0E1322',
  royalTint: '#1E2852',
  red: '#FF6F61',
  redTint: '#3B1E22',
  amber: '#FFB532',
  amberInk: '#FFC861',
  amberTint: '#33290F',
  green: '#4FC78E',
  greenTint: '#13301F',
  der: '#72A9FF',
  die: '#FF7BA6',
  das: '#4FD3A2',
  derTint: '#18284A',
  dieTint: '#3A1A2A',
  dasTint: '#11312A',
  scrim: 'rgba(0, 0, 0, 0.55)',
};

export const font = {
  sans: 'FiraSans_400Regular',
  sansItalic: 'FiraSans_400Regular_Italic',
  sansMedium: 'FiraSans_500Medium',
  sansSemi: 'FiraSans_600SemiBold',
  sansBold: 'FiraSans_700Bold',
  de: 'Vollkorn_400Regular',
  deItalic: 'Vollkorn_400Regular_Italic',
  deMedium: 'Vollkorn_500Medium',
  deSemi: 'Vollkorn_600SemiBold',
  deSemiItalic: 'Vollkorn_600SemiBold_Italic',
  deBold: 'Vollkorn_700Bold',
} as const;

/** The type scale: a 1.2 ratio from a 16 pt body, serif lines one step more leading than sans. */
export const type = {
  display: { fontFamily: font.deSemi, fontSize: 34, lineHeight: 40, letterSpacing: -0.4 },
  title: { fontFamily: font.sansSemi, fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  headline: { fontFamily: font.sansSemi, fontSize: 19, lineHeight: 25, letterSpacing: -0.1 },
  body: { fontFamily: font.sans, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: font.sansMedium, fontSize: 16, lineHeight: 23 },
  small: { fontFamily: font.sans, fontSize: 14, lineHeight: 20 },
  smallStrong: { fontFamily: font.sansMedium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: font.sansMedium, fontSize: 12, lineHeight: 16, letterSpacing: 0.1 },
  german: { fontFamily: font.de, fontSize: 18, lineHeight: 27 },
  germanStrong: { fontFamily: font.deSemi, fontSize: 18, lineHeight: 27 },
  germanLarge: { fontFamily: font.deSemi, fontSize: 24, lineHeight: 31 },
  cue: { fontFamily: font.deSemi, fontSize: 40, lineHeight: 48, letterSpacing: -0.5 },
} satisfies Record<string, TextStyle>;

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, x3: 32, x4: 40 } as const;
export const gutter = 20;
export const radius = { sheet: 22, control: 14, small: 10, pill: 999 } as const;

export interface Theme {
  scheme: 'light' | 'dark';
  c: Palette;
}

export const ThemeContext = createContext<Theme>({ scheme: 'light', c: light });
export const useTheme = () => useContext(ThemeContext);

export const genderColor = (c: Palette, article: string | null | undefined) =>
  article === 'der' ? c.der : article === 'die' ? c.die : article === 'das' ? c.das : c.inkSoft;

export const genderTint = (c: Palette, article: string | null | undefined) =>
  article === 'der' ? c.derTint : article === 'die' ? c.dieTint : article === 'das' ? c.dasTint : c.sheetAlt;
