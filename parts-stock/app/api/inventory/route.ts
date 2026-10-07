export async function POST(request:Request){
 try{
  if(Number(request.headers.get('content-length')??0)>64000)return Response.json({error:'送信内容が大きすぎます。'},{status:413});
  const text=await request.text();if(text.length>64000)return Response.json({error:'送信内容が大きすぎます。'},{status:413});
  const {endpoint,token,...payload}=JSON.parse(text);
  if(typeof endpoint!=='string'||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint))return Response.json({error:'Apps ScriptのウェブアプリURL（/exec）を入力してください。'},{status:400});
  if(typeof token!=='string'||token.length<32)return Response.json({error:'接続キーを確認してください。'},{status:400});
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...payload,token}),redirect:'follow',signal:AbortSignal.timeout(45000)});
  const raw=await response.text();let result;try{result=JSON.parse(raw);}catch{return Response.json({error:'Googleから応答を読み取れませんでした。ウェブアプリの公開設定とURLを確認してください。'},{status:502});}
  return Response.json(result,{status:result.error?400:200,headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'通信を完了できませんでした。送信済みの場合もあるため、同じ記録を再送して確認してください。'},{status:502});}
}
