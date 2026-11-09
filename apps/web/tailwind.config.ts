import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        parish: {
          navy: '#0B1230',
          night: '#1B0F3A',
          gold: '#F5C451',
          goldLight: '#FFE9A8',
          burgundy: '#8E1B2E',
          cream: '#FFF6E0',
        },
      },
      fontFamily: {
        title: ['Playfair Display', 'Cormorant Garamond', 'serif'],
        body: ['Be Vietnam Pro', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
