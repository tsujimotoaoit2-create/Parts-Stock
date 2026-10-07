/* Shared inventory logic is prepended by scripts/build-apps-script.mjs. */
const SPREADSHEET_ID = '1ApO3COCM41WX2jgb4oKjV2d-3gUfYGLZ1kQOwfEadJM';
const PART_HEADERS = ['部品名','用途','型番','価格（円）（希望小売価格か調達額）','調達先','数量（1袋にたくさんある場合は小数で表現）','単位','当面必要な在庫（部室内）','発注予定','確認日','備考','URL','部品ID'];
const LOG_HEADERS = ['記録ID','記録日時','部品ID','部品名','操作','増減数量','変更前数量','変更後数量','単位','記録者','備考','操作内容'];

function setup(){
 const book=SpreadsheetApp.getActiveSpreadsheet();
 if(!book||book.getId()!==SPREADSHEET_ID)throw new Error('作成した「部品管理台帳」の拡張機能から開いてください。');
 const properties=PropertiesService.getScriptProperties();
 if(!properties.getProperty('ACCESS_TOKEN'))properties.setProperty('ACCESS_TOKEN',Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,''));
 book.setSpreadsheetTimeZone('Asia/Tokyo');
 for(const pair of [['部品台帳',PART_HEADERS],['増減履歴',LOG_HEADERS]]){
  const sheet=book.getSheetByName(pair[0]);if(!sheet)throw new Error('シートがありません：'+pair[0]);
  const actual=sheet.getRange(1,1,1,pair[1].length).getValues()[0];if(JSON.stringify(actual)!==JSON.stringify(pair[1]))throw new Error('ヘッダーが異なります：'+pair[0]);
  sheet.setFrozenRows(1);sheet.getRange(1,1,1,pair[1].length).setFontWeight('bold').setBackground('#edeff2').setWrap(true).setVerticalAlignment('middle');sheet.setRowHeight(1,64);
 }
 SpreadsheetApp.getUi().alert('接続キー（部員だけに共有してください）',properties.getProperty('ACCESS_TOKEN'),SpreadsheetApp.getUi().ButtonSet.OK);
}
function doGet(){return jsonOutput_({name:'部品室 API',message:'POSTで接続してください。'});}
function jsonOutput_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function sheetText_(value){return typeof value==='string'&&/^[=+\-@]/.test(value)?"'"+value:value;}
function readState_(book){
 const sheet=book.getSheetByName('増減履歴');
 if(!sheet)throw new Error('増減履歴シートがありません。');
 const rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,12).getValues():[];
 const parts=new Map(),logs=[],requests=new Map();
 for(const row of rows){
  if(!row[0])continue;
  let event;try{event=JSON.parse(row[11]);}catch{throw new Error('履歴の操作内容が壊れています。履歴を直接編集せず、バックアップから修復してください。');}
  if(!event.part||!event.request||event.request.id!==row[0])throw new Error('履歴の整合性を確認できません。');
  const previous=parts.get(event.part.id);
  if(!previous||event.part.revision>previous.revision)parts.set(event.part.id,event.part);
  requests.set(row[0],event.request);
  logs.push({id:row[0],timestamp:row[1] instanceof Date?row[1].toISOString():String(row[1]),partId:event.part.id,name:event.part.name,action:event.request.action,delta:Number(row[5]),before:Number(row[6]),after:Number(row[7]),unit:event.part.unit,actor:event.request.actor,note:event.request.note,part:event.part});
 }
 logs.sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)||a.part.revision-b.part.revision);
 return {parts:Array.from(parts.values()),logs,requests};
}
function project_(book,state){
 const sheet=book.getSheetByName('部品台帳');if(!sheet)throw new Error('部品台帳シートがありません。');
 const rows=state.parts.map(p=>[p.name,p.purpose,p.model,p.price,p.supplier,p.quantity,p.unit,p.minimum,p.order,p.checked?new Date(p.checked+'T00:00:00+09:00'):'',p.notes,p.url,p.id].map(sheetText_));
 if(rows.length){
  if(sheet.getMaxRows()<rows.length+1)sheet.insertRowsAfter(sheet.getMaxRows(),rows.length+1-sheet.getMaxRows());
  sheet.getRange(2,1,rows.length,13).setValues(rows);
  sheet.getRange(2,4,rows.length,1).setNumberFormat('#,##0.##');
  sheet.getRange(2,6,rows.length,1).setNumberFormat('0.######');sheet.getRange(2,8,rows.length,1).setNumberFormat('0.######');
  sheet.getRange(2,10,rows.length,1).setNumberFormat('yyyy-mm-dd');
 }
 // App operations do not delete parts. Do not clear unrelated spreadsheet cells.
 SpreadsheetApp.flush();
}
function publicState_(state){return {parts:state.parts,logs:state.logs,sheetUrl:SHEET_URL,updatedAt:new Date().toISOString()};}
function doPost(e){
 let lock;
 try{
  if(!e.postData||e.postData.contents.length>64000)return jsonOutput_({error:'送信内容が大きすぎるか空です。'});
  const body=JSON.parse(e.postData.contents),expected=PropertiesService.getScriptProperties().getProperty('ACCESS_TOKEN');
  if(!expected||typeof body.token!=='string'||body.token!==expected)return jsonOutput_({error:'接続キーが一致しません。接続設定を確認してください。'});
  lock=LockService.getScriptLock();if(!lock.tryLock(25000))return jsonOutput_({error:'他の記録を保存中です。少し待って同じ記録を再送してください。'});
  const book=SpreadsheetApp.openById(SPREADSHEET_ID),state=readState_(book);
  if(body.action==='snapshot'){project_(book,state);return jsonOutput_(publicState_(state));}
  if(body.action!=='mutate'||!body.command)return jsonOutput_({error:'不明なリクエストです。',terminal:true});
  const command=body.command;
  if(state.requests.has(command.id)){
   if(JSON.stringify(state.requests.get(command.id))!==JSON.stringify(command))return jsonOutput_({error:'同じ記録IDに異なる操作があります。元の操作を再送してください。'});
   project_(book,state);return jsonOutput_(publicState_(state));
  }
  let next;
  try{next=applyCommand(state,command);}catch(error){return jsonOutput_({error:error.message,terminal:true});}
  const log=next.logs[next.logs.length-1],sheet=book.getSheetByName('増減履歴');
  // The single appended event is authoritative. A retry repairs the materialized view.
  sheet.appendRow([log.id,new Date(log.timestamp),log.partId,log.name,labels[log.action],log.delta,log.before,log.after,log.unit,log.actor,log.note,JSON.stringify({part:log.part,request:command})].map(sheetText_));
  sheet.getRange(sheet.getLastRow(),2,1,1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  SpreadsheetApp.flush();project_(book,next);return jsonOutput_(publicState_(next));
 }catch(error){return jsonOutput_({error:'保存結果を確認できませんでした。同じ記録を再送してください。詳細：'+String(error.message).slice(0,250)});}
 finally{if(lock)lock.releaseLock();}
}
