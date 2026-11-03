(() => {
 "use strict";
 const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),slug=params.get("slug");
 $("year").textContent=String(new Date().getFullYear());
 let gameUrl="",sessionId="",heartbeatTimer=null,started=false,tracked=false,lastActivity=Date.now();
 function fail(message){$("gameTitle").textContent="Game unavailable";$("gameDescription").textContent=message;$("gameFrame").hidden=true;$("playerError").hidden=false;$("playerError").querySelector("p").textContent=message+" It may have been unpublished or removed.";$("playerLoading")?.remove();}
 async function session(action,extra={}){const r=await fetch("/api/game-session",{method:action==="start"?"POST":"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(action==="start"?{action:"start",slug,device_session_id:getDeviceId()}:{action,session_id:sessionId,...extra}),keepalive:action==="finish"});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Session tracking unavailable.");return d;}
 function getDeviceId(){try{let id=localStorage.getItem("gh_device_session");if(!id){id=crypto.randomUUID();localStorage.setItem("gh_device_session",id);}return id;}catch{return "device-"+Math.random().toString(36).slice(2);}}
 function beginHeartbeat(){if(heartbeatTimer)clearInterval(heartbeatTimer);heartbeatTimer=setInterval(()=>{if(sessionId&&tracked)session("heartbeat",{state:document.hidden||Date.now()-lastActivity>120000?"idle":"playing"}).catch(()=>{});},30000);}
 async function startTracking(){if(started)return;started=true;try{await fetch("/api/player",{cache:"no-store"}).catch(()=>{});const d=await session("start");sessionId=d.session_id;tracked=!!d.tracked;if(d.guest){const note=document.createElement("p");note.className="tracking-note";note.innerHTML='Login to GAME HUB to track your gaming statistics and compete on the global leaderboard. <a href="/login?next='+encodeURIComponent(location.pathname+location.search)+'">Sign in</a>'; $("gameStage").append(note);}if(tracked)beginHeartbeat();}catch(e){if(e.message.includes("another tab")){const note=document.createElement("p");note.className="tracking-note";note.textContent=e.message;$("gameStage").append(note);} }}
 async function finishTracking(){if(heartbeatTimer)clearInterval(heartbeatTimer);if(sessionId){try{await session("finish");}catch(_){}}}
 async function init(){
  if(!slug||!/^[a-z0-9-]{1,70}$/.test(slug))return fail("This game link is invalid.");
  try{
   const response=await fetch("/api/games",{cache:"no-store",headers:{Accept:"application/json"}});
   if(!response.ok)throw Error("Could not load the game library.");
   const data=await response.json(),game=(data.games||[]).find(item=>item.slug===slug);
   if(!game)return fail("This game is no longer published.");
   $("gameTitle").textContent=game.name;$("gameDescription").textContent=game.description||"Enjoy this browser game on Game Hub.";$("gameCategory").textContent=(game.category||"GAME")+" · GAME HUB";document.title=game.name+" — Game Hub";
   gameUrl="/api/play/"+encodeURIComponent(slug);
   try{const all=JSON.parse(localStorage.getItem("gh_history")||"[]"),old=all.find(x=>x.slug===game.slug),hist=all.filter(x=>x.slug!==game.slug);hist.unshift({id:game.id,slug:game.slug,name:game.name,category:game.category,cover_emoji:game.cover_emoji,thumbnail_url:game.thumbnail_url,last_played:new Date().toISOString(),sessions:(old?.sessions||0)+1});localStorage.setItem("gh_history",JSON.stringify(hist.slice(0,100)));}catch(_){}
   $("gameFrame").src=gameUrl;$("gameFrame").hidden=false;
   $("gameFrame").addEventListener("load",()=>{$("gameStage").querySelector(".player-loading")?.remove();if($("gameFrame").contentWindow&&$("gameFrame").src!=="about:blank"){lastActivity=Date.now();try{const doc=$("gameFrame").contentWindow.document,mark=()=>{lastActivity=Date.now();};["pointerdown","pointerup","keydown","keyup","touchstart","click","mousemove"].forEach(type=>doc.addEventListener(type,mark,{passive:true,capture:true}));}catch(_){}startTracking();}},{once:true});
   $("gameFrame").addEventListener("error",()=>fail("The game could not be loaded. Please try again later."));
  }catch(error){fail(error.message||"Unable to load this game.");}
 }
 $("reloadGame").addEventListener("click",()=>{if(!gameUrl)return;$("gameFrame").src="about:blank";window.setTimeout(()=>{$("gameFrame").src=gameUrl+"?reload="+Date.now();},30);});
 $("fullscreenGame").addEventListener("click",async()=>{const frame=$("gameFrame");try{if(document.fullscreenElement)await document.exitFullscreen();else if(frame.requestFullscreen)await frame.requestFullscreen();else if(frame.webkitRequestFullscreen)frame.webkitRequestFullscreen();}catch(_){}});
 window.addEventListener("message",e=>{if(e.source===$("gameFrame").contentWindow&&e.data?.type==="gh-game-input")lastActivity=Date.now();});
 document.addEventListener("visibilitychange",()=>{if(sessionId&&tracked)session("heartbeat",{state:document.hidden||Date.now()-lastActivity>120000?"idle":"playing"}).catch(()=>{});});
 window.addEventListener("pagehide",()=>{finishTracking();});
 init();
})();