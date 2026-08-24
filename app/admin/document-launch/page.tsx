"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import styles from "./document-launch.module.css";

type Stage = {
  id: string;
  group: "governance" | "runtime" | "authorization";
  title: string;
  titleAr: string;
  detail: string;
  detailAr: string;
  action: string;
  actionAr: string;
  href: string;
  passed: boolean;
  current: number;
  target: number;
  order: number;
  state: "complete" | "next" | "blocked";
};

type Workspace = {
  role: string;
  generatedAt: string;
  workflowVersion: string;
  completion: number;
  completed: number;
  total: number;
  decision: "authorized" | "evidence_required";
  nextStage: Stage | null;
  stages: Stage[];
  activeCertificate: { reference: string; releaseEndsAt: string } | null;
};

const groupNames = {
  governance: ["Governance foundation", "أساس الحوكمة"],
  runtime: ["Protected runtime", "التشغيل المحمي"],
  authorization: ["Independent authorization", "التفويض المستقل"],
} as const;

function stateLabel(stage: Stage, ar: boolean) {
  if (stage.state === "complete") return ar ? "مكتمل" : "Complete";
  if (stage.state === "next") return ar ? "الإجراء التالي" : "Next action";
  return ar ? "بانتظار المتطلبات" : "Waiting";
}

