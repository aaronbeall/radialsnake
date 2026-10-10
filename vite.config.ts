import { defineConfig } from 'vite';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  plugins: [{
    name: 'local-gameplay-recording',
    configureServer(server) {
      server.middlewares.use('/__recording', async (request, response) => {
        if (request.method !== 'POST') { response.statusCode = 405; response.end(); return; }
        if (request.headers.origin !== `http://${request.headers.host}`) {
          response.statusCode = 403; response.end(); return;
        }
        try {
          const chunks: Buffer[] = []; let size = 0;
          for await (const chunk of request) {
            size += chunk.length;
            if (size > 128 * 1024 * 1024) { response.statusCode = 413; response.end(); return; }
            chunks.push(Buffer.from(chunk));
          }
          if (!size) { response.statusCode = 400; response.end(); return; }
          const docs = resolve(server.config.root, 'docs');
          await mkdir(docs, { recursive: true });
          await writeFile(resolve(docs, 'gameplay.webm'), Buffer.concat(chunks));
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ saved: true }));
        } catch {
          response.statusCode = 500; response.end('Unable to save recording');
        }
      });
    },
  }],
});
