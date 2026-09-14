import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  // アーティファクトや任意のサブパスに置けるよう相対パスで出す。
  base: './',
  plugins: [react(), tailwindcss()],
})
