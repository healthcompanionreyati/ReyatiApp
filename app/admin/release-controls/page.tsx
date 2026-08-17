"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import styles from "./release-controls.module.css";

type Proposal = {
  id: string; capabilityId: string; targetEnvironment: string; proposedState: boolean; owner: string; rationale: string;
  rollbackPlan: string; changeWindowStartsAt: string; changeWindowEndsAt: string; expiresAt: string; status: string;
  version: number; preparedByUserId: string; reviewedByUserId: string | null; reviewReasonCode: string | null;
  expired: boolean; independentReview: boolean; runtimeStateChanged: false;
};
type Evidence = { id: string; proposalId: string | null; eventCode: string; proposalVersion: number | null; reasonCode: string | null; createdAt: string };
type Data = { role: string; capabilityIds: string[]; environments: string[]; metrics: Record<string, number>; proposals: Proposal[]; evidence: Evidence[]; boundaries: Record<string, boolean> };
type Draft = { capabilityId: string; targetEnvironment: string; proposedState: boolean; owner: string; rationale: string; rollbackPlan: string; changeWindowStartsAt: string; changeWindowEndsAt: string; expiresAt: string };

const localDate = (hours: number) => {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000), offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const blankDraft = (): Draft => ({ capabilityId: "", targetEnvironment: "uat", proposedState: false, owner: "", rationale: "", rollbackPlan: "", changeWindowStartsAt: localDate(24), changeWindowEndsAt: localDate(26), expiresAt: localDate(72) });
const toLocal = (value: string) => { const date = new Date(value), offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); };

