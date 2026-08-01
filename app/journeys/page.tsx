"use client";

import { useState } from "react";

type Group="all"|"patient"|"provider"|"partner"|"operations";
const journeys=[
  {group:"patient",href:"/",icon:"⌂",title:"Patient home",titleAr:"الرئيسية للمريض",text:"Discover care and start a booking",textAr:"اكتشف الرعاية وابدأ الحجز",status:"Core"},
  {group:"patient",href:"/providers",icon:"⌕",title:"Provider discovery",titleAr:"اكتشاف مقدمي الرعاية",text:"Search, compare, verify, and book",textAr:"ابحث وقارن وتحقق واحجز",status:"Core"},
  {group:"patient",href:"/appointments",icon:"◎",title:"Appointments",titleAr:"المواعيد",text:"Manage visits, changes, and reviews",textAr:"إدارة الزيارات والتغييرات والتقييمات",status:"Core"},
  {group:"patient",href:"/wallet",icon:"▤",title:"Health wallet",titleAr:"المحفظة الصحية",text:"Documents, provenance, and sharing",textAr:"المستندات والمصدر والمشاركة",status:"Core"},
  {group:"patient",href:"/family",icon:"♡",title:"Family profiles",titleAr:"ملفات العائلة",text:"Dependants, guardianship, and consent",textAr:"المعالون والوصاية والموافقة",status:"Extended"},
  {group:"patient",href:"/payments",icon:"Q",title:"Payments",titleAr:"المدفوعات",text:"Checkout, receipts, and refunds",textAr:"الدفع والإيصالات والاستردادات",status:"Core"},
  {group:"patient",href:"/notifications",icon:"●",title:"Notifications",titleAr:"الإشعارات",text:"Privacy-safe updates and preferences",textAr:"تحديثات آمنة وتفضيلات التواصل",status:"Shared"},
  {group:"patient",href:"/support",icon:"?",title:"Support & safety",titleAr:"الدعم والسلامة",text:"Cases, privacy, complaints, and help",textAr:"الحالات والخصوصية والشكاوى والمساعدة",status:"Shared"},
  {group:"provider",href:"/provider",icon:"✚",title:"Provider console",titleAr:"بوابة مقدم الرعاية",text:"Schedule, patients, and verification",textAr:"الجدول والمرضى والتحقق",status:"Core"},
  {group:"provider",href:"/provider/patients",icon:"♙",title:"Patient workspace",titleAr:"مساحة المرضى",text:"Consent-scoped directory and shared context",textAr:"دليل محدد بالموافقة وسياق مشترك",status:"Core"},
  {group:"provider",href:"/provider/services",icon:"◇",title:"Services & availability",titleAr:"الخدمات والتوفر",text:"Pricing, booking rules, locations, and publishing",textAr:"الأسعار وقواعد الحجز والمواقع والنشر",status:"Core"},
  {group:"provider",href:"/provider/insights",icon:"↗",title:"Provider insights",titleAr:"تقارير مقدم الرعاية",text:"Aggregate demand, capacity, and service performance",textAr:"الطلب المجمع والسعة وأداء الخدمات",status:"Core"},
  {group:"provider",href:"/provider/settings",icon:"⚙",title:"Settings & team",titleAr:"الإعدادات والفريق",text:"Roles, permissions, organization, and audit trail",textAr:"الأدوار والصلاحيات والمنشأة وسجل التدقيق",status:"Core"},
  {group:"provider",href:"/provider/encounter",icon:"◇",title:"Encounter workspace",titleAr:"مساحة الزيارة",text:"Clinical notes, summaries, and audit",textAr:"الملاحظات والملخصات والتدقيق",status:"Core"},
  {group:"partner",href:"/partner",icon:"◫",title:"Partner benefits",titleAr:"مزايا الشركاء",text:"Eligibility, funding, and invoices",textAr:"الأهلية والتمويل والفواتير",status:"Core"},
  {group:"partner",href:"/partner/program",icon:"⚙",title:"Benefits programme",titleAr:"برنامج المزايا",text:"Plans, eligibility rules, enrollment, and privacy controls",textAr:"الخطط وقواعد الأهلية والتسجيل وضوابط الخصوصية",status:"Core"},
  {group:"operations",href:"/admin",icon:"♙",title:"Platform operations",titleAr:"عمليات المنصة",text:"Verification, finance, cases, and audit",textAr:"التحقق والمالية والحالات والتدقيق",status:"Restricted"},
  {group:"operations",href:"/admin/verification",icon:"▣",title:"Provider verification",titleAr:"التحقق من مقدمي الرعاية",text:"Evidence review, compliance decisions, and expiry monitoring",textAr:"مراجعة الأدلة وقرارات الامتثال ومراقبة الانتهاء",status:"Restricted"},
  {group:"all",href:"/auth",icon:"✓",title:"Sign-in & onboarding",titleAr:"الدخول والتهيئة",text:"Role-aware access and consent setup",textAr:"وصول حسب الدور وإعداد الموافقة",status:"Shared"},
];

