import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
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
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        body: ['16px', { lineHeight: '1.5' }],
        cardTitle: ['20px', { lineHeight: '1.3', fontWeight: '600' }],
        sectionHeader: ['24px', { lineHeight: '1.3', fontWeight: '700' }],
        bigTitle: ['32px', { lineHeight: '1.2', fontWeight: '700' }],
      },
      borderRadius: {
        card: '16px',
      },
      boxShadow: {
        card: '0 2px 8px rgba(26, 58, 92, 0.06), 0 1px 2px rgba(26, 58, 92, 0.04)',
        cardHover: '0 8px 24px rgba(26, 58, 92, 0.1), 0 2px 6px rgba(26, 58, 92, 0.06)',
      },
      transitionTimingFunction: {
        soft: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
