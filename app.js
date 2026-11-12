'use strict';
const $=s=>document.querySelector(s); let original=null, board=null, mode='inspect';
function dist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])}
function pixel(d,w,x,y){let i=(Math.round(y)*w+Math.round(x))*4;return [d[i],d[i+1],d[i+2]]}
const sampleOffsets = [[-.28,-.1],[.28,-.1],[-.28,.1],[.28,.1],[-.1,-.28],[.1,-.28],[-.1,.28],[.1,.28],[-.3,-.3],[.3,-.3],[-.3,.3],[.3,.3],[-.36,-.36],[.36,-.36],[-.36,.36],[.36,.36],[-.36,-.2],[.36,-.2],[-.36,.2],[.36,.2],[0,-.35],[0,.35]];

function readPixels(img, maxWidth=900){
 const canvas=document.createElement('canvas');
 canvas.width=Math.min(maxWidth,img.width);
 canvas.height=Math.round(img.height*canvas.width/img.width);
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 ctx.drawImage(img,0,0,canvas.width,canvas.height);
 return {w:canvas.width,h:canvas.height,d:ctx.getImageData(0,0,canvas.width,canvas.height).data,sx:canvas.width/img.width,sy:canvas.height/img.height};
}

function readBoard({w,d,sx,sy},n,x0,y0,dx,dy){
 const palette=[],grid=[],marks=[];
 for(let r=0;r<n;r++){
  const row=[];
  for(let c=0;c<n;c++){
   const samples=sampleOffsets.map(([ox,oy])=>pixel(d,w,x0+(c+ox)*dx,y0+(r+oy)*dy));
   let best=samples[0],count=0;
   for(const rgb of samples){
    const near=samples.filter(other=>dist(rgb,other)<35).length;
    if(near>count){best=rgb;count=near;}
   }
   let id=palette.findIndex(rgb=>dist(rgb,best)<34);
   if(id<0){id=palette.length;palette.push(best);}
   row.push(id);
  }
  grid.push(row);marks.push(Array(n).fill(''));
 }
 return {n,grid,marks,palette,x0:x0/sx,y0:y0/sy,dx:dx/sx,dy:dy/sy};
}

// Locate the regular strips of colored cells on either side of the light gutters.
function stripRuns(length,active){
 const runs=[];
 for(let i=0;i<length;){
  if(!active(i)){i++;continue;}
  const start=i;
  while(i<length&&active(i))i++;
  if(i-start>=7)runs.push({start,end:i,center:(start+i-1)/2,length:i-start});
 }
 return runs;
}

function regularStrips(runs){
 const chains=[];
 for(let i=0;i<runs.length-3;i++){
  const first=runs[i],pitch=runs[i+1].center-first.center;
  if(pitch>first.length*1.55||pitch<first.length*.9)continue;
  let j=i+1;
  for(;j<runs.length;j++){
   const next=runs[j];
   if(Math.abs(next.center-first.center-(j-i)*pitch)>pitch*.20||next.length<first.length*.62||next.length>first.length*1.45)break;
  }
  const n=j-i;
  if(n>=4)chains.push({n,center:first.center,pitch:(runs[j-1].center-first.center)/(n-1),first:i,last:j});
 }
 return chains.filter(a=>!chains.some(b=>b.n>a.n&&b.first<=a.first&&b.last>=a.last));
}

