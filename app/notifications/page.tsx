"use client";

import { useEffect, useState } from "react";
import PatientHeader from "@/app/components/PatientHeader";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";

type Notice = { id: string; type: string; title: string; body: string; actionPath: string | null; resourceType: string | null; resourceId: string | null; status: string; readAt: string | null; createdAt: string };
type InboxData = { notifications: Notice[]; unreadCount: number; nextCursor: string | null };
type Filter = "all" | "unread";

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({})) as { data?: unknown; message?: string; error?: string };
  if (response.status === 401) {
    window.location.assign("/sign-in?redirect_url=/notifications");
    throw new Error("Authentication required");
  }
  if (!response.ok) throw new Error(payload.message || payload.error || "Request failed");
  return payload.data;
}

function typeLabel(type: string, ar: boolean) {
  const labels: Record<string, string> = { appointment: "موعد", provider_verification: "التحقق من مقدم الرعاية", account: "الحساب", support: "الدعم", payment: "الدفع" };
  return ar ? labels[type] || type.replaceAll("_", " ") : type.replaceAll("_", " ");
}

function icon(type: string) {
  return type === "appointment" ? "◷" : type === "provider_verification" ? "✓" : "●";
}

export default function Notifications() {
  const [lang, setLang] = useReyatiLocale();
  const ar = lang === "ar";
  const [data, setData] = useState<InboxData | null>(null);
  const [items, setItems] = useState<Notice[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function url(nextFilter = filter, cursor?: string | null) {
    const params = new URLSearchParams();
    if (nextFilter === "unread") params.set("status", "unread");
    if (cursor) params.set("cursor", cursor);
    return `/api/notifications?${params}`;
  }

  async function load(nextFilter = filter) {
    setLoading(true); setError("");
    try {
      const next = await api(url(nextFilter)) as InboxData;
      setData(next); setItems(next.notifications);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Notifications unavailable");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    api("/api/notifications", { signal: controller.signal }).then((next) => {
      if (active) { const inbox = next as InboxData; setData(inbox); setItems(inbox.notifications); }
    }).catch((caught) => {
      if (active && (!(caught instanceof DOMException) || caught.name !== "AbortError")) setError(caught instanceof Error ? caught.message : "Notifications unavailable");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, []);

  async function changeFilter(next: Filter) { setFilter(next); await load(next); }
  async function markRead(item: Notice) {
    if (item.status !== "unread") return;
    try {
      await api("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_read", notificationId: item.id }) });
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: "read", readAt: new Date().toISOString() } : row));
      setData((current) => current ? { ...current, unreadCount: Math.max(0, current.unreadCount - 1) } : current);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Notification could not be updated"); }
  }
  async function markAll() {
    try {
      await api("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_all_read" }) });
      setItems((current) => filter === "unread" ? [] : current.map((row) => ({ ...row, status: "read", readAt: new Date().toISOString() })));
      setData((current) => current ? { ...current, unreadCount: 0 } : current); setNotice("All notifications marked as read");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Notifications could not be updated"); }
  }
  async function more() {
    if (!data?.nextCursor) return;
    setLoadingMore(true);
    try {
      const next = await api(url(filter, data.nextCursor)) as InboxData;
      setItems((current) => [...current, ...next.notifications]);
      setData((current) => current ? { ...next, unreadCount: current.unreadCount } : next);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "More notifications could not be loaded"); }
    finally { setLoadingMore(false); }
  }

  return <main className={`notification-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"} id="main-content">
    <PatientHeader ar={ar} displayName={ar ? "عضو كيفايا" : "Qivaya member"} onLocaleChange={() => setLang(ar ? "en" : "ar")} active="messages" />
    <nav className="patient-context-nav" aria-label={ar ? "روابط الإشعارات" : "Notification tools"}><a href="/settings/communications">{ar ? "تفضيلات التواصل" : "Communication preferences"}</a><a href="/journeys">{ar ? "كل الرحلات" : "All journeys"}</a></nav>
    <section className="notification-hero"><div><p>{ar ? "مركز الاتصال" : "COMMUNICATION CENTRE"}</p><h1>{ar ? "الإشعارات" : "Notifications"}</h1><span>{ar ? "تحديثات مملوكة لحسابك من نشاطك الحقيقي في كيفايا، مع معاينات تحمي الخصوصية." : "Account-owned updates from your real Qivaya activity, with privacy-safe previews."}</span></div>{Boolean(data?.unreadCount) && <button onClick={() => void markAll()}>✓ {ar ? "تحديد الكل كمقروء" : "Mark all as read"}</button>}</section>
    <section className="notification-content">
      <div className="notification-privacy"><span>♙</span><p><b>{ar ? "معاينات تحمي الخصوصية" : "Privacy-safe previews"}</b>{ar ? "لا تتضمن الإشعارات تشخيصات أو نتائج فحوصات أو ملاحظات سريرية أو أدلة تحقق. افتح مساحة العمل المحمية لعرض التفاصيل المسموح بها." : "Notifications do not contain diagnoses, test results, clinical notes, or verification evidence. Open the protected workspace to view permitted details."}</p></div>
      {error && <div className="notification-error">{error}<button type="button" onClick={() => void load()}>{ar ? "حاول مرة أخرى" : "Try again"}</button></div>}
      <section className="notification-inbox live">
        <div className="inbox-head"><div><h2>{ar ? "صندوق الوارد" : "Your inbox"}</h2><p>{data?.unreadCount ?? 0} {ar ? "غير مقروء" : "unread"}</p></div><button onClick={() => void load()}>↻ {ar ? "تحديث" : "Refresh"}</button></div>
        <div className="inbox-tabs"><button className={filter === "all" ? "active" : ""} onClick={() => void changeFilter("all")}>{ar ? "الكل" : "All"}</button><button className={filter === "unread" ? "active" : ""} onClick={() => void changeFilter("unread")}>{ar ? "غير مقروء" : "Unread"} <span>{data?.unreadCount ?? 0}</span></button></div>
        <div className="notice-list">{loading ? <div className="empty-inbox"><span>◇</span><h3>{ar ? "جارٍ تحميل إشعاراتك…" : "Loading your notifications…"}</h3></div> : error ? <div className="empty-inbox error"><span>!</span><h3>{ar ? "الإشعارات غير متاحة" : "Notifications unavailable"}</h3><p>{ar ? "تعذر على كيفايا تأكيد أحدث محتويات صندوق الوارد." : "Qivaya could not confirm your latest inbox."}</p></div> : items.length ? items.map((item) => <article className={item.status === "unread" ? "unread" : ""} key={item.id} onClick={() => void markRead(item)}><span className={`notice-icon ${item.type === "appointment" ? "k2" : "k1"}`}>{icon(item.type)}</span><div className="notice-copy"><div><i>{typeLabel(item.type, ar)}</i><time>{new Date(item.createdAt).toLocaleString(ar ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short" })}</time></div><h3>{item.title}</h3><p>{item.body}</p>{item.actionPath && <a href={item.actionPath} onClick={(event) => { event.stopPropagation(); void markRead(item); }}>{ar ? "افتح مساحة العمل الآمنة ←" : "Open secure workspace →"}</a>}</div>{item.status === "unread" && <b className="unread-dot" />}</article>) : <div className="empty-inbox"><span>✓</span><h3>{ar ? "لا يوجد شيء بانتظارك" : "Nothing waiting here"}</h3><p>{filter === "unread" ? (ar ? "لقد قرأت كل الإشعارات." : "You have read every notification.") : (ar ? "ستظهر تحديثات النشاط الجديدة هنا." : "New activity updates will appear here.")}</p></div>}</div>
        {data?.nextCursor && <button className="notification-more" disabled={loadingMore} onClick={() => void more()}>{loadingMore ? (ar ? "جارٍ التحميل…" : "Loading…") : (ar ? "تحميل ٥٠ إشعاراً إضافياً" : "Load 50 more")}</button>}
      </section>
    </section>
    {notice && <div className="notification-toast"><span>✓</span>{ar ? "تم تحديد كل الإشعارات كمقروءة" : notice}<button onClick={() => setNotice("")}>×</button></div>}
  </main>;
}
