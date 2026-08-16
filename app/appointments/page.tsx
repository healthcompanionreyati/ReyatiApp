"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmActionDialog from "@/app/components/ConfirmActionDialog";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import { reyatiDate, reyatiLabel } from "@/lib/reyati-i18n";

type Appointment = {
  id: string; providerId: string; serviceLocationId: string | null; providerName: string; specialty: string;
  facilityId: string | null; facilityName: string | null; scheduledStart: string; scheduledEnd: string;
  mode: string; status: string; cancelledAt: string | null; version: number;
};

const terminalStatuses = ["cancelled", "completed", "declined", "no_show"];

async function request(init?: RequestInit) {
  const subjectUserId = new URLSearchParams(window.location.search).get("subjectUserId");
  const endpoint = subjectUserId ? `/api/appointments?subjectUserId=${encodeURIComponent(subjectUserId)}` : "/api/appointments";
  const response = await fetch(endpoint, init);
  const payload = await response.json().catch(() => ({})) as { appointments?: Appointment[]; appointment?: unknown; delegated?: boolean; message?: string; error?: string };
  if (response.status === 401) {
    window.location.assign(`/signin-with-chatgpt?return_to=${encodeURIComponent(`/appointments${window.location.search}`)}`);
    throw new Error("Authentication required");
  }
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || "Request failed");
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return { ...payload, requestedSubjectUserId: subjectUserId };
}

