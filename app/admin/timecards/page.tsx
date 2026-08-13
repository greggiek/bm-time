'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import ManagerShell from '@/components/manager-shell';

type Punch = { id:string; employeeId:string; employeeNumber:string; employeeName:string; location:string; action:'clock_in'|'clock_out'; occurredAt:string };
type Summary = { employeeId:string; employeeNumber:string; employeeName:string; location:string; totalHours:number; incomplete:boolean };
type EmployeeOption = { id:string; employeeNumber:string; name:string };
type User = { name:string; role:'admin'|'manager'; locationName:string|null; allLocations:boolean };
type SummarySort = 'employee-asc'|'employee-desc'|'location-asc'|'hours-desc'|'hours-asc'|'incomplete';

function currentThursday(){const d=new Date();d.setDate(d.getDate()-((d.getDay()+3)%7));const p=(v:number)=>String(v).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`}
function addDays(value:string,days:number){const d=new Date(`${value}T12:00:00`);d.setDate(d.getDate()+days);const p=(v:number)=>String(v).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`}
function csvCell(value:string|number|boolean){return `"${String(value).replaceAll('"','""')}"`}
function toLocalInput(iso:string){const d=new Date(iso);const p=(v:number)=>String(v).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`}

export default function TimecardsPage(){
  const [pin,setPin]=useState('');
  const [user,setUser]=useState<User|null>(null);
  const [startDate,setStartDate]=useState(currentThursday());
  const [endDate,setEndDate]=useState(()=>addDays(currentThursday(),6));
  const [punches,setPunches]=useState<Punch[]>([]);
  const [summaries,setSummaries]=useState<Summary[]>([]);
  const [employees,setEmployees]=useState<EmployeeOption[]>([]);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [loading,setLoading]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [checking,setChecking]=useState(true);
  const [summarySort,setSummarySort]=useState<SummarySort>('employee-asc');
  const [employeeSearch,setEmployeeSearch]=useState('');
  const totalHours=useMemo(()=>summaries.reduce((sum,row)=>sum+row.totalHours,0),[summaries]);
  const sortedSummaries=useMemo(()=>[...summaries].sort((a,b)=>{
    if(summarySort==='employee-desc')return b.employeeName.localeCompare(a.employeeName);
    if(summarySort==='location-asc')return a.location.localeCompare(b.location)||a.employeeName.localeCompare(b.employeeName);
    if(summarySort==='hours-desc')return b.totalHours-a.totalHours||a.employeeName.localeCompare(b.employeeName);
    if(summarySort==='hours-asc')return a.totalHours-b.totalHours||a.employeeName.localeCompare(b.employeeName);
    if(summarySort==='incomplete')return Number(b.incomplete)-Number(a.incomplete)||a.employeeName.localeCompare(b.employeeName);
    return a.employeeName.localeCompare(b.employeeName);
  }),[summaries,summarySort]);
  const searchTerm=employeeSearch.trim().toLowerCase();
  const filteredSummaries=useMemo(()=>sortedSummaries.filter(row=>!searchTerm||row.employeeName.toLowerCase().includes(searchTerm)||row.employeeNumber.toLowerCase().includes(searchTerm)),[sortedSummaries,searchTerm]);
  const filteredPunches=useMemo(()=>punches.filter(row=>!searchTerm||row.employeeName.toLowerCase().includes(searchTerm)||row.employeeNumber.toLowerCase().includes(searchTerm)),[punches,searchTerm]);

  useEffect(()=>{fetch('/api/auth/session').then(async response=>{if(response.ok){const data=await response.json();setUser(data.user)}}).finally(()=>setChecking(false))},[]);

  async function signIn(){
    setLoading(true);setError('');
    try{
      const response=await fetch('/api/auth/pin-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pin})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.message||'Unable to sign in.');
      setUser(data.user);setPin('');
    }catch(err){setError(err instanceof Error?err.message:'Unable to sign in.')}finally{setLoading(false)}
  }

  async function request(body:Record<string,unknown>={}){
    const response=await fetch('/api/admin/timecards',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({startDate,endDate,...body})});
    const data=await response.json();
    if(response.status===401){setUser(null);throw new Error(data.message||'Please sign in again.');}
    if(!response.ok)throw new Error(data.message||'Unable to update timecards.');
    setPunches(data.punches||[]);setSummaries(data.summaries||[]);setEmployees(data.employees||[]);setUser(data.user||user);setLoaded(true);
  }

  async function loadWeek(){setLoading(true);setError('');setMessage('');try{await request()}catch(err){setError(err instanceof Error?err.message:'Unable to load timecards.')}finally{setLoading(false)}}
  async function updatePunch(punchId:string,occurredAt:string){setLoading(true);setError('');setMessage('');try{await request({action:'update_punch',punchId,occurredAt:new Date(occurredAt).toISOString()});setMessage('Punch updated.')}catch(err){setError(err instanceof Error?err.message:'Unable to update punch.')}finally{setLoading(false)}}
  async function deletePunch(punch:Punch){const when=new Date(punch.occurredAt).toLocaleString();if(!confirm(`Permanently delete ${punch.employeeName}'s ${punch.action==='clock_in'?'Clock In':'Clock Out'} punch from ${when}?`))return;setLoading(true);setError('');setMessage('');try{await request({action:'delete_punch',punchId:punch.id});setMessage('Punch permanently deleted.')}catch(err){setError(err instanceof Error?err.message:'Unable to delete punch.')}finally{setLoading(false)}}
  async function addPunch(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);setLoading(true);setError('');setMessage('');try{await request({action:'create_punch',employeeId:form.get('employeeId'),punchAction:form.get('punchAction'),occurredAt:new Date(String(form.get('occurredAt'))).toISOString()});setMessage('Manual punch added.')}catch(err){setError(err instanceof Error?err.message:'Unable to add punch.')}finally{setLoading(false)}}
  async function logout(){await fetch('/api/auth/logout',{method:'POST'});setUser(null);setLoaded(false);setPunches([]);setSummaries([]);setEmployees([])}

  function exportCsv(){
    const lines:any[][]=[['Timecard Summary'],['From',startDate],['Through',endDate],[],['Employee Number','Employee','Location','Total Hours','Incomplete Punch'],...filteredSummaries.map(r=>[r.employeeNumber,r.employeeName,r.location,r.totalHours.toFixed(2),r.incomplete?'Yes':'No']),[],['Punch Detail'],['Employee Number','Employee','Location','Action','Date','Time'],...filteredPunches.map(p=>{const d=new Date(p.occurredAt);return[p.employeeNumber,p.employeeName,p.location,p.action==='clock_in'?'Clock In':'Clock Out',d.toLocaleDateString(),d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})]})];
    const csv=lines.map(row=>row.map((cell:any)=>csvCell(cell??'')).join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`bm-time-${startDate}-to-${endDate}.csv`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
  }

  if(checking)return <main className="managerShell"><section className="managerCard loginBox">Loading management portal…</section></main>;
  if(!user)return <main className="managerShell"><section className="managerCard loginBox"><h1>Enter Manager PIN</h1><input type="password" inputMode="numeric" maxLength={4} pattern="\d{4}" placeholder="4-digit PIN" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,4))} onKeyDown={e=>e.key==='Enter'&&pin.length===4&&signIn()}/><button className="primary" disabled={pin.length!==4||loading} onClick={signIn}>{loading?'Signing in…':'Sign In'}</button>{error&&<div className="error">{error}</div>}</section></main>;

  return <ManagerShell brand="BM TIME" title="Weekly Timecards" user={user}>
    <section className="managerCard">
      <div className="loginBox" style={{margin:0,maxWidth:620}}><h1>Timecards</h1><div className="dateRange"><label>From<input type="date" value={startDate} max={endDate} onChange={e=>setStartDate(e.target.value)}/></label><label>Through<input type="date" value={endDate} min={startDate} onChange={e=>setEndDate(e.target.value)}/></label></div><button className="primary" onClick={loadWeek} disabled={!startDate||!endDate||endDate<startDate||loading}>{loading?'Loading…':'Load Date Range'}</button>{message&&<div style={{marginTop:12}}>{message}</div>}{error&&<div className="error">{error}</div>}</div>
      {loaded&&<div style={{marginTop:30,display:'grid',gap:24}}>
        <div className="summary"><div><strong>{summaries.length}</strong><span>Employees</span></div><div><strong>{totalHours.toFixed(2)}</strong><span>Total Hours</span></div><div><strong>{summaries.filter(r=>r.incomplete).length}</strong><span>Incomplete</span></div></div>
        <button className="primary" onClick={exportCsv} disabled={punches.length===0}>Download CSV</button>
        <section><h2>Add Missing Punch</h2><form onSubmit={addPunch} style={{display:'grid',gap:10,maxWidth:620}}><select name="employeeId" required defaultValue=""><option value="" disabled>Select employee</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name} (#{e.employeeNumber})</option>)}</select><select name="punchAction" required defaultValue="clock_in"><option value="clock_in">Clock In</option><option value="clock_out">Clock Out</option></select><input name="occurredAt" type="datetime-local" required/><button className="primary" disabled={loading}>{loading?'Saving…':'Add Punch'}</button></form></section>
        <section><div className="sectionHeading"><h2>Weekly Summary</h2><div className="timecardTools"><label className="employeeSearch"><span>Search employee</span><input type="search" placeholder="Name or employee number" value={employeeSearch} onChange={e=>setEmployeeSearch(e.target.value)} /></label><label className="summarySort">Sort by<select value={summarySort} onChange={e=>setSummarySort(e.target.value as SummarySort)}><option value="employee-asc">Employee A–Z</option><option value="employee-desc">Employee Z–A</option><option value="location-asc">Branch</option><option value="hours-desc">Hours: highest first</option><option value="hours-asc">Hours: lowest first</option><option value="incomplete">Incomplete punches first</option></select></label></div></div><div className="tableWrap"><table><thead><tr><th>Employee</th><th>Location</th><th>Hours</th><th>Status</th></tr></thead><tbody>{filteredSummaries.map(r=><tr key={r.employeeId}><td><strong>{r.employeeName}</strong><br/>#{r.employeeNumber}</td><td>{r.location}</td><td>{r.totalHours.toFixed(2)}</td><td>{r.incomplete?'Incomplete punch':'Complete'}</td></tr>)}{filteredSummaries.length===0&&<tr><td colSpan={4}>{searchTerm?'No employee matches your search.':'No punches found for this pay period.'}</td></tr>}</tbody></table></div></section>
        <section><h2>Punch Detail</h2><div className="tableWrap"><table><thead><tr><th>Employee</th><th>Action</th><th>Date & Time</th><th></th></tr></thead><tbody>{filteredPunches.map(p=><PunchRow key={p.id} punch={p} loading={loading} onSave={updatePunch} onDelete={deletePunch}/>)}{filteredPunches.length===0&&<tr><td colSpan={4}>{searchTerm?'No punches match this employee search.':'No punches found for this pay period.'}</td></tr>}</tbody></table></div></section>
      </div>}
    </section>
  </ManagerShell>
}

function PunchRow({punch,loading,onSave,onDelete}:{punch:Punch;loading:boolean;onSave:(id:string,occurredAt:string)=>void;onDelete:(punch:Punch)=>void}){const[value,setValue]=useState(toLocalInput(punch.occurredAt));return <tr><td><strong>{punch.employeeName}</strong><br/>#{punch.employeeNumber}</td><td>{punch.action==='clock_in'?'Clock In':'Clock Out'}</td><td><input type="datetime-local" value={value} onChange={e=>setValue(e.target.value)}/></td><td><button disabled={loading||!value} onClick={()=>onSave(punch.id,value)}>Save</button><button className="deletePunch" disabled={loading} onClick={()=>onDelete(punch)}>Delete</button></td></tr>}
