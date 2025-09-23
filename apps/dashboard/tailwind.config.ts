import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        imm: {
          cyan: '#22d3ee',
          indigo: '#8b5cf6',
          emerald: '#34d399',
        },
      },
      backdropBlur: {
        '3xl': '40px',
      },
      boxShadow: {
        glass: '0 25px 50px -20px rgba(15, 23, 42, 0.45)',
      },
      borderRadius: {
        'glass-lg': '1.75rem',
      },
    },
  },
  plugins: [],
};

export default config;