export default function DocumentLaunchPage() {
  const [lang, setLang] = useReyatiLocale();
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const ar = lang === "ar";
  const t = (en: string, arabic: string) => ar ? arabic : en;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/document-launch", { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json() as { data?: Workspace; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error === "forbidden" ? "This workspace requires platform operations access." : "Unable to load launch readiness.");
      setData(payload.data);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load launch readiness.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; };
  }, [load]);

  return <main className={styles.shell} dir={ar ? "rtl" : "ltr"} id="main-content">
    <aside className={styles.side}>
      <a className={styles.brand} href="/admin"><Image src="/brand/qivaya-logo-reversed.png" alt="Qivaya" width={148} height={56}/></a>
      <p className={styles.sideLabel}>{t("MEDICAL DOCUMENT LAUNCH", "إطلاق المستندات الطبية")}</p>
      <div className={styles.sideDecision} data-authorized={data?.decision === "authorized"}>
        <span aria-hidden="true">{data?.decision === "authorized" ? "✓" : "◇"}</span>
        <div><b>{data?.decision === "authorized" ? t("Release authorized", "الإطلاق مفوض") : t("Evidence required", "الدليل مطلوب")}</b><small>{data ? `${data.completed}/${data.total} ${t("gates complete", "بوابة مكتملة")}` : t("Reading live posture", "قراءة الوضع المباشر")}</small></div>
      </div>
      <nav aria-label={t("Document launch navigation", "تنقل إطلاق المستندات")}>
        <a href="/admin">{t("Operations overview", "نظرة عامة على العمليات")}</a>
        <a href="/admin/ownership">{t("Ownership", "الملكية")}</a>
        <a href="/admin/data-lifecycle">{t("Lifecycle policy", "سياسة دورة الحياة")}</a>
        <a href="/admin/document-activation">{t("Activation", "التفعيل")}</a>
        <a href="/admin/document-assurance">{t("Assurance", "الضمان")}</a>
        <a href="/admin/data-lifecycle-acceptance">{t("Acceptance", "القبول")}</a>
        <a className={styles.active} href="/admin/document-launch" aria-current="page">{t("Launch command", "قيادة الإطلاق")}</a>
        <a href="/admin/document-release">{t("Release certificate", "شهادة الإطلاق")}</a>
      </nav>
      <div className={styles.boundary}><span aria-hidden="true">⌁</span><div><b>{t("Read-only coordination", "تنسيق للقراءة فقط")}</b><p>{t("This centre reads aggregate evidence. It cannot change Vercel, R2, scanner settings, patient records, or launch traffic.", "يقرأ هذا المركز الأدلة المجمعة ولا يمكنه تغيير Vercel أو R2 أو إعدادات الماسح أو سجلات المرضى أو إطلاق الحركة.")}</p></div></div>
    </aside>

    <section className={styles.workspace}>
      <header className={styles.topbar}>
        <div><span className={styles.liveDot} aria-hidden="true"/><b>{t("Live production evidence", "دليل الإنتاج المباشر")}</b><small>{data ? new Intl.DateTimeFormat(ar ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.generatedAt)) : "—"}</small></div>
        <div className={styles.topActions}><button type="button" onClick={() => void load()} disabled={loading}>{loading ? t("Reading…", "جارٍ القراءة…") : t("Refresh", "تحديث")}</button><button type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "EN" : "العربية"}</button></div>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}><p>{data?.workflowVersion ?? "medical-document-launch-readiness-v1"}</p><h1>{t("One command centre. One safe path to launch.", "مركز قيادة واحد. مسار آمن واحد للإطلاق.")}</h1><span>{t("Live evidence is ordered into a single operational sequence. Complete the highlighted action, return here, and the next dependency unlocks automatically.", "تم ترتيب الأدلة المباشرة في تسلسل تشغيلي واحد. أكمل الإجراء المحدد ثم عد هنا ليُفتح المتطلب التالي تلقائياً.")}</span></div>
          <div className={styles.progressCard} aria-label={t("Launch completion", "اكتمال الإطلاق")}>
            <div className={styles.ring} style={{ "--progress": `${data?.completion ?? 0}%` } as CSSProperties}><b>{data?.completion ?? 0}%</b></div>
            <div><span>{t("launch evidence", "دليل الإطلاق")}</span><strong>{data?.completed ?? 0} / {data?.total ?? 13}</strong><small>{t("live gates complete", "بوابات مباشرة مكتملة")}</small></div>
          </div>
        </section>

        {error ? <div className={styles.error} role="alert"><div><b>{t("Live evidence is unavailable", "الدليل المباشر غير متاح")}</b><span>{error}</span></div><button type="button" onClick={() => void load()}>{t("Try again", "حاول مجدداً")}</button></div> : null}

        <section className={styles.nextPanel} data-authorized={data?.decision === "authorized"}>
          <div className={styles.nextIcon} aria-hidden="true">{data?.decision === "authorized" ? "✓" : "→"}</div>
          <div><p>{data?.decision === "authorized" ? t("CURRENT DECISION", "القرار الحالي") : t("NEXT REQUIRED ACTION", "الإجراء المطلوب التالي")}</p><h2>{data?.activeCertificate ? t("Bounded release certificate is active", "شهادة الإطلاق المحدودة نشطة") : data?.nextStage ? (ar ? data.nextStage.titleAr : data.nextStage.title) : t("Reading production evidence", "قراءة دليل الإنتاج")}</h2><span>{data?.activeCertificate ? `${data.activeCertificate.reference} · ${t("expires", "تنتهي")} ${new Intl.DateTimeFormat(ar ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.activeCertificate.releaseEndsAt))}` : data?.nextStage ? (ar ? data.nextStage.detailAr : data.nextStage.detail) : t("The first unresolved dependency will appear here.", "سيظهر أول متطلب غير مكتمل هنا.")}</span></div>
          {data?.nextStage ? <a href={data.nextStage.href}>{ar ? data.nextStage.actionAr : data.nextStage.action}<span aria-hidden="true">→</span></a> : null}
        </section>

        <section className={styles.summary}>
          <div><span>{t("Governance", "الحوكمة")}</span><b>{data?.stages.filter((stage) => stage.group === "governance" && stage.passed).length ?? 0}<small>/5</small></b></div>
          <div><span>{t("Protected runtime", "التشغيل المحمي")}</span><b>{data?.stages.filter((stage) => stage.group === "runtime" && stage.passed).length ?? 0}<small>/4</small></b></div>
          <div><span>{t("Authorization", "التفويض")}</span><b>{data?.stages.filter((stage) => stage.group === "authorization" && stage.passed).length ?? 0}<small>/4</small></b></div>
          <div><span>{t("Patient records read", "سجلات المرضى المقروءة")}</span><b>0</b></div>
        </section>

        <section className={styles.roadmap}>
          <header><div><p>{t("LIVE LAUNCH SEQUENCE", "تسلسل الإطلاق المباشر")}</p><h2>{t("Complete the work in dependency order", "أكمل العمل حسب ترتيب المتطلبات")}</h2></div><span>{t("Green items are verified now. The teal item is the next productive action.", "العناصر الخضراء متحققة الآن والعنصر الفيروزي هو الإجراء التالي المنتج.")}</span></header>
          {(["governance", "runtime", "authorization"] as const).map((group) => <section className={styles.group} key={group}>
            <div className={styles.groupHead}><span>{String((group === "governance" ? 1 : group === "runtime" ? 2 : 3)).padStart(2, "0")}</span><div><b>{ar ? groupNames[group][1] : groupNames[group][0]}</b><small>{data?.stages.filter((stage) => stage.group === group && stage.passed).length ?? 0}/{data?.stages.filter((stage) => stage.group === group).length ?? (group === "governance" ? 5 : 4)} {t("complete", "مكتمل")}</small></div></div>
            <div className={styles.stageList}>{data?.stages.filter((stage) => stage.group === group).map((stage) => <article key={stage.id} data-state={stage.state}>
              <div className={styles.stageNumber} aria-hidden="true">{stage.passed ? "✓" : String(stage.order).padStart(2, "0")}</div>
              <div className={styles.stageCopy}><div><span className={styles.state}>{stateLabel(stage, ar)}</span><b>{ar ? stage.titleAr : stage.title}</b></div><p>{ar ? stage.detailAr : stage.detail}</p><small>{t("Evidence", "الدليل")}: {stage.current} / {stage.target}</small></div>
              <a href={stage.href} aria-label={`${ar ? stage.actionAr : stage.action}: ${ar ? stage.titleAr : stage.title}`}>{ar ? stage.actionAr : stage.action}<span aria-hidden="true">→</span></a>
            </article>) ?? <div className={styles.loading}>{t("Reading aggregate production evidence…", "جارٍ قراءة دليل الإنتاج المجمع…")}</div>}</div>
          </section>)}
        </section>

        <footer className={styles.footer}><div><b>{t("Fail-closed by design", "مغلق افتراضياً حسب التصميم")}</b><span>{t("Missing, stale, mismatched, or rejected evidence never becomes an authorization.", "لا يتحول الدليل المفقود أو القديم أو غير المتطابق أو المرفوض إلى تفويض.")}</span></div><a href="/admin/audit">{t("Open audit ledger", "فتح سجل التدقيق")} →</a></footer>
      </div>
    </section>
  </main>;
}
