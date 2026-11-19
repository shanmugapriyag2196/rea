module.exports = {
  content: [
    './client/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#000000',
        surface: '#0a0a0a',
        'surface-2': '#111111',
        border: '#222222',
        'border-light': '#1a1a1a',
        text: '#ffffff',
        'text-dim': '#888888',
        'text-muted': '#555555',
        accent: '#ffffff',
        'accent-dim': '#a3a3a3',
        success: '#00ff88',
        warning: '#ffb020',
        error: '#ff3b3b',
        info: '#00a3ff',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '1.4' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
      },
    },
  },
  plugins: [],
}