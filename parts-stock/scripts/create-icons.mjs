import fs from 'node:fs/promises';
import sharp from 'sharp';
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="104" fill="#1958d1"/><g fill="none" stroke="#fff" stroke-width="18" stroke-linejoin="round" stroke-linecap="round"><path d="M148 197 256 139 364 197 256 258Z"/><path d="M148 197v122l108 59 108-59V197M256 258v120M203 168l109 59"/></g></svg>';
await fs.writeFile(new URL('../public/favicon.svg',import.meta.url),svg);
for(const [file,size] of [['icon-192.png',192],['icon-512.png',512],['icon-maskable.png',512],['apple-touch-icon.png',180]])await sharp(Buffer.from(svg.replace('rx="104"',file==='icon-maskable.png'?'rx="0"':'rx="104"'))).resize(size,size).png().toFile(new URL('../public/'+file,import.meta.url).pathname);
