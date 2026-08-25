"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import AdminNavigation from "@/app/components/AdminNavigation";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import styles from "./pilot-activation.module.css";

type StageStatus = "complete" | "action" | "waiting" | "blocked";
type Stage = { id: string; order: number; name: string; summary: string; href: string; status: StageStatus; progress: number; total: number; evidence: string; dependency?: string };
type Plan = { id: string; organizationName: string; clinicLabel: string; plannedStartAt: string; plannedEndAt: string; providerTarget: number; patientTarget: number; status: string };
type Organization = { id: string; name: string; type: string };
type Gate = { id: string; name: string; status: "cleared" | "blocked"; evidence: string; ownerNeeded: boolean; href: string };
type Centre = {
  role: string;
  generatedAt: string;
  runtimeMode: "controlled_rehearsal";
  realParticipantActivationEnabled: false;
  organizations: Organization[];
  plans: Plan[];
  selectedPlan: Plan | null;
  stages: Stage[];
  completedStageCount: number;
  totalStageCount: number;
  nextStage: Stage | null;
  readiness: { cleared: number; total: number; gates: Gate[] };
  syntheticStarter: { available: boolean; missingEnrollmentDrafts: number; missingMetricDrafts: number };
};

function isoDate(offsetDays: number) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

const arabicStage: Record<string, [string, string]> = {
  scope: ["نطاق البرنامج ودورته", "اعتماد المؤسسة المحدودة والتواريخ وحدود المجموعة المدعوة فقط."],
  cohort: ["مجموعة المرضى ومقدمي الرعاية", "ترشيح الحسابات المؤهلة دون منح وصول أو إرسال دعوات."],
  enrollment: ["أدلة التسجيل والموافقة", "اعتماد موافقة المريض واتفاقية مقدم الرعاية بشكل مستقل."],
  invitations: ["ضمانات الدعوة الآمنة", "ربط قواعد الدعوة بالأدلة المعتمدة مع بقاء الإرسال معطلاً."],
  participation: ["المشاركة والانسحاب", "اعتماد قواعد دورة الحياة والتحقق من بروفات الانسحاب الاصطناعية."],
  learning: ["مقاييس النجاح والتعلم", "اعتماد تعريفات القياس الستة دون إنشاء ادعاءات نتائج."],
  ownership: ["الملكية التشغيلية", "تعيين مالك أساسي واحتياطي مع أدلة بروفة حديثة."],
  monitoring: ["قبول المراقبة", "التحقق من السجلات والتحليلات والأداء ومسار تنبيهات الأمان."],
  recovery: ["بروفة التعافي المستضاف", "التحقق المستقل من استعادة اصطناعية ضمن أهداف التعافي."],
  launch: ["قرار الإطلاق واليوم الأول", "اعتماد الجاهزية والتراجع والتفويض وفحوص مركز القيادة."],
};

const statusCopy: Record<StageStatus, [string, string]> = {
  complete: ["Complete", "مكتمل"], action: ["Action needed", "إجراء مطلوب"], waiting: ["In review", "قيد المراجعة"], blocked: ["Blocked", "محظور"],
};

async function requestCentre(planId?: string) {
  const query = planId ? `?planId=${encodeURIComponent(planId)}` : "";
  const response = await fetch(`/api/admin/pilot-activation${query}`, { cache: "no-store", credentials: "same-origin" });
  const payload = await response.json().catch(() => ({})) as { data?: Centre; message?: string; error?: string };
  if (response.status === 401) {
    window.location.assign(`/sign-in?redirect_url=${encodeURIComponent("/admin/pilot-activation")}`);
    throw new Error("Authentication required");
  }
  if (!response.ok || !payload.data) throw new Error(payload.message || payload.error || "Pilot activation centre is unavailable");
  return payload.data;
}