function identifyByGaps(img,wanted){
 const data=readPixels(img),{w,h,d}=data;
 const margin=Math.max(1,Math.floor(w*.018));
 const flags=new Uint8Array(w*h),counts=new Uint16Array(h);
 for(let y=0;y<h;y++){
  const left=(y*w+margin)*4,right=(y*w+w-1-margin)*4;
  for(let x=margin;x<w-margin;x++){
   const i=(y*w+x)*4;
   const a=(d[i]-d[left])**2+(d[i+1]-d[left+1])**2+(d[i+2]-d[left+2])**2;
   const b=(d[i]-d[right])**2+(d[i+1]-d[right+1])**2+(d[i+2]-d[right+2])**2;
   if(Math.min(a,b)>46**2){flags[y*w+x]=1;counts[y]++;}
  }
 }
 const rows=regularStrips(stripRuns(h,y=>counts[y]>=w*.57));
 const candidates=[];
 for(const r of rows){
  if(r.n>16||(wanted&&r.n!==wanted))continue;
  const sampleRows=[];
  for(let i=0;i<r.n;i++)for(const offset of [-.25,0,.25])sampleRows.push(Math.round(r.center+(i+offset)*r.pitch));
  const cols=regularStrips(stripRuns(w,x=>sampleRows.filter(y=>flags[y*w+x]).length>=sampleRows.length*.62));
  for(const c of cols){
   if(c.n!==r.n||Math.abs(c.pitch-r.pitch)>.12*r.pitch||c.n*c.pitch<w*.60)continue;
   candidates.push({r,c,area:c.n*c.pitch*r.n*r.pitch});
  }
 }
 candidates.sort((a,b)=>b.area-a.area);
 if(candidates.length){
  const {r,c}=candidates[0];
  return readBoard(data,r.n,c.center,r.center,c.pitch,r.pitch);
 }
 return null;
}
function identifyAtScale(img, wanted=0, maxWidth=900){
 let scale=Math.min(1,maxWidth/img.width), c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);let ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,c.width,c.height);let w=c.width,h=c.height,d=ctx.getImageData(0,0,w,h).data, lines=[];
 // Find rows with repeated, evenly spaced flat-color squares.
 for(let y=5;y<h-5;y+=2){let runs=[],start=0, base=pixel(d,w,0,y);for(let x=1;x<=w;x++){let p=x<w?pixel(d,w,x,y):[-255,-255,-255];if(dist(p,base)>38){let len=x-start;if(len>=Math.max(10,w/22)&&len<=w/3&&Math.max(...base)-Math.min(...base)>8)runs.push({x:start,end:x,len,mid:(start+x)/2});start=x;base=p;}}
 for(let i=0;i<runs.length;i++){let seq=[runs[i]];for(let j=i+1;j<runs.length;j++){let a=seq[seq.length-1],b=runs[j],gap=b.x-a.end;if(gap<0)continue;if(gap>Math.max(a.len,b.len)*.35||b.len<a.len*.72||b.len>a.len*1.38)break;seq.push(b);}let n=seq.length;if(n>=4&&n<=16){let pitch=(seq[n-1].mid-seq[0].mid)/(n-1);if(seq.every((v,k)=>Math.abs(v.mid-(seq[0].mid+k*pitch))<pitch*.12)) lines.push({y,n,x:seq[0].mid,pitch});}}
 }
 // Merge successive scan lines into cell-height bands, then find N bands with square pitch.
 let groups=[];for(const line of lines){let g=groups.findLast(v=>v.n===line.n&&Math.abs(v.x-line.x)<line.pitch*.1&&Math.abs(v.pitch-line.pitch)<line.pitch*.1&&line.y-v.last<=4);if(g){g.last=line.y;g.ys.push(line.y)}else groups.push({n:line.n,x:line.x,pitch:line.pitch,last:line.y,ys:[line.y]});}
 let bands=groups.map(g=>{let y=g.ys[0], color=pixel(d,w,g.x,y), lo=y,hi=y;while(lo>0&&y-lo<g.pitch&&dist(pixel(d,w,g.x,lo-1),color)<38)lo--;while(hi<h-1&&hi-y<g.pitch&&dist(pixel(d,w,g.x,hi+1),color)<38)hi++;return {...g,cy:hi-lo>g.pitch*.55?(lo+hi)/2:y+g.pitch*.40}});let expanded=[];for(const g of bands){expanded.push(g);let n=Math.round(w*.91/g.pitch);if(n>g.n&&n<=16&&n>=4&&(!wanted||wanted===n)){expanded.push({...g,n,x:(w-(n-1)*g.pitch)/2})}}let options=[];for(const a of expanded){let n=a.n,p=a.pitch;if(wanted&&n!==wanted)continue;if(a.cy+(n-1)*p>=h-p*.35)continue;let good=0, colors=[];for(let r=0;r<n;r++)for(let col=0;col<n;col++){let x=a.x+col*p,y=a.cy+r*p;let ss=[[-.28,-.1],[.28,-.1],[-.28,.1],[.28,.1],[-.1,-.28],[.1,-.28],[-.1,.28],[.1,.28],[-.3,-.3],[.3,-.3],[-.3,.3],[.3,.3],[-.36,-.36],[.36,-.36],[-.36,.36],[.36,.36],[-.36,-.2],[.36,-.2],[-.36,.2],[.36,.2],[0,-.35],[0,.35]].map(([ox,oy])=>pixel(d,w,x+ox*p,y+oy*p));let top=ss.map((s,i)=>({i,count:ss.filter(t=>dist(s,t)<35).length})).sort((u,v)=>v.count-u.count)[0];let v=ss[top.i];if(top.count>=4&&Math.max(...v)-Math.min(...v)>8){good++;if(!colors.some(q=>dist(q,v)<34))colors.push(v)}}if(good>=n*n*.96&&colors.length>=n-1&&colors.length<=n+2)options.push({a,score:n*p+good});}options.sort((a,b)=>b.score-a.score);if(!options.length)throw Error('未能识别完整棋盘，请上传包含完整棋盘的清晰截图。');let {a}=options[0], n=a.n, x0=a.x, y0=a.cy, dx=a.pitch, dy=a.pitch, palette=[], grid=[],marks=[];
 for(let r=0;r<n;r++){let row=[],mr=[];for(let col=0;col<n;col++){let x=x0+col*dx,y=y0+r*dy;let samples=[[-.28,-.1],[.28,-.1],[-.28,.1],[.28,.1],[-.1,-.28],[.1,-.28],[-.1,.28],[.1,.28],[-.3,-.3],[.3,-.3],[-.3,.3],[.3,.3],[-.36,-.36],[.36,-.36],[-.36,.36],[.36,.36],[-.36,-.2],[.36,-.2],[-.36,.2],[.36,.2],[0,-.35],[0,.35]].map(([ox,oy])=>pixel(d,w,x+ox*dx,y+oy*dy));let rgb=samples.map((_,i)=>({i,count:samples.filter(s=>dist(s,samples[i])<35).length})).sort((u,v)=>v.count-u.count)[0];rgb=samples[rgb.i];let id=palette.findIndex(p=>dist(p,rgb)<34);if(id<0){id=palette.length;palette.push(rgb)}row.push(id);
 mr.push('');}grid.push(row);marks.push(mr)}
 return {n,grid,marks,palette,x0:x0/scale,y0:y0/scale,dx:dx/scale,dy:dy/scale};
}
function identify(img, wanted=0){
 const geometry=identifyByGaps(img,wanted);
 if(geometry)return geometry;
 let results=[], lastError;
 // Different mobile decoders can sample the grid differently. Retry at several sizes
 // when the first pass finds only a small board or a specific size was requested.
 for(const width of [900,720,540]){
  try {const result=identifyAtScale(img,wanted,width);results.push(result);if(!wanted && width===900 && result.n>6)break;}
  catch(error){lastError=error;}
 }
 if(!results.length)throw lastError || Error('未能识别完整棋盘，请检查截图。');
 results.sort((a,b)=>(b.n*b.dx)-(a.n*a.dx));
 if(results[0].n*results[0].dx<img.width*.60)throw Error('只找到了部分格子。');
 return results[0];
}
function solutions(b){let n=b.n,found=[],seq=[],calls=0;function dfs(r,cols,colors){if(++calls>2000000)throw Error('棋盘较复杂，搜索超时；请核对颜色与标记。');if(found.length>=2)return;if(r===n){found.push([...seq]);return}let fixed=[];for(let c=0;c<n;c++)if(b.marks[r][c]==='fixed')fixed.push(c);if(fixed.length>1)return;for(let c=0;c<n;c++){let col=b.grid[r][c];if((fixed.length&&fixed[0]!==c)||b.marks[r][c]==='excluded'||cols.has(c)||colors.has(col)||(r&&Math.abs(seq[r-1]-c)<=1))continue;seq.push(c);cols.add(c);colors.add(col);dfs(r+1,cols,colors);seq.pop();cols.delete(c);colors.delete(col)}}dfs(0,new Set(),new Set());return found}
function renderGrid(){let el=$('#grid');el.style.gridTemplateColumns=`repeat(${board.n},1fr)`;el.replaceChildren();for(let r=0;r<board.n;r++)for(let c=0;c<board.n;c++){let b=document.createElement('button'),id=board.grid[r][c],m=board.marks[r][c];b.className='cell';b.style.background=`rgb(${board.palette[id].join(',')})`;b.textContent=m==='fixed'?'🐈':m==='excluded'?'✕':id+1;b.setAttribute('aria-label',`第${r+1}行第${c+1}列，区域${id+1} ${m}`);b.onclick=()=>{if(mode==='color')board.grid[r][c]=(id+1)%board.palette.length;else if(mode!=='inspect')board.marks[r][c]=m===mode?'':mode;renderGrid();$('#result').hidden=true};el.append(b)}}
function solve(autoSave=false){try{let regions=new Set(board.grid.flat());if(regions.size!==board.n)throw Error(`识别到 ${regions.size} 个颜色区域，棋盘应有 ${board.n} 个；请检查并修改颜色。`);let sols=solutions(board);if(!sols.length)throw Error('没有符合条件的解，请检查底色区域。');if(sols.length>1)throw Error('当前条件存在多个解，无法确定全部位置；请核对颜色。');let s=sols[0],out=$('#output');out.width=original.width;out.height=original.height;let ctx=out.getContext('2d');ctx.drawImage(original,0,0);let radius=Math.min(board.dx,board.dy)*.34,redWidth=Math.max(4,board.dx*.065),whiteWidth=Math.max(2,redWidth*.7);for(let r=0;r<board.n;r++){let x=board.x0+s[r]*board.dx,y=board.y0+r*board.dy;ctx.strokeStyle='#ed2338';ctx.lineWidth=redWidth;ctx.beginPath();ctx.arc(x,y,radius,0,2*Math.PI);ctx.stroke();ctx.strokeStyle='#ffffff';ctx.lineWidth=whiteWidth;ctx.beginPath();ctx.arc(x,y,radius-(redWidth+whiteWidth)/2,0,2*Math.PI);ctx.stroke()}$('#answer').textContent=`唯一解 · ${board.n} 只猫。各行对应列：${s.map(c=>c+1).join('、')}`;$('#download').href=out.toDataURL('image/png');$('#result').hidden=false;if(autoSave && $('#auto-save').checked){$('#download').click()}$('#status').textContent=`已识别 ${board.n} × ${board.n} 棋盘，请核对下方颜色。`;}catch(e){$('#result').hidden=true;$('#status').textContent=e.message}}
function showBoard(result,autoSave=false){
 board=result;
 $('#size').value=board.n;
 $('#work').hidden=false;
 $('#board-edit').hidden=false;
 $('#manual-panel').hidden=true;
 renderGrid();
 solve(autoSave);
}

