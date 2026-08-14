"use client";

import { useEffect, useState } from "react";

type Notice = { id: string; type: string; title: string; body: string; actionPath: string | null; resourceType: string | null; resourceId: string | null; status: string; readAt: string | null; createdAt: string };
type InboxData = { notifications: Notice[]; unreadCount: number; nextCursor: string | null };
type Filter = "all" | "unread";

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, init); const payload = await response.json().catch(() => ({})) as { data?: unknown; message?: string; error?: string };
  if (response.status === 401) { window.location.assign("/signin-with-chatgpt?return_to=/notifications"); throw new Error("Authentication required"); }
  if (!response.ok) throw new Error(payload.message || payload.error || "Request failed");
  return payload.data;
}

function typeLabel(type: string) { return type.replaceAll("_", " "); }
function icon(type: string) { return type === "appointment" ? "◷" : type === "provider_verification" ? "✓" : "●"; }

export default function Notifications() {
  const [data, setData] = useState<InboxData | null>(null); const [items, setItems] = useState<Notice[]>([]); const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true); const [loadingMore, setLoadingMore] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  function url(nextFilter = filter, cursor?: string | null) { const params = new URLSearchParams(); if (nextFilter === "unread") params.set("status", "unread"); if (cursor) params.set("cursor", cursor); return `/api/notifications?${params}`; }
  async function load(nextFilter = filter) { setLoading(true); setError(""); try { const next = await api(url(nextFilter)) as InboxData; setData(next); setItems(next.notifications); } catch (caught) { setError(caught instanceof Error ? caught.message : "Notifications unavailable"); } finally { setLoading(false); } }
  useEffect(() => { let active = true; const controller = new AbortController(); api("/api/notifications", { signal: controller.signal }).then((next) => { if (active) { const inbox = next as InboxData; setData(inbox); setItems(inbox.notifications); } }).catch((caught) => { if (active && (!(caught instanceof DOMException) || caught.name !== "AbortError")) setError(caught instanceof Error ? caught.message : "Notifications unavailable"); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; controller.abort(); }; }, []);
  async function changeFilter(next: Filter) { setFilter(next); await load(next); }
  async function markRead(item: Notice) {
    if (item.status !== "unread") return;
    try { await api("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_read", notificationId: item.id }) }); setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: "read", readAt: new Date().toISOString() } : row)); setData((current) => current ? { ...current, unreadCount: Math.max(0, current.unreadCount - 1) } : current); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Notification could not be updated"); }
  }
  async function markAll() {
    try { await api("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_all_read" }) }); setItems((current) => filter === "unread" ? [] : current.map((row) => ({ ...row, status: "read", readAt: new Date().toISOString() }))); setData((current) => current ? { ...current, unreadCount: 0 } : current); setNotice("All notifications marked as read"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Notifications could not be updated"); }
  }
  async function more() { if (!data?.nextCursor) return; setLoadingMore(true); try { const next = await api(url(filter, data.nextCursor)) as InboxData; setItems((current) => [...current, ...next.notifications]); setData((current) => current ? { ...next, unreadCount: current.unreadCount } : next); } catch (caught) { setError(caught instanceof Error ? caught.message : "More notifications could not be loaded"); } finally { setLoadingMore(false); } }

  return <main className="notification-shell" id="main-content"><header className="notification-header"><a href="/" className="brand"><img src="/brand/reyati-logo.svg" alt="Reyati"/></a><nav aria-label="Patient navigation"><a href="/">Home</a><a href="/providers">Find care</a><a href="/appointments">Appointments</a><a href="/wallet">Health records</a><a href="/support">Support</a></nav><div className="notification-header-actions"><a className="notification-back" href="/journeys">All journeys</a><span className="notification-avatar" aria-label="Reyati account">RY</span></div></header><section className="notification-hero"><div><p>COMMUNICATION CENTRE</p><h1>Notifications</h1><span>Account-owned updates from your real Reyati activity, with privacy-safe previews.</span></div>{Boolean(data?.unreadCount) && <button onClick={() => void markAll()}>✓ Mark all as read</button>}</section><section className="notification-content"><div className="notification-privacy"><span>♙</span><p><b>Privacy-safe previews</b>Notifications do not contain diagnoses, test results, clinical notes, or verification evidence. Open the protected workspace to view permitted details.</p></div>{error && <div className="notification-error">{error}<button type="button" onClick={() => void load()}>Try again</button></div>}<section className="notification-inbox live"><div className="inbox-head"><div><h2>Your inbox</h2><p>{data?.unreadCount ?? 0} unread</p></div><button onClick={() => void load()}>↻ Refresh</button></div><div className="inbox-tabs"><button className={filter === "all" ? "active" : ""} onClick={() => void changeFilter("all")}>All</button><button className={filter === "unread" ? "active" : ""} onClick={() => void changeFilter("unread")}>Unread <span>{data?.unreadCount ?? 0}</span></button></div><div className="notice-list">{loading ? <div className="empty-inbox"><span>◇</span><h3>Loading your notifications…</h3></div> : error ? <div className="empty-inbox error"><span>!</span><h3>Notifications unavailable</h3><p>Reyati could not confirm your latest inbox.</p></div> : items.length ? items.map((item) => <article className={item.status === "unread" ? "unread" : ""} key={item.id} onClick={() => void markRead(item)}><span className={`notice-icon ${item.type === "appointment" ? "k2" : "k1"}`}>{icon(item.type)}</span><div className="notice-copy"><div><i>{typeLabel(item.type)}</i><time>{new Date(item.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time></div><h3>{item.title}</h3><p>{item.body}</p>{item.actionPath && <a href={item.actionPath} onClick={(event) => { event.stopPropagation(); void markRead(item); }}>Open secure workspace →</a>}</div>{item.status === "unread" && <b className="unread-dot"/>}</article>) : <div className="empty-inbox"><span>✓</span><h3>Nothing waiting here</h3><p>{filter === "unread" ? "You have read every notification." : "New activity updates will appear here."}</p></div>}</div>{data?.nextCursor && <button className="notification-more" disabled={loadingMore} onClick={() => void more()}>{loadingMore ? "Loading…" : "Load 50 more"}</button>}</section></section>{notice && <div className="notification-toast"><span>✓</span>{notice}<button onClick={() => setNotice("")}>×</button></div>}</main>;
}
