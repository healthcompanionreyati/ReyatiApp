"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import ConfirmActionDialog from "@/app/components/ConfirmActionDialog";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import { reyatiDate, reyatiLabel, reyatiNumber } from "@/lib/reyati-i18n";

type ContinuityCase = {
  id: string; appointmentId: string; organizationId: string; assignedToUserId: string | null; status: string; resolutionNote: string | null;
  version: number; createdAt: string; updatedAt: string; appointmentStatus: string; scheduledStart: string; scheduledEnd: string; mode: string;
  patientName: string; providerName: string; organizationName: string; organizationStatus: string;
};
type Queue = { role: string; cases: ContinuityCase[] };
type PendingAction = { action: string; item: ContinuityCase } | null;

async function api(init?: RequestInit) {
  const response = await fetch("/api/admin/continuity", { credentials: "same-origin", ...init });
  const payload = await response.json().catch(() => ({})) as { data?: unknown; message?: string; error?: string };
  if (response.status === 401) { window.location.assign(`/sign-in?redirect_url=${encodeURIComponent("/admin/continuity")}`); throw new Error("Authentication required"); }
  if (!response.ok || payload.data === undefined) { const error = new Error(payload.message || payload.error || "Continuity queue unavailable"); (error as Error & { status?: number }).status = response.status; throw error; }
  return payload.data;
}

