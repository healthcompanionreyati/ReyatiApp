import { and, desc, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { documentReleaseAuthorizations } from "@/db/document-release-schema";
import { requirePlatformRole } from "@/lib/authorization";
import { getDocumentReleasePrerequisites } from "@/lib/document-release";

export const DOCUMENT_LAUNCH_READINESS_VERSION = "medical-document-launch-readiness-v1";

export const DOCUMENT_LAUNCH_READINESS_BOUNDARIES = {
  aggregateEvidenceOnly: true,
  readsPatientRecords: false,
  readsR2Objects: false,
  changesConfiguration: false,
  enablesRuntimeControls: false,
  executesRetention: false,
  executesDeletion: false,
  launchesProductionTraffic: false,
} as const;

type StageInput = {
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
};

export type DocumentLaunchStage = StageInput & {
  order: number;
  state: "complete" | "next" | "blocked";
};

export async function getDocumentLaunchReadiness(userId: string, now = new Date()) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const prerequisites = await getDocumentReleasePrerequisites(now);
  const db = await getDb();
  const activeCertificates = await db.select({
    id: documentReleaseAuthorizations.id,
    reference: documentReleaseAuthorizations.reference,
    lifecycleAcceptanceRunId: documentReleaseAuthorizations.lifecycleAcceptanceRunId,
    latestActivationWindowId: documentReleaseAuthorizations.latestActivationWindowId,
    latestAssuranceRunId: documentReleaseAuthorizations.latestAssuranceRunId,
    releaseEndsAt: documentReleaseAuthorizations.releaseEndsAt,
    reviewedAt: documentReleaseAuthorizations.reviewedAt,
  }).from(documentReleaseAuthorizations).where(and(
    eq(documentReleaseAuthorizations.status, "authorized"),
    lt(documentReleaseAuthorizations.releaseStartsAt, now),
    gt(documentReleaseAuthorizations.releaseEndsAt, now),
  )).orderBy(desc(documentReleaseAuthorizations.reviewedAt)).limit(1);

  const activeCertificate = activeCertificates.find((certificate) =>
    prerequisites.ready
    && prerequisites.acceptance?.id === certificate.lifecycleAcceptanceRunId
    && prerequisites.activation?.id === certificate.latestActivationWindowId
    && prerequisites.assurance?.id === certificate.latestAssuranceRunId,
  ) ?? null;
  const lifecycle = prerequisites.lifecycle;
  const postureChecks = [lifecycle.posture.productionEnvironment, lifecycle.posture.protectedStorageConfigured, lifecycle.posture.privateScannerConfigured];
  const ownershipChecks = [prerequisites.dataLifecycleOwnership, prerequisites.incidentOwnership];
  const safetyChecks = [prerequisites.exceptionSignalCount === 0, prerequisites.activeIncidentCount === 0];

  const inputs: StageInput[] = [
    {
      id: "ownership",
      group: "governance",
      title: "Name accountable owners",
      titleAr: "تسمية المالكين المسؤولين",
      detail: "Lifecycle and incident response each need a primary owner, backup, escalation path, and rehearsal evidence verified within 90 days.",
      detailAr: "تحتاج دورة الحياة والاستجابة للحوادث إلى مالك أساسي واحتياطي ومسار تصعيد ودليل بروفة متحقق خلال 90 يوماً.",
      action: "Complete ownership evidence",
      actionAr: "استكمال دليل الملكية",
      href: "/admin/ownership",
      passed: ownershipChecks.every(Boolean),
      current: ownershipChecks.filter(Boolean).length,
      target: ownershipChecks.length,
    },
    {
      id: "policies",
      group: "governance",
      title: "Approve lifecycle policies",
      titleAr: "اعتماد سياسات دورة الحياة",
      detail: "All required record classes need independently approved retention and disposition policy evidence.",
      detailAr: "تحتاج جميع فئات السجلات المطلوبة إلى أدلة سياسة احتفاظ وتصرف معتمدة بشكل مستقل.",
      action: lifecycle.approvedPolicyCount === 0 ? "Prepare governance pack" : "Review lifecycle policies",
      actionAr: lifecycle.approvedPolicyCount === 0 ? "إعداد حزمة الحوكمة" : "مراجعة سياسات دورة الحياة",
      href: lifecycle.approvedPolicyCount === 0 ? "/admin/document-governance-setup" : "/admin/data-lifecycle",
      passed: lifecycle.approvedPolicyCount === lifecycle.requiredPolicyCount,
      current: lifecycle.approvedPolicyCount,
      target: lifecycle.requiredPolicyCount,
    },
    {
      id: "retention-plan",
      group: "governance",
      title: "Approve document retention automation",
      titleAr: "اعتماد أتمتة احتفاظ المستندات",
      detail: "The medical-document plan must be bound to the approved policy and independently reviewed.",
      detailAr: "يجب ربط خطة المستندات الطبية بالسياسة المعتمدة ومراجعتها بشكل مستقل.",
      action: "Open retention automation",
      actionAr: "فتح أتمتة الاحتفاظ",
      href: "/admin/retention-automation",
      passed: lifecycle.approvedRetentionPlan,
      current: lifecycle.approvedRetentionPlan ? 1 : 0,
      target: 1,
    },
    {
      id: "safety-rehearsal",
      group: "governance",
      title: "Pass the synthetic safety rehearsal",
      titleAr: "اجتياز بروفة السلامة الاصطناعية",
      detail: "A fresh 22-scenario rehearsal must pass with zero document, object, deletion-job, or external-call effects.",
      detailAr: "يجب نجاح بروفة حديثة من 22 سيناريو دون أي أثر على المستندات أو الكائنات أو مهام الحذف أو الاتصالات الخارجية.",
      action: "Run safety rehearsal",
      actionAr: "تشغيل بروفة السلامة",
      href: "/admin/retention-automation",
      passed: lifecycle.freshSafetyRehearsal && lifecycle.safetyScenarioCount >= 22,
      current: lifecycle.safetyScenarioCount,
      target: 22,
    },
    {
      id: "legal-holds",
      group: "governance",
      title: "Clear overdue legal-hold reviews",
      titleAr: "معالجة مراجعات الحجز القانوني المتأخرة",
      detail: "Every active or release-pending hold must remain inside its review window.",
      detailAr: "يجب أن يبقى كل حجز نشط أو قيد الإفراج ضمن نافذة المراجعة.",
      action: "Review legal holds",
      actionAr: "مراجعة الحجوزات القانونية",
      href: "/admin/legal-holds",
      passed: lifecycle.overdueLegalHoldCount === 0,
      current: lifecycle.overdueLegalHoldCount,
      target: 0,
    },
    {
      id: "production-posture",
      group: "runtime",
      title: "Verify protected production posture",
      titleAr: "التحقق من وضع الإنتاج المحمي",
      detail: "Vercel production, private R2 storage, and the approved private-processing scanner must be detected server-side.",
      detailAr: "يجب اكتشاف إنتاج Vercel وتخزين R2 الخاص والماسح المعتمد للمعالجة الخاصة من جهة الخادم.",
      action: "Inspect activation posture",
      actionAr: "فحص وضع التفعيل",
      href: "/admin/document-activation",
      passed: postureChecks.every(Boolean),
      current: postureChecks.filter(Boolean).length,
      target: postureChecks.length,
    },
    {
      id: "runtime-controls",
      group: "runtime",
      title: "Confirm all six runtime controls",
      titleAr: "تأكيد ضوابط التشغيل الستة",
      detail: "Cleanup, recovery, scan dispatch, scan polling, retention execution, and deletion processing must all be enabled.",
      detailAr: "يجب تفعيل التنظيف والاستعادة وإرسال الفحص واستطلاع الفحص وتنفيذ الاحتفاظ ومعالجة الحذف.",
      action: "Inspect runtime controls",
      actionAr: "فحص ضوابط التشغيل",
      href: "/admin/document-activation",
      passed: lifecycle.posture.allRuntimeControlsEnabled,
      current: [lifecycle.posture.cleanupEnabled, lifecycle.posture.scanRecoveryEnabled, lifecycle.posture.scanDispatchEnabled, lifecycle.posture.scanPollingEnabled, lifecycle.posture.retentionExecutionEnabled, lifecycle.posture.deletionProcessorEnabled].filter(Boolean).length,
      target: 6,
    },
    {
      id: "activation",
      group: "runtime",
      title: "Verify the production activation window",
      titleAr: "التحقق من نافذة تفعيل الإنتاج",
      detail: "Prepare, independently review, open, observe, and verify a bounded production change window.",
      detailAr: "إعداد نافذة تغيير إنتاج محدودة ومراجعتها وفتحها ومراقبتها والتحقق منها بشكل مستقل.",
      action: "Open activation governance",
      actionAr: "فتح حوكمة التفعيل",
      href: "/admin/document-activation",
      passed: lifecycle.activationWindowVerified,
      current: lifecycle.activationWindowVerified ? 1 : 0,
      target: 1,
    },
    {
      id: "assurance",
      group: "runtime",
      title: "Stabilize post-activation assurance",
      titleAr: "تثبيت ضمان ما بعد التفعيل",
      detail: "The current activation needs a passing aggregate-only assurance run and an independent stabilization decision.",
      detailAr: "يحتاج التفعيل الحالي إلى تشغيل ضمان مجمع ناجح وقرار تثبيت مستقل.",
      action: "Open stability assurance",
      actionAr: "فتح تأكيد الاستقرار",
      href: "/admin/document-assurance",
      passed: lifecycle.stabilityAssuranceVerified,
      current: lifecycle.stabilityAssuranceVerified ? 1 : 0,
      target: 1,
    },
    {
      id: "acceptance",
      group: "authorization",
      title: "Verify production lifecycle acceptance",
      titleAr: "التحقق من قبول دورة حياة الإنتاج",
      detail: "Current production evidence must be captured as synthetic-only and independently verified within 30 days.",
      detailAr: "يجب التقاط دليل الإنتاج الحالي بوضع اصطناعي فقط والتحقق منه بشكل مستقل خلال 30 يوماً.",
      action: "Prepare lifecycle acceptance",
      actionAr: "إعداد قبول دورة الحياة",
      href: "/admin/data-lifecycle-acceptance",
      passed: Boolean(prerequisites.acceptance),
      current: prerequisites.acceptance ? 1 : 0,
      target: 1,
    },
    {
      id: "safety-signals",
      group: "authorization",
      title: "Keep exception and incident signals clear",
      titleAr: "إبقاء إشارات الاستثناء والحوادث صافية",
      detail: `${prerequisites.exceptionSignalCount} aggregate exceptions and ${prerequisites.activeIncidentCount} active document incidents are currently visible.`,
      detailAr: `توجد حالياً ${prerequisites.exceptionSignalCount} استثناءات مجمعة و${prerequisites.activeIncidentCount} حوادث مستندات نشطة.`,
      action: "Open document incident command",
      actionAr: "فتح قيادة حوادث المستندات",
      href: "/admin/document-incidents",
      passed: safetyChecks.every(Boolean),
      current: safetyChecks.filter(Boolean).length,
      target: safetyChecks.length,
    },
    {
      id: "operator-coverage",
      group: "authorization",
      title: "Establish three-person release control",
      titleAr: "إنشاء ضبط إطلاق بثلاثة أشخاص",
      detail: "Release owner, monitoring owner, and stop authority must be three distinct active privileged operators.",
      detailAr: "يجب أن يكون مالك الإطلاق ومالك المراقبة وسلطة الإيقاف ثلاثة مشغلين مميزين وذوي صلاحية نشطة.",
      action: "Manage platform access",
      actionAr: "إدارة وصول المنصة",
      href: "/admin/access",
      passed: prerequisites.roster.length >= 3,
      current: prerequisites.roster.length,
      target: 3,
    },
    {
      id: "release-certificate",
      group: "authorization",
      title: "Authorize a bounded release certificate",
      titleAr: "تفويض شهادة إطلاق محدودة",
      detail: "Bind the current acceptance, activation, assurance, named operators, stop authority, and time-limited window.",
      detailAr: "اربط القبول والتفعيل والضمان الحالي والمشغلين المسمين وسلطة الإيقاف بنافذة زمنية محدودة.",
      action: "Prepare release certificate",
      actionAr: "إعداد شهادة الإطلاق",
      href: "/admin/document-release",
      passed: Boolean(activeCertificate),
      current: activeCertificate ? 1 : 0,
      target: 1,
    },
  ];

  const firstIncomplete = inputs.findIndex((stage) => !stage.passed);
  const stages: DocumentLaunchStage[] = inputs.map((stage, index) => ({
    ...stage,
    order: index + 1,
    state: stage.passed ? "complete" : index === firstIncomplete ? "next" : "blocked",
  }));
  const completed = stages.filter((stage) => stage.passed).length;
  const nextStage = stages.find((stage) => stage.state === "next") ?? null;

  return {
    role: access.role,
    generatedAt: now.toISOString(),
    workflowVersion: DOCUMENT_LAUNCH_READINESS_VERSION,
    boundaries: DOCUMENT_LAUNCH_READINESS_BOUNDARIES,
    completion: Math.round((completed / stages.length) * 100),
    completed,
    total: stages.length,
    decision: activeCertificate ? "authorized" as const : "evidence_required" as const,
    nextStage,
    stages,
    activeCertificate: activeCertificate ? { reference: activeCertificate.reference, releaseEndsAt: activeCertificate.releaseEndsAt.toISOString() } : null,
  };
}
