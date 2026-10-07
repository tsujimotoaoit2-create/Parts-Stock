import fs from 'node:fs/promises';
import ts from 'typescript';
const source=await fs.readFile(new URL('../lib/inventory.ts',import.meta.url),'utf8');
const core=ts.transpile(source,{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2020}).replace(/^export /gm,'');
const backend=await fs.readFile(new URL('../apps-script/backend.js',import.meta.url),'utf8');
await fs.mkdir(new URL('../public/download/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('../public/download/Code.gs',import.meta.url),'// 部品室 Google Apps Script. Generated from shared inventory logic.\n'+core+'\n'+backend);
console.log('Built public/download/Code.gs');
