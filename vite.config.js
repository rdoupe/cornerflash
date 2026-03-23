import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

// Dev plugin: POST /api/save-assignments writes assignments to disk
function saveAssignmentsPlugin() {
  return {
    name: 'save-assignments',
    configureServer(server) {
      server.middlewares.use('/api/save-assignments', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          const dest = path.resolve(__dirname, 'scripts/text_assignments.json');
          fs.writeFileSync(dest, body, 'utf8');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, path: dest }));
        });
      });
    },
  };
}

// Dev plugin: POST /api/save-manifest rewrites public/candidates_new/manifest.json
function saveManifestPlugin() {
  return {
    name: 'save-manifest',
    configureServer(server) {
      server.middlewares.use('/api/save-manifest', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          const dest = path.resolve(__dirname, 'public/candidates_new/manifest.json');
          fs.writeFileSync(dest, body, 'utf8');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, path: dest }));
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    saveAssignmentsPlugin(),
    saveManifestPlugin(),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
})
