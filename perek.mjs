import { timingSafeEqual } from 'node:crypto';

function json(payload, status=200){
 return new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
function equalSecrets(actual, expected){
 const a=Buffer.from(actual||'','utf8'),b=Buffer.from(expected||'','utf8');
 return a.length===b.length && b.length>=20 && timingSafeEqual(a,b);
}
// Runs ONLY on Netlify servers. Never put PEREK_API_KEY inside public/.
export default async function handler(request){
 if(request.method!=='GET')return json({error:'Метод не поддерживается'},405);
 const apiKey=process.env.PEREK_API_KEY,appToken=process.env.PEREK_APP_TOKEN;
 if(!apiKey||!appToken||appToken.length<20)return json({error:'Не настроены переменные PEREK_API_KEY и PEREK_APP_TOKEN в Netlify.'},503);
 if(!equalSecrets(request.headers.get('X-Diary-Token'),appToken))return json({error:'Неверный пароль доступа'},401);
 const url=new URL(request.url),mode=url.searchParams.get('mode');
 let endpoint;
 if(mode==='search'){
  const q=(url.searchParams.get('q')||'').trim();
  if(q.length<2||q.length>100)return json({error:'Название должно содержать от 2 до 100 символов.'},400);
  const limit=Math.min(12,Math.max(1,Number(url.searchParams.get('limit'))||12));
  const offset=Number(url.searchParams.get('offset')||0);
  if(!Number.isSafeInteger(offset)||offset<0||offset>240)return json({error:'Слишком большой номер страницы'},400);
  endpoint='https://perek.us/api/v1/foods/search?'+new URLSearchParams({q,limit:String(limit),offset:String(offset),market:'ru'});
 }else if(mode==='barcode'){
  const ean=url.searchParams.get('ean')||'';
  if(!/^(?:\d{8}|\d{13})$/.test(ean))return json({error:'Нужен EAN-8 или EAN-13'},400);
  endpoint='https://perek.us/api/v1/foods/barcode/'+ean;
 }else return json({error:'Неизвестный режим'},400);
 try{
  const response=await fetch(endpoint,{headers:{'X-Api-Key':apiKey,Accept:'application/json'},signal:AbortSignal.timeout(12500),cache:'no-store'});
  if(response.status===429)return json({error:'Достигнут лимит бесплатного API perek.us.'},429);
  if(response.status===404)return json({error:'Товар не найден.'},404);
  if(response.status===401||response.status===403)return json({error:'Ключ perek.us отклонён. Проверь PEREK_API_KEY.'},502);
  if(!response.ok)return json({error:'Источник продуктов временно недоступен: HTTP '+response.status},response.status===503?503:502);
  const data=await response.json();
  if(!data||typeof data!=='object')return json({error:'Источник вернул пустые данные'},502);
  return json(data);
 }catch(e){return json({error:e?.name==='TimeoutError'?'Превышено время ожидания perek.us':'Сервис perek.us временно недоступен'},503)}
}
