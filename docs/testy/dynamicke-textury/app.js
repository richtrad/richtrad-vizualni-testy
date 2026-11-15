"use strict";
const API = "https://richtrad-vizualni-testy-sber.richtrad.chatgpt.site/v1/";
const PROTOCOL_HASH = "6ec1e27e425996b87f8e72be8566a806ad1d12f0f61e43669ee5510984864931";
const mode = new URLSearchParams(location.search).get("rezim") === "zkouska" ? "qa" : "participant";
const demo = mode === "qa";
const modeName = demo ? "Technická zkouška" : "Účast ve výzkumu";
const storageKey = "richtrad:textury:v1:" + mode;
const el = id => document.getElementById(id);
const canvases = ["ref", "left", "right"].map(el);
const choices = [...document.querySelectorAll("[data-choice]")];
const viewportOK = () => innerWidth >= 900 && innerHeight >= 650;
const allVisible = () => !document.hidden && viewportOK() && canvases.every(canvas => {
  const b = canvas.getBoundingClientRect();
  return b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth;
});
let saved = null, session = null, playback = null, busy = false, generation = 0, unavailable = false;
let raf = 0;
function save(next) {
  localStorage.setItem(storageKey, JSON.stringify(next));
  saved = next;
}
try {
  saved = JSON.parse(localStorage.getItem(storageKey));
} catch {
  unavailable = true;
  el("error").textContent = "Pro pokračování musí prohlížeč povolit místní uložení klíče měření.";
}
function report(error) { el("error").textContent = error.message; }
function panel(id) {
  for (const name of ["intro", "run", "end"]) el(name).hidden = name !== id;
  window.scrollTo(0,0);
}
function syncIntro() {
  el("size-intro").hidden = viewportOK();
  el("start").disabled = unavailable || busy || !viewportOK() || !el("consent").checked;
  el("resume").disabled = unavailable || busy || !viewportOK();
  el("start").hidden = !!saved;
  el("consent-row").hidden = !!saved;
  el("resume").hidden = !saved;
}
async function call(path, fields = {}) {
  let response;
  try {
    response = await fetch(API + path, {method:"POST",mode:"cors",credentials:"omit",cache:"no-store",
      referrerPolicy:"no-referrer",headers:{"Content-Type":"text/plain;charset=UTF-8"},
      body:JSON.stringify({id:saved.id,key:saved.key,...fields}),signal:AbortSignal.timeout(22000)});
  } catch {
    throw Error("Úložiště neodpovídá. Zkontrolujte připojení a zkuste to znovu.");
  }
  let result;
  try { result = await response.json(); } catch { throw Error("Úložiště nevrátilo potvrzení. Zkuste to znovu."); }
  if (!response.ok) {
    if (response.status === 410 || (path === "start" && response.status === 409)) el("recover").hidden = false;
    throw Error(result.error || "Požadavek se nepodařilo uložit.");
  }
  if (result.protocol_sha256 !== PROTOCOL_HASH) throw Error("Verze plánu a úložiště se neshodují.");
  return result;
}
function settings() {
  el(demo ? "tab-demo" : "tab-person").setAttribute("aria-current","page");
  el("mode-info").textContent = demo
    ? "Vyzkoušíte si stejný test. Vaše volby se uloží jako technická zkouška a do výzkumu se nezapočítají."
    : "Vaše volby a údaje o přehrávání se pod náhodným kódem průběžně ukládají do soukromé databáze výzkumu.";
  el("consent-label").textContent = demo
    ? "Rozumím, že se mé zkušební volby a údaje o přehrávání uloží."
    : "Dobrovolně se účastním a souhlasím s uložením svých odpovědí a údajů o přehrávání.";
  el("start").textContent = demo ? "Spustit zkoušku" : "Zahájit test";
  el("run-mode").textContent = el("end-mode").textContent = modeName;
  el("consent").onchange = syncIntro;
  window.addEventListener("resize",syncIntro);
  syncIntro();
}
function stopPlayback() {
  generation++; cancelAnimationFrame(raf); playback = null;
  for (const b of choices) b.disabled = true;
}
function finish(paused) {
  stopPlayback(); panel("end");
  el("end-title").textContent = paused ? "Test je přerušen" : "Děkujeme za porovnání";
  el("end-text").textContent = (paused ? "Počet potvrzených odpovědí je " + session.answered + " z 64. " : "Úložiště potvrdilo všech 64 odpovědí. ")
    + (demo ? "Relace je označená jako technická zkouška." : "Odpovědi jsou uložené pod vaším náhodným kódem.");
  el("again").hidden = !paused;
}
function message(text) { if (el("ready").textContent !== text) el("ready").textContent = text; }
function setChoices() {
  const ready = playback && playback.loaded && playback.visible >= 4000 && allVisible();
  for (const b of choices) b.disabled = busy || !!saved?.pending || !playback || (b.dataset.choice !== "technical" && !ready);
}
function draw(now) {
  const p = playback;
  if (!p || !p.loaded) return;
  const visible = allVisible();
  const delta = Math.min(250, Math.max(0,now - p.lastNow));
  p.lastNow = now;
  if (visible && p.wasVisible) { p.visible += delta; p.clock += delta; }
  p.wasVisible = visible;
  el("size-run").hidden = viewportOK();
  if (visible) {
    const indexes = p.clips.map(c => {
      const t = (p.clock / 1000) % (c.frames / c.fps + .3);
      return t >= c.frames / c.fps ? -1 : Math.min(c.frames - 1, Math.floor(t * c.fps));
    });
    if (indexes.some((f,j) => p.last[j] !== f)) {
      for (let j=0;j<3;j++) {
        const ctx = canvases[j].getContext("2d"), f = indexes[j];
        if (f < 0) { ctx.fillStyle="#222"; ctx.fillRect(0,0,64,64); }
        else {
          ctx.imageSmoothingEnabled=false;
          if (p.last[j]>=0 && f>p.last[j]+1) p.skipped += f-p.last[j]-1;
          ctx.drawImage(p.images[j],(f%10)*64,Math.floor(f/10)*64,64,64,0,0,64,64);
        }
      }
      p.last=indexes;
      if (p.log.length < 5000) p.log.push({visible_ms:Math.round(p.visible),wall_ms:Math.round(now),frames:indexes});
      else p.truncated=true;
    }
  }
  if (!busy && !saved.pending) message(!visible ? "Pro přehrávání zobrazte všechna tři videa současně."
    : p.visible >= 4000 ? "Můžete odpovědět nebo videa přehrát znovu."
    : "Sledujte videa ještě " + Math.ceil((4000-p.visible)/1000) + " s.");
  setChoices();
  raf = requestAnimationFrame(draw);
}
function startImage(src) {
  return new Promise((resolve,reject) => {
    const img = new Image(); img.onload=()=>resolve(img); img.onerror=()=>reject(Error("Video se nepodařilo načíst. Zkuste přehrání znovu nebo zvolte technický problém.")); img.src=src;
  });
}
async function show() {
  stopPlayback(); el("retry").hidden=true; el("error").textContent="";
  if (session.status === "complete") { finish(false); return; }
  const own = generation;
  const tr=STUDY.plans[session.schedule_slot-1].trials[session.answered];
  el("question").textContent=tr.question==="overall" ? "Které video se celkově více podobá referenci?" : "Které video má podobnější pohyb a jeho změny v čase?";
  el("progress").value=session.answered;
  el("counter").textContent="Porovnání "+(session.answered+1)+" z 64";
  el("size-run").hidden=viewportOK();
  const p = {clips:[tr.reference,tr.left,tr.right].map(id=>STUDY.stimuli[id]),images:[],loaded:false,visible:0,clock:0,hidden:0,
    hiddenAt:document.hidden ? performance.now() : null,lastNow:0,wasVisible:false,last:[-2,-2,-2],log:[],truncated:false,skipped:0,replays:0};
  playback=p;
  for (const canvas of canvases) { const cx=canvas.getContext("2d"); cx.fillStyle="#222"; cx.fillRect(0,0,64,64); }
  panel("run"); message("Načítání videí…"); setChoices();
  try {
    p.images=await Promise.all(p.clips.map(c=>startImage(c.sprite)));
    if (generation!==own) return;
    p.loaded=true; p.lastNow=performance.now(); raf=requestAnimationFrame(draw);
  } catch (e) { if (generation===own) { message(e.message); setChoices(); } }
}
async function submitPending() {
  if (!saved?.pending) return;
  message("Ukládání odpovědi…");
  try {
    session=await call("answer",saved.pending);
    save({...saved,pending:null});
    el("retry").hidden=true;
  } catch (e) {
    el("retry").hidden=false;
    message("Odpověď čeká na potvrzení úložiště.");
    throw e;
  }
}
async function withLock(action) {
  if (busy) return;
  busy=true; el("error").textContent=""; syncIntro(); setChoices();
  try { await action(); } catch (e) { report(e); }
  finally { busy=false; syncIntro(); setChoices(); }
}
function syncSession() {
  return withLock(async()=>{
    if (!saved) {
      if (!viewportOK() || !el("consent").checked) return;
      const bytes=crypto.getRandomValues(new Uint8Array(32));
      save({id:crypto.randomUUID(),key:Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join(""),pending:null});
    }
    session=await call("start",{mode,consent:true});
    if (saved.pending) await submitPending();
    await show();
  });
}
for (const b of choices) b.onclick = () => withLock(async()=>{
  const p=playback;
  if (!p || saved.pending || (b.dataset.choice!=="technical" && (!p.loaded || p.visible<4000 || !allVisible()))) return;
  const tm={visible_ms:Math.round(p.visible),loaded:p.loaded,viewport_width:innerWidth,viewport_height:innerHeight,
    hidden_ms:Math.round(p.hidden+(p.hiddenAt===null?0:performance.now()-p.hiddenAt)),skipped_frames:p.skipped,
    replays:p.replays,frames:p.log.slice(),frame_log_truncated:p.truncated,device_pixel_ratio:devicePixelRatio};
  save({...saved,pending:{presentation_index:session.answered,response_id:crypto.randomUUID(),choice:b.dataset.choice,telemetry:tm}});
  stopPlayback(); await submitPending(); await show();
});
el("retry").onclick=()=>withLock(async()=>{await submitPending(); await show();});
el("start").onclick=el("resume").onclick=syncSession;
el("replay").onclick=()=>{
  const p=playback;
  if (!p || busy || saved.pending) return;
  if (!p.loaded) { show(); return; }
  p.clock=0; p.last=[-2,-2,-2]; p.replays++;
};
el("pause").onclick=()=>{ if (!busy && !saved.pending) finish(true); };
el("again").onclick=syncSession;
el("recover").onclick=()=>{localStorage.removeItem(storageKey); location.reload();};
el("download").onclick=()=>withLock(async()=>{
  const result=await call("own-record");
  const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:"application/json"}));
  const link=document.createElement("a"); link.href=url; link.download="textury-"+mode+"-"+result.session_id+".json"; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
});
document.addEventListener("visibilitychange",()=>{
  const p=playback;
  if (!p) return;
  p.wasVisible=false; p.lastNow=performance.now();
  if (document.hidden) p.hiddenAt=performance.now();
  else if (p.hiddenAt!==null) { p.hidden+=performance.now()-p.hiddenAt; p.hiddenAt=null; }
  setChoices();
});
settings();
