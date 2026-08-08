import { dbQuery, dbRun } from "./db.js";
const cache=new Map<string,string>();
export async function loadSettings(){for(const r of await dbQuery<{key:string;value:string}>("SELECT key,value FROM settings"))cache.set(r.key,r.value);}
export function getSetting(key:string,fallback:string){return cache.get(key)??fallback;}
export async function setSetting(key:string,value:string){cache.set(key,value);await dbRun("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",[key,value]);}
const RI="require_invite", O="outlook_client_id", G="google_client_id", GS="google_client_secret", P="pubsub_audience";
export function isInviteRequired(){return getSetting(RI,"0")==="1";} export async function setInviteRequired(v:boolean){await setSetting(RI,v?"1":"0");}
export function getOutlookClientId(){return getSetting(O,"").trim();} export async function setOutlookClientId(v:string){await setSetting(O,v.trim());}
export function getGoogleClientId(){return getSetting(G,"").trim();} export async function setGoogleClientId(v:string){await setSetting(G,v.trim());}
export function getGoogleClientSecret(){return getSetting(GS,"").trim();} export async function setGoogleClientSecret(v:string){await setSetting(GS,v.trim());}
export function getPubSubAudience(){return getSetting(P,"").trim();} export async function setPubSubAudience(v:string){await setSetting(P,v.trim());}