function detect(wanted=0,autoSave=false){
 try{showBoard(identify(original,wanted),autoSave)}
 catch(e){
  board=null;
  $('#status').textContent=e.message+' 可以填写行列数，再点「手动选棋盘」。';
  $('#work').hidden=false;
  $('#board-edit').hidden=true;
  $('#result').hidden=true;
 }
}

let firstCell=null;
const manualMessage=$('#manual-message');
const manualTarget=$('#manual-target');
function snapCell({w,h,d},x,y,dx,dy){
 function snap(at,cross,pitch,crossPitch,limit,crossLimit,horizontal){
  let best=at,bestWidth=0;
  const color=(a,b)=>horizontal?pixel(d,w,a,b):pixel(d,w,b,a);
  for(const offset of [0,-.18,.18,-.30,.30]){
   const crossAt=Math.round(cross+offset*crossPitch);
   if(crossAt<0||crossAt>=crossLimit)continue;
   const start=Math.round(at),rgb=color(start,crossAt);
   let lo=start,hi=start;
   while(lo>0&&start-lo<pitch&&dist(color(lo-1,crossAt),rgb)<40)lo--;
   while(hi<limit-1&&hi-start<pitch&&dist(color(hi+1,crossAt),rgb)<40)hi++;
   const width=hi-lo+1,mid=(lo+hi)/2;
   if(width>bestWidth&&width>=pitch*.60&&width<=pitch*1.06&&Math.abs(mid-at)<pitch*.25){best=mid;bestWidth=width;}
  }
  return best;
 }
 return {x:snap(x,y,dx,dy,w,h,true),y:snap(y,x,dy,dx,h,w,false)};
}