export default function PilotActivationPage() {
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Pilot activation centre is unavailable"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function prepareFoundation() {
    if (!data?.selectedPlan) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/pilot-activation", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "prepare_synthetic_foundation", planId: data.selectedPlan.id }),
      });
      const payload = await response.json().catch(() => ({})) as { data?: { createdEnrollmentDrafts: number; createdMetricDrafts: number; alreadyPrepared: boolean }; message?: string; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.message || payload.error || "Synthetic foundation could not be prepared");
      setNotice(payload.data.alreadyPrepared
        ? (ar ? "المسودات الاصطناعية الأساسية موجودة بالفعل." : "The synthetic foundation drafts are already prepared.")
        : ar ? `تم إعداد ${payload.data.createdEnrollmentDrafts} مسودات تسجيل و${payload.data.createdMetricDrafts} مسودات قياس للمراجعة.` : `${payload.data.createdEnrollmentDrafts} enrollment drafts and ${payload.data.createdMetricDrafts} metric drafts are ready for review.`);
      await load(data.selectedPlan.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Synthetic foundation could not be prepared"); }
    finally { setBusy(false); }
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/pilot-activation", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "save_pilot_plan",
          organizationId: form.get("organizationId"),
          clinicLabel: form.get("clinicLabel"),
          plannedStartAt: form.get("plannedStartAt"),
          plannedEndAt: form.get("plannedEndAt"),
          providerTarget: Number(form.get("providerTarget")),
          patientTarget: Number(form.get("patientTarget")),
        }),
      });
      const payload = await response.json().catch(() => ({})) as { data?: { id: string }; message?: string; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.message || payload.error || "Pilot plan could not be created");
      setNotice(ar ? "تم إنشاء خطة محدودة كمسودة. أرسلها للمراجعة المستقلة من مساحة نطاق البرنامج." : "A bounded pilot draft is ready. Submit it for independent review in the scope workspace.");
      await load(payload.data.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Pilot plan could not be created"); }
    finally { setBusy(false); }
  }

  const completion = data ? Math.round((data.completedStageCount / Math.max(data.totalStageCount, 1)) * 100) : 0;
  const next = data?.nextStage ?? null;

  return <main className={styles.shell} dir={ar ? "rtl" : "ltr"} id="main-content">
    <aside className={styles.sidebar}>
      <a className={styles.brand} href="/admin"><Image src="/brand/qivaya-logo-reversed.png" alt="Qivaya" width={150} height={55} priority /></a>
      <span className={styles.sideLabel}>{ar ? "عمليات المنصة" : "Platform operations"}</span>
      <AdminNavigation ar={ar} />
      <div className={styles.sideBoundary}><b>{ar ? "بروفة مضبوطة فقط" : "Controlled rehearsal only"}</b><span>{ar ? "لا دعوات ولا وصول للمشاركين ولا تفعيل حقيقي." : "No invitations, participant access, or live activation."}</span></div>
    </aside>

    <section className={styles.workspace}>
      <header className={styles.topbar}>
        <a className={styles.mobileBrand} href="/admin"><Image src="/brand/qivaya-logo-primary.png" alt="Qivaya" width={128} height={47} /></a>
        <div><span className={styles.eyebrow}>{ar ? "مركز تنسيق البرنامج" : "CONTROLLED PILOT ORCHESTRATION"}</span><b>{ar ? "مسار واحد. أدلة واضحة." : "One plan. Clear evidence."}</b></div>
        <nav><a href="/admin/pilot-command">{ar ? "مركز القيادة" : "Command centre"}</a><button type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button></nav>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>{ar ? "مسار تفعيل آمن" : "SAFE ACTIVATION PATH"}</span>
            <h1>{ar ? "مركز تفعيل البرنامج التجريبي" : "Pilot Activation Centre"}</h1>
            <p>{ar ? "اجمع النطاق والمشاركين والموافقة والتشغيل والجاهزية في مسار واحد مستمد بالكامل من أدلة الخادم." : "Move from approved scope to day-zero readiness through one server-derived path across all ten pilot workspaces."}</p>
          </div>
          <div className={styles.heroStatus} aria-label={ar ? "نسبة اكتمال المسار" : "Activation path completion"}>
            <div className={styles.progressRing} style={{ "--progress": `${completion * 3.6}deg` } as CSSProperties}><span><b>{completion}%</b><small>{ar ? "مكتمل" : "complete"}</small></span></div>
            <div><b>{data ? `${data.completedStageCount}/${data.totalStageCount}` : "—"}</b><span>{ar ? "مراحل موثقة" : "evidenced stages"}</span></div>
          </div>
        </section>

        <section className={styles.boundary}>
          <span aria-hidden="true">◇</span><div><b>{ar ? "التجهيز لا يعني التفعيل" : "Preparation is not activation"}</b><p>{ar ? "يمكن لهذه المساحة إنشاء مسودات اصطناعية فقط. لا ترسل رسائل ولا تنشئ رموز دعوة ولا تمنح وصولاً ولا تبدأ برنامجاً حقيقياً." : "This workspace can create synthetic drafts only. It sends no message, creates no invitation token, grants no access, and cannot start a live pilot."}</p></div>
          <strong>{ar ? "الوضع: اصطناعي" : "SYNTHETIC MODE"}</strong>
        </section>

        {notice && <div className={styles.notice} role="status">✓ {notice}</div>}
        {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => void load(planId)}>{ar ? "إعادة المحاولة" : "Try again"}</button></div>}
        {loading && <div className={styles.loading} aria-live="polite"><span />{ar ? "جارٍ تجميع أدلة البرنامج…" : "Assembling the pilot evidence path…"}</div>}

        {data && !loading && <>
          {!data.selectedPlan && data.role === "platform_admin" ? <section className={styles.setup}>
            <div className={styles.setupCopy}><span className={styles.eyebrow}>{ar ? "الخطوة الأولى" : "START THE CONTROLLED PATH"}</span><h2>{ar ? "أنشئ نطاقاً اصطناعياً محدوداً" : "Create the bounded synthetic pilot plan"}</h2><p>{ar ? "اختر مؤسسة نشطة وحدد عيادة واحدة وفترة من ستة إلى ثمانية أسابيع. تحفظ هذه الخطوة مسودة فقط ولا ترسل دعوات أو تمنح وصولاً." : "Choose one active organization, one clinic, and a six-to-eight-week window. This saves a draft only—it sends no invitations and grants no access."}</p></div>
            {data.organizations.length ? <form className={styles.setupForm} onSubmit={createPlan}>
              <label>{ar ? "المؤسسة" : "Active organization"}<select name="organizationId" required defaultValue=""><option value="" disabled>{ar ? "اختر مؤسسة" : "Select organization"}</option>{data.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
              <label>{ar ? "العيادة أو القسم" : "Clinic or department"}<input name="clinicLabel" defaultValue="Qivaya Controlled Pilot Clinic" minLength={3} maxLength={100} pattern="[A-Za-z0-9 _.-]+" required /></label>
              <div className={styles.setupPair}><label>{ar ? "تاريخ البدء" : "Start date"}<input name="plannedStartAt" type="date" defaultValue={isoDate(14)} required /></label><label>{ar ? "تاريخ الانتهاء" : "End date"}<input name="plannedEndAt" type="date" defaultValue={isoDate(56)} required /></label></div>
              <div className={styles.setupPair}><label>{ar ? "مقدمو الرعاية" : "Provider target"}<input name="providerTarget" type="number" min={3} max={5} defaultValue={3} required /></label><label>{ar ? "المرضى الاصطناعيون" : "Synthetic patient target"}<input name="patientTarget" type="number" min={50} max={100} defaultValue={50} required /></label></div>
              <button type="submit" disabled={busy}>{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "إنشاء المسودة المحدودة" : "Create bounded draft")}</button>
            </form> : <div className={styles.setupEmpty}><b>{ar ? "لا توجد مؤسسة نشطة" : "No active organization is available"}</b><p>{ar ? "أكمل اعتماد مؤسسة واحدة أولاً." : "Complete one organization approval first."}</p><a href="/admin/organizations">{ar ? "فتح المؤسسات" : "Open organizations"} →</a></div>}
          </section> : <section className={styles.controlRow}>
            <label>{ar ? "خطة البرنامج" : "Pilot plan"}<select value={planId} onChange={(event) => { const value = event.target.value; setPlanId(value); void load(value); }}>{data.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.clinicLabel} · {plan.organizationName} · {plan.status}</option>)}</select></label>
            <div className={styles.planMeta}>{data.selectedPlan ? <><span>{new Date(data.selectedPlan.plannedStartAt).toLocaleDateString(lang)} → {new Date(data.selectedPlan.plannedEndAt).toLocaleDateString(lang)}</span><span>{data.selectedPlan.patientTarget} {ar ? "مرضى" : "patients"} · {data.selectedPlan.providerTarget} {ar ? "مقدمو رعاية" : "providers"}</span></> : <span>{ar ? "أنشئ خطة محدودة للبدء." : "Create a bounded pilot plan to begin."}</span>}</div>
            <button className={styles.refresh} type="button" onClick={() => void load(planId)}>↻ {ar ? "تحديث" : "Refresh"}</button>
          </section>}

          {next ? <section className={styles.nextAction}>
            <div className={styles.nextNumber}>{String(next.order).padStart(2, "0")}</div>
            <div><span className={styles.eyebrow}>{ar ? "الإجراء التالي الموصى به" : "RECOMMENDED NEXT ACTION"}</span><h2>{ar ? arabicStage[next.id]?.[0] ?? next.name : next.name}</h2><p>{next.dependency || next.evidence}</p></div>
            <a href={next.href}>{ar ? "فتح مساحة العمل" : "Open workspace"} <span aria-hidden="true">→</span></a>
          </section> : <section className={`${styles.nextAction} ${styles.allComplete}`}><div className={styles.nextNumber}>✓</div><div><span className={styles.eyebrow}>{ar ? "المسار مكتمل" : "PATH COMPLETE"}</span><h2>{ar ? "جميع المراحل العشر موثقة" : "All ten stages are evidenced"}</h2><p>{ar ? "راجع قرار الإطلاق ونافذة اليوم الأول قبل أي تغيير تشغيلي منفصل." : "Review the launch decision and day-zero window before any separate operational change."}</p></div><a href="/admin/pilot-review">{ar ? "مراجعة القرار" : "Review decision"} →</a></section>}

          {(data.syntheticStarter.missingEnrollmentDrafts > 0 || data.syntheticStarter.missingMetricDrafts > 0) && <section className={styles.starter}>
            <div><span className={styles.eyebrow}>{ar ? "بداية أسرع وآمنة" : "SAFE ACCELERATOR"}</span><h2>{ar ? "إعداد أساس البروفة الاصطناعية" : "Prepare the synthetic rehearsal foundation"}</h2><p>{ar ? "ينشئ مسودات قابلة للمراجعة للموافقة والقياس فقط، مع سجل تدقيق كامل وصفر آثار خارجية." : "Create reviewable consent and measurement drafts with an audit trail and zero external effects."}</p><small>{data.syntheticStarter.missingEnrollmentDrafts} {ar ? "مسودات تسجيل" : "enrollment drafts"} · {data.syntheticStarter.missingMetricDrafts} {ar ? "مسودات قياس" : "metric drafts"}</small></div>
            {data.syntheticStarter.available ? <button type="button" disabled={busy} onClick={() => void prepareFoundation()}>{busy ? (ar ? "جارٍ الإعداد…" : "Preparing…") : (ar ? "إعداد المسودات الاصطناعية" : "Prepare synthetic drafts")}</button> : <span className={styles.roleTag}>{data.role.replaceAll("_", " ")}</span>}
          </section>}

          <section className={styles.stageSection}>
            <div className={styles.sectionHead}><div><span className={styles.eyebrow}>{ar ? "المسار الموحّد" : "TEN-STAGE ACTIVATION PATH"}</span><h2>{ar ? "من النطاق إلى قيادة اليوم الأول" : "From scope to day-zero command"}</h2></div><span>{data.completedStageCount} / {data.totalStageCount}</span></div>
            <div className={styles.stageGrid}>{data.stages.map((item) => {
              const copy = arabicStage[item.id];
              const percent = Math.round((item.progress / Math.max(item.total, 1)) * 100);
              return <article className={`${styles.stageCard} ${styles[item.status]}`} key={item.id}>
                <header><span className={styles.stageNumber}>{String(item.order).padStart(2, "0")}</span><span className={styles.status}>{ar ? statusCopy[item.status][1] : statusCopy[item.status][0]}</span></header>
                <h3>{ar ? copy?.[0] ?? item.name : item.name}</h3><p>{ar ? copy?.[1] ?? item.summary : item.summary}</p>
                <div className={styles.progress}><span style={{ width: `${Math.min(percent, 100)}%` }} /></div>
                <div className={styles.evidence}><b>{item.progress}/{item.total}</b><span>{item.evidence}</span></div>
                {item.dependency && <small className={styles.dependency}>! {item.dependency}</small>}
                <a href={item.href}>{item.status === "complete" ? (ar ? "عرض الدليل" : "View evidence") : (ar ? "متابعة المرحلة" : "Continue stage")} <span aria-hidden="true">→</span></a>
              </article>;
            })}</div>
          </section>

          <section className={styles.gates}>
            <div className={styles.sectionHead}><div><span className={styles.eyebrow}>{ar ? "قرار الخادم" : "SERVER-DERIVED READINESS"}</span><h2>{ar ? "بوابات الجاهزية المستقلة" : "Independent readiness gates"}</h2><p>{ar ? "لا يمكن تجاوز هذه الإشارات من الواجهة." : "These signals cannot be overridden by the interface."}</p></div><span>{data.readiness.cleared}/{data.readiness.total}</span></div>
            <div className={styles.gateGrid}>{data.readiness.gates.map((gate) => <a href={gate.href} className={gate.status === "cleared" ? styles.gateClear : styles.gateBlocked} key={gate.id}><span>{gate.status === "cleared" ? "✓" : "!"}</span><div><b>{gate.name}</b><small>{gate.evidence}</small></div><i>{gate.status}</i></a>)}</div>
          </section>
        </>}
      </div>
    </section>
  </main>;
}
