"use client";

import { useMemo, useState } from "react";

type Range = "7" | "30" | "90";
const metrics = [
  {icon:"◇",value:"184",label:"Bookings",labelAr:"الحجوزات",change:"+12.4%",tone:"up"},
  {icon:"◫",value:"78%",label:"Capacity used",labelAr:"السعة المستخدمة",change:"+4.1%",tone:"up"},
  {icon:"◷",value:"11 min",label:"Median wait",labelAr:"متوسط الانتظار",change:"−3 min",tone:"up"},
  {icon:"×",value:"6.2%",label:"Cancellation rate",labelAr:"نسبة الإلغاء",change:"−1.3%",tone:"up"},
];
const serviceRows = [
  {name:"Family medicine consultation",nameAr:"استشارة طب الأسرة",bookings:86,conversion:72,utilization:84,trend:14},
  {name:"Chronic care follow-up",nameAr:"متابعة الرعاية المزمنة",bookings:58,conversion:68,utilization:79,trend:9},
  {name:"Annual health review",nameAr:"مراجعة صحية سنوية",bookings:31,conversion:54,utilization:65,trend:-2},
  {name:"Video follow-up",nameAr:"متابعة عبر الفيديو",bookings:9,conversion:47,utilization:41,trend:6},
];
const demand = [
  {day:"Sun",dayAr:"الأحد",values:[22,48,72,64,38]},
  {day:"Mon",dayAr:"الاثنين",values:[34,63,91,70,45]},
  {day:"Tue",dayAr:"الثلاثاء",values:[28,58,82,76,51]},
  {day:"Wed",dayAr:"الأربعاء",values:[31,69,88,67,42]},
  {day:"Thu",dayAr:"الخميس",values:[44,78,66,43,20]},
];

