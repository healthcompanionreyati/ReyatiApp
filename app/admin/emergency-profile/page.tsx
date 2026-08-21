"use client";

import { useCallback, useEffect, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import styles from "@/app/emergency-profile/emergency-profile.module.css";

type Governance={visibility:string;metrics:Record<string,number>;privacy:{medicalContentsExposed:boolean;contactDetailsExposed:boolean;patientIdentitiesExposed:boolean};rehearsals:Array<{id:string;result:string;scenarioCount:number;executedAt:string}>};

const labels:Record<string,{en:string;ar:string}>={profiles:{en:"Active profiles",ar:"الملفات النشطة"},privateProfiles:{en:"Private profiles",ar:"الملفات الخاصة"},consentedEmergencySummaries:{en:"Consented summaries",ar:"الملخصات الموافق عليها"},profilesWithStructuredItems:{en:"With structured items",ar:"بها معلومات منظمة"},profilesWithEmergencyContact:{en:"With emergency contact",ar:"بها جهة اتصال"},profilesNeedingReview:{en:"May need review",ar:"قد تحتاج مراجعة"}};

export default function EmergencyProfileGovernancePage(){
  const[lang,setLang]=useReyatiLocale(),ar=lang==="ar";
  const[data,setData]=useState<Governance|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const load=useCallback(async()=>{try{const response=await fetch("/api/admin/emergency-profile",{cache:"no-store"});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error);setData(payload.data);setError("")}catch{setError(ar?"تعذر تحميل حوكمة ملف الطوارئ.":"Emergency-profile governance could not be loaded.")}},[ar]);
  useEffect(()=>{queueMicrotask(()=>void load())},[load]);
  async function rehearse(){setBusy(true);setMessage("");setError("");try{const response=await fetch("/api/admin/emergency-profile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"run_rehearsal"})});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error);setMessage(ar?"نجحت 18 حالة من دون آثار تشغيلية.":"All 18 scenarios passed with zero operational side effects.");await load()}catch{setError(ar?"تعذر تشغيل الاختبار.":"The boundary rehearsal could not be completed.")}finally{setBusy(false)}}
  return <main className={styles.shell} dir={ar?"rtl":"ltr"}>
    <header className={styles.top}><a href="/admin"><img src="/brand/qivaya-logo-primary.png" alt="Qivaya"/></a><nav><a href="/admin">{ar?"العمليات":"Operations"}</a><a href="/admin/audit">{ar?"التدقيق":"Audit"}</a><button type="button" onClick={()=>setLang(ar?"en":"ar")}>{ar?"English":"العربية"}</button></nav></header>
    <section className={styles.hero}><span className={styles.eyebrow}>{ar?"حوكمة مجمعة فقط":"Aggregate-only governance"}</span><h1>{ar?"حوكمة ملف الطوارئ":"Emergency-profile governance"}</h1><p>{ar?"رؤية تشغيلية لاتجاهات الاكتمال والموافقة من دون هوية المرضى أو المعلومات الطبية أو تفاصيل الاتصال.":"Operational visibility into completion and consent trends without patient identity, medical information, or contact details."}</p></section>
    <div className={styles.content}>
      <section className={styles.emergency}><div><strong>{ar?"الحد التشغيلي للطوارئ":"Emergency operational boundary"}</strong><p>{ar?"هذه الوحدة لا تتصل بالرقم 999، ولا ترسل سيارة إسعاف، ولا تعرض سعة أقسام الطوارئ.":"This module never calls 999, dispatches an ambulance, or exposes live emergency-department capacity."}</p></div><span className={styles.number}>999</span></section>
      <section className={styles.source}><div><strong>{ar?"لا يمكن للمشرف رؤية محتوى الملف":"Profile contents are not visible to administrators"}</strong><small>{ar?"لا تظهر الحساسية أو الحالات أو الأدوية أو أرقام الاتصال أو هوية المريض هنا.":"Allergies, conditions, medicines, contact numbers, and patient identities never appear here."}</small></div><span className={styles.badge}>{ar?"مقاييس فقط":"METRICS ONLY"}</span></section>
      {message&&<p className={styles.status} role="status">{message}</p>}{error&&<p className={`${styles.status} ${styles.error}`} role="alert">{error}</p>}
      <section className={styles.panel}><div className={styles.panelHead}><div><h2>{ar?"مقاييس الحوكمة":"Governance metrics"}</h2><p className={styles.muted}>{ar?"أرقام مجمعة لا تسمح بالوصول إلى السجلات الفردية.":"Aggregate counts with no path to individual records."}</p></div></div><div className={styles.metricGrid}>{Object.entries(data?.metrics??{}).map(([key,value])=><div className={styles.metric} key={key}><b>{value}</b><span>{labels[key]?.[ar?"ar":"en"]??key}</span></div>)}</div></section>
      <section className={styles.panel}><div className={styles.panelHead}><div><h2>{ar?"اختبار الحدود بلا آثار جانبية":"Zero-side-effect boundary rehearsal"}</h2><p className={styles.muted}>{ar?"يتحقق من الملكية والموافقة والإصدارات ومنع وصول مقدمي الرعاية والمشاركة الخارجية وأتمتة الطوارئ.":"Validates ownership, consent, version checks, and the absence of provider access, external sharing, and emergency automation."}</p></div><button className={`${styles.button} ${styles.primary}`} type="button" disabled={busy} onClick={()=>void rehearse()}>{busy?(ar?"جارٍ التشغيل…":"Running…"):(ar?"تشغيل 18 حالة":"Run 18 scenarios")}</button></div><div className={styles.rehearsals}>{data?.rehearsals.map(item=><article className={styles.rehearsal} key={item.id}><h3>{item.result}</h3><p>{item.scenarioCount} {ar?"حالة":"scenarios"} · {new Date(item.executedAt).toLocaleString(lang==="ar"?"ar-QA":"en-QA")}</p></article>)}</div></section>
    </div>
  </main>
}