export default function CareContinuityCentre() {
  const [lang, setLang] = useReyatiLocale(); const ar = lang === "ar";
  const [data, setData] = useState<Queue | null>(null); const [selected, setSelected] = useState<ContinuityCase | null>(null);
  const [filter, setFilter] = useState("active"); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [pending, setPending] = useState<PendingAction>(null);
  const [note, setNote] = useState(""); const [confirmCancel, setConfirmCancel] = useState(false);

  async function load() { const queue = await api() as Queue; setData(queue); setSelected((current) => current ? queue.cases.find((item) => item.id === current.id) ?? queue.cases[0] ?? null : queue.cases[0] ?? null); }
  useEffect(() => { let active = true; api().then((value) => { if (active) { const queue = value as Queue; setData(queue); setSelected(queue.cases[0] ?? null); } }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Continuity queue unavailable"); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const cases = useMemo(() => data?.cases ?? [], [data]);
  const rows = useMemo(() => cases.filter((item) => filter === "all" || (filter === "active" ? !["resolved", "appointment_cancelled"].includes(item.status) : item.status === filter)), [cases, filter]);

  async function mutate(action: string, item: ContinuityCase, actionNote?: string) {
    setSaving(true); setError("");
    try {
      await api({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, caseId: item.id, version: item.version, note: actionNote }) });
      setNotice(ar ? "تم تسجيل إجراء استمرارية الرعاية وإرسال التحديثات اللازمة." : "Continuity action recorded and required account updates sent.");
      setPending(null); setNote(""); setConfirmCancel(false); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Continuity action could not be recorded"); }
    finally { setSaving(false); }
  }
  function begin(action: string, item: ContinuityCase) { setPending({ action, item }); setNote(""); setConfirmCancel(false); }
  function submitAction(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!pending || note.trim().length < 10) return; if (pending.action === "cancel_appointment") setConfirmCancel(true); else void mutate(pending.action, pending.item, note); }
  const activeCount = cases.filter((item) => !["resolved", "appointment_cancelled"].includes(item.status)).length;

  return <main className={`continuity-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"} id="main-content">
    <aside className="continuity-side"><a href="/" className="provider-logo"><img src="/brand/qivaya-logo-reversed.png" alt="Qivaya"/><span>{ar ? "عمليات المنصة" : "Platform operations"}</span></a><nav><a href="/admin">{ar ? "نظرة عامة" : "Overview"}</a><a href="/admin/organizations">{ar ? "المؤسسات" : "Organizations"}</a><a className="active" href="/admin/continuity">{ar ? "استمرارية الرعاية" : "Care continuity"}</a><a href="/admin/cases">{ar ? "حالات الدعم" : "Support cases"}</a><a href="/admin/audit">{ar ? "سجل التدقيق" : "Audit ledger"}</a></nav><div><b>{ar ? "لا فقدان صامت للرعاية" : "No silent loss of care"}</b><p>{ar ? "يُنشأ سجل دائم لكل موعد مستقبلي يتأثر بتعليق مؤسسة." : "A durable record is created for every future appointment affected by an organization suspension."}</p></div></aside>
    <section className="continuity-main"><header><div><small>{ar ? "سلامة البرنامج التجريبي" : "CONTROLLED-PILOT SAFETY"}</small><b>{ar ? "مساحة محمية لمعالجة المواعيد المتأثرة" : "Protected affected-appointment workspace"}</b></div><div><button className="lang" type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications" aria-label={ar ? "الإشعارات" : "Notifications"}>●</a></div></header><div className="continuity-workspace">
      <div className="continuity-heading"><div><p>{ar ? "استمرارية الرعاية" : "CARE CONTINUITY"}</p><h1>{ar ? "مركز استمرارية الرعاية" : "Care Continuity Centre"}</h1><span>{ar ? "راجع كل موعد تأثر بتعليق مؤسسة، وسجل التواصل، واطلب إعادة الحجز، أو نفّذ إلغاءً مضبوطاً." : "Review every appointment affected by an organization suspension, record contact, request rebooking, or perform a controlled cancellation."}</span></div><button disabled={loading} onClick={() => void load()}>↻ {ar ? "تحديث" : "Refresh"}</button></div>
      <section className="continuity-banner"><span>+</span><div><b>{activeCount ? (ar ? `${reyatiNumber(activeCount, lang)} مواعيد تحتاج متابعة` : `${reyatiNumber(activeCount, lang)} appointments need follow-up`) : (ar ? "لا توجد مواعيد تنتظر المعالجة" : "No appointments are awaiting action")}</b><p>{ar ? "لا يؤدي تعليق المؤسسة إلى إلغاء المواعيد تلقائياً. يجب أن يمتلك كل تغيير سبباً مسجلاً وإشعاراً واضحاً." : "Organization suspension never silently cancels appointments. Every change requires a recorded reason and a clear account notification."}</p></div><i>{ar ? "مراجعة بشرية" : "HUMAN REVIEW"}</i></section>
      {loading && <div className="continuity-state">{ar ? "جارٍ تحميل قائمة الاستمرارية المحمية…" : "Loading the protected continuity queue…"}</div>}
      {error && <div className="continuity-alert error" role="alert"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
      {notice && <div className="continuity-alert success"><span>✓ {notice}</span><button onClick={() => setNotice("")}>×</button></div>}
      {!loading && data && <><section className="continuity-metrics"><article><b>{reyatiNumber(activeCount, lang)}</b><span>{ar ? "تحتاج إجراء" : "Need action"}</span></article><article><b>{reyatiNumber(cases.filter((item) => item.status === "rebooking_required").length, lang)}</b><span>{ar ? "إعادة حجز مطلوبة" : "Rebooking required"}</span></article><article><b>{reyatiNumber(cases.filter((item) => item.status === "contacted").length, lang)}</b><span>{ar ? "تم التواصل" : "Contact recorded"}</span></article><article><b>{reyatiNumber(cases.filter((item) => ["resolved", "appointment_cancelled"].includes(item.status)).length, lang)}</b><span>{ar ? "مغلقة" : "Closed"}</span></article></section>
        <section className="continuity-layout"><div className="continuity-queue"><div className="continuity-filters">{["active", "needs_review", "contacted", "rebooking_required", "all"].map((item) => <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{item === "active" ? (ar ? "النشطة" : "Active") : item === "all" ? (ar ? "الكل" : "All") : reyatiLabel(item, lang)}</button>)}</div>{rows.length === 0 ? <div className="continuity-empty"><span>✓</span><b>{ar ? "لا توجد حالات ضمن هذا العرض" : "Nothing in this view"}</b></div> : rows.map((item) => <button className={selected?.id === item.id ? "selected" : ""} key={item.id} onClick={() => setSelected(item)}><span className={item.status}>{item.status === "needs_review" ? "!" : item.status === "rebooking_required" ? "↻" : "✓"}</span><div><b>{item.patientName}</b><small>{item.providerName} · {item.organizationName}</small><time>{reyatiDate(item.scheduledStart, lang, { dateStyle: "medium", timeStyle: "short" })}</time></div><i>{reyatiLabel(item.status, lang)}</i></button>)}</div>
          {selected && <aside className="continuity-detail"><div className="continuity-detail-head"><span className={selected.status}>{reyatiLabel(selected.status, lang)}</span><h2>{selected.patientName}</h2><p>{ar ? "موعد متأثر" : "Affected appointment"} · {selected.appointmentId.slice(0, 8).toUpperCase()}</p></div><dl><div><dt>{ar ? "المزود" : "Provider"}</dt><dd>{selected.providerName}</dd></div><div><dt>{ar ? "المؤسسة" : "Organization"}</dt><dd>{selected.organizationName} · {reyatiLabel(selected.organizationStatus, lang)}</dd></div><div><dt>{ar ? "الموعد" : "Appointment"}</dt><dd>{reyatiDate(selected.scheduledStart, lang, { dateStyle: "full", timeStyle: "short" })}</dd></div><div><dt>{ar ? "الحالة الحالية" : "Current status"}</dt><dd>{reyatiLabel(selected.appointmentStatus, lang)} · {reyatiLabel(selected.mode, lang)}</dd></div></dl>{selected.resolutionNote && <section><b>{ar ? "آخر ملاحظة تشغيلية" : "Latest operational note"}</b><p>{selected.resolutionNote}</p></section>}<div className="continuity-actions">{!selected.assignedToUserId && <button disabled={saving} onClick={() => void mutate("claim", selected)}>{ar ? "استلام الحالة" : "Claim case"}</button>}{!["resolved", "appointment_cancelled"].includes(selected.status) && <><button onClick={() => begin("record_contact", selected)}>{ar ? "تسجيل التواصل" : "Record contact"}</button><button onClick={() => begin("request_rebooking", selected)}>{ar ? "طلب إعادة الحجز" : "Request rebooking"}</button><button onClick={() => begin("resolve", selected)}>{ar ? "إغلاق كمحلولة" : "Resolve"}</button>{data.role === "platform_admin" && <button className="danger-action" onClick={() => begin("cancel_appointment", selected)}>{ar ? "إلغاء الموعد" : "Cancel appointment"}</button>}</>}</div><small>{ar ? "كل إجراء مرتبط بالحساب، محفوظ بالإصدار، ومسجل للتدقيق." : "Every action is account-attributed, version-checked, and audited."}</small></aside>}
        </section></>}
    </div></section>
    {pending && !confirmCancel && <div className="continuity-modal-layer"><form className="continuity-modal" onSubmit={submitAction}><button type="button" onClick={() => setPending(null)}>×</button><p>{ar ? "إجراء استمرارية موثق" : "AUDITED CONTINUITY ACTION"}</p><h2>{pending.action === "record_contact" ? (ar ? "تسجيل التواصل" : "Record patient contact") : pending.action === "request_rebooking" ? (ar ? "طلب إعادة الحجز" : "Request patient rebooking") : pending.action === "resolve" ? (ar ? "حل حالة الاستمرارية" : "Resolve continuity case") : (ar ? "إلغاء الموعد المتأثر" : "Cancel affected appointment")}</h2><label>{ar ? "ملاحظة تشغيلية" : "Operational note"}<textarea value={note} onChange={(event) => setNote(event.target.value)} required minLength={10} maxLength={1000} placeholder={ar ? "سجل ما تم الاتفاق عليه دون إضافة تفاصيل سريرية…" : "Record what was agreed without adding clinical detail…"}/><small>{note.trim().length}/1000 · {ar ? "10 أحرف على الأقل" : "10 character minimum"}</small></label><button type="submit" disabled={saving || note.trim().length < 10}>{pending.action === "cancel_appointment" ? (ar ? "مراجعة الإلغاء" : "Review cancellation") : (ar ? "تسجيل الإجراء" : "Record action")}</button></form></div>}
    <ConfirmActionDialog open={Boolean(pending?.action === "cancel_appointment" && confirmCancel)} locale={lang} busy={saving} title={ar ? "إلغاء هذا الموعد المتأثر؟" : "Cancel this affected appointment?"} description={ar ? "سيُلغى الموعد ويُحرر الوقت المحجوز ويُخطر حسابا المريض والمزود." : "The appointment will be cancelled, its reserved time released, and both patient and provider accounts notified."} consequence={ar ? "لا يعني هذا الإجراء أي دفعة أو استرداد مالي، ولا يمكن التراجع عنه من هذه الشاشة." : "This action does not imply payment or refund movement and cannot be reversed from this screen."} confirmLabel={ar ? "إلغاء الموعد" : "Cancel appointment"} busyLabel={ar ? "جارٍ الإلغاء…" : "Cancelling…"} onCancel={() => setConfirmCancel(false)} onConfirm={() => pending && void mutate("cancel_appointment", pending.item, note)}/>
  </main>;
}
