/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#10241C', soft: '#1D3A2E', mute: '#4A6157' },
        forest: {
          50: '#EFF5F0', 100: '#DCE9DE', 200: '#B9D3BF', 300: '#8FB59A',
          400: '#5F9070', 500: '#3C7253', 600: '#2A5C42', 700: '#1F4A35',
          800: '#173A2A', 900: '#102B1F', 950: '#081A13',
        },
        parchment: { DEFAULT: '#F7F3EA', deep: '#EFE8D9', light: '#FCFAF4' },
        brass: {
          50: '#FBF6E9', 100: '#F5E9C8', 200: '#EBD49A', 300: '#DDB965',
          400: '#CFA043', 500: '#B98631', 600: '#986A26', 700: '#7A5322',
          800: '#644321', 900: '#53381F',
        },
        clay: { 50: '#FBF1EC', 100: '#F6DFD3', 200: '#EDBEA8', 300: '#E09472', 400: '#D26F48', 500: '#C05530', 600: '#A54326', 700: '#863422', 800: '#6E2D21', 900: '#5C281F' },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,36,28,0.04), 0 8px 24px -12px rgba(16,36,28,0.12)',
        lift: '0 24px 60px -24px rgba(16,36,28,0.35)',
        book: '6px 8px 20px -8px rgba(16,36,28,0.45)',
      },
      borderRadius: { xl2: '1.25rem' },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
      },
      animation: {
        'fade-up': 'fade-up .5s cubic-bezier(.21,.6,.35,1) both',
        'fade-in': 'fade-in .3s ease both',
      },
    },
  },
  plugins: [],
};
