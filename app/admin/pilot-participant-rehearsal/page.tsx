"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import AdminNavigation from "@/app/components/AdminNavigation";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import styles from "./pilot-participant-rehearsal.module.css";

type Check = { id: string; label: string; passed: boolean; evidence: string };
type Plan = { id: string; clinicLabel: string; status: string; providerTarget: number; patientTarget: number; syntheticMemberCount: number; providerCount: number; patientCount: number; rehearsedCount: number; lastRehearsedAt: string | null; ready: boolean; checks: Check[] };
type Centre = { role: string; generatedAt: string; suiteVersion: string; invitationDelivered: false; participantAcceptanceRecorded: false; participantAccessGranted: false; cohortStateChanged: false; externalEffects: false; plans: Plan[]; selectedPlan: Plan | null };

const arabicChecks: Record<string, string> = {
  approved_scope: "نطاق تجريبي محدود ومعتمد",
  synthetic_provider: "مرشح اصطناعي من مقدمي الرعاية",
  synthetic_patient: "مرشح مريض اصطناعي",
  approved_enrollment: "أدلة تسجيل معتمدة",
  invitation_controls: "ضوابط دعوة مرتبطة بالهوية ومعتمدة",
  participation_controls: "ضوابط مشاركة معتمدة",
  withdrawal_evidence: "بروفات انسحاب وإلغاء وصول متحقق منها",
  runtime_boundary: "جميع أعلام تشغيل المشاركين معطلة",
  privacy_boundary: "الدليل يستبعد الهوية والبيانات السريرية",
  external_effects: "الإرسال الخارجي ومنح الوصول محظوران",
};

async function requestCentre(planId?: string) {
  const query = planId ? `?planId=${encodeURIComponent(planId)}` : "";
  const response = await fetch(`/api/admin/pilot-participant-rehearsal${query}`, { cache: "no-store", credentials: "same-origin" });
  const payload = await response.json().catch(() => ({})) as { data?: Centre; message?: string; error?: string };
  if (response.status === 401) {
    window.location.assign(`/sign-in?redirect_url=${encodeURIComponent("/admin/pilot-participant-rehearsal")}`);
    throw new Error("Authentication required");
  }
  if (!response.ok || !payload.data) throw new Error(payload.message || payload.error || "Participant rehearsal is unavailable");
  return payload.data;
}

export default function PilotParticipantRehearsalPage() {
  const [lang, setLang] = useReyatiLocale();
  const ar = lang === "ar";
  const [data, setData] = useState<Centre | null>(null);
  const [planId, setPlanId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (requestedPlanId?: string) => {
    setLoading(true); setError("");
    try {
      const next = await requestCentre(requestedPlanId);
      setData(next); setPlanId(next.selectedPlan?.id ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Participant rehearsal is unavailable"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function run() {
    if (!data?.selectedPlan) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/pilot-participant-rehearsal", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "run_synthetic_rehearsal", planId: data.selectedPlan.id, confirmZeroEffect: true }),
      });
      const payload = await response.json().catch(() => ({})) as { data?: { createdEvidence: number; alreadyComplete: boolean }; message?: string; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.message || payload.error || "Rehearsal could not be completed");
      setNotice(payload.data.alreadyComplete
        ? (ar ? "جميع رحلات المشاركين الاصطناعية موثقة بالفعل." : "Every synthetic participant journey is already evidenced.")
        : ar ? `اكتملت ${payload.data.createdEvidence} رحلات مشفرة دون أي تأثير خارجي.` : `${payload.data.createdEvidence} coded journeys completed with zero external effects.`);
      await load(data.selectedPlan.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Rehearsal could not be completed"); }
    finally { setBusy(false); }
  }

  const plan = data?.selectedPlan ?? null;
  const passed = plan?.checks.filter((item) => item.passed).length ?? 0;
  return <main className={styles.shell} dir={ar ? "rtl" : "ltr"} id="main-content">
    <aside className={styles.sidebar}>
      <a className={styles.brand} href="/admin"><Image src="/brand/qivaya-logo-reversed.png" alt="Qivaya" width={150} height={55} priority /></a>
      <span className={styles.sideLabel}>{ar ? "عمليات المنصة" : "Platform operations"}</span>
      <AdminNavigation ar={ar} />
      <div className={styles.sideBoundary}><b>{ar ? "بروفة دون تأثير" : "Zero-effect rehearsal"}</b><span>{ar ? "لا دعوة، ولا قبول، ولا وصول، ولا تغيير للحساب." : "No invitation, acceptance, access, or account change."}</span></div>
    </aside>
    <section className={styles.workspace}>
      <header className={styles.topbar}>
        <a href="/admin" className={styles.mobileBrand}><Image src="/brand/qivaya-logo-primary.png" alt="Qivaya" width={126} height={46} /></a>
        <div><span>{ar ? "ضمان المشاركين" : "PARTICIPANT ASSURANCE"}</span><b>{ar ? "رحلة اصطناعية. دليل حقيقي." : "Synthetic journey. Durable evidence."}</b></div>
        <nav><a href="/admin/pilot-activation">{ar ? "مركز التفعيل" : "Activation centre"}</a><button type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button></nav>
      </header>
      <div className={styles.content}>
        <section className={styles.hero}>
          <div><span className={styles.eyebrow}>{ar ? "بوابة ما قبل التشغيل" : "PRE-RUNTIME ASSURANCE"}</span><h1>{ar ? "بروفة رحلة المشارك" : "Participant Journey Rehearsal"}</h1><p>{ar ? "تحقق من الدعوة والقبول والوصول والانسحاب وإلغاء الصلاحية باستخدام حسابات اصطناعية فقط، مع بقاء جميع عمليات التشغيل الحقيقية معطلة." : "Prove invitation, acceptance, access, withdrawal, and revocation controls against synthetic accounts while every live runtime remains disabled."}</p></div>
          <div className={styles.score}><strong>{passed}/10</strong><span>{ar ? "فحوص مستوفاة" : "checks satisfied"}</span></div>
        </section>
        <section className={styles.boundary} aria-label={ar ? "حدود الأمان" : "Safety boundary"}><span>◇</span><div><b>{ar ? "نتيجة البروفة لا تمنح إذن التشغيل" : "A passing rehearsal is not runtime authorization"}</b><p>{ar ? "لا يتم إنشاء رمز دعوة أو إرسال بريد أو تسجيل قبول أو تغيير مجموعة أو منح وصول." : "No token is created, no email is sent, no acceptance is recorded, no cohort state changes, and no access is granted."}</p></div></section>
        {loading && <div className={styles.state}>{ar ? "جارٍ تحميل أدلة الخادم…" : "Loading server-derived evidence…"}</div>}
        {error && <div className={`${styles.alert} ${styles.error}`} role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>×</button></div>}
        {notice && <div className={`${styles.alert} ${styles.success}`} aria-live="polite"><span>✓ {notice}</span><button type="button" onClick={() => setNotice("")}>×</button></div>}
        {data && <>
          <section className={styles.controls}>
            <label>{ar ? "خطة البرنامج" : "Pilot plan"}<select value={planId} onChange={(event) => { setPlanId(event.target.value); void load(event.target.value); }}><option value="">{ar ? "اختر خطة" : "Select a plan"}</option>{data.plans.map((item) => <option value={item.id} key={item.id}>{item.clinicLabel} · {item.status}</option>)}</select></label>
            <div className={styles.actions}>{plan && <a href={`/api/admin/pilot-participant-rehearsal/evidence?planId=${encodeURIComponent(plan.id)}`}>{ar ? "تنزيل الدليل" : "Download evidence"}</a>}<button type="button" onClick={() => void load(planId)}>↻ {ar ? "تحديث" : "Refresh"}</button></div>
          </section>
          {plan ? <div className={styles.layout}>
            <section className={styles.checks}>
              <div className={styles.sectionHead}><div><span className={styles.eyebrow}>{ar ? "بوابات مشتقة من الخادم" : "SERVER-DERIVED GATES"}</span><h2>{ar ? "قائمة تحقق الرحلة" : "Journey assurance checklist"}</h2></div><span className={plan.ready ? styles.ready : styles.hold}>{plan.ready ? (ar ? "جاهز للبروفة" : "Ready to rehearse") : (ar ? "متوقف" : "Hold")}</span></div>
              <div className={styles.checkGrid}>{plan.checks.map((check, index) => <article key={check.id} className={check.passed ? styles.pass : styles.blocked}><span>{check.passed ? "✓" : String(index + 1).padStart(2, "0")}</span><div><b>{ar ? arabicChecks[check.id] : check.label}</b><small>{check.evidence}</small></div></article>)}</div>
            </section>
            <aside className={styles.runCard}>
              <span className={styles.eyebrow}>{ar ? "المجموعة الاصطناعية" : "SYNTHETIC COHORT"}</span><h2>{plan.clinicLabel}</h2>
              <div className={styles.metrics}><div><b>{plan.providerCount}</b><span>{ar ? "مقدمو رعاية" : "providers"}</span></div><div><b>{plan.patientCount}</b><span>{ar ? "مرضى" : "patients"}</span></div><div><b>{plan.rehearsedCount}</b><span>{ar ? "موثقون" : "evidenced"}</span></div></div>
              <ul><li>✓ {ar ? "تجربة ربط الهوية" : "Identity binding simulated"}</li><li>✓ {ar ? "تجربة القبول المحدود" : "Bounded acceptance simulated"}</li><li>✓ {ar ? "تجربة الإلغاء والانسحاب" : "Revocation and withdrawal simulated"}</li><li>✓ {ar ? "الهوية والبيانات السريرية مستبعدة" : "Identity and clinical data excluded"}</li></ul>
              {data.role === "platform_admin" && <button className={styles.primary} type="button" disabled={busy || !plan.ready} onClick={() => void run()}>{busy ? (ar ? "جارٍ التشغيل…" : "Running…") : plan.rehearsedCount === plan.syntheticMemberCount ? (ar ? "إعادة التحقق من الدليل" : "Recheck evidence") : (ar ? "تشغيل البروفة الاصطناعية" : "Run synthetic rehearsal")}</button>}
              {!plan.ready && <p className={styles.hint}>{ar ? "أكمل الفحوص المحظورة في مساحات البرنامج المرتبطة أولاً." : "Complete blocked checks in the linked pilot workspaces first."}</p>}
              <small>{plan.lastRehearsedAt ? `${ar ? "آخر بروفة" : "Last rehearsal"}: ${new Date(plan.lastRehearsedAt).toLocaleString(ar ? "ar-QA" : "en-QA")}` : (ar ? "لم تُشغل أي بروفة بعد" : "No rehearsal recorded yet")}</small>
            </aside>
          </div> : <div className={styles.state}><b>{ar ? "لا توجد خطة مؤهلة" : "No eligible pilot plan"}</b><p>{ar ? "اعتمد خطة محدودة من مركز التفعيل أولاً." : "Approve a bounded plan in the activation centre first."}</p><a href="/admin/pilot-activation">{ar ? "فتح مركز التفعيل" : "Open activation centre"}</a></div>}
        </>}
      </div>
    </section>
  </main>;
}
