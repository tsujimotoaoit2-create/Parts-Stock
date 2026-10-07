export type Part = {id:string; name:string; purpose:string; model:string; price:number; supplier:string; quantity:number; unit:string; minimum:number; order:string; checked:string; notes:string; url:string; revision:number};
export type Action = 'create'|'edit'|'use'|'purchase'|'adjust';
export type Movement = {id:string; timestamp:string; partId:string; name:string; action:Action; delta:number; before:number; after:number; unit:string; actor:string; note:string; part:Part};
export type Snapshot = {parts:Part[]; logs:Movement[]; sheetUrl?:string; updatedAt?:string};
export type Command = {id:string; action:Action; partId:string; expectedRevision?:number; quantity?:number; part?:Part; actor:string; note:string};
export const SHEET_URL='https://docs.google.com/spreadsheets/d/1ApO3COCM41WX2jgb4oKjV2d-3gUfYGLZ1kQOwfEadJM/edit';
export const labels:Record<Action,string>={create:'初期登録',edit:'情報変更',use:'使用',purchase:'購入',adjust:'棚卸調整'};
export const emptyPart=():Part=>({id:crypto.randomUUID(),name:'',purpose:'',model:'',price:0,supplier:'',quantity:0,unit:'個',minimum:0,order:'',checked:'',notes:'',url:'',revision:0});
export const formatQuantity=(n:number)=>n.toLocaleString('ja-JP',{maximumFractionDigits:6});
export function scaled(n:unknown):number{
 if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1000000000||Math.abs(n*1e6-Math.round(n*1e6))>0.001)throw new Error('数量は0〜10億、小数点以下6桁までで入力してください。');
 return Math.round(n*1e6);
}
export function applyCommand(snapshot:Snapshot, c:Command, now=new Date().toISOString()):Snapshot{
 if(snapshot.logs.some(l=>l.id===c.id))return snapshot;
 if(!['create','edit','use','purchase','adjust'].includes(c.action))throw new Error('不明な操作です。');
 if(!/^[A-Za-z0-9_-]{8,100}$/.test(c.id)||!/^[A-Za-z0-9_-]{8,100}$/.test(c.partId))throw new Error('記録IDが正しくありません。');
 if(typeof c.actor!=='string'||!c.actor.trim()||c.actor.length>80)throw new Error('記録者を80文字以内で入力してください。');
 if(typeof c.note!=='string'||c.note.length>1000)throw new Error('記録メモは1000文字以内で入力してください。');
 const old=snapshot.parts.find(p=>p.id===c.partId);
 if(c.action==='create'&&old)throw new Error('この部品は登録済みです。');
 if(c.action!=='create'&&!old)throw new Error('部品が見つかりません。');
 if(c.action==='edit'&&old?.revision!==c.expectedRevision)throw new Error('他の人が情報を更新しました。一覧を更新してからやり直してください。');
 let next:Part;
 if(c.action==='create'||c.action==='edit'){
  if(!c.part)throw new Error('部品情報がありません。');
  next={...c.part,id:c.partId,quantity:old?.quantity??c.part.quantity,revision:(old?.revision??0)+1};
  for(const key of ['name','purpose','model','supplier','unit','order','checked','notes','url'] as const){if(typeof next[key]!=='string'||next[key].length>(key==='notes'?4000:key==='url'?2000:500))throw new Error('部品情報の文字数または形式が正しくありません。');}
  if(!next.name.trim()||!next.unit.trim())throw new Error('部品名と単位を入力してください。');
  if(old&&old.unit!==next.unit)throw new Error('履歴の整合性を保つため、登録後の単位は変更できません。');
  scaled(next.quantity);scaled(next.minimum);
  if(!Number.isFinite(next.price)||next.price<0)throw new Error('価格は0以上で入力してください。');
  if(next.url&&!/^https?:\/\//i.test(next.url))throw new Error('URLはhttps://またはhttp://で始めてください。');
  if(next.checked&&!/^\d{4}-\d{2}-\d{2}$/.test(next.checked))throw new Error('確認日を正しい形式で入力してください。');
 }else{
  if(!old)throw new Error('部品が見つかりません。');
  const count=scaled(c.quantity);
  if(c.action!=='adjust'&&count===0)throw new Error('数量は0より大きい値にしてください。');
  if(c.action==='adjust'&&!c.note.trim())throw new Error('棚卸調整の理由を入力してください。');
  if(c.action==='adjust'&&old.revision!==c.expectedRevision)throw new Error('在庫が更新されました。一覧を更新してから棚卸してください。');
  const total=c.action==='adjust'?count:scaled(old.quantity)+(c.action==='use'?-count:count);
  if(total<0)throw new Error('使用数が現在庫を超えています。一覧を更新して確認してください。');
  next={...old,quantity:total/1e6,revision:old.revision+1};scaled(next.quantity);
 }
 const before=old?.quantity??0;
 const log:Movement={id:c.id,timestamp:now,partId:next.id,name:next.name,action:c.action,delta:(scaled(next.quantity)-scaled(before))/1e6,before,after:next.quantity,unit:next.unit,actor:c.actor.trim(),note:c.note.trim(),part:next};
 return {...snapshot,parts:old?snapshot.parts.map(p=>p.id===next.id?next:p):[...snapshot.parts,next],logs:[...snapshot.logs,log],updatedAt:now};
}
export function demoSnapshot():Snapshot{
 return {parts:[],logs:[]};
}