export default function ProviderInsights(){
  const [lang,setLang]=useState<"en"|"ar">("en");
  const [range,setRange]=useState<Range>("30");
  const [location,setLocation]=useState("all");
  const [notice,setNotice]=useState("");
  const ar=lang==="ar";
  const scale=range==="7"?.3:range==="90"?2.7:1;
  const bookingTotal=useMemo(()=>Math.round(184*scale),[scale]);
  const exportReport=()=>{setNotice(ar?"تم إعداد تقرير إجمالي تجريبي":"Aggregate prototype report prepared");window.setTimeout(()=>setNotice(""),2600)};
  return <main className={`insights-shell ${ar?"arabic":""}`} dir={ar?"rtl":"ltr"}>
    <aside className="insights-sidebar">
      <a href="/" className="provider-logo"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati"/><span>{ar?"بوابة مقدم الرعاية":"Provider console"}</span></a>
      <div className="insights-facility"><span>AN</span><div><b>{ar?"مركز النور الطبي":"Al Noor Medical Center"}</b><small>{ar?"فرع الوعب":"Al Waab location"}</small></div></div>
      <nav><a href="/provider"><span>◫</span>{ar?"اليوم":"Today"}</a><a href="/provider"><span>□</span>{ar?"التقويم":"Calendar"}</a><a href="/provider/patients"><span>♙</span>{ar?"المرضى":"Patients"}</a><a href="/provider/services"><span>◇</span>{ar?"الخدمات":"Services"}</a><a className="active" href="/provider/insights"><span>↗</span>{ar?"التقارير":"Insights"}</a></nav>
      <div className="insights-side-bottom"><a href="/journeys">◇ {ar?"جميع المسارات":"All journeys"}</a><a href="/provider">← {ar?"لوحة مقدم الرعاية":"Provider dashboard"}</a><p>{ar?"بيانات اصطناعية · إجماليات محمية":"Synthetic data · Protected aggregates"}</p></div>
    </aside>
    <section className="insights-main">
      <header className="insights-top"><div><span>⌖</span><div><b>{ar?"مركز النور الطبي · الوعب":"Al Noor Medical Center · Al Waab"}</b><small>{ar?"وصول تحليلي · مدير المنشأة":"Analytics access · facility manager"}</small></div></div><div><button onClick={()=>setLang(ar?"en":"ar")}>{ar?"English":"العربية"}</button><a href="/notifications">●</a><span>LK</span></div></header>
      <div className="insights-workspace">
        <div className="insights-heading"><div><p>{ar?"الأداء التشغيلي":"OPERATIONAL PERFORMANCE"}</p><h1>{ar?"التقارير والرؤى":"Insights & analytics"}</h1><span>{ar?"افهم الطلب والسعة وتجربة الحجز دون كشف بيانات المرضى.":"Understand demand, capacity, and booking experience without exposing patient data."}</span></div><button onClick={exportReport}>⇩ {ar?"تصدير التقرير":"Export report"}</button></div>
        <div className="privacy-banner"><span>♙</span><p><b>{ar?"رؤى إجمالية تحافظ على الخصوصية":"Privacy-safe aggregate insights"}</b>{ar?"لا تعرض هذه المساحة سجلات المرضى أو الحالات السريرية. تُخفى الشرائح التي تقل عن 10 حجوزات.":"No patient records or clinical conditions appear here. Segments with fewer than 10 bookings are suppressed."}</p><i>{ar?"الحد الأدنى 10":"MINIMUM 10"}</i></div>
        <div className="insights-controls"><div>{(["7","30","90"] as Range[]).map(r=><button key={r} className={range===r?"active":""} onClick={()=>setRange(r)}>{r} {ar?"يوم":"days"}</button>)}</div><label><span>⌖</span><select value={location} onChange={e=>setLocation(e.target.value)}><option value="all">{ar?"كل المواقع":"All locations"}</option><option value="waab">{ar?"الوعب":"Al Waab"}</option></select></label><small>{ar?"تم التحديث منذ 8 دقائق":"Updated 8 min ago"}</small></div>
        <section className="insights-metrics">{metrics.map((m,i)=><article key={m.label}><div><span>{m.icon}</span><i>{m.change}</i></div><b>{i===0?bookingTotal:m.value}</b><p>{ar?m.labelAr:m.label}</p><small>{ar?"مقارنة بالفترة السابقة":"vs previous period"}</small></article>)}</section>
        <section className="insights-grid">
          <article className="booking-chart"><div className="panel-title"><div><h2>{ar?"اتجاه الحجوزات":"Booking trend"}</h2><p>{ar?"الحجوزات المكتملة والجديدة حسب الأسبوع":"Completed and new bookings by week"}</p></div><span><i/> {ar?"الحجوزات":"Bookings"}</span></div><div className="chart-area"><div className="chart-y"><span>60</span><span>40</span><span>20</span><span>0</span></div><div className="bars">{[31,42,37,49,45,58,52,61].map((v,i)=><div key={i}><i style={{height:`${v*1.7}px`}}/><span>{ar?`أ${i+1}`:`W${i+1}`}</span></div>)}</div></div><div className="chart-summary"><span>{ar?"أعلى أسبوع":"Peak week"}<b>61</b></span><span>{ar?"تحويل البحث للحجز":"Search-to-book"}<b>64%</b></span><span>{ar?"مرضى جدد":"New patients"}<b>38%</b></span></div></article>
          <article className="capacity-card"><div className="panel-title"><div><h2>{ar?"السعة هذا الأسبوع":"This week’s capacity"}</h2><p>{ar?"المواعيد المتاحة مقابل المحجوزة":"Available versus booked slots"}</p></div></div><div className="capacity-ring"><div><b>78%</b><span>{ar?"مستخدم":"used"}</span></div></div><div className="capacity-legend"><span><i className="booked"/>{ar?"محجوز":"Booked"}<b>142</b></span><span><i className="open"/>{ar?"متاح":"Open"}<b>40</b></span></div><div className="capacity-note"><span>↗</span><p><b>{ar?"فرصة سعة":"Capacity opportunity"}</b>{ar?"أضف 4 فترات صباحية يوم الاثنين لتلبية الطلب.":"Add 4 Monday morning slots to meet demand."}</p></div></article>
          <article className="demand-card"><div className="panel-title"><div><h2>{ar?"متى يبحث المرضى":"When patients are looking"}</h2><p>{ar?"كثافة الطلب حسب اليوم والوقت":"Demand intensity by day and time"}</p></div></div><div className="heatmap"><div className="heat-times"><span/><span>8–10</span><span>10–12</span><span>12–2</span><span>2–4</span><span>4–6</span></div>{demand.map(d=><div className="heat-row" key={d.day}><b>{ar?d.dayAr:d.day}</b>{d.values.map((v,i)=><i key={i} style={{opacity:.14+v/120}} title={`${v}% demand`}/>)}</div>)}</div><div className="heat-key"><span>{ar?"طلب أقل":"Lower demand"}</span><i/><i/><i/><i/><span>{ar?"طلب أعلى":"Higher demand"}</span></div></article>
          <article className="source-card"><div className="panel-title"><div><h2>{ar?"كيف يجدك المرضى":"How patients find you"}</h2><p>{ar?"مصادر الحجوزات المؤكدة":"Sources of confirmed bookings"}</p></div></div>{[["Reyati search","بحث رعايتي",46],["Returning patients","مرضى عائدون",28],["Direct link","رابط مباشر",17],["Partner benefit","ميزة الشريك",9]].map(x=><div className="source-row" key={String(x[0])}><span>{ar?x[1]:x[0]}</span><p><i style={{width:`${Number(x[2])*2}%`}}/></p><b>{x[2]}%</b></div>)}</article>
        </section>
        <section className="service-performance"><div className="panel-title"><div><h2>{ar?"أداء الخدمات":"Service performance"}</h2><p>{ar?"مقارنة الطلب والتحويل واستخدام السعة":"Compare demand, conversion, and capacity use"}</p></div><a href="/provider/services">{ar?"إدارة الخدمات":"Manage services"} →</a></div><div className="performance-table"><div className="performance-head"><span>{ar?"الخدمة":"Service"}</span><span>{ar?"الحجوزات":"Bookings"}</span><span>{ar?"التحويل":"Conversion"}</span><span>{ar?"استخدام السعة":"Capacity use"}</span><span>{ar?"الاتجاه":"Trend"}</span></div>{serviceRows.map(row=><div className="performance-row" key={row.name}><div><span>◇</span><b>{ar?row.nameAr:row.name}</b></div><strong>{Math.round(row.bookings*scale)}</strong><span>{row.conversion}%</span><p><i style={{width:`${row.utilization}%`}}/></p><em className={row.trend>=0?"positive":"negative"}>{row.trend>=0?"+":""}{row.trend}%</em></div>)}</div></section>
        <footer className="insights-foot"><span>ⓘ</span><p>{ar?"البيانات المعروضة اصطناعية لأغراض التخطيط. لا تستخدم لاتخاذ قرارات سريرية أو مالية.":"Displayed data is synthetic for planning. Do not use it for clinical or financial decisions."}</p><a href="/support">{ar?"حول حوكمة البيانات":"About data governance"}</a></footer>
      </div>
    </section>
    {notice&&<div className="insights-toast"><span>✓</span>{notice}</div>}
  </main>
}
