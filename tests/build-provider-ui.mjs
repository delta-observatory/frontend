import {build} from 'vite';
import {fileURLToPath} from 'node:url';
await build({configFile:false,root:fileURLToPath(new URL('../',import.meta.url)),base:'./',build:{outDir:'../release/.build/provider-ui-fixture',emptyOutDir:true,rollupOptions:{input:'tests/provider-ui.html'}}});
