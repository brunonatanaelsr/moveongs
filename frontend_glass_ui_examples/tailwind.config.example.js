/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{ts,tsx}',
    './frontend_glass_ui_examples/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        imm: {
          cyan: '#22d3ee',
          indigo: '#8b5cf6',
          emerald: '#34d399'
        }
      },
      borderRadius: {
        'glass-lg': '1.75rem'
      },
      boxShadow: {
        glass: '0 25px 50px -20px rgba(15, 23, 42, 0.45)'
      },
      backdropBlur: {
        '3xl': '40px'
      }
    }
  },
  plugins: []
};
