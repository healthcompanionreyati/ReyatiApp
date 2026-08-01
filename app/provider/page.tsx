"use client";

import { useState } from "react";

type View = "today" | "calendar" | "organization";
type AppointmentStatus = "confirmed" | "arrived" | "in_consultation" | "completed";
type Appointment = { id: number; time: string; duration: number; patient: string; initials: string; reason: string; mode: string; status: AppointmentStatus; alert?: string };

const initialAppointments: Appointment[] = [
  { id: 1, time: "09:00", duration: 30, patient: "Noora Al-Mansoori", initials: "NM", reason: "Diabetes follow-up", mode: "In-person", status: "confirmed" },
  { id: 2, time: "10:00", duration: 30, patient: "Yousef Hassan", initials: "YH", reason: "Persistent cough", mode: "In-person", status: "arrived", alert: "Shared document available" },
  { id: 3, time: "11:30", duration: 45, patient: "Aisha Rahman", initials: "AR", reason: "Annual health review", mode: "In-person", status: "confirmed" },
  { id: 4, time: "13:30", duration: 30, patient: "Khalid Al-Sayed", initials: "KS", reason: "Blood pressure review", mode: "In-person", status: "confirmed" },
  { id: 5, time: "15:00", duration: 30, patient: "Fatima Ibrahim", initials: "FI", reason: "Results discussion", mode: "In-person", status: "confirmed" },
];

const labels = {
  en: { today: "Today", calendar: "Calendar", org: "Organization", patients: "Patients", services: "Services", insights: "Insights", hello: "Good morning, Dr. Laila", overview: "Here’s what needs your attention today.", location: "Al Noor Medical Center · Al Waab", date: "Sunday, 2 August", schedule: "Today’s schedule", all: "All appointments", verification: "Verification center" },
  ar: { today: "اليوم", calendar: "التقويم", org: "المنشأة", patients: "المرضى", services: "الخدمات", insights: "التقارير", hello: "صباح الخير، د. ليلى", overview: "إليك ما يحتاج إلى اهتمامك اليوم.", location: "مركز النور الطبي · الوعب", date: "الأحد، ٢ أغسطس", schedule: "جدول اليوم", all: "جميع المواعيد", verification: "مركز التحقق" },
};

function statusLabel(status: AppointmentStatus, ar: boolean) {
  const values = { confirmed: ar ? "مؤكد" : "Confirmed", arrived: ar ? "وصل" : "Arrived", in_consultation: ar ? "في الاستشارة" : "In consultation", completed: ar ? "مكتمل" : "Completed" };
  return values[status];
}

