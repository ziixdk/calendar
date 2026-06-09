/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'ZiixCalendar',
      formats: ['es'],
      fileName: () => 'ziix-calendar.js',
    },
    rollupOptions: {
      // dayjs is a peer dependency — keep it out of the bundle
      external: ['dayjs', 'dayjs/plugin/utc', 'dayjs/plugin/timezone'],
      output: {
        assetFileNames: 'ziix-calendar.[ext]',
      },
    },
    cssCodeSplit: false,
    sourcemap: true,
  },
  plugins: [dts({ rollupTypes: true })],
  test: {
    environment: 'node',
    globals: true,
  },
})
