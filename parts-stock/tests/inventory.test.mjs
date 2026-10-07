import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const text=await fs.readFile(new URL('../lib/inventory.ts',import.meta.url),'utf8');
const js=ts.transpile(text,{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2020});
const {applyCommand,emptyPart}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const base=()=>({id:'part-test-01',name:'抵抗 100本入り',purpose:'試作',model:'R-10K',price:100,supplier:'調達先',quantity:1,unit:'袋',minimum:0.5,order:'',checked:'2026-09-24',notes:'テスト',url:'https://example.com',revision:0});
const create=()=>({id:'request-create-01',action:'create',partId:'part-test-01',part:base(),actor:'テスト担当',note:''});
const seed=()=>applyCommand({parts:[],logs:[]},create());
function command(action,quantity,id='request-action-01'){return{id,action,partId:'part-test-01',quantity,actor:'テスト担当',note:''};}
test('小数の使用と購入で浮動小数誤差を残さない',()=>{let s=seed();for(let i=0;i<10;i++)s=applyCommand(s,command('use',0.1,'request-use-'+i));assert.equal(s.parts[0].quantity,0);s=applyCommand(s,command('purchase',0.3));assert.equal(s.parts[0].quantity,0.3);assert.equal(s.logs.length,12);assert.equal(s.logs.at(-1).before,0);assert.equal(s.logs.at(-1).after,0.3);});
test('在庫不足・無効な数量・不明な操作を拒否',()=>{for(const count of [-1,0,NaN,Infinity,0.0000001,1.1])assert.throws(()=>applyCommand(seed(),command('use',count)));assert.throws(()=>applyCommand(seed(),command('remove',1)));assert.equal(seed().parts[0].quantity,1);});
test('同一記録IDの再送は二重計上しない',()=>{const c=command('use',0.1);const a=applyCommand(seed(),c),b=applyCommand(a,c);assert.equal(b.parts[0].quantity,0.9);assert.equal(b.logs.length,2);});
test('別端末で連続使用しても最新在庫に対して検証',()=>{const s=applyCommand(seed(),command('use',0.7));assert.throws(()=>applyCommand(s,command('use',0.7,'request-second-01')));assert.equal(s.parts[0].quantity,0.3);});
test('情報変更は在庫を上書きせず古い編集を拒否',()=>{const s=seed();const c={...create(),id:'request-edit-01',action:'edit',expectedRevision:1,part:{...base(),name:'抵抗更新',quantity:999}};const changed=applyCommand(s,c);assert.equal(changed.parts[0].quantity,1);assert.equal(changed.parts[0].name,'抵抗更新');assert.throws(()=>applyCommand(changed,{...c,id:'request-edit-02'}));assert.throws(()=>applyCommand(s,{...c,part:{...base(),unit:'個'}}));});
test('棚卸は理由と最新revisionが必須、0への調整可能',()=>{const c={...command('adjust',0),expectedRevision:1};assert.throws(()=>applyCommand(seed(),c));const s=applyCommand(seed(),{...c,note:'棚卸確認'});assert.equal(s.parts[0].quantity,0);assert.equal(s.logs.at(-1).delta,-1);assert.throws(()=>applyCommand(s,{...c,id:'request-adjust-02',note:'確認'}));});
test('危険なURL・型違いを拒否する',()=>{assert.throws(()=>applyCommand({parts:[],logs:[]},{...create(),part:{...base(),url:'javascript:alert(1)'}}));assert.throws(()=>applyCommand({parts:[],logs:[]},{...create(),part:{...base(),name:123}}));});

const backend=await fs.readFile(new URL('../public/download/Code.gs',import.meta.url),'utf8');
function harness(){
 const rows=[Array(12).fill('header')],view=[];let failProjection=false,locked=false,released=0;
 const logSheet={getLastRow:()=>rows.length,getRange:()=>({getValues:()=>rows.slice(1),setNumberFormat(){return this;}}),appendRow:row=>rows.push(row)};
 const partSheet={getMaxRows:()=>1000,getRange:(r,c,n,w)=>({setValues(values){if(failProjection)throw Error('projection failure');view.splice(0,view.length,...values);return this;},setNumberFormat(){return this;}})};
 const book={getSheetByName:name=>name==='増減履歴'?logSheet:partSheet};
 const context=vm.createContext({console,Map,Date,JSON,Number,Math,Error,PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test-token-'.repeat(5)})},SpreadsheetApp:{openById:()=>book,flush:()=>{}},LockService:{getScriptLock:()=>({tryLock:()=>!locked,releaseLock:()=>released++})},ContentService:{MimeType:{JSON:'json'},createTextOutput:value=>({value,setMimeType(){return this;}})}});
 vm.runInContext(backend,context);
 return{rows,view,post:(body)=>JSON.parse(context.doPost({postData:{contents:JSON.stringify({token:'test-token-'.repeat(5),...body})}}).value),fail:()=>failProjection=true,repair:()=>failProjection=false,lock:()=>locked=true,released:()=>released};
}
test('Apps Scriptの永続化：投影失敗後の再送で1件だけ保存・修復',()=>{const h=harness();h.fail();const failed=h.post({action:'mutate',command:create()});assert.ok(failed.error);assert.equal(h.rows.length,2);h.repair();const recovered=h.post({action:'mutate',command:create()});assert.equal(recovered.parts[0].quantity,1);assert.equal(h.rows.length,2);assert.equal(h.view[0][5],1);assert.equal(h.released(),2);});
test('Apps Script：認証、競合ロック、ID改ざん、式注入',()=>{const h=harness();assert.ok(h.post({token:'wrong',action:'snapshot'}).error);assert.equal(h.rows.length,1);const c=create();c.part.name='=IMPORTXML("bad")';assert.equal(h.post({action:'mutate',command:c}).parts.length,1);assert.ok(h.view[0][0].startsWith("'="));assert.ok(h.post({action:'mutate',command:{...c,actor:'他人'}}).error);assert.equal(h.rows.length,2);h.lock();assert.ok(h.post({action:'mutate',command:command('use',0.1)}).error);assert.equal(h.rows.length,2);});
test('Apps Script：2人の使用・再送と棚卸の履歴を照合',()=>{const h=harness();h.post({action:'mutate',command:create()});const c=command('use',0.7);assert.equal(h.post({action:'mutate',command:c}).parts[0].quantity,0.3);assert.equal(h.post({action:'mutate',command:c}).logs.length,2);const rejected=h.post({action:'mutate',command:command('use',0.7,'request-user2-01')});assert.equal(rejected.terminal,true);const result=h.post({action:'mutate',command:{...command('adjust',0.1,'request-count-01'),expectedRevision:2,note:'実地確認'}});assert.equal(result.parts[0].quantity,0.1);assert.equal(result.logs.at(-1).before,0.3);assert.equal(h.view[0][5],0.1);});
test('履歴シートが並べ替えられても最新revisionから在庫を復元',()=>{const h=harness();h.post({action:'mutate',command:create()});h.post({action:'mutate',command:command('use',0.1)});[h.rows[1],h.rows[2]]=[h.rows[2],h.rows[1]];const state=h.post({action:'snapshot'});assert.equal(state.parts[0].quantity,0.9);assert.equal(h.view[0][5],0.9);});
