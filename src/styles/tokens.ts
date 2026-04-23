export const colors = {
  background: '#F5F0E8',
  cardBg: '#FFFFFF',
  navy: '#1A3A5C',
  blue: '#2E7DD1',
  coral: '#E8604C',
  amber: '#F0A050',
  green: '#4CAF82',
  lightBlue: '#EBF3FB',
  lightCoral: '#FDF0EE',
  lightGreen: '#EDF7F1',
  lightAmber: '#FEF6EC',
  textDark: '#1A1A1A',
  textMid: '#444444',
  textLight: '#888888',
  border: '#DDDDDD',
} as const;

export const statusColors: Record<string, { stripe: string; tint: string; pill: string; pillText: string }> = {
  action: {
    stripe: colors.coral,
    tint: colors.lightCoral,
    pill: colors.lightCoral,
    pillText: colors.coral,
  },
  ongoing: {
    stripe: colors.amber,
    tint: colors.lightAmber,
    pill: colors.lightAmber,
    pillText: '#B57020',
  },
  saved: {
    stripe: colors.green,
    tint: colors.lightGreen,
    pill: colors.lightGreen,
    pillText: '#2F7A54',
  },
  archive: {
    stripe: colors.blue,
    tint: colors.lightBlue,
    pill: colors.lightBlue,
    pillText: colors.blue,
  },
};
