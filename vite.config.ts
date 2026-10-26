import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

/**
 * Ensures the built app works in all Android APK WebView environments:
 * 1. Uses relative asset paths (base: './')
 * 2. Converts the ES module bundle to a classic ES2019 IIFE script so Android WebViews
 *    loading via file:///android_asset/ never block scripts due to CORS on type="module"
 * 3. Inlines CSS & JS into dist/index.html and android-apk/index.html, and writes
 *    public/apk-bundle.js & public/apk-bundle.css so even opening the raw downloaded ZIP
 *    directly in an APK builder (without running npm run build) works out of the box!
 */
function androidApkCompatibilityPlugin(): Plugin {
  return {
    name: 'android-apk-compatibility',
    apply: 'build',
    closeBundle() {
      try {
        const distDir = path.resolve(__dirname, 'dist');
        const assetsDir = path.join(distDir, 'assets');
        if (!fs.existsSync(assetsDir)) return;

        const files = fs.readdirSync(assetsDir);
        const jsFile = files.find((f) => f.endsWith('.js'));
        const cssFile = files.find((f) => f.endsWith('.css'));

        if (!jsFile) return;

        const rawJs = fs.readFileSync(path.join(assetsDir, jsFile), 'utf-8');
        const rawCss = cssFile
          ? fs.readFileSync(path.join(assetsDir, cssFile), 'utf-8')
          : '';

        // Convert ES module output into a self-contained ES2019 IIFE for Android WebView (file:// safe)
        const transformed = esbuild.transformSync(rawJs, {
          format: 'iife',
          target: 'es2019',
          minify: true,
        });
        const iifeJs = transformed.code;

        // 1. Save standalone bundles in public/ so raw ZIP archive works in HTML-to-APK tools
        const publicDir = path.resolve(__dirname, 'public');
        fs.mkdirSync(publicDir, {recursive: true});
        fs.writeFileSync(path.join(publicDir, 'apk-bundle.js'), iifeJs, 'utf-8');
        fs.writeFileSync(path.join(publicDir, 'apk-bundle.css'), rawCss, 'utf-8');

        // Also copy to dist/ root
        fs.writeFileSync(path.join(distDir, 'apk-bundle.js'), iifeJs, 'utf-8');
        fs.writeFileSync(path.join(distDir, 'apk-bundle.css'), rawCss, 'utf-8');

        // 2. Build a 100% self-contained index.html for dist/index.html and android-apk/index.html
        const safeInlineJs = iifeJs.replace(/<\/script>/gi, '<\\/script>');
        const selfContainedHtml = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <title>Чудо-Пазлы: Мастерская Картинок</title>
    <meta name="description" content="Детская развивающая игра-пазл для планшета: загружай свою картинку или выбирай сказочный сюжет, перемещай и соединяй кусочки пазла со звуковыми эффектами и праздничным салютом победы." />
    <style>${rawCss}</style>
  </head>
  <body style="margin:0;padding:0;background-color:#2c1b12;color:#fff8ed;overflow:hidden;">
    <div id="root"></div>
    <script>${safeInlineJs}</script>
  </body>
</html>`;

        fs.writeFileSync(path.join(distDir, 'index.html'), selfContainedHtml, 'utf-8');

        const apkDir = path.resolve(__dirname, 'android-apk');
        fs.mkdirSync(apkDir, {recursive: true});
        fs.writeFileSync(path.join(apkDir, 'index.html'), selfContainedHtml, 'utf-8');
      } catch (err) {
        console.warn('Android APK bundle helper warning:', err);
      }
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), androidApkCompatibilityPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      target: 'es2019',
      assetsInlineLimit: 100000,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