export default function ReleaseControlsPage() {
  const [lang, setLang] = useReyatiLocale(), ar = lang === "ar";
  const [data, setData] = useState<Data | null>(null), [draft, setDraft] = useState<Draft>(blankDraft), [editing, setEditing] = useState<{ id: string; version: number } | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({}), [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/release-controls", { cache: "no-store" }), payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error);
      setData(payload.data);
      setDraft((current) => current.capabilityId ? current : { ...current, capabilityId: payload.data.capabilityIds[0] ?? "" });
    } catch (cause) { setError(cause instanceof Error ? cause.message : ar ? "تعذر تحميل سجل ضوابط الإصدار." : "The release-control register could not be loaded."); }
  }, [ar]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function act(body: Record<string, unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/release-controls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error);
      setMessage(success); setReasons({}); await load(); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : ar ? "تعذر إكمال الإجراء." : "The action could not be completed."); return false; }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action = editing ? "revise" : "prepare", saved = await act({ action, ...draft, ...(editing ? { proposalId: editing.id, version: editing.version } : {}) }, ar ? "حُفظ مقترح الإثبات دون تغيير وقت التشغيل." : "Evidence proposal saved without changing runtime.");
    if (saved) { setEditing(null); setDraft({ ...blankDraft(), capabilityId: data?.capabilityIds[0] ?? "" }); }
  }
  function edit(item: Proposal) {
    setEditing({ id: item.id, version: item.version });
    setDraft({ capabilityId: item.capabilityId, targetEnvironment: item.targetEnvironment, proposedState: item.proposedState, owner: item.owner, rationale: item.rationale, rollbackPlan: item.rollbackPlan, changeWindowStartsAt: toLocal(item.changeWindowStartsAt), changeWindowEndsAt: toLocal(item.changeWindowEndsAt), expiresAt: toLocal(item.expiresAt) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const proposals = useMemo(() => (data?.proposals ?? []).filter((item) => statusFilter === "all" || item.status === statusFilter), [data, statusFilter]);
  const isAuditor = data?.role === "security_auditor";
  const copyStatus = (status: string) => ({ draft: ar ? "مسودة" : "Draft", pending_review: ar ? "قيد المراجعة" : "Pending review", approved: ar ? "إثبات معتمد" : "Approved evidence", returned: ar ? "مُعاد" : "Returned" }[status] ?? status);

  return <main className={styles.shell} dir={ar ? "rtl" : "ltr"}>
    <aside className={styles.sidebar}><a className={styles.brand} href="/admin"><img src="/brand/reyati-logo-white.svg" alt="Reyati" /></a><p>{ar ? "حوكمة المنصة" : "Platform governance"}</p><nav aria-label={ar ? "التنقل الإداري" : "Administration navigation"}><a href="/admin">{ar ? "نظرة عامة" : "Overview"}</a><a className={styles.active} href="/admin/release-controls" aria-current="page">{ar ? "ضوابط الإصدار" : "Release controls"}</a><a href="/admin/audit">{ar ? "سجل التدقيق" : "Audit ledger"}</a></nav><div className={styles.sideNote}>{ar ? "مسار إثبات فقط. لا تفعيل ولا نشر." : "Evidence workflow only. No activation or deployment."}</div></aside>
    <div className={styles.workspace}>
      <header className={styles.topbar}><div><span className={styles.eyebrow}>{ar ? "مراجعة مستقلة خاصة" : "Private independent review"}</span><h1>{ar ? "ضوابط إصدار المنصة" : "Platform release controls"}</h1><p>{ar ? "إعداد ومراجعة أدلة تغييرات الخصائص المعروفة دون لمس حالة التشغيل أو إعدادات البيئة." : "Prepare and review evidence for known capability changes without touching runtime state or environment configuration."}</p></div><button className={styles.locale} type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button></header>
      <section className={styles.boundary}><span aria-hidden="true">!</span><div><b>{ar ? "الاعتماد ليس تفعيلاً" : "Approval is not activation"}</b><p>{ar ? "لا يغيّر هذا السجل الخصائص، أو الأسرار، أو المستأجرين، أو إعدادات Sites، ولا يستدعي خدمة خارجية." : "This register never changes flags, secrets, tenants, Sites configuration, or calls an external service."}</p></div></section>
      {message && <div className={styles.success} role="status">{message}</div>}
      {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>{ar ? "إعادة المحاولة" : "Try again"}</button></div>}
      {!data && !error ? <section className={styles.loading} aria-live="polite"><span />{ar ? "جارٍ تحميل سجل الإصدار الخاص…" : "Loading the private release register…"}</section> : data && <>
        <section className={styles.metrics} aria-label={ar ? "مقاييس مجمعة" : "Aggregate metrics"}>{Object.entries(data.metrics).map(([key, value]) => <article key={key}><b>{value}</b><span>{key.replaceAll(/([A-Z])/g, " $1")}</span></article>)}</section>
        {!isAuditor && <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.eyebrow}>{ar ? "مساحة المُعدّ" : "Maker workspace"}</span><h2>{editing ? (ar ? "مراجعة المقترح المُعاد" : "Revise returned proposal") : (ar ? "إعداد مقترح تغيير" : "Prepare a change proposal")}</h2></div><span className={styles.role}>platform_admin</span></div><form className={styles.form} onSubmit={save}>
          <label>{ar ? "معرّف الخاصية المعروف" : "Known capability ID"}<select required value={draft.capabilityId} onChange={(event) => setDraft({ ...draft, capabilityId: event.target.value })}>{data.capabilityIds.map((id) => <option key={id} value={id}>{id}</option>)}</select></label>
          <label>{ar ? "البيئة المستهدفة" : "Target environment"}<select value={draft.targetEnvironment} onChange={(event) => setDraft({ ...draft, targetEnvironment: event.target.value })}>{data.environments.map((environment) => <option key={environment}>{environment}</option>)}</select></label>
          <label>{ar ? "الحالة المقترحة" : "Proposed state"}<select value={String(draft.proposedState)} onChange={(event) => setDraft({ ...draft, proposedState: event.target.value === "true" })}><option value="false">false</option><option value="true">true</option></select></label>
          <label>{ar ? "المالك المسؤول" : "Accountable owner"}<input required minLength={2} maxLength={160} value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} /></label>
          <label>{ar ? "بداية نافذة التغيير" : "Change window starts"}<input required type="datetime-local" value={draft.changeWindowStartsAt} onChange={(event) => setDraft({ ...draft, changeWindowStartsAt: event.target.value })} /></label>
          <label>{ar ? "نهاية نافذة التغيير" : "Change window ends"}<input required type="datetime-local" value={draft.changeWindowEndsAt} onChange={(event) => setDraft({ ...draft, changeWindowEndsAt: event.target.value })} /></label>
          <label>{ar ? "انتهاء صلاحية المقترح" : "Proposal expiry"}<input required type="datetime-local" value={draft.expiresAt} onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })} /></label>
          <label className={styles.wide}>{ar ? "مبرر التغيير" : "Change rationale"}<textarea required minLength={12} maxLength={1200} value={draft.rationale} onChange={(event) => setDraft({ ...draft, rationale: event.target.value })} /></label>
          <label className={styles.wide}>{ar ? "خطة التراجع الصريحة" : "Explicit rollback plan"}<textarea required minLength={20} maxLength={1600} value={draft.rollbackPlan} onChange={(event) => setDraft({ ...draft, rollbackPlan: event.target.value })} /></label>
          <div className={styles.formActions}>{editing && <button className={styles.secondary} type="button" onClick={() => { setEditing(null); setDraft({ ...blankDraft(), capabilityId: data.capabilityIds[0] ?? "" }); }}>{ar ? "إلغاء" : "Cancel"}</button>}<button className={styles.primary} disabled={busy} type="submit">{editing ? (ar ? "حفظ النسخة الجديدة" : "Save new version") : (ar ? "حفظ مسودة خاصة" : "Save private draft")}</button></div>
        </form></section>}
        <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.eyebrow}>{ar ? "دورة إثبات صريحة" : "Explicit evidence lifecycle"}</span><h2>{ar ? "سجل المقترحات" : "Proposal register"}</h2></div><select aria-label={ar ? "تصفية الحالة" : "Filter by status"} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">{ar ? "كل الحالات" : "All statuses"}</option>{["draft", "pending_review", "approved", "returned"].map((status) => <option value={status} key={status}>{copyStatus(status)}</option>)}</select></div>
          {!proposals.length ? <div className={styles.empty}><b>{ar ? "لا توجد مقترحات في هذا العرض" : "No proposals in this view"}</b><p>{ar ? "أنشئ مسودة أو اختر حالة أخرى." : "Prepare a draft or choose another status."}</p></div> : <div className={styles.register}>{proposals.map((item) => { const reason = reasons[item.id] ?? ""; return <article className={styles.card} key={item.id}><header><div><span className={styles.eyebrow}>{item.targetEnvironment} · {item.proposedState ? "enable" : "disable"}</span><h3>{item.capabilityId}</h3><span>{ar ? "المالك" : "Owner"}: {item.owner}</span></div><span className={`${styles.status} ${styles[item.status] ?? ""}`}>{copyStatus(item.status)}</span></header><div className={styles.details}><div><b>{ar ? "المبرر" : "Rationale"}</b><p>{item.rationale}</p></div><div><b>{ar ? "خطة التراجع" : "Rollback plan"}</b><p>{item.rollbackPlan}</p></div></div><div className={styles.meta}><span>v{item.version}</span><span>{new Date(item.changeWindowStartsAt).toLocaleString()} → {new Date(item.changeWindowEndsAt).toLocaleString()}</span><span>{ar ? "الانتهاء" : "Expires"}: {new Date(item.expiresAt).toLocaleString()}</span><span>{ar ? "مراجعة مستقلة" : "Independent review"}: {item.independentReview ? "✓" : "—"}</span><span>{ar ? "تغيير التشغيل" : "Runtime change"}: 0</span></div>
            {item.status === "pending_review" && <label className={styles.reason}>{ar ? "رمز سبب الإعادة" : "Return reason code"}<input maxLength={80} placeholder="rollback_incomplete" value={reason} onChange={(event) => setReasons({ ...reasons, [item.id]: event.target.value })} /></label>}
            <div className={styles.actions}>{!isAuditor && item.status === "draft" && <button className={styles.primary} disabled={busy || item.expired} type="button" onClick={() => void act({ action: "submit", proposalId: item.id, version: item.version }, ar ? "أُرسل المقترح للمراجعة المستقلة." : "Proposal submitted for independent review.")}>{ar ? "إرسال للمراجعة" : "Submit for review"}</button>}{!isAuditor && item.status === "returned" && <button className={styles.secondary} disabled={busy} type="button" onClick={() => edit(item)}>{ar ? "تعديل وإصدار نسخة" : "Edit and version"}</button>}{item.status === "pending_review" && <><button className={styles.primary} disabled={busy || item.expired} type="button" onClick={() => void act({ action: "review", decision: "approve", reasonCode: "controls_verified", proposalId: item.id, version: item.version }, ar ? "اعتمد الدليل فقط؛ لم يحدث تفعيل." : "Evidence approved; nothing was activated.")}>{ar ? "اعتماد كدليل فقط" : "Approve evidence only"}</button><button className={styles.secondary} disabled={busy || !reason} type="button" onClick={() => void act({ action: "review", decision: "return", reasonCode: reason, proposalId: item.id, version: item.version }, ar ? "أُعيد المقترح للمُعدّ." : "Proposal returned to maker.")}>{ar ? "إعادة للمُعدّ" : "Return to maker"}</button></>}</div>
          </article>; })}</div>}
        </section>
        <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.eyebrow}>{ar ? "ضمان اصطناعي" : "Synthetic assurance"}</span><h2>{ar ? "اختبار بلا آثار جانبية" : "Zero-side-effect rehearsal"}</h2><p>{ar ? "أكثر من عشرين سيناريو تتحقق من الحدود والأدوار والإصدارات دون تعديل مقترح أو خاصية." : "More than twenty scenarios verify boundaries, roles, and versioning without changing a proposal or capability."}</p></div><button className={styles.primary} disabled={busy} type="button" onClick={() => void act({ action: "run_rehearsal" }, ar ? "اكتمل الاختبار دون آثار تشغيلية." : "Rehearsal completed with zero operational side effects.")}>{ar ? "تشغيل الاختبار" : "Run rehearsal"}</button></div><div className={styles.evidence}><b>{ar ? "آخر الأدلة غير القابلة للتعديل" : "Latest immutable evidence"}</b>{!data.evidence.length ? <span>{ar ? "لا توجد أحداث بعد." : "No evidence events yet."}</span> : data.evidence.slice(0, 8).map((item) => <span key={item.id}><code>{item.eventCode}</code> {item.proposalVersion ? `v${item.proposalVersion}` : "suite"} · {new Date(item.createdAt).toLocaleString()}</span>)}</div></section>
      </>}
    </div>
  </main>;
}
