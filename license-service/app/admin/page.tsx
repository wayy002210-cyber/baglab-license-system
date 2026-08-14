"use client";
import { useEffect, useState } from "react";
import { clearAdminCsrf, readAdminCsrf, saveAdminCsrf } from "../../src/admin/client-session";

type Dashboard = { codes: Array<Record<string, string>>; licenses: Array<Record<string, string>>; events: Array<Record<string, string>> };
const plans = [["day1","1天卡"],["day3","3天卡"],["day7","7天卡"],["month","月卡"],["year","年卡"],["permanent","永久卡"]];

export default function AdminPage() {
  const [password,setPassword]=useState(""); const [csrf,setCsrf]=useState(""); const [data,setData]=useState<Dashboard>();
  const [plan,setPlan]=useState("day1"); const [count,setCount]=useState(1); const [codes,setCodes]=useState<string[]>([]); const [message,setMessage]=useState("");
  function expireSession(reason:string){clearAdminCsrf(window.sessionStorage);setCsrf("");setData(undefined);setCodes([]);setMessage(reason)}
  async function load(){const response=await fetch("/api/admin/dashboard",{cache:"no-store"});if(response.ok)setData((await response.json()).data);else expireSession("管理员会话已过期，请重新登录")}
  useEffect(()=>{const saved=readAdminCsrf(window.sessionStorage);if(saved){setCsrf(saved);void load()}},[]);
  async function login(){const response=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});const body=await response.json();if(response.ok){const token=body.data.csrfToken;saveAdminCsrf(window.sessionStorage,token);setCsrf(token);setMessage("已登录");void load()}else setMessage(body.error.message)}
  async function generate(){const response=await fetch("/api/admin/codes",{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":csrf},body:JSON.stringify({plan,count,note:""})});const body=await response.json();if(response.ok){setCodes(body.data.codes);setMessage("明文仅在本页显示一次，请立即复制或导出。");void load()}else if(response.status===403)expireSession("安全校验已失效，请重新登录");else setMessage(body.error.message)}
  async function mutate(licenseId:string,action:string){const hours=action==="extend"?Number(prompt("延长小时数","24")):undefined;const note=prompt("备注","")??"";const response=await fetch("/api/admin/licenses",{method:"PATCH",headers:{"Content-Type":"application/json","X-CSRF-Token":csrf},body:JSON.stringify({licenseId,action,hours,note})});if(response.status===403){expireSession("安全校验已失效，请重新登录");return}void load()}
  function exportCodes(){const blob=new Blob([codes.join("\r\n")],{type:"text/plain;charset=utf-8"});const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`activation-codes-${Date.now()}.txt`;link.click();URL.revokeObjectURL(link.href)}
  return <main className="admin"><header><div><small>BAG LAB</small><h1>授权管理台</h1></div><p>{message}</p></header>
    {!data&&<section className="card login"><h2>管理员登录</h2><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="管理员密码"/><button onClick={login}>登录</button></section>}
    {data&&<><section className="card generator"><h2>生成激活码</h2><select value={plan} onChange={e=>setPlan(e.target.value)}>{plans.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><input type="number" min="1" max="500" value={count} onChange={e=>setCount(Number(e.target.value))}/><button onClick={generate}>生成</button>{codes.length>0&&<div className="codes"><pre>{codes.join("\n")}</pre><button onClick={()=>navigator.clipboard.writeText(codes.join("\n"))}>复制</button><button onClick={exportCodes}>导出</button></div>}</section>
    <section className="card"><h2>授权</h2><div className="table"><table><thead><tr><th>ID</th><th>卡种</th><th>状态</th><th>设备</th><th>到期</th><th>操作</th></tr></thead><tbody>{data.licenses.map(row=><tr key={row.id}><td>{row.id}</td><td>{row.plan}</td><td>{row.status}</td><td>{row.short_code??"-"}</td><td>{row.expires_at??"永久"}</td><td>{["disable","restore","extend","unbind"].map(action=><button className="minor" key={action} onClick={()=>mutate(row.id,action)}>{action}</button>)}</td></tr>)}</tbody></table></div></section>
    <section className="card"><h2>激活码</h2><div className="table"><table><thead><tr><th>末尾</th><th>卡种</th><th>状态</th><th>备注</th></tr></thead><tbody>{data.codes.map(row=><tr key={row.id}><td>****{row.code_suffix}</td><td>{row.plan}</td><td>{row.status}</td><td>{row.note}</td></tr>)}</tbody></table></div></section>
    <section className="card"><h2>审计日志</h2><div className="events">{data.events.map(row=><p key={row.id}><b>{row.event_type}</b> {row.license_id??""} <time>{row.created_at}</time></p>)}</div></section></>}</main>;
}