export default function Journeys(){
  const [lang,setLang]=useState<"en"|"ar">("en");const [group,setGroup]=useState<Group>("all");const ar=lang==="ar";
  const shown=journeys.filter(j=>group==="all"||j.group===group||j.group==="all");
  return <main className={`journey-shell ${ar?"arabic":""}`} dir={ar?"rtl":"ltr"}>
    <header className="journey-header"><a href="/"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati"/></a><div><span>{ar?"نظام رعايتي المتصل":"Connected Reyati system"}</span><button onClick={()=>setLang(ar?"en":"ar")}>{ar?"English":"العربية"}</button></div></header>
    <section className="journey-hero"><div><p>{ar?"نموذج المنتج المتكامل":"CONNECTED PRODUCT PROTOTYPE"}</p><h1>{ar?"كل رحلة. منتج واحد.":"Every journey. One product."}</h1><span>{ar?"استكشف كيف تتصل تجربة المريض ومقدم الرعاية والشريك والعمليات حول الثقة والموافقة والوضوح.":"Explore how patient, provider, partner, and operations experiences connect around trust, consent, and clarity."}</span></div><aside><b>19</b><p>{ar?"رحلة تفاعلية":"interactive journeys"}</p><i><span/></i><small>{ar?"تغطية النموذج الأولي":"Prototype coverage"} · 99%</small></aside></section>
    <section className="journey-workspace"><div className="journey-intro"><div><h2>{ar?"اختر مساحة عمل":"Choose a workspace"}</h2><p>{ar?"كل البيانات اصطناعية، وجميع الإجراءات محاكاة آمنة.":"All data is synthetic and every action is safely simulated."}</p></div><div className="journey-filters">{(["all","patient","provider","partner","operations"] as Group[]).map(g=><button className={group===g?"active":""} onClick={()=>setGroup(g)} key={g}>{g==="all"?(ar?"الكل":"All"):g==="patient"?(ar?"المريض":"Patient"):g==="provider"?(ar?"مقدم الرعاية":"Provider"):g==="partner"?(ar?"الشريك":"Partner"):(ar?"العمليات":"Operations")}</button>)}</div></div><div className="journey-grid">{shown.map(j=><a href={j.href} className={`journey-card ${j.group}`} key={j.href}><div className="journey-card-top"><span>{j.icon}</span><i>{j.status}</i></div><p>{j.group.toUpperCase()}</p><h2>{ar?j.titleAr:j.title}</h2><small>{ar?j.textAr:j.text}</small><div><b>{ar?"فتح المساحة":"Open workspace"}</b><span>→</span></div></a>)}</div>
      <section className="journey-foundations"><div><p>{ar?"أسس مشتركة":"SHARED FOUNDATIONS"}</p><h2>{ar?"قواعد واحدة في كل رحلة":"One set of rules across every journey"}</h2></div>{[["♙",ar?"الخصوصية حسب التصميم":"Privacy by design",ar?"الحد الأدنى من البيانات والوصول المحدد":"Minimum data and scoped access"],["✓",ar?"الثقة القابلة للتحقق":"Verifiable trust",ar?"مصدر وحالة لكل معلومة مهمة":"Source and status for important facts"],["◎",ar?"الموافقة والتحكم":"Consent and control",ar?"اختيارات واضحة وقابلة للإلغاء":"Clear, revocable choices"],["◇",ar?"مساءلة كاملة":"Accountability",ar?"قرارات وأحداث قابلة للتدقيق":"Auditable decisions and events"]].map(x=><article key={x[1]}><span>{x[0]}</span><div><b>{x[1]}</b><small>{x[2]}</small></div></article>)}</section>
    </section>
    <footer className="journey-footer"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati"/><p>{ar?"نموذج تخطيطي ببيانات اصطناعية · ليس للاستخدام الطبي أو المالي":"Planning prototype with synthetic data · Not for medical or financial use"}</p><a href="/auth">{ar?"ابدأ من تسجيل الدخول":"Start at sign-in"} →</a></footer>
  </main>
}
