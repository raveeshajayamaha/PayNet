import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "charts",
              test: /node_modules[\\/](recharts|d3-|victory|@reduxjs|react-redux|immer|reselect)/,
              priority: 20,
            },
            {
              name: "motion",
              test: /node_modules[\\/](framer-motion|motion)/,
              priority: 15,
            },
            { name: "vendor", test: /node_modules/, priority: 0 },
          ],
        },
      },
    },
  },
});
