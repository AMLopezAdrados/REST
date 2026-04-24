export const colors = {
  background: '#F5F0E8',
  cardBg: '#FFFFFF',
  coral: '#E8604C',     // action
  amber: '#F0A050',     // ongoing
  green: '#4CAF82',     // saved/done
  blue: '#4A90D9',      // info/travel/archive
  lightCoral: '#FDF0EE',
  lightAmber: '#FEF6EC',
  lightGreen: '#EDF7F1',
  lightBlue: '#EBF3FB',
  textDark: '#1C1917',  // warm dark ink (stone-900)
  textMid: '#57534E',   // warm mid gray (stone-600)
  textLight: '#78716C', // warm light gray (stone-500)
  border: '#E7E5E4',    // light stroke
  pencil: '#D6D3D1',    // for the lines between nodes
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
    pillText: '#C07525',
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

