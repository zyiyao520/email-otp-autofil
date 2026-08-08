import crypto from "node:crypto";
import { dbGet, dbQuery, dbRun } from "./db.js";

export type User = { id:string; username:string; passwordHash:string; createdAt:number; lastSeen:number|null; disabled:boolean };
type UserRow = { id:string; username:string; password_hash:string; created_at:number|string; last_seen:number|string|null; disabled:boolean|number|null };
export function hashPassword(password:string):string { const salt=crypto.randomBytes(16); const hash=crypto.scryptSync(password,salt,64); return `${salt.toString("base64")}:${hash.toString("base64")}`; }
export function verifyPassword(password:string,stored:string):boolean { const [s,h]=stored.split(":"); if(!s||!h)return false; const salt=Buffer.from(s,"base64"), expected=Buffer.from(h,"base64"), actual=crypto.scryptSync(password,salt,expected.length); return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected); }
function normUsername(v:string){return v.trim().toLowerCase();}
function row(r:UserRow):User{return {id:r.id,username:r.username,passwordHash:r.password_hash,createdAt:Number(r.created_at),lastSeen:r.last_seen==null?null:Number(r.last_seen),disabled:Boolean(r.disabled)};}
export async function listUsers(){return (await dbQuery<UserRow>("SELECT * FROM users ORDER BY created_at")).map(row);}
export async function setUserDisabled(id:string,disabled:boolean){await dbRun("UPDATE users SET disabled = ? WHERE id = ?",[disabled,id]);}
export async function findByUsername(name:string){const r=await dbGet<UserRow>("SELECT * FROM users WHERE username = ?",[normUsername(name)]); return r?row(r):null;}
export async function getUser(id:string){const r=await dbGet<UserRow>("SELECT * FROM users WHERE id = ?",[id]); return r?row(r):null;}
export async function listUserIds(){return (await dbQuery<{id:string}>("SELECT id FROM users")).map(r=>r.id);}
export async function deleteUser(id:string){await dbRun("DELETE FROM users WHERE id = ?",[id]);}
export async function touchUser(id:string,at:number){await dbRun("UPDATE users SET last_seen = ? WHERE id = ?",[at,id]);}
export async function createUser(username:string,password:string,inviteCode?:string):Promise<User>{const u={id:crypto.randomUUID(),username:normUsername(username),passwordHash:hashPassword(password),createdAt:Date.now(),lastSeen:null,disabled:false};try{await dbRun("INSERT INTO users (id,username,password_hash,created_at,invite_code,disabled) VALUES (?,?,?,?,?,?)",[u.id,u.username,u.passwordHash,u.createdAt,inviteCode??null,false]);}catch(e){if(/unique|duplicate/i.test(String((e as any)?.message||e)))throw new Error("username_taken");throw e;}return u;}
