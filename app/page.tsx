"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type User={displayName:string;email:string;status:string};
type Appointment={id:string;providerName:string;specialty:string;facilityName:string|null;scheduledStart:string;scheduledEnd:string;mode:string;status:string};

function initials(value:string){return value.split(/\s+|@/).filter(Boolean).slice(0,2).map((part)=>part[0]).join("").toUpperCase()||"RY";}
function formatVisit(value:string){return new Intl.DateTimeFormat("en-QA",{timeZone:"Asia/Qatar",dateStyle:"full",timeStyle:"short"}).format(new Date(value));}

export default function Home(){
  const [user,setUser]=useState<User|null>(null);const [appointments,setAppointments]=useState<Appointment[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState("");const [referenceTime]=useState(()=>Date.now());
  const loadWorkspace=useCallback(async(signal?:AbortSignal)=>{
    setLoading(true);setError("");
    try{
      const [identityResponse,appointmentResponse]=await Promise.all([fetch("/api/me",{cache:"no-store",signal}),fetch("/api/appointments",{cache:"no-store",signal})]);
      if(identityResponse.status===401||appointmentResponse.status===401){window.location.assign(`/signin-with-chatgpt?return_to=${encodeURIComponent("/")}`);return;}
      const identity=await identityResponse.json().catch(()=>({})) as {user?:User;error?:string};const schedule=await appointmentResponse.json().catch(()=>({})) as {appointments?:Appointment[];error?:string};
      if(!identityResponse.ok)throw new Error(identity.error||"Your Reyati identity is temporarily unavailable");if(!appointmentResponse.ok)throw new Error(schedule.error||"Appointments are temporarily unavailable");
      setUser(identity.user||null);setAppointments(schedule.appointments||[]);
    }catch(caught){
      if(caught instanceof DOMException&&caught.name==="AbortError")return;
      setError(caught instanceof Error?caught.message:"Reyati is temporarily unavailable");
    }finally{if(!signal?.aborted)setLoading(false);}
  },[]);
  useEffect(()=>{const controller=new AbortController();queueMicrotask(()=>{if(!controller.signal.aborted)void loadWorkspace(controller.signal);});return()=>controller.abort();},[loadWorkspace]);
  const nextAppointment=useMemo(()=>appointments.filter((item)=>["pending","confirmed"].includes(item.status)&&new Date(item.scheduledEnd).valueOf()>referenceTime).sort((a,b)=>new Date(a.scheduledStart).valueOf()-new Date(b.scheduledStart).valueOf())[0]||null,[appointments,referenceTime]);
  const displayName=user?.displayName||"Reyati member";
  return <main id="main-content">
    <header><a className="brand" href="/" aria-label="Reyati home"><img src="/brand/reyati-logo.svg" alt="Reyati"/></a><nav><a className="active" href="/">Home</a><a href="/providers">Find care</a><a href="/appointments">Appointments</a><a href="/wallet">Health records</a><a href="/family">Family access</a><a href="/support">Support</a></nav><div className="header-actions"><a className="bell" href="/notifications" aria-label="Notifications"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></a><a className="account-trigger" href="/auth" aria-label="Open secure account"><span className="avatar">{initials(displayName)}</span><span className="profile">Account</span></a></div></header>
    <section className="hero"><div className="hero-inner"><p className="eyebrow">CARE, INTELLIGENTLY CONNECTED</p><h1>{loading?"Welcome to Reyati":`Welcome, ${displayName}`}</h1><p className="lead">Manage real appointments, finalized visit information, scoped family access, and support from one secure account.</p><div className="home-hero-actions"><a className="search-button" href="/providers">Find verified care</a><a href="/appointments">View appointments</a></div><p className="emergency"><span>＋</span>For a life-threatening emergency in Qatar, call 999.</p></div><div className="hero-art" aria-hidden="true"><img src="/brand/care-conversation.webp" alt="" width="960" height="640" decoding="async" fetchPriority="high"/><span className="weave-path weave-cyan"/><span className="weave-path weave-white"/></div></section>
    <section className="content home-live-content">
      {error&&<div className="family-live-alert error"><span>{error}</span><button type="button" onClick={()=>void loadWorkspace()}>Try again</button></div>}
      <div className="section-heading"><div><h2>Your care workspace</h2><p>Every destination below uses authenticated, account-owned data.</p></div></div>
      <div className="categories home-live-actions"><a href="/providers"><span>⌕</span><b>Find care</b><small>Verified providers and published availability</small></a><a href="/appointments"><span>◎</span><b>Appointments</b><small>Book, review, or safely cancel visits</small></a><a href="/wallet"><span>▤</span><b>Health records</b><small>Finalized patient-visible visit information</small></a><a href="/payments"><span>Q</span><b>Payments</b><small>Account-owned payment ledger status</small></a><a href="/family"><span>♧</span><b>Family access</b><small>Explicit, revocable delegated permissions</small></a><a href="/support"><span>◇</span><b>Support</b><small>Create and track durable support requests</small></a></div>
      <div className="section-heading providers-heading"><div><h2>Next appointment</h2><p>Loaded from your signed-in patient account.</p></div><a href="/appointments">All appointments →</a></div>
      {loading?<div className="appointment-live-state"><span>◇</span><h2>Loading your care workspace…</h2></div>:error?<div className="appointment-live-state error"><span>!</span><h2>Appointment status unavailable</h2><p>Reyati could not confirm your latest schedule. Try again before relying on this section.</p></div>:nextAppointment?<section className="next-appt"><div className="date-block"><b>{new Date(nextAppointment.scheduledStart).toLocaleDateString("en-QA",{day:"2-digit"})}</b><span>{new Date(nextAppointment.scheduledStart).toLocaleDateString("en-QA",{month:"short"}).toUpperCase()}</span></div><div><p>{nextAppointment.status.replaceAll("_"," ")}</p><h3>{nextAppointment.providerName}</h3><span>{formatVisit(nextAppointment.scheduledStart)} · {nextAppointment.mode.replaceAll("_"," ")}</span></div><div className="appt-location"><span>⌖</span><div><b>{nextAppointment.facilityName||"Video consultation"}</b><small>{nextAppointment.specialty}</small></div></div><a href="/appointments">View details</a></section>:<div className="home-empty-appointment"><span>◎</span><div><h3>No upcoming appointment</h3><p>Choose a verified provider and a currently published time whenever you are ready.</p></div><a href="/providers">Find care</a></div>}
      <section className="wallet-notice home-trust-note"><span>i</span><p><b>No information is invented on this page.</b> Empty states remain empty until activity is created through the secure Reyati workflows.</p></section>
    </section>
    <footer><img src="/brand/reyati-logo.svg" alt="Reyati"/><p>Care, intelligently connected.</p><a href="/auth">Secure account</a><small>Authenticated patient workspace</small></footer>
  </main>;
}
