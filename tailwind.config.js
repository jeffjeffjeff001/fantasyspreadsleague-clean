/** @type {import('tailwindcss').Config} */
// tailwind.config.js
module.exports = {
  content: ['./pages/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          400: '#7b5cd6',
          500: '#5f3dc4',
          600: '#4b2da1',
        },
      },
      boxShadow: {
        'xl-soft': '0 8px 30px rgba(0,0,0,0.12)',
      },
    },
  },
  plugins: [],
}
