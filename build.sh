#!/bin/sh
# Bundle the game into dist/: index.html + app.js
set -e
cd "$(dirname "$0")"
npx esbuild src/main.js --bundle --format=esm --minify --target=es2020 --outfile=dist/app.js --log-level=warning
npx esbuild src/boot.js --format=esm --minify --target=es2022 --outfile=dist/boot.js --log-level=warning
cp src/index.html dist/index.html
cp -r assets/site/. dist/
cp assets/sea.json dist/sea.json
rm -f dist/animals.glb dist/animals.json
node -e "const fs=require('fs');for(const f of fs.readdirSync('assets/q')){const id=f.replace('.glb','');fs.writeFileSync('dist/q-'+id+'.json',JSON.stringify({format:'glb',credit:'Quaternius, Ultimate Animated Animal Pack, CC0',base64:fs.readFileSync('assets/q/'+f).toString('base64')}))}"
ls -la dist
