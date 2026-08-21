"use client";

import { useReyatiLocale } from "@/app/components/useReyatiLocale";

import { useEffect, useMemo, useState } from "react";

type AppointmentSummary = {
  id: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  mode: string;
};

type PatientSummary = {
  patientId: string;
  patientName: string;
  appointmentCount: number;
  latestAppointment: AppointmentSummary;
  nextAppointment: AppointmentSummary | null;
};

type Directory = {
  providerName: string;
  organizationName: string;
  patients: PatientSummary[];
  truncated: boolean;
};

type Filter = "all" | "upcoming" | "recent";
const recentWindowStart = Date.now() - 90 * 24 * 60 * 60 * 1000;

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";
}

function formatDate(value: string, lang: "en" | "ar") {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-QA" : "en-QA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Qatar",
  }).format(new Date(value));
}

export default function ProviderPatients() {
  const [lang, setLang] = useReyatiLocale();
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<"auth" | "forbidden" | "unavailable" | null>(null);
  const ar = lang === "ar";

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/provider/patients", { signal: controller.signal, credentials: "same-origin" })
      .then(async (response) => {
        if (response.status === 401) throw new Error("auth");
        if (response.status === 403) throw new Error("forbidden");
        if (!response.ok) throw new Error("unavailable");
        const data = await response.json().catch(() => null) as Directory | null;
        if (!data || !Array.isArray(data.patients)) throw new Error("unavailable");
        return data;
      })
      .then(setDirectory)
      .catch((reason: Error) => {
        if (reason.name === "AbortError") return;
        setError(reason.message === "auth" || reason.message === "forbidden" ? reason.message : "unavailable");
      });
    return () => controller.abort();
  }, []);

  const visiblePatients = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return (directory?.patients ?? []).filter((patient) => {
      if (normalized && !patient.patientName.toLocaleLowerCase().includes(normalized)) return false;
      if (filter === "upcoming") return Boolean(patient.nextAppointment);
      if (filter === "recent") return new Date(patient.latestAppointment.scheduledStart).getTime() >= recentWindowStart;
      return true;
    });
  }, [directory, filter, query]);

  const upcomingCount = directory?.patients.filter((patient) => patient.nextAppointment).length ?? 0;
  const providerInitials = initials(directory?.providerName ?? "Provider");

  return <main className={`provider-patients-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"}>
    <aside className="patient-provider-sidebar">
      <a href="/" className="provider-logo"><img src="/brand/qivaya-logo-reversed.png" alt="Qivaya"/><span>{ar ? "بوابة مقدم الرعاية" : "Provider console"}</span></a>
      <div className="patient-facility"><span>{providerInitials}</span><div><b>{directory?.organizationName ?? (ar ? "مساحة مقدم الرعاية" : "Provider workspace")}</b><small>{directory?.providerName ?? (ar ? "حساب موثّق" : "Verified account")}</small></div></div>
      <nav>
        <a href="/provider"><span>◫</span>{ar ? "المواعيد" : "Appointments"}</a>
        <a className="active" href="/provider/patients"><span>♙</span>{ar ? "المرضى" : "Patients"}{directory && <i>{directory.patients.length}</i>}</a>
        <a href="/provider/documents"><span>▤</span>{ar ? "المستندات المشتركة" : "Shared documents"}</a>
        <a href="/provider/services"><span>◇</span>{ar ? "الخدمات" : "Services"}</a>
        <a href="/provider/insights"><span>↗</span>{ar ? "التقارير" : "Insights"}</a>
        <a href="/provider/settings"><span>⚙</span>{ar ? "الإعدادات" : "Settings"}</a>
      </nav>
      <div className="patient-sidebar-bottom"><a href="/support">◇ {ar ? "الدعم" : "Support"}</a><a href="/provider">← {ar ? "لوحة مقدم الرعاية" : "Provider dashboard"}</a><p>{ar ? "وصول محمي · كل عرض مسجّل" : "Protected access · every view is logged"}</p></div>
    </aside>

    <section className="patient-provider-main">
      <header className="patient-provider-top">
        <div><span>⌖</span><div><b>{directory?.organizationName ?? (ar ? "مساحة مقدم الرعاية" : "Provider workspace")}</b><small>{ar ? "دليل مرتبط بالمواعيد" : "Appointment-linked directory"}</small></div></div>
        <div><button type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications" aria-label={ar ? "الإشعارات" : "Notifications"}>●</a><span>{providerInitials}</span></div>
      </header>

      <div className="patient-provider-workspace">
        <div className="patient-workspace-heading"><div><p>{ar ? "نطاق مقدم الرعاية" : "PROVIDER-OWNED ROSTER"}</p><h1>{ar ? "المرضى" : "Patients"}</h1><span>{ar ? "لا يظهر هنا إلا المرضى المرتبطون بمواعيدك الفعلية." : "Only patients connected through your provider-owned appointments appear here."}</span></div><a href="/provider">{ar ? "إدارة المواعيد" : "Manage appointments"} →</a></div>

        <div className="patient-access-note"><span>♙</span><p><b>{ar ? "هذا ليس سجلاً صحياً" : "This is not a health-record directory"}</b>{ar ? "يعرض الاسم وسياق الموعد فقط. لا يمنح الوصول إلى السجلات أو المدفوعات أو البيانات الديموغرافية أو الموافقات." : "It shows only identity and appointment context. It does not grant access to records, payments, demographics, or consent data."}</p></div>

        {error ? <section className="patient-state" role="alert"><span>!</span><h2>{error === "auth" ? (ar ? "يلزم تسجيل الدخول" : "Sign in required") : error === "forbidden" ? (ar ? "دور مقدم رعاية موثّق مطلوب" : "Verified provider access required") : (ar ? "تعذر تحميل المرضى" : "Patients could not be loaded")}</h2><p>{error === "forbidden" ? (ar ? "يجب أن يكون حسابك موثّقاً وعضواً نشطاً في المؤسسة." : "Your account must be verified and have active organization membership.") : (ar ? "أعد المحاولة أو تواصل مع الدعم إذا استمرت المشكلة." : "Try again, or contact support if the problem continues.")}</p><a href={error === "auth" ? "/auth" : error === "forbidden" ? "/provider/services" : "/support"}>{error === "auth" ? (ar ? "تسجيل الدخول" : "Sign in") : error === "forbidden" ? (ar ? "إكمال الإعداد" : "Review provider setup") : (ar ? "فتح الدعم" : "Open support")}</a></section> : !directory ? <section className="patient-state patient-loading" aria-live="polite"><span>◌</span><h2>{ar ? "جارٍ تحميل دليل المرضى" : "Loading patient directory"}</h2><p>{ar ? "نحن نتحقق من صلاحيات مقدم الرعاية." : "We are verifying your provider scope."}</p></section> : <>
          <div className="patient-metrics"><article><span>♙</span><div><b>{directory.patients.length}</b><p>{ar ? "مرضى مرتبطون" : "Appointment-linked patients"}</p></div></article><article><span>◎</span><div><b>{upcomingCount}</b><p>{ar ? "لديهم موعد قادم" : "With upcoming appointments"}</p></div></article><article><span>✓</span><div><b>{directory.patients.length - upcomingCount}</b><p>{ar ? "سياق سابق فقط" : "Past context only"}</p></div></article></div>
          {directory.truncated && <p className="patient-limit-note">{ar ? "تُعرض أحدث 500 علاقة موعد. استخدم البحث أو لوحة المواعيد للوصول إلى سياق أقدم." : "Showing the 500 most recent appointment relationships. Use the appointments dashboard for older context."}</p>}
          <div className="patient-tools"><div><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>{ar ? "الكل" : "All"}</button><button className={filter === "upcoming" ? "active" : ""} onClick={() => setFilter("upcoming")}>{ar ? "قادم" : "Upcoming"}</button><button className={filter === "recent" ? "active" : ""} onClick={() => setFilter("recent")}>{ar ? "آخر ٩٠ يوماً" : "Last 90 days"}</button></div><label>⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? "البحث بالاسم" : "Search by name"} aria-label={ar ? "البحث عن مريض" : "Search patients"}/></label></div>

          {visiblePatients.length ? <section className="patient-directory"><div className="patient-directory-head"><span>{ar ? "المريض" : "Patient"}</span><span>{ar ? "آخر موعد" : "Latest appointment"}</span><span>{ar ? "الموعد القادم" : "Next appointment"}</span><span>{ar ? "الحالة" : "Status"}</span><span>{ar ? "الإجمالي" : "Total"}</span><span/></div>{visiblePatients.map((patient) => <article key={patient.patientId}><div className="directory-person"><span>{initials(patient.patientName)}</span><div><b>{patient.patientName}</b><small>{ar ? "مرتبط بمواعيدك فقط" : "Linked through your appointments only"}</small></div></div><time>{formatDate(patient.latestAppointment.scheduledStart, lang)}</time><span>{patient.nextAppointment ? formatDate(patient.nextAppointment.scheduledStart, lang) : (ar ? "لا يوجد" : "None")}</span><i className={patient.nextAppointment ? "active" : "visit-only"}>{patient.nextAppointment?.status ?? patient.latestAppointment.status}</i><strong>{patient.appointmentCount}</strong><a href={patient.nextAppointment ? `/provider/encounter?appointmentId=${encodeURIComponent(patient.nextAppointment.id)}` : "/provider"} aria-label={`${ar ? "فتح سياق موعد" : "Open appointment context"}: ${patient.patientName}`}>›</a></article>)}</section> : <section className="patient-state patient-empty"><span>♙</span><h2>{query || filter !== "all" ? (ar ? "لا توجد نتائج مطابقة" : "No matching patients") : (ar ? "لا يوجد مرضى مرتبطون بعد" : "No appointment-linked patients yet")}</h2><p>{query || filter !== "all" ? (ar ? "غيّر البحث أو عامل التصفية." : "Adjust the search or filter.") : (ar ? "سيظهر المريض هنا بعد حجز موعد مع ملف مقدم الرعاية الخاص بك." : "A patient will appear here after an appointment is booked with your provider profile.")}</p>{!query && filter === "all" && <a href="/provider/services">{ar ? "مراجعة الخدمات المنشورة" : "Review published services"}</a>}</section>}
        </>}
      </div>
    </section>
  </main>;
}
