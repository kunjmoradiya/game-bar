import { db, auth, events } from 'hatchable';
import { awardSuperCoins, ensureWallet } from 'lib/supercoin.js';
import { touchPresence } from 'lib/player-presence.js';
export const access = 'public';
export const methods = ['POST','PUT'];

const publish = async (event, data) => { try { await events.publish('leaderboard', event, data); } catch (_) {} };
async function currentUser(req) { if(req.user?.id)return req.user;try { return await auth.getUser(req); } catch (_) { return null; } }
async function recordDailyActivity(sessionId,userId,playerId,seconds){
 if(seconds<=0)return;
 await db.query(`
  WITH t AS (
   SELECT NOW() AS now_ts,NOW()-($4::int*INTERVAL '1 second') AS start_ts
  ), split AS (
   SELECT (start_ts AT TIME ZONE 'UTC')::date AS start_day,
    (now_ts AT TIME ZONE 'UTC')::date AS today,
    LEAST($4,GREATEST(0,EXTRACT(EPOCH FROM (date_trunc('day',now_ts AT TIME ZONE 'UTC')-(start_ts AT TIME ZONE 'UTC')))::int)) AS previous_seconds
   FROM t
  ), parts AS (
   SELECT start_day AS activity_date,previous_seconds AS seconds FROM split
   UNION ALL
   SELECT today AS activity_date,$4-previous_seconds AS seconds FROM split
  )
  INSERT INTO player_session_daily_activity(session_key,user_id,player_id,activity_date,active_seconds)
  SELECT $1,$2,$3,activity_date,seconds FROM parts WHERE seconds>0
  ON CONFLICT(session_key,activity_date) DO UPDATE SET active_seconds=player_session_daily_activity.active_seconds+EXCLUDED.active_seconds,updated_at=NOW()
 `,[sessionId,userId,playerId,seconds]);
}
async function recordCompletedSession(sessionId,userId,playerId){
 await db.query(`INSERT INTO player_session_daily_activity(session_key,user_id,player_id,activity_date,completed_sessions)
 VALUES($1,$2,$3,(NOW() AT TIME ZONE 'UTC')::date,1)
 ON CONFLICT(session_key,activity_date) DO UPDATE SET completed_sessions=player_session_daily_activity.completed_sessions+1,updated_at=NOW()`,[sessionId,userId,playerId]);
}
async function identity(user) {
  const r=await db.query("SELECT p.player_id,u.email_verified_at FROM player_profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1 AND p.player_id IS NOT NULL LIMIT 1",[user.id]);
  if(!r.rows[0])return null;
  return {player_id:r.rows[0].player_id,verified:!!r.rows[0].email_verified_at};
}
export default async function(req,res) {
  const body=req.body||{}, action=String(body.action||'start');
  const slug=String(body.slug||'');
  if(req.method==='POST' && action==='start') {
    if(!/^[a-z0-9-]{1,70}$/.test(slug)) return res.status(400).json({error:'Invalid game.'});
    const game=await db.query("SELECT id FROM games WHERE slug=$1 AND status='published' LIMIT 1",[slug]);
    if(!game.rows.length) return res.status(404).json({error:'Published game not found.'});
    const sessionId=crypto.randomUUID();
    const user=await currentUser(req);
    const ident=user?.id?await identity(user):null;
    if(!user?.id || !ident?.verified) {
      await db.query("INSERT INTO game_activity(session_key,game_id) VALUES($1,$2)",[sessionId,game.rows[0].id]);
      return res.json({ok:true,tracked:false,guest:true,session_id:sessionId,heartbeat_seconds:30,message:'Login to GAME HUB to track your gaming statistics and compete on the global leaderboard.'});
    }
    const stale=await db.query("UPDATE game_play_sessions SET session_status='timed_out',completion_status='incomplete',ended_at=COALESCE(ended_at,NOW()) WHERE user_id=$1 AND session_status IN ('playing','idle') AND last_heartbeat_at < NOW()-INTERVAL '90 seconds' RETURNING session_key",[user.id]);
    if(stale.rows.length) await db.query("UPDATE player_presence SET status='offline',current_game_id=NULL,active_session_id=NULL,updated_at=NOW() WHERE user_id=$1",[user.id]);
    const existing=await db.query("SELECT session_key FROM game_play_sessions WHERE user_id=$1 AND session_status IN ('playing','idle') LIMIT 1",[user.id]);
    const deviceId=String(body.device_session_id||'').slice(0,100);
    const deviceUse=deviceId?await db.query("SELECT COUNT(DISTINCT user_id)::int AS accounts FROM game_play_sessions WHERE device_session_id=$1 AND user_id<>$2 AND started_at>NOW()-INTERVAL '7 days'",[deviceId,user.id]):{rows:[{accounts:0}]};
    const suspiciousReason=Number(deviceUse.rows[0]?.accounts)>=2?'shared_device_multiple_accounts_7d':null;
    if(existing.rows.length) return res.status(409).json({error:'You already have an active GAME HUB session in another tab or device. Finish it before starting another game.',active_session:true});
    try { await db.transaction([
      {sql:"INSERT INTO game_activity(session_key,game_id,player_id) VALUES($1,$2,$3)",params:[sessionId,game.rows[0].id,ident.player_id]},
      {sql:"INSERT INTO game_play_sessions(session_key,game_id,user_id,player_id,started_at,last_heartbeat_at,session_status,completion_status,device_session_id,verified_at,suspicious_reason) VALUES($1,$2,$3,$4,NOW(),NOW(),'playing','pending',$5,NOW(),$6)",params:[sessionId,game.rows[0].id,user.id,ident.player_id,deviceId,suspiciousReason]}
    ]); } catch (_) { return res.status(409).json({error:'You already have an active GAME HUB session in another tab or device. Finish it before starting another game.',active_session:true}); }
    await touchPresence({userId:user.id,playerId:ident.player_id,status:'playing',gameId:game.rows[0].id,sessionKey:sessionId});
    await ensureWallet(user.id,ident.player_id);
    const firstGame=await awardSuperCoins({userId:user.id,playerId:ident.player_id,ruleKey:'first_game_daily',referenceKey:'first-game:'+user.id+':'+new Date().toISOString().slice(0,10),reason:'First game played today',sessionKey:sessionId,gameId:game.rows[0].id});
    if(firstGame.awarded)await publish('supercoin_awarded',{player_id:ident.player_id,amount:firstGame.awarded,reason:'First game played today'});
    await publish('player_started',{player_id:ident.player_id,game_id:game.rows[0].id});
    return res.json({ok:true,tracked:true,guest:false,session_id:sessionId,heartbeat_seconds:30});
  }

  const sessionId=String(body.session_id||'');
  if(!/^[0-9a-f-]{36}$/i.test(sessionId)) return res.status(400).json({error:'Invalid session ID.'});
  const user=await currentUser(req);
  if(!user?.id) {
    if(req.method==='PUT'&&action==='finish'){await db.query("UPDATE game_activity SET ended_at=NOW() WHERE session_key=$1 AND player_id IS NULL AND ended_at IS NULL",[sessionId]);return res.json({ok:true,guest:true});}
    return res.status(401).json({error:'Sign in to manage a tracked session.'});
  }
  const ident=await identity(user);
  if(!ident?.verified) {
    if(req.method==='PUT'&&action==='finish'){await db.query("UPDATE game_activity SET ended_at=NOW() WHERE session_key=$1 AND player_id IS NULL AND ended_at IS NULL",[sessionId]);return res.json({ok:true,guest:true});}
    return res.status(403).json({error:'Verify your email to track official gaming statistics.'});
  }
  if(!/^[0-9a-f-]{36}$/i.test(sessionId)) return res.status(400).json({error:'Invalid session ID.'});
  const row=await db.query("SELECT session_key,game_id,session_status,active_duration_seconds,last_heartbeat_at FROM game_play_sessions WHERE session_key=$1 AND user_id=$2 LIMIT 1",[sessionId,user.id]);
  if(!row.rows.length) return res.status(404).json({error:'Tracked session not found.'});
  const session=row.rows[0];
  if(!['playing','idle'].includes(session.session_status)) return res.status(409).json({error:'This game session is no longer active.'});
  const heartbeatAge=await db.query("SELECT EXTRACT(EPOCH FROM (NOW()-$1::timestamptz))::int AS seconds",[session.last_heartbeat_at]);
  const age=Math.max(0,Number(heartbeatAge.rows[0]?.seconds)||0);
  if(age>90) {
    await db.query("UPDATE game_play_sessions SET session_status='timed_out',completion_status='incomplete',ended_at=NOW() WHERE session_key=$1 AND user_id=$2",[sessionId,user.id]);
    await db.query("UPDATE player_presence SET status='offline',current_game_id=NULL,active_session_id=NULL,updated_at=NOW() WHERE user_id=$1 AND active_session_id=$2",[user.id,sessionId]);
    await publish('player_offline',{player_id:ident.player_id});
    return res.status(409).json({error:'Session expired after missed heartbeats. Start the game again to resume tracking.'});
  }
  if(req.method==='PUT' && action==='heartbeat') {
    if(age<10)return res.status(429).json({error:'Heartbeat received too quickly. Wait for the next tracking interval.'});
    const next=body.state==='idle'?'idle':'playing';
    const creditedSeconds=session.session_status==='playing'?Math.min(45,age):0;
    const updated=await db.query("UPDATE game_play_sessions SET active_duration_seconds=active_duration_seconds+$4,last_heartbeat_at=NOW(),session_status=$3 WHERE session_key=$1 AND user_id=$2 AND session_status IN ('playing','idle') AND last_heartbeat_at=$5::timestamptz RETURNING active_duration_seconds,session_status",[sessionId,user.id,next,creditedSeconds,session.last_heartbeat_at]);
    if(!updated.rows.length) return res.status(409).json({error:'Session changed; please restart the game.'});
    if(creditedSeconds>0)await recordDailyActivity(sessionId,user.id,ident.player_id,creditedSeconds);
    const previousMilestone=Math.floor((Number(session.active_duration_seconds)||0)/600),nextActive=Number(updated.rows[0].active_duration_seconds)||0,nextMilestone=Math.floor(nextActive/600);
    if(nextMilestone>previousMilestone){const award=await awardSuperCoins({userId:user.id,playerId:ident.player_id,ruleKey:'active_10m',referenceKey:'active10:'+sessionId+':'+nextMilestone,reason:'10 minutes of verified active gameplay',sessionKey:sessionId,gameId:session.game_id});if(award.awarded)await publish('supercoin_awarded',{player_id:ident.player_id,amount:award.awarded,reason:'Verified active gameplay'});}
    await touchPresence({userId:user.id,playerId:ident.player_id,status:next,gameId:session.game_id,sessionKey:sessionId});
    await publish('player_activity_updated',{player_id:ident.player_id,active_seconds:Number(updated.rows[0].active_duration_seconds)||0,status:next});
    return res.json({ok:true,active_seconds:Number(updated.rows[0].active_duration_seconds)||0,status:next});
  }
  if(req.method==='PUT' && action==='finish') {
    const finishDelta=session.session_status==='playing'?Math.min(45,age):0;
    const updated=await db.query("UPDATE game_play_sessions SET active_duration_seconds=active_duration_seconds+$3,ended_at=NOW(),last_heartbeat_at=NOW(),session_status='completed',completion_status=CASE WHEN active_duration_seconds+$3>=30 THEN 'completed' ELSE 'short' END,verified_at=COALESCE(verified_at,NOW()) WHERE session_key=$1 AND user_id=$2 AND session_status IN ('playing','idle') AND last_heartbeat_at=$4::timestamptz RETURNING active_duration_seconds,completion_status,game_id",[sessionId,user.id,finishDelta,session.last_heartbeat_at]);
    if(!updated.rows.length) return res.status(409).json({error:'Session was already finalized.'});
    const activeSeconds=Number(updated.rows[0].active_duration_seconds)||0;
    if(finishDelta>0)await recordDailyActivity(sessionId,user.id,ident.player_id,finishDelta);
    if(updated.rows[0].completion_status==='completed'){await recordCompletedSession(sessionId,user.id,ident.player_id);const sessionAward=await awardSuperCoins({userId:user.id,playerId:ident.player_id,ruleKey:'completed_session',referenceKey:'session-complete:'+sessionId,reason:'Completed a verified game session',sessionKey:sessionId,gameId:updated.rows[0].game_id});if(sessionAward.awarded)await publish('supercoin_awarded',{player_id:ident.player_id,amount:sessionAward.awarded,reason:'Completed game session'});}
    await db.query("UPDATE game_activity SET ended_at=NOW(),duration_seconds=$2 WHERE session_key=$1",[sessionId,activeSeconds]);
    await touchPresence({userId:user.id,playerId:ident.player_id,status:'online',gameId:null,sessionKey:null});
    const stats=await db.query("SELECT COUNT(*) FILTER(WHERE completion_status='completed')::int AS sessions,COUNT(DISTINCT game_id) FILTER(WHERE completion_status='completed')::int AS games,COALESCE(SUM(active_duration_seconds),0)::bigint AS seconds FROM game_play_sessions WHERE user_id=$1 AND verified_at IS NOT NULL AND suspicious_reason IS NULL AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=game_play_sessions.session_key AND sm.excluded=true)",[user.id]);
    await db.query("UPDATE player_profiles SET total_sessions=$2,games_played=$3,play_seconds=$4,last_active_at=NOW(),updated_at=NOW() WHERE user_id=$1",[user.id,Number(stats.rows[0]?.sessions)||0,Number(stats.rows[0]?.games)||0,Number(stats.rows[0]?.seconds)||0]);
    const settings=await db.query("SELECT achievement_reward_points,special_achievement_reward_points FROM leaderboard_settings WHERE id=1");
    const reward=Number(settings.rows[0]?.achievement_reward_points)||25,specialReward=Number(settings.rows[0]?.special_achievement_reward_points)||50;
    const milestones=[['first-session','First Game',1,false,10],['ten-sessions','10 Games Completed',10,false,20],['fifty-sessions','50 Games Completed',50,false,50],['hundred-sessions','100 Games Completed',100,false,100],['ten-hours','10 Hours Active Gameplay',36000,false,25],['fifty-hours','50 Hours Active Gameplay',180000,false,50],['hundred-hours','100 Hours Active Gameplay',360000,true,100]];
    const achievements=[];
    for(const [key,title,threshold,isSpecial,coinReward] of milestones){
      const reached=key.includes('hours')?Number(stats.rows[0]?.seconds)>=threshold:Number(stats.rows[0]?.sessions)>=threshold;
      if(reached){const ins=await db.query("INSERT INTO player_achievements(user_id,player_id,achievement_key,title,reward_points,reward_sc,xp_awarded) VALUES($1,$2,$3,$4,$5,$6,$6) ON CONFLICT(user_id,achievement_key) DO NOTHING RETURNING achievement_key",[user.id,ident.player_id,key,title,isSpecial?specialReward:reward,coinReward]);if(ins.rows.length){achievements.push(title);const a=await awardSuperCoins({userId:user.id,playerId:ident.player_id,ruleKey:'achievement',referenceKey:'achievement:'+user.id+':'+key,reason:'Achievement unlocked: '+title,amountOverride:coinReward,sessionKey:sessionId,gameId:updated.rows[0].game_id});if(a.awarded)await publish('supercoin_awarded',{player_id:ident.player_id,amount:a.awarded,reason:title});}}
    }
    await publish('player_session_finished',{player_id:ident.player_id,game_id:updated.rows[0].game_id});
    return res.json({ok:true,active_seconds:activeSeconds,completion_status:updated.rows[0].completion_status,achievements});
  }
  return res.status(400).json({error:'Unknown session action.'});
}