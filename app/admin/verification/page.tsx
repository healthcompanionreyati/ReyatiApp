"use client";

import { useReyatiLocale } from "@/app/components/useReyatiLocale";

import { useEffect, useState } from "react";
import ConfirmActionDialog from "@/app/components/ConfirmActionDialog";

type VerificationCase = {
  providerId: string; providerName: string; providerEmail: string; organizationId: string;
  organizationName: string; licenseReference: string; specialty: string; submittedAt: string; updatedAt: string;
  membershipStatus: string; membershipRole: string;
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, init); const payload = await response.json().catch(() => ({})) as { data?: unknown; message?: string; error?: string };
  if (response.status === 401) { window.location.assign("/signin-with-chatgpt?return_to=/admin/verification"); throw new Error("Authentication required"); }
  if (!response.ok || payload.data === undefined) { const error = new Error(payload.message || payload.error || "Request failed"); (error as Error & { status?: number }).status = response.status; throw error; }
  return payload.data;
}

export default function VerificationWorkspace() {
  const [lang, setLang] = useReyatiLocale();
  const [cases, setCases] = useState<VerificationCase[]>([]);
  const [selected, setSelected] = useState<VerificationCase | null>(null);
  const [role, setRole] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmReject, setConfirmReject] = useState(false);
  const ar = lang === "ar";

  async function load() {
    try {
      setError(""); const data = await request("/api/admin/verification") as { role: string; cases: VerificationCase[] };
      setRole(data.role); setCases(data.cases); setSelected((current) => data.cases.find((item) => item.providerId === current?.providerId) ?? data.cases[0] ?? null); setForbidden(false);
    } catch (caught) {
      if ((caught as Error & { status?: number }).status === 403) setForbidden(true);
      else setError(caught instanceof Error ? caught.message : "Unable to load verification queue");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    request("/api/admin/verification").then((data) => {
      if (!active) return; const queue = data as { role: string; cases: VerificationCase[] };
      setRole(queue.role); setCases(queue.cases); setSelected(queue.cases[0] ?? null);
    }).catch((caught) => { if (!active) return; if ((caught as Error & { status?: number }).status === 403) setForbidden(true); else setError(caught instanceof Error ? caught.message : "Unable to load verification queue"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function decide(decision: "approved" | "rejected") {
    if (!selected || saving) return; setSaving(true); setError("");
    try {
      await request("/api/admin/verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: selected.providerId, decision, notes }) });
      setNotice(decision === "approved" ? (ar ? "تم اعتماد التحقق" : "Provider verification approved") : (ar ? "تم رفض التحقق وإلغاء النشر" : "Verification rejected and publication withdrawn"));
      setConfirmReject(false); setNotes(""); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Decision could not be saved"); }
    finally { setSaving(false); }
  }

  return <main className={`verify-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"}>
    <aside className="verify-sidebar"><a href="/" className="provider-logo"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati" /><span>{ar ? "عمليات المنصة" : "Platform operations"}</span></a><div className="verify-role"><span>VR</span><div><b>{ar ? "مراجع التحقق" : "Verification reviewer"}</b><small>{role ? role.replaceAll("_", " ") : (ar ? "صلاحية مستقلة مطلوبة" : "Independent role required")}</small></div></div><nav><a href="/admin"><span>◫</span>{ar ? "نظرة عامة" : "Overview"}</a><a className="active" href="/admin/verification"><span>✓</span>{ar ? "التحقق" : "Verification"}<i>{cases.length}</i></a><a href="/admin/audit"><span>▤</span>{ar ? "التدقيق" : "Audit"}</a></nav><div className="verify-side-note"><span>▣</span><p><b>{ar ? "فصل الصلاحيات" : "Separation of duties"}</b>{ar ? "لا يمكن لمراجع التحقق نشر خدمة أو تغيير أدلة مقدم الطلب." : "Verification reviewers cannot publish services or alter applicant evidence."}</p></div></aside>
    <section className="verify-main"><header className="verify-top"><div><span>{ar ? "بيئة إنتاج محمية" : "PROTECTED OPERATIONS"}</span><b>{ar ? "قرارات حقيقية ومسجلة" : "Live, audited decisions"}</b></div><div><button onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications" aria-label="Notifications">●</a><span>VR</span></div></header><div className="verify-workspace">
      <div className="verify-heading"><div><p>{ar ? "الثقة والامتثال" : "TRUST & COMPLIANCE"}</p><h1>{ar ? "التحقق من مقدمي الرعاية" : "Provider verification"}</h1><span>{ar ? "راجع الترخيص والانتماء قبل السماح بإنشاء خدمات قابلة للحجز." : "Review licence and affiliation before a provider can create bookable services."}</span></div><button onClick={load}>↻ {ar ? "تحديث القائمة" : "Refresh queue"}</button></div>
      <div className="verify-security"><span>▣</span><p><b>{ar ? "بيانات الترخيص محمية" : "Licence data is protected"}</b>{ar ? "يقتصر الوصول على أدوار المنصة المستقلة، ويسجل كل قرار." : "Access is limited to independent platform roles and every decision is recorded."}</p><i>{ar ? "وصول مقيد" : "ROLE SCOPED"}</i></div>
      {loading && <div className="verify-live-state"><span>◇</span><h2>{ar ? "جارٍ تحميل قائمة التحقق…" : "Loading verification queue…"}</h2></div>}
      {!loading && forbidden && <div className="verify-live-state restricted"><span>♙</span><h2>{ar ? "صلاحية المراجع مطلوبة" : "Reviewer access is required"}</h2><p>{ar ? "يجب تعيين دور مراجع تحقق أو مسؤول منصة لهذا الحساب خارج مسار مقدم الرعاية." : "This account must be assigned an active verification reviewer or platform administrator role outside the provider workflow."}</p></div>}
      {!loading && !forbidden && error && <div className="verify-live-state error"><span>!</span><h2>{ar ? "تعذر تحميل قائمة التحقق" : "Verification queue unavailable"}</h2><p>{error}</p></div>}
      {!loading && !forbidden && !error && cases.length === 0 && <div className="verify-live-state"><span>✓</span><h2>{ar ? "لا توجد طلبات معلقة" : "The queue is clear"}</h2><p>{ar ? "ستظهر طلبات مقدمي الرعاية الجديدة هنا بعد إرسالها." : "New provider applications will appear here after submission."}</p></div>}
      {!loading && !forbidden && cases.length > 0 && <section className="verify-layout"><div className="queue-panel"><div className="verify-tools"><div><button className="active">{ar ? "معلق" : "Pending"} <span>{cases.length}</span></button></div></div><div className="verify-table"><header><span>{ar ? "المتقدم" : "Applicant"}</span><span>{ar ? "المنشأة" : "Organization"}</span><span>{ar ? "التخصص" : "Specialty"}</span><span>{ar ? "الحالة" : "Status"}</span><span>{ar ? "تاريخ الإرسال" : "Submitted"}</span><span /><span /></header>{cases.map((item) => <button className={selected?.providerId === item.providerId ? "selected" : ""} onClick={() => { setSelected(item); setNotes(""); setConfirmReject(false); }} key={item.providerId}><div><b>{item.providerName}</b><small>{item.providerEmail}</small></div><span>{item.organizationName}</span><span>{item.specialty}</span><i className={item.membershipStatus === "active" ? "normal" : "high"}>{item.membershipStatus}</i><strong>{new Date(item.submittedAt).toLocaleDateString()}</strong><span>›</span></button>)}</div></div>
        {selected && <aside className="review-panel"><div className="review-head"><div><p>{ar ? "طلب مقدم رعاية" : "Provider application"}</p><h2>{selected.providerName}</h2><span>{selected.organizationName}</span></div><i className="normal">Pending</i></div><section className="identity-summary"><span>{selected.providerName.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><div><b>{selected.specialty}</b><p>{selected.providerEmail}</p><small>{selected.organizationName}</small></div></section><section className="evidence-checks"><h3>{ar ? "بيانات المراجعة" : "Review facts"}</h3><article><span className="review">!</span><div><b>{ar ? "مرجع الترخيص" : "Licence reference"}</b><small>{selected.licenseReference}</small></div><i>{ar ? "يتطلب فحص المصدر" : "Source check required"}</i></article><article><span className={selected.membershipStatus === "active" ? "pass" : "review"}>{selected.membershipStatus === "active" ? "✓" : "!"}</span><div><b>{ar ? "الانتماء للمنشأة" : "Organization affiliation"}</b><small>{selected.organizationName} · {selected.membershipRole.replaceAll("_", " ")}</small></div><i>{selected.membershipStatus}</i></article></section><div className="source-note"><span>ⓘ</span><p><b>{ar ? "المصدر الأولي مطلوب" : "Primary source required"}</b>{ar ? "لا تعتمد القرار على المرجع المقدم وحده. تحقق من الجهة الرسمية قبل الموافقة." : "Do not approve from the submitted reference alone. Confirm status with the authoritative source."}</p></div><label className="decision-reason">{ar ? "ملاحظة القرار" : "Auditable decision note"}<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} placeholder={ar ? "اكتب نتيجة فحص المصدر بوضوح…" : "Record the source check and rationale…"} /></label><div className="review-actions"><button disabled={saving || notes.trim().length < 10} onClick={() => setConfirmReject(true)}>{ar ? "رفض" : "Reject"}</button><button disabled={saving || notes.trim().length < 10 || selected.membershipStatus !== "active"} onClick={() => decide("approved")}>✓ {ar ? "اعتماد" : "Approve"}</button></div></aside>}
      </section>}
    </div></section>{notice && <div className="verify-toast"><span>✓</span>{notice}</div>}
    <ConfirmActionDialog locale={lang} open={Boolean(selected && confirmReject)} title={ar ? "رفض طلب التحقق؟" : `Reject ${selected?.providerName ?? "this provider"}?`} description={ar ? "سيتم تسجيل ملاحظة القرار وإزالة مقدم الرعاية من قائمة التحقق." : "The decision note will be recorded and the provider will leave the verification queue."} consequence={ar ? "سيتم سحب النشر. يجب على مقدم الرعاية إعادة التقديم قبل أن يمكن التحقق منه لاحقًا." : "Publication will be withdrawn. The provider must submit again before they can be verified later."} confirmLabel={ar ? "رفض التحقق" : "Reject verification"} busyLabel={ar ? "جارٍ الرفض…" : "Rejecting…"} busy={saving} onCancel={() => setConfirmReject(false)} onConfirm={() => void decide("rejected")}/>
  </main>;
}
