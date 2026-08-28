/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        shield: {
          50: '#eef4ff',
          100: '#dae7ff',
          200: '#bcd3ff',
          300: '#8db5ff',
          400: '#568cff',
          500: '#2f63fb',
          600: '#1c42f0',
          700: '#1731d6',
          800: '#182aad',
          900: '#182989',
          950: '#121a54',
        },
        risk: {
          low: '#12946f',
          lowBg: '#e7f7f1',
          medium: '#b4790a',
          mediumBg: '#fdf2df',
          high: '#c8293c',
          highBg: '#fdeaec',
        },
        ink: {
          900: '#0c1220',
          800: '#161d2f',
          700: '#232c42',
          600: '#3a445c',
          500: '#5b6784',
          400: '#8792ac',
          300: '#b7bfd4',
          200: '#dde1ec',
          100: '#eef1f7',
          50: '#f7f8fc',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(12, 18, 32, 0.04), 0 4px 16px rgba(12, 18, 32, 0.06)',
        popover: '0 8px 30px rgba(12, 18, 32, 0.16)',
      },
      borderRadius: {
        xl2: '1.1rem',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease',
      },
    },
  },
  plugins: [],
}