export default function ProviderConsole() {
  const [view, setView] = useState<View>("today");
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [appointments, setAppointments] = useState(initialAppointments);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [week, setWeek] = useState(0);
  const ar = lang === "ar"; const t = labels[lang];
  const selected = appointments.find(a => a.id === selectedId) ?? null;
  const updateStatus = (status: AppointmentStatus) => setAppointments(items => items.map(a => a.id === selectedId ? { ...a, status } : a));
  const count = (status: AppointmentStatus) => appointments.filter(a => a.status === status).length;

  return <main className={`provider-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"}>
    <aside className="provider-sidebar">
      <a href="/" className="provider-logo"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati"/><span>{ar ? "بوابة مقدمي الرعاية" : "Provider console"}</span></a>
      <div className="facility-chip"><span>AN</span><div><b>{ar ? "مركز النور الطبي" : "Al Noor Medical Center"}</b><small>{ar ? "فرع الوعب" : "Al Waab location"}</small></div><i>⌄</i></div>
      <nav className="provider-nav">
        <button className={view === "today" ? "active" : ""} onClick={() => setView("today")}><span>◫</span>{t.today}<em>2</em></button>
        <button className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")}><span>□</span>{t.calendar}</button>
        <a className="provider-nav-link" href="/provider/patients"><span>♙</span>{t.patients}</a>
        <a className="provider-nav-link" href="/provider/services"><span>◇</span>{t.services}</a>
        <button className={view === "organization" ? "active" : ""} onClick={() => setView("organization")}><span>⌂</span>{t.org}<em className="warning-dot">!</em></button>
        <button><span>↗</span>{t.insights}</button>
      </nav>
      <div className="sidebar-bottom"><a href="/">← {ar ? "العودة لتطبيق المريض" : "Patient experience"}</a><a href="/admin">◇ {ar ? "عمليات المنصة" : "Platform operations"}</a><p>{ar ? "نموذج ببيانات تجريبية" : "Synthetic-data prototype"}</p></div>
    </aside>

    <section className="provider-main">
      <header className="provider-topbar"><button className="mobile-menu">☰</button><div className="provider-context"><span>⌖</span><div><b>{t.location}</b><small>{ar ? "دور ممارس" : "Practitioner role"}</small></div></div><div className="provider-actions"><button onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><button aria-label="Notifications" className="provider-notification">●<i>2</i></button><span className="provider-avatar">LK</span><div><b>{ar ? "د. ليلى الكواري" : "Dr. Laila Al-Kuwari"}</b><small>{ar ? "طب الأسرة" : "Family medicine"}</small></div></div></header>

      {view === "today" && <div className="provider-workspace">
        <div className="provider-welcome"><div><p>{t.date}</p><h1>{t.hello}</h1><span>{t.overview}</span></div><button onClick={() => setView("calendar")}>＋ {ar ? "حجز موعد" : "Create appointment"}</button></div>
        <div className="metric-grid"><article><span className="metric-icon cyan">□</span><div><small>{ar ? "مواعيد اليوم" : "Today’s appointments"}</small><b>{appointments.length}</b><p><strong>{count("arrived")}</strong> {ar ? "وصل" : "arrived"}</p></div></article><article><span className="metric-icon teal">✓</span><div><small>{ar ? "المكتملة" : "Completed"}</small><b>{count("completed")}</b><p>{ar ? "من أصل" : "of"} {appointments.length}</p></div></article><article><span className="metric-icon sand">!</span><div><small>{ar ? "مهام تحتاج إجراء" : "Tasks requiring action"}</small><b>2</b><p>{ar ? "مراجعة اليوم" : "review today"}</p></div></article></div>
        <div className="provider-columns"><section className="schedule-card"><div className="card-title"><div><h2>{t.schedule}</h2><p>{ar ? "٥ مواعيد · آخر تحديث الآن" : "5 appointments · Updated just now"}</p></div><button onClick={() => setView("calendar")}>{t.all} →</button></div><div className="appointment-list">{appointments.map(a => <button key={a.id} className={`appointment-row ${selectedId === a.id ? "selected" : ""}`} onClick={() => setSelectedId(a.id)}><time>{a.time}</time><span className="patient-avatar">{a.initials}</span><div><b>{a.patient}</b><small>{a.reason} · {a.duration} min</small>{a.alert && <em>◇ {a.alert}</em>}</div><i className={`status ${a.status}`}>{statusLabel(a.status, ar)}</i><span className="row-arrow">›</span></button>)}</div></section><aside className="task-card"><div className="card-title"><div><h2>{ar ? "المهام والتنبيهات" : "Tasks & alerts"}</h2><p>{ar ? "مرتبة حسب الأولوية" : "Ordered by priority"}</p></div></div><article className="task warning"><span>!</span><div><b>{ar ? "ترخيص مهني ينتهي قريباً" : "Professional license expires soon"}</b><p>{ar ? "ينتهي في ٢١ يوماً. ارفعي المستند المحدّث." : "Expires in 21 days. Upload the renewed document."}</p><button onClick={() => setView("organization")}>{ar ? "مراجعة التحقق" : "Review verification"}</button></div></article><article className="task info"><span>◇</span><div><b>{ar ? "ملخص زيارة يحتاج توقيعاً" : "Visit summary needs review"}</b><p>{ar ? "ملخص يوسف حسن لا يزال مسودة." : "Yousef Hassan’s summary is still a draft."}</p><button>{ar ? "فتح المسودة" : "Open draft"}</button></div></article></aside></div>
      </div>}

      {view === "calendar" && <div className="provider-workspace calendar-workspace"><div className="calendar-heading"><div><p>{ar ? "الجدول والمواعيد" : "Schedule & appointments"}</p><h1>{t.calendar}</h1></div><div><button onClick={() => setWeek(w => w - 1)}>‹</button><button onClick={() => setWeek(0)}>{t.today}</button><button onClick={() => setWeek(w => w + 1)}>›</button><button className="new-appointment">＋ {ar ? "موعد جديد" : "New appointment"}</button></div></div><div className="week-label"><b>{week === 0 ? (ar ? "٢ - ٨ أغسطس ٢٠٢٦" : "2 - 8 August 2026") : week > 0 ? (ar ? "الأسبوع التالي" : "Next week") : (ar ? "الأسبوع السابق" : "Previous week")}</b><span><i className="open-dot"/> {ar ? "متاح" : "Available"}<i className="booked-dot"/> {ar ? "محجوز" : "Booked"}</span></div><div className="calendar-card"><div className="time-column"><span/><time>08:00</time><time>09:00</time><time>10:00</time><time>11:00</time><time>12:00</time><time>13:00</time><time>14:00</time><time>15:00</time><time>16:00</time></div>{["SUN 02","MON 03","TUE 04","WED 05","THU 06"].map((day, i) => <div className={`calendar-day ${i === 0 ? "current" : ""}`} key={day}><b>{day}</b><div className="calendar-lines">{Array.from({length:9}).map((_,j)=><span key={j}/>)}</div>{i === 0 && appointments.map((a,index) => <button key={a.id} style={{top:`${58 + index * 68}px`}} className={`calendar-event ${a.status}`} onClick={() => setSelectedId(a.id)}><time>{a.time}</time><b>{a.patient}</b><small>{a.reason}</small></button>)}{i === 1 && <button style={{top:"126px"}} className="calendar-event confirmed"><time>09:00</time><b>Hamad Noor</b><small>Follow-up</small></button>}</div>)}</div></div>}

      {view === "organization" && <div className="provider-workspace"><div className="provider-welcome"><div><p>{ar ? "المنشأة والثقة" : "Organization & trust"}</p><h1>{t.verification}</h1><span>{ar ? "حافظي على حالة المنشأة والممارسين محدثة." : "Keep facility and practitioner evidence current."}</span></div><button>＋ {ar ? "إضافة موقع" : "Add location"}</button></div><div className="verification-summary"><div className="verify-score"><span>83%</span><i><b/></i><p>{ar ? "٥ من ٦ متطلبات مكتملة" : "5 of 6 requirements complete"}</p></div><div><strong>{ar ? "النشر العام محدود" : "Public publishing restricted"}</strong><p>{ar ? "سيظل الملف العام فعالاً، لكن لا يمكن نشر خدمات جديدة حتى يتم تجديد الترخيص." : "The current profile remains active, but new services cannot publish until the license is renewed."}</p></div></div><section className="verification-card"><div className="card-title"><div><h2>{ar ? "قائمة التحقق" : "Verification checklist"}</h2><p>{ar ? "آخر مراجعة: ١ أغسطس ٢٠٢٦" : "Last reviewed: 1 August 2026"}</p></div><button>{ar ? "سجل التغييرات" : "Audit history"} →</button></div>{[
          ["✓", ar ? "هوية الممارس" : "Practitioner identity", ar ? "تم التحقق" : "Verified", "complete"],
          ["✓", ar ? "انتساب المنشأة" : "Facility affiliation", ar ? "تم التحقق" : "Verified", "complete"],
          ["✓", ar ? "التخصص والمؤهلات" : "Specialty & qualifications", ar ? "تم التحقق" : "Verified", "complete"],
          ["!", ar ? "الترخيص المهني" : "Professional license", ar ? "ينتهي خلال ٢١ يوماً" : "Expires in 21 days", "attention"],
          ["✓", ar ? "معلومات الموقع" : "Location information", ar ? "مكتمل" : "Complete", "complete"],
          ["○", ar ? "مراجعة التجديد" : "Renewal review", ar ? "في انتظار المستند" : "Waiting for document", "pending"]
        ].map(([icon,title,status,state]) => <div className="verification-row" key={title}><span className={state}>{icon}</span><div><b>{title}</b><small>{status}</small></div>{state === "attention" ? <button>{ar ? "رفع التجديد" : "Upload renewal"}</button> : <i>›</i>}</div>)}</section></div>}
    </section>

    {selected && <aside className="appointment-drawer"><button className="drawer-close" onClick={() => setSelectedId(null)}>×</button><p>{ar ? "تفاصيل الموعد" : "Appointment detail"}</p><h2>{selected.time} · {selected.duration} min</h2><div className="drawer-patient"><span>{selected.initials}</span><div><b>{selected.patient}</b><small>{ar ? "تم تأكيد الهوية" : "Identity confirmed"} ✓</small></div></div><dl><div><dt>{ar ? "سبب الزيارة" : "Visit reason"}</dt><dd>{selected.reason}</dd></div><div><dt>{ar ? "نوع الموعد" : "Appointment type"}</dt><dd>{selected.mode}</dd></div><div><dt>{ar ? "الحالة" : "Status"}</dt><dd><i className={`status ${selected.status}`}>{statusLabel(selected.status, ar)}</i></dd></div><div><dt>{ar ? "الموافقة" : "Consent"}</dt><dd className="consent-ok">✓ {ar ? "صالحة لهذه الزيارة" : "Valid for this visit"}</dd></div></dl><div className="shared-record"><span>◇</span><div><b>{ar ? "مستند مشترك واحد" : "1 shared document"}</b><p>{ar ? "تقرير مخبري · شاركه المريض لهذه الزيارة فقط" : "Lab report · Patient-shared for this visit only"}</p></div><button>{ar ? "عرض" : "View"}</button></div><div className="drawer-actions">{selected.status === "confirmed" && <button className="primary" onClick={() => updateStatus("arrived")}>{ar ? "تسجيل الوصول" : "Mark arrived"}</button>}{selected.status === "arrived" && <a className="primary drawer-link" href="/provider/encounter">{ar ? "بدء الزيارة" : "Start visit"}</a>}{selected.status === "in_consultation" && <button className="primary" onClick={() => updateStatus("completed")}>{ar ? "إكمال الزيارة" : "Complete visit"}</button>}{selected.status === "completed" && <div className="completed-banner">✓ {ar ? "اكتملت الزيارة" : "Visit completed"}</div>}<button className="secondary">{ar ? "إعادة الجدولة" : "Reschedule"}</button></div><p className="drawer-footnote">{ar ? "كل إجراء في هذا النموذج تجريبي ومسجل محلياً فقط." : "All actions in this prototype are synthetic and local to this screen."}</p></aside>}
  </main>;
}