function resetSelection(){
 firstCell=null;
 manualTarget.hidden=true;
 manualMessage.textContent='第 1 步：点一下左上角第一个格子的中心。';
}

$('#manual').onclick=()=>{
 if(!original)return;
 $('#manual-image').replaceChildren(original,manualTarget);
 $('#manual-panel').hidden=false;
 resetSelection();
};
$('#manual-reset').onclick=resetSelection;
$('#manual-close').onclick=()=>{$('#manual-panel').hidden=true;resetSelection()};
$('#manual-image').addEventListener('click',event=>{
 if(event.target!==original)return;
 const n=Number($('#size').value);
 if(!Number.isInteger(n)||n<4||n>16){manualMessage.textContent='请先填写 4 到 16 之间的行列数。';return;}
 const rect=original.getBoundingClientRect();
 const x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
 if(!firstCell){
  firstCell={x,y};
  manualTarget.style.left=`${x*100}%`;
  manualTarget.style.top=`${y*100}%`;
  manualTarget.hidden=false;
  manualMessage.textContent='第 2 步：点一下右下角最后一个格子的中心。';
  return;
 }
 const data=readPixels(original);
 const dx=(x-firstCell.x)*data.w/(n-1),dy=(y-firstCell.y)*data.h/(n-1);
 if(dx<7||dy<7||Math.abs(dx-dy)>Math.max(dx,dy)*.20||firstCell.x*data.w<dx*.36||firstCell.y*data.h<dy*.36||(1-x)*data.w<=dx*.36||(1-y)*data.h<=dy*.36){
  resetSelection();
  manualMessage.textContent='两点位置不合适，请重新点左上格和右下格的中心。';
  return;
 }
 const first=snapCell(data,firstCell.x*data.w,firstCell.y*data.h,dx,dy);
 const last=snapCell(data,x*data.w,y*data.h,dx,dy);
 showBoard(readBoard(data,n,first.x,first.y,(last.x-first.x)/(n-1),(last.y-first.y)/(n-1)));
 resetSelection();
});
$('#file').addEventListener('change',async e=>{let f=e.target.files[0];if(!f)return;e.target.value='';$('#status').textContent='正在识别截图…';$('#work').hidden=true;$('#result').hidden=true;try{let url=URL.createObjectURL(f),img=new Image();img.onload=()=>{original=img;URL.revokeObjectURL(url);setTimeout(()=>detect(0,true),20)};img.onerror=()=>{$('#status').textContent='无法读取图片，请换一张截图。';URL.revokeObjectURL(url)};img.src=url}catch(err){$('#status').textContent=err.message}});
$('#detect').onclick=()=>{if(original)detect(Number($('#size').value))};$('#solve').onclick=()=>solve();document.querySelectorAll('#mode button').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('#mode button').forEach(x=>x.classList.toggle('active',x===b));$('#hint').textContent=mode==='color'?'点击格子可切换区域编号，直到与截图颜色一致。':mode==='fixed'?'点击已确认的猫，再次点击可取消。':mode==='excluded'?'点击已确认的 X，再次点击可取消。':'棋盘上的数字代表识别的颜色区域；同一区域应为相同数字。'});

// The browser controls whether and when the native installation prompt is available.
let installPrompt = null;
const installButton = document.querySelector('#install');
const installHelp = document.querySelector('#install-help');
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
installButton.addEventListener('click', async () => {
  if (installPrompt) {
    const prompt = installPrompt; installPrompt = null;
    try { await prompt.prompt(); await prompt.userChoice; } catch (_) { installHelp.hidden = false; installButton.setAttribute('aria-expanded', 'true'); }
  } else {
    installHelp.hidden = !installHelp.hidden;
    installButton.setAttribute('aria-expanded', String(!installHelp.hidden));
  }
});
window.addEventListener('appinstalled', () => { installHelp.hidden = true; installButton.textContent = '✓ 已安装应用'; installButton.disabled = true; });
if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true) { installButton.hidden = true; }
if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {})); }

const autoSaveOption = document.querySelector("#auto-save");
try { autoSaveOption.checked = localStorage.getItem("findcat-auto-save") === "true"; } catch (_) {}
autoSaveOption.addEventListener("change", () => { try { localStorage.setItem("findcat-auto-save", String(autoSaveOption.checked)); } catch (_) {} });