function initials(name: string) { return name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
export default function Appointments() {
  const [lang, setLang] = useReyatiLocale();
  const ar = lang === "ar";
  const statusLabel = (status: string) => reyatiLabel(status, lang);
  const [items, setItems] = useState<Appointment[]>([]);
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [confirmCancellation, setConfirmCancellation] = useState(false);
  const [referenceTime] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [subjectUserId, setSubjectUserId] = useState<string | null>(null);
  const [delegated, setDelegated] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try { const payload = await request({ cache: "no-store", signal }); setItems(payload.appointments ?? []); setDelegated(Boolean(payload.delegated)); setSubjectUserId(payload.requestedSubjectUserId); }
    catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(ar ? "المواعيد غير متاحة مؤقتاً" : caught instanceof Error ? caught.message : "Appointments unavailable");
    }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [ar]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); });
    return () => controller.abort();
  }, [load]);

  const upcoming = useMemo(() => items
    .filter((item) => new Date(item.scheduledEnd).valueOf() > referenceTime && !terminalStatuses.includes(item.status))
    .sort((a, b) => new Date(a.scheduledStart).valueOf() - new Date(b.scheduledStart).valueOf()), [items, referenceTime]);
  const history = useMemo(() => items
    .filter((item) => new Date(item.scheduledEnd).valueOf() <= referenceTime || terminalStatuses.includes(item.status))
    .sort((a, b) => new Date(b.scheduledStart).valueOf() - new Date(a.scheduledStart).valueOf()), [items, referenceTime]);
  const visible = tab === "upcoming" ? upcoming : history;
  const providersPath = subjectUserId ? `/providers?subjectUserId=${encodeURIComponent(subjectUserId)}` : "/providers";

  async function cancelAppointment() {
    if (!selected || cancelling) return;
    setCancelling(true); setError("");
    try {
      await request({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", appointmentId: selected.id, version: selected.version, subjectUserId }) });
      setConfirmCancellation(false); setSelected(null); setNotice(ar ? "تم إلغاء الموعد وتحرير الوقت" : "Appointment cancelled and schedule released"); await load();
    } catch (caught) { setError(ar ? "تعذر إلغاء الموعد" : caught instanceof Error ? caught.message : "Appointment could not be cancelled"); }
    finally { setCancelling(false); }
  }

  return <main className={`appointments-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"} id="main-content">
    <header className="wallet-header"><a href="/" className="brand"><img src="/brand/reyati-logo.svg" alt="Reyati"/></a><nav aria-label={ar ? "تنقل المريض" : "Patient navigation"}><a href={providersPath}>{ar ? "ابحث عن رعاية" : "Find care"}</a><a className="active" href="/appointments">{ar ? "المواعيد" : "Appointments"}</a><a href="/virtual-care">{ar ? "الرعاية الافتراضية" : "Virtual care"}</a><a href="/messages">{ar ? "الرسائل" : "Messages"}</a><a href="/wallet">{ar ? "المحفظة الصحية" : "Health wallet"}</a><a href="/payments">{ar ? "المدفوعات" : "Payments"}</a><a href="/support">{ar ? "الدعم" : "Support"}</a></nav><div><button className="lang" type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications" className="appointment-notification-link" aria-label={ar ? "الإشعارات" : "Notifications"}>●</a><span className="avatar">RY</span></div></header>
    <section className="appointments-hero"><div><p>{ar ? "رحلة رعايتك" : "Your care journey"}</p><h1>{ar ? "المواعيد" : "Appointments"}</h1><span>{ar ? "حجوزات مملوكة لحسابك وحالتها الحالية وضوابط آمنة لدورة حياتها." : "Account-owned bookings, current status, and safe lifecycle controls."}</span></div><a href={providersPath}>＋ {ar ? "حجز موعد جديد" : "Book new appointment"}</a></section>
    {delegated && <div className="appointments-delegated-note"><b>{ar ? "إدارة المواعيد بموافقة." : "Managing appointments with consent."}</b> {ar ? "يمكنك العرض والحجز والإلغاء فقط أثناء سريان إذن الموعد القابل للإلغاء. يتم تدقيق كل إجراء مفوّض." : "You can view, book, and cancel only while this revocable appointment permission remains active. Every delegated action is audited."}</div>}
    <section className="appointments-content">
      <div className="appointment-tabs"><button className={tab === "upcoming" ? "active" : ""} onClick={() => setTab("upcoming")}>{ar ? "القادمة" : "Upcoming"} <span>{upcoming.length}</span></button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>{ar ? "السجل" : "History"} <span>{history.length}</span></button><a href="/support">{ar ? "الدعم" : "Support"}</a></div>
      {error && <div className="appointment-live-error">{error}<button type="button" onClick={() => void load()}>{ar ? "حاول مرة أخرى" : "Try again"}</button></div>}
      {loading ? <div className="appointment-live-state"><span>◇</span><h2>{ar ? "جارٍ تحميل مواعيدك…" : "Loading your appointments…"}</h2></div>
        : error ? <div className="appointment-live-state error"><span>!</span><h2>{ar ? "حالة الموعد غير متاحة" : "Appointment status unavailable"}</h2><p>{ar ? "تعذر على رعايتي تأكيد أحدث حجوزاتك. حاول مرة أخرى قبل الاعتماد على هذه القائمة." : "Reyati could not confirm your latest bookings. Try again before relying on this list."}</p></div>
        : visible.length === 0 ? <div className="appointment-live-state"><span>◷</span><h2>{tab === "upcoming" ? (ar ? "لا توجد مواعيد قادمة" : "No upcoming appointments") : (ar ? "لا يوجد سجل مواعيد" : "No appointment history")}</h2><p>{tab === "upcoming" ? (ar ? "تصفح مقدمي الرعاية الموثّقين واختر وقتاً منشوراً عندما تكون مستعداً." : "Browse verified providers and choose a published time when you are ready.") : (ar ? "ستظهر المواعيد المكتملة والملغاة هنا." : "Completed and cancelled appointments will appear here.")}</p>{tab === "upcoming" && <a href={providersPath}>{ar ? "ابحث عن رعاية" : "Find care"}</a>}</div>
        : <div className="appointment-live-list">{visible.map((item) => {
          const start = new Date(item.scheduledStart);
          const canCancel = tab === "upcoming" && ["pending", "confirmed"].includes(item.status) && start.valueOf() > referenceTime;
          return <article key={item.id}><div className="appointment-date"><b>{reyatiDate(start, lang, { day: "2-digit" })}</b><span>{reyatiDate(start, lang, { month: "short" }).toUpperCase()}</span></div><div className="appointment-live-provider"><span>{initials(item.providerName)}</span><div><p>{reyatiDate(start, lang, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</p><h2>{item.providerName}</h2><small>{item.specialty} · {item.facilityName || (item.mode === "video" ? (ar ? "استشارة فيديو" : "Video consultation") : (ar ? "المنشأة قيد التأكيد" : "Facility pending"))}</small></div></div><i className={item.status}>{statusLabel(item.status)}</i><div className="appointment-live-actions"><button onClick={() => setSelected(item)}>{ar ? "عرض التفاصيل" : "View details"}</button>{item.status === "completed" && <a href={`/wallet?appointmentId=${encodeURIComponent(item.id)}`}>{ar ? "سجل الزيارة" : "Visit record"}</a>}{canCancel && <button className="cancel" onClick={() => setSelected(item)}>{ar ? "إلغاء" : "Cancel"}</button>}</div></article>;
        })}</div>}
    </section>
    {selected && <div className="appointment-modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) { setConfirmCancellation(false); setSelected(null); } }}><div className="appointment-dialog wide"><button className="drawer-close" onClick={() => { setConfirmCancellation(false); setSelected(null); }} aria-label={ar ? "إغلاق" : "Close"}>×</button><p>{ar ? "تفاصيل الموعد" : "APPOINTMENT DETAIL"}</p><h2>{reyatiDate(selected.scheduledStart, lang, { dateStyle: "full", timeStyle: "short" })}</h2><div className="selected-doctor"><div className="doctor-avatar blue">{initials(selected.providerName)}<span>✓</span></div><div><h3>{selected.providerName}</h3><p>{selected.specialty} · {selected.facilityName || (selected.mode === "video" ? (ar ? "استشارة فيديو" : "Video consultation") : (ar ? "المنشأة قيد التأكيد" : "Facility pending"))}</p></div></div><dl className="appointment-detail-list"><div><dt>{ar ? "الحالة" : "Status"}</dt><dd>{statusLabel(selected.status)}</dd></div><div><dt>{ar ? "نوع الزيارة" : "Visit mode"}</dt><dd>{statusLabel(selected.mode)}</dd></div><div><dt>{ar ? "المرجع" : "Reference"}</dt><dd>{selected.id}</dd></div><div><dt>{ar ? "ينتهي" : "Ends"}</dt><dd>{reyatiDate(selected.scheduledEnd, lang, { hour: "numeric", minute: "2-digit" })}</dd></div></dl><div className="policy-box"><span>i</span><p><b>{ar ? "تتم إدارة حالة الدفع بشكل منفصل." : "Payment status is managed separately."}</b>{ar ? " يؤدي الإلغاء هنا إلى تحرير الجدول السريري ولا يعد باسترداد أو يدل عليه." : "Cancelling here releases the clinical schedule. It does not promise or imply a refund."}</p></div>{["pending", "confirmed"].includes(selected.status) && new Date(selected.scheduledStart).valueOf() > referenceTime && <button className="danger-action appointment-confirm-trigger" onClick={() => setConfirmCancellation(true)}>{ar ? "إلغاء الموعد" : "Cancel appointment"}</button>}</div></div>}
    <ConfirmActionDialog locale={lang} open={Boolean(selected && confirmCancellation)} title={ar ? "إلغاء هذا الموعد؟" : "Cancel this appointment?"} description={ar ? "سيتم إخطار مقدم الرعاية وتحرير الوقت المحجوز فوراً." : "The provider will be notified and the reserved time will be released immediately."} consequence={ar ? "هذا لا يثبت استرداد دفعة. تتم إدارة حالة الدفع بشكل منفصل." : "This does not prove a payment was refunded. Payment status is handled separately."} confirmLabel={ar ? "إلغاء الموعد" : "Cancel appointment"} busyLabel={ar ? "جارٍ الإلغاء…" : "Cancelling…"} busy={cancelling} onCancel={() => setConfirmCancellation(false)} onConfirm={() => void cancelAppointment()}/>
    {notice && <div className="appointment-live-toast">✓ {notice}<button onClick={() => setNotice("")}>×</button></div>}
  </main>;
}
