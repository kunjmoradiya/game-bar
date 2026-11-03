(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>Number(x||0).toLocaleString();
const date=x=>x?new Date(x).toLocaleString():'—';
let data=null;
function message(s,bad=false){$('walletMessage').className=bad?'portal-error':'portal-success';$('walletMessage').textContent=s||''}
async function api(url,opt={}){const r=await fetch(url,opt),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Wallet request failed.');return d}
async function load(){
 try{
  const session=await window.hatchable?.auth?.getSession?.();
  if(!session?.user){location.replace('/login?next='+encodeURIComponent('/wallet.html'));return}
  let login={};
  try{login=await api('/api/supercoin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'daily_login'})})}
  catch(e){if(!e.message.toLowerCase().includes('suspended'))throw e}
  data=await api('/api/supercoin');try{const rank=await api('/api/gamer-rankings?period=all&limit=100');data.rank=rank.my_rank}catch(_){}render();
  if(login.awarded)message('Daily login reward: +'+login.awarded+' SC');
  else if(data.reward_suspended)message('Your wallet is visible, but earning and redemption are currently suspended.',true);
 }catch(e){$('walletContent').innerHTML='<div class="portal-empty">'+esc(e.message)+'</div>';message(e.message,true)}
}
function render(){
 const w=data.wallet||{},l=data.level||{level:1,name:'Beginner',xp:0,next_level_xp:100},st=data.stats||{};
 const pct=l.next_level_xp?Math.min(100,Math.max(0,(l.xp-(l.level-1)*100)/100*100)):100;
 $('playerId').textContent=data.player_id||'Player ID unavailable';
 const challenges=(data.challenges||[]).map(c=>{
  const progress=Math.min(100,Number(c.progress||0)/Math.max(1,Number(c.target))*100);
  return '<article class="wallet-item"><h3>'+esc(c.title)+'</h3><p class="wallet-muted">'+esc(c.description)+'</p><div class="wallet-progress"><i style="width:'+progress+'%"></i></div><div class="wallet-row"><span class="wallet-muted">'+num(c.progress)+' / '+num(c.target)+' '+esc(String(c.metric).replaceAll('_',' '))+'</span><b>+'+num(c.reward_sc)+' SC</b></div><button class="wallet-btn" data-challenge="'+esc(c.challenge_key)+'" '+(c.completed||progress<100?'disabled':'')+'>'+(c.completed?'Claimed':'Claim reward')+'</button></article>';
 }).join('');
 const rewards=(data.rewards||[]).map(r=>'<article class="wallet-item"><h3>'+esc(r.name)+'</h3><p class="wallet-muted">'+esc(r.description)+'</p><div class="wallet-row"><b>'+num(r.cost_sc)+' SC</b><span class="wallet-muted">'+(r.stock_remaining===null?'Unlimited stock':num(r.stock_remaining)+' left')+' · Level '+r.min_level+'+</span></div><button class="wallet-btn" data-reward="'+r.id+'" '+(Number(w.balance)<Number(r.cost_sc)||Number(l.level)<Number(r.min_level)||r.stock_remaining===0?'disabled':'')+'>Redeem reward</button></article>').join('');
 const achievements=(data.achievements||[]).map(a=>'<article class="wallet-item"><h3>🏅 '+esc(a.title)+'</h3><p class="wallet-muted">'+esc(a.achievement_key)+'</p><b>+'+num(a.reward_sc)+' SC</b></article>').join('');
 const transactions=(data.transactions||[]).map(t=>'<tr><td>'+date(t.created_at)+'</td><td>'+esc(t.transaction_type)+'</td><td>'+esc(t.reason)+'</td><td class="'+(t.amount>0?'coin-positive':'coin-negative')+'">'+(t.amount>0?'+':'')+num(t.amount)+' SC</td><td>'+esc(t.status)+'</td></tr>').join('');
 const redemptions=(data.redemptions||[]).map(r=>'<div class="wallet-row"><div><b>'+esc(r.reward_name)+'</b><div class="wallet-muted">'+date(r.created_at)+'</div></div><span class="coin-negative">-'+num(r.cost_sc)+' SC</span></div>').join('');
 $('walletContent').innerHTML=
 '<div class="wallet-grid"><article class="wallet-card primary"><small>AVAILABLE BALANCE</small><strong class="wallet-value" id="coinBalance">◈ '+num(w.balance)+' SC</strong><p>Virtual platform points · no cash value or withdrawal</p></article><article class="wallet-card"><small>TOTAL EARNED</small><strong class="wallet-value">+'+num(w.total_earned)+' SC</strong><p>All successful coin credits</p></article><article class="wallet-card"><small>TOTAL SPENT</small><strong class="wallet-value">'+num(w.total_spent)+' SC</strong><p>Coins used for virtual rewards</p></article></div>'+
 '<section class="wallet-section"><div class="wallet-row"><div><h2>Gamer Level</h2><b>Level '+l.level+' · '+esc(l.name)+(data.rank?' · Global rank #'+data.rank.rank:'')+'</b><p class="wallet-muted">'+num(l.xp)+' XP'+(l.next_level_xp?' / '+num(l.next_level_xp)+' XP to next level':' · Maximum level')+'</p></div><div style="font-size:38px">🏆</div></div><div class="level-track"><i style="width:'+pct+'%"></i></div><p class="wallet-muted">Online time: '+(Number(st.online_seconds||0)/3600).toFixed(1)+' hours · Verified active gaming time: '+(Number(st.active_seconds||0)/3600).toFixed(1)+' hours · '+num(st.completed_sessions)+' completed sessions · '+num(st.games_played)+' games completed</p></section>'+
 '<section class="wallet-section"><h2>Daily & Weekly Challenges</h2><div class="wallet-challenges">'+(challenges||'<p class="wallet-muted">No active challenges right now.</p>')+'</div></section>'+
 '<section class="wallet-section"><h2>Virtual Rewards Store</h2><div class="wallet-rewards">'+(rewards||'<p class="wallet-muted">No rewards are currently available. Check back later.</p>')+'</div></section>'+
 '<section class="wallet-section"><h2>Achievements</h2><div class="wallet-challenges">'+(achievements||'<p class="wallet-muted">Complete eligible game milestones to unlock achievements.</p>')+'</div></section>'+
 '<section class="wallet-section"><h2>Transaction History</h2><div class="wallet-table-wrap"><table class="wallet-table"><thead><tr><th>DATE</th><th>TYPE</th><th>REASON</th><th>AMOUNT</th><th>STATUS</th></tr></thead><tbody>'+transactions+'</tbody></table></div>'+(transactions?'':'<p class="wallet-muted">Your first transaction will appear here after you earn or spend SuperCoins.</p>')+'</section>'+
 '<section class="wallet-section"><h2>Reward Redemption History</h2>'+(redemptions||'<p class="wallet-muted">No reward redemptions yet.</p>')+'</section>'+
 '<p class="wallet-muted">SuperCoins are virtual GAME HUB points only. They cannot be withdrawn, transferred for cash or exchanged for real-world money.</p>';
 document.querySelectorAll('[data-challenge]').forEach(b=>b.onclick=()=>claim(b.dataset.challenge,b));
 document.querySelectorAll('[data-reward]').forEach(b=>b.onclick=()=>redeem(b.dataset.reward,b));
}
async function claim(key,b){b.disabled=true;try{const d=await api('/api/supercoin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'claim_challenge',challenge_key:key})});message('Challenge reward credited: +'+d.award.awarded+' SC');await load()}catch(e){message(e.message,true);b.disabled=false}}
async function redeem(id,b){if(!confirm('Redeem this virtual reward using SuperCoins?'))return;b.disabled=true;try{const d=await api('/api/supercoin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'redeem',reward_id:id,idempotency_key:crypto.randomUUID()})});message('Reward redeemed. New balance: '+num(d.redemption.balance)+' SC');await load()}catch(e){message(e.message,true);b.disabled=false}}
load();
try{const ev=window.hatchable?.events?.connect?.(),ch=ev?.channel?.('leaderboard');['supercoin_awarded','supercoin_spent','player_session_finished'].forEach(n=>ch?.on?.(n,load))}catch(_){}
setInterval(()=>{if(!document.hidden)load()},45000);
})();