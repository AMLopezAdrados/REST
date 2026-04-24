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
        coral: '#E8604C',
        amber: '#F0A050',
        green: '#4CAF82',
        blue: '#4A90D9',
        lightBlue: '#EBF3FB',
        lightCoral: '#FDF0EE',
        lightGreen: '#EDF7F1',
        lightAmber: '#FEF6EC',
        textDark: '#1C1917',
        textMid: '#57534E',
        textLight: '#78716C',
        border: '#E7E5E4',
        pencil: '#D6D3D1',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 'sans-serif'],
      },
      fontSize: {
        body: ['15px', { lineHeight: '1.6' }],
        cardTitle: ['18px', { lineHeight: '1.3', fontWeight: '600', letterSpacing: '-0.3px' }],
        sectionHeader: ['20px', { lineHeight: '1.3', fontWeight: '700' }],
      },
      borderRadius: {
        card: '12px',
        pill: '9999px',
      },
      boxShadow: {
        paper: '0 2px 8px -2px rgba(28, 25, 23, 0.05), 0 4px 16px -4px rgba(28, 25, 23, 0.05)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
