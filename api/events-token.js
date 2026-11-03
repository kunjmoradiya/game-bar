import { events } from 'hatchable';
export const access='public';
export const methods=['GET'];
export default async function(req,res){return res.json(await events.grant(['leaderboard']));}