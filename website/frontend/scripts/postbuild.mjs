// GitHub Pages serves 404.html for unknown paths. Copying index.html there
// makes clean URLs (/taxon/ID) work without a redirect trick.
import { copyFileSync, writeFileSync } from 'node:fs'
copyFileSync('dist/index.html', 'dist/404.html')
writeFileSync('dist/.nojekyll', '')
console.log('postbuild: wrote dist/404.html and dist/.nojekyll')
