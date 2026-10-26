import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], root: 'client', publicDir: '../public', build: { outDir: '../dist/client', emptyOutDir: true }, server: { allowedHosts: ['localhost', '127.0.0.1', '.replit.dev', '.repl.co'] } });
