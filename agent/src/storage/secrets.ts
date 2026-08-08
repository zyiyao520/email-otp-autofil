import { MASTER_KEY } from "../constants.js";
import { decrypt, encrypt, isEncrypted } from "./crypto.js";
import { dbGet, dbQuery, dbRun } from "./db.js";
export async function secretGet(key:string){const r=await dbGet<{value:string}>("SELECT value FROM secrets WHERE key = ?",[key]);if(!r)return null;if(!isEncrypted(r.value))return r.value;if(!MASTER_KEY)return null;try{return decrypt(r.value,MASTER_KEY);}catch{return null;}}
export async function secretSet(key:string,value:string){await dbRun("INSERT INTO secrets (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",[key,MASTER_KEY?encrypt(value,MASTER_KEY):value]);}
export async function secretDelete(key:string){await dbRun("DELETE FROM secrets WHERE key = ?",[key]);}
export async function migratePlaintextSecrets(){if(!MASTER_KEY)return;const rows=await dbQuery<{key:string;value:string}>("SELECT key,value FROM secrets");let n=0;for(const r of rows)if(!isEncrypted(r.value)){await secretSet(r.key,r.value);n++;}if(n)console.log(`[otp-agent] migrated ${n} plaintext secret(s)`);}
