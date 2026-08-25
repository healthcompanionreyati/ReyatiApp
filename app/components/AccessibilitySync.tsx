"use client";

import { useEffect } from "react";

const routeTitles: Record<string, string> = {
  "/admin/legal-hold-review": "Legal-hold review desk", "/admin/retention-safety": "Retention safety rehearsal", "/admin/document-runtime-posture": "Document runtime posture", "/admin/document-activation-preflight": "Document activation preflight", "/admin/document-change-window": "Document activation window preparation", "/admin/document-change-review": "Document activation independent review", "/admin/document-change-observation": "Document activation posture verification", "/admin/document-rollback-control": "Document activation rollback control", "/admin/document-assurance-collection": "Document stability evidence collection", "/admin/document-assurance-review": "Document stability independent review", "/admin/lifecycle-acceptance-submission": "Lifecycle acceptance submission", "/admin/lifecycle-acceptance-review": "Lifecycle acceptance independent review", "/admin/document-release-preparation": "Document release certificate preparation", "/admin/document-release-review": "Document release independent review", "/admin/document-release-monitoring": "Document release window monitoring", "/admin/document-release-stop": "Document release stop control", "/admin/document-runtime-controls": "Document runtime controls watch", "/admin/document-storage-watch": "Document protected storage watch", "/admin/document-scanner-watch": "Document private scanner watch", "/admin/document-queue-watch": "Document queue health watch", "/admin/document-retention-watch": "Document retention execution watch", "/admin/document-deletion-watch": "Document deletion safety watch", "/admin/document-legal-hold-watch": "Document legal-hold safety watch", "/admin/document-incident-watch": "Document incident escalation watch", "/admin/document-evidence-renewal": "Document evidence renewal", "/admin/document-operations-handoff": "Document operations handoff", "/admin/document-service-health": "Document service health", "/admin/document-sla-watch": "Document service-level watch", "/admin/document-capacity-watch": "Document capacity watch", "/admin/document-recovery-readiness": "Document recovery readiness", "/admin/document-vendor-assurance": "Document vendor assurance", "/admin/document-access-certification": "Document access certification", "/admin/document-audit-reconciliation": "Document audit reconciliation", "/admin/document-change-calendar": "Document change calendar", "/admin/document-privacy-obligations": "Document privacy obligations", "/admin/document-executive-assurance": "Document executive assurance", "/admin/document-cleanup-assurance": "Document cleanup assurance", "/admin/document-scan-dispatch-assurance": "Document scan dispatch assurance", "/admin/document-scan-polling-assurance": "Document scan polling assurance", "/admin/document-scan-recovery-assurance": "Document scan recovery assurance", "/admin/document-quarantine-assurance": "Document quarantine assurance", "/admin/document-retention-control-assurance": "Document retention control assurance", "/admin/document-deletion-control-assurance": "Document deletion control assurance", "/admin/document-legal-hold-enforcement": "Document legal-hold enforcement", "/admin/document-maintenance-readiness": "Document maintenance readiness", "/admin/document-safety-rehearsal-assurance": "Document safety rehearsal assurance",
  "/admin/document-continuity-assurance": "Document continuity assurance", "/admin/document-recovery-runbook-assurance": "Document recovery runbook assurance", "/admin/document-storage-resilience-assurance": "Document storage resilience assurance", "/admin/document-scanner-resilience-assurance": "Document scanner resilience assurance", "/admin/document-lifecycle-resilience-assurance": "Document lifecycle resilience assurance", "/admin/document-incident-response-assurance": "Document incident response assurance", "/admin/document-evidence-continuity-assurance": "Document evidence continuity assurance", "/admin/document-ownership-continuity-assurance": "Document ownership continuity assurance", "/admin/document-dependency-resilience-assurance": "Document dependency resilience assurance", "/admin/document-resilience-scorecard": "Document resilience scorecard",
  "/admin/document-policy-alignment-assurance": "Document policy alignment assurance", "/admin/document-control-ownership-assurance": "Document control ownership assurance", "/admin/document-release-governance-assurance": "Document release governance assurance", "/admin/document-exception-governance-assurance": "Document exception governance assurance", "/admin/document-risk-signal-assurance": "Document risk signal assurance", "/admin/document-audit-evidence-assurance": "Document audit evidence assurance", "/admin/document-separation-of-duties-assurance": "Document separation-of-duties assurance", "/admin/document-review-cadence-assurance": "Document review cadence assurance", "/admin/document-governance-reporting-assurance": "Document governance reporting assurance", "/admin/document-governance-scorecard": "Document governance scorecard",
  "/admin/document-availability-assurance": "Document availability assurance", "/admin/document-processing-reliability-assurance": "Document processing reliability assurance", "/admin/document-queue-reliability-assurance": "Document queue reliability assurance", "/admin/document-service-level-assurance": "Document service-level assurance", "/admin/document-capacity-planning-assurance": "Document capacity planning assurance", "/admin/document-maintenance-governance-assurance": "Document maintenance governance assurance", "/admin/document-change-risk-assurance": "Document change-risk assurance", "/admin/document-operational-readiness-assurance": "Document operational readiness assurance", "/admin/document-service-reporting-assurance": "Document service reporting assurance", "/admin/document-service-management-scorecard": "Document service-management scorecard",
  "/admin/integration-access-reviews": "Integration access recertification", "/admin/integration-access-review-governance": "Integration access-review posture",
  "/admin/integration-residency": "Integration data residency", "/admin/integration-residency-governance": "Integration residency posture",
  "/admin/integration-observability": "Integration observability governance", "/admin/integration-observability-governance": "Integration observability posture",
  "/admin/integration-change": "Integration change governance", "/admin/integration-change-governance": "Integration change posture",
  "/admin/integration-resilience": "Integration resilience and failover", "/admin/integration-resilience-governance": "Integration resilience posture",
  "/admin/integration-traffic": "Integration traffic and abuse controls", "/admin/integration-traffic-governance": "Traffic-control posture",
  "/admin/integration-payload-security": "Integration payload security", "/admin/integration-payload-security-governance": "Payload protection posture",
  "/admin/integration-network": "Integration network boundaries", "/admin/integration-network-governance": "Network boundary posture",
  "/admin/integration-certificates": "Certificate and trust governance", "/admin/integration-certificates-governance": "Certificate governance posture",
  "/admin/integration-secrets": "Secrets and key rotation", "/admin/integration-secrets-governance": "Secret governance posture",
  "/admin/api-contracts": "API contract versions", "/admin/api-deprecations": "API deprecation plans", "/admin/integration-retention": "Integration data retention", "/admin/partner-sla": "Partner service levels", "/admin/exchange-purposes": "Exchange purpose mappings", "/admin/integration-lifecycle": "Integration lifecycle governance",
  "/admin/exchange-reconciliation": "Integration exchange reconciliation",
  "/admin/api-clients": "API client governance", "/admin/webhook-endpoints": "Webhook endpoint governance", "/admin/partner-conformance": "Partner conformance", "/admin/terminology-sets": "Terminology governance", "/admin/patient-match-exceptions": "Patient-match exceptions", "/admin/integration-assurance": "Integration assurance governance",
  "/admin/integration-vendors": "Integration vendor registry", "/admin/connection-onboarding": "Connection onboarding", "/admin/data-mappings": "Data mapping governance", "/admin/migration-rehearsals": "Migration rehearsals", "/admin/integration-incidents": "Integration incidents", "/admin/integration-operations": "Integration operations governance",
  "/connections": "External health connections", "/device-connections": "Wearable connections", "/admin/interoperability": "Interoperability profiles", "/admin/data-quality-operations": "Data-quality operations", "/admin/tenant-experience": "Tenant experience governance", "/admin/release-two-readiness": "Release 2 readiness governance",
  "/document-capture": "Document capture drafts", "/record-index": "Health record index", "/sharing-directives": "Sharing directives", "/access-history": "Wallet access history", "/data-quality": "Data quality concerns", "/admin/health-wallet-operations": "Health Wallet operations governance",
  "/immunizations": "Immunization history", "/screening-history": "Preventive screening history", "/health-measurements": "Health measurements", "/symptom-journal": "Symptom journal", "/wellness-journal": "Wellness journal", "/admin/personal-health-tracking": "Personal health tracking governance",
  "/pre-visit-intake": "Pre-visit intake", "/appointment-preparation": "Appointment preparation", "/appointment-accommodations": "Appointment accommodations", "/post-visit-actions": "Post-visit actions", "/care-timeline": "Care journey timeline", "/provider/pre-visit-intake": "Provider intake review", "/provider/preparation-guides": "Preparation guides", "/provider/accommodation-requests": "Accommodation requests", "/provider/follow-up-actions": "Follow-up actions", "/admin/appointment-journeys": "Appointment journey governance",
  "/care-plan": "My care plans", "/provider/care-plans": "Provider care plans", "/admin/care-plans": "Care-plan governance", "/diagnostic-imaging": "Diagnostic imaging", "/provider/diagnostic-imaging": "Provider imaging orders", "/partner/diagnostic-imaging": "Imaging operations", "/admin/diagnostic-imaging": "Imaging governance", "/insurance": "Insurance and authorization", "/provider/insurance": "Provider authorizations", "/partner/insurance": "Payer operations", "/admin/insurance": "Insurance governance", "/saved-care": "Saved care and comparison", "/admin/saved-care": "Saved-care governance", "/privacy-rights": "Privacy Rights Center", "/admin/privacy-rights": "Privacy-rights operations", "/health-library": "Trusted health library", "/admin/health-content": "Health-content governance", "/emergency-profile": "Emergency profile", "/admin/emergency-profile": "Emergency-profile governance", "/health-profile": "Personal health profile", "/admin/health-profile": "Health-profile governance", "/consents": "Consent Center", "/admin/consents": "Consent governance", "/complaints": "Complaints and safety concerns", "/admin/complaints": "Complaints operations", "/account/security": "Account security", "/admin/account-security": "Account security governance", "/notification-preferences": "Notification preferences", "/admin/notification-preferences": "Notification preference governance", "/admin/catalogue": "Catalogue governance",
  "/settings/accessibility": "Language and accessibility", "/settings/communications": "Communication preferences", "/admin/accessibility-settings": "Accessibility governance", "/facilities": "Facility directory", "/provider/facility-profile": "Facility profile", "/admin/facility-directory": "Facility directory governance", "/admin/release-controls": "Release controls",
  "/account/profile": "My profile", "/account/identity": "Password and MFA", "/admin/patient-profiles": "Patient-profile governance", "/provider/organization-settings": "Organization settings", "/admin/tenant-configuration": "Tenant configuration", "/admin/policy-templates": "Policy and communication templates", "/service-status": "Service status", "/admin/service-status": "Service-status communications", "/provider/team-access": "Team and access governance", "/provider/schedule-rules": "Scheduling rules and impact", "/admin/provider-operations-governance": "Provider operations governance", "/provider/credentials": "Credential re-verification", "/provider/organization-verification": "Organization and location verification", "/admin/verification-lifecycle": "Verification lifecycle governance", "/provider/workforce-credentials": "Workforce credentials", "/provider/clinical-privileges": "Delegated clinical privileges", "/admin/workforce-governance": "Workforce and privilege governance", "/provider/leave-planning": "Provider leave planning", "/provider/coverage-assignments": "Locum and substitute coverage", "/admin/coverage-governance": "Coverage continuity governance", "/partner/onboarding": "Partner onboarding and access", "/partner/settlements": "Partner settlement and reconciliation", "/admin/partner-governance": "Partner and settlement governance",
  "/benefits": "My benefits", "/partner/benefits": "Employer benefit operations", "/admin/benefits": "Benefit governance", "/reviews": "My reviews", "/provider/reviews": "Provider reviews", "/admin/reviews": "Review moderation", "/payment-support": "Payment support", "/admin/finance-controls": "Finance controls", "/admin/payment-reconciliation": "Payment reconciliation", "/admin/payment-disputes": "Payment disputes", "/admin/payment-receipts": "Payment receipts", "/admin/payment-lifecycle-rehearsal": "Payment lifecycle rehearsal", "/admin/payment-acceptance": "Stripe test acceptance", "/admin/payment-go-live": "Payment go-live readiness", "/admin/payment-activation": "Payment activation window", "/admin/payment-assurance": "Payment stability assurance", "/admin/payment-incidents": "Payment incident command and recovery", "/admin/document-activation": "Medical document activation", "/admin/document-assurance": "Medical document stability assurance", "/admin/document-incidents": "Medical document incident command and recovery", "/admin/data-lifecycle-acceptance": "Production lifecycle acceptance", "/admin/document-governance-setup": "Document governance setup pack", "/admin/ownership-setup": "Ownership setup pack", "/admin/lifecycle-submission": "Lifecycle submission desk", "/admin/lifecycle-review": "Independent lifecycle review", "/admin/governance-handoff": "Governance handoff board", "/admin/document-launch": "Medical document launch command centre", "/admin/document-release": "Medical document release authorization",
  "/encounter-follow-up": "Visit amendments and follow-up", "/provider/encounter-continuity": "Encounter amendments", "/admin/encounter-continuity": "Encounter continuity governance", "/pharmacy": "Pharmacy fulfilment", "/provider/pharmacy": "Provider pharmacy review", "/partner/pharmacy": "Pharmacy operations", "/admin/pharmacy": "Pharmacy governance", "/sample-collection": "Home sample collection", "/partner/sample-collection": "Sample-collection operations", "/admin/sample-collection": "Sample-collection governance",
  "/queue": "Digital check-in", "/provider/queue": "Queue operations", "/admin/queue": "Queue governance", "/laboratory": "Laboratory orders", "/provider/laboratory": "Provider laboratory orders", "/partner/laboratory": "Laboratory fulfilment", "/admin/laboratory": "Laboratory governance", "/home-care": "Home care", "/partner/home-care": "Home-care fulfilment", "/admin/home-care": "Home-care governance",
  "/waitlist": "Appointment waitlist", "/provider/waitlist": "Provider waitlist", "/admin/waitlist": "Waitlist governance",
  "/": "Home", "/navigator": "Care Navigator", "/providers": "Find care", "/appointments": "Appointments", "/virtual-care": "Virtual care", "/messages": "Secure messages", "/referrals": "Referrals", "/experience": "My experience", "/wallet": "Health records", "/medication-reminders": "Medication reminders",
  "/documents": "Medical documents", "/provider/documents": "Shared documents", "/provider/prescription-review": "Prescription review", "/provider/report-review": "Report review",
  "/payments": "Payments", "/payment-receipts": "Payment receipts", "/family": "Family access", "/family/dependents": "Dependant and guardian lifecycle", "/support": "Support", "/notifications": "Notifications",
  "/auth": "Secure account", "/sign-in": "Sign in", "/sign-up": "Create account", "/sign-out": "Sign out", "/journeys": "Care journeys", "/provider": "Provider dashboard",
  "/provider/services": "Provider services", "/provider/settings": "Provider settings", "/provider/patients": "Provider patients",
  "/provider/insights": "Provider insights", "/provider/experience": "Patient experience insights", "/provider/encounter": "Encounter workspace", "/provider/virtual-care": "Provider virtual care", "/provider/messages": "Provider messages", "/provider/referrals": "Provider referrals", "/partner": "Partner workspace",
  "/partner/program": "Partner programme", "/admin": "Operations overview", "/admin/access": "Platform access", "/admin/communications": "Delivery operations",
  "/admin/audit": "Audit ledger", "/admin/cases": "Support operations", "/admin/finance": "Finance operations", "/admin/messaging": "Messaging governance", "/admin/referrals": "Referral governance", "/admin/experience": "Experience governance",
  "/admin/moderation": "Moderation boundary", "/admin/organizations": "Organizations", "/admin/verification": "Provider verification", "/admin/virtual-care": "Virtual-care governance", "/admin/navigator-governance": "Care Navigator governance", "/admin/prescription-intelligence": "Prescription intelligence", "/admin/report-reader": "Medical Report Reader", "/admin/reminder-readiness": "Medication reminder readiness", "/admin/reminder-delivery-policy": "Medication reminder delivery policy", "/admin/reminder-activation-readiness": "Medication reminder activation readiness", "/admin/dependent-care": "Dependent care governance", "/admin/dependent-transition": "Age-of-majority transition rehearsal",
};

const arabicRouteTitles: Record<string, string> = {
  "/admin/legal-hold-review": "مكتب مراجعة الحجز القانوني", "/admin/retention-safety": "بروفة أمان الاحتفاظ", "/admin/document-runtime-posture": "وضع تشغيل المستندات", "/admin/document-activation-preflight": "فحص تفعيل المستندات المسبق", "/admin/document-change-window": "إعداد نافذة تفعيل المستندات", "/admin/document-change-review": "المراجعة المستقلة لتفعيل المستندات", "/admin/document-change-observation": "التحقق من وضع تفعيل المستندات", "/admin/document-rollback-control": "التحكم بتراجع تفعيل المستندات", "/admin/document-assurance-collection": "جمع دليل استقرار المستندات", "/admin/document-assurance-review": "المراجعة المستقلة لاستقرار المستندات", "/admin/lifecycle-acceptance-submission": "إرسال قبول دورة الحياة", "/admin/lifecycle-acceptance-review": "المراجعة المستقلة لقبول دورة الحياة", "/admin/document-release-preparation": "إعداد شهادة إطلاق المستندات", "/admin/document-release-review": "المراجعة المستقلة لإطلاق المستندات", "/admin/document-release-monitoring": "مراقبة نافذة إطلاق المستندات", "/admin/document-release-stop": "التحكم بإيقاف إطلاق المستندات", "/admin/document-runtime-controls": "مراقبة ضوابط تشغيل المستندات", "/admin/document-storage-watch": "مراقبة تخزين المستندات المحمي", "/admin/document-scanner-watch": "مراقبة ماسح المستندات الخاص", "/admin/document-queue-watch": "مراقبة صحة قوائم المستندات", "/admin/document-retention-watch": "مراقبة تنفيذ احتفاظ المستندات", "/admin/document-deletion-watch": "مراقبة سلامة حذف المستندات", "/admin/document-legal-hold-watch": "مراقبة سلامة حجز المستندات", "/admin/document-incident-watch": "مراقبة تصعيد حوادث المستندات", "/admin/document-evidence-renewal": "تجديد دليل المستندات", "/admin/document-operations-handoff": "تسليم عمليات المستندات", "/admin/document-service-health": "صحة خدمة المستندات", "/admin/document-sla-watch": "مراقبة مستوى خدمة المستندات", "/admin/document-capacity-watch": "مراقبة سعة المستندات", "/admin/document-recovery-readiness": "جاهزية تعافي المستندات", "/admin/document-vendor-assurance": "تأكيد مورد المستندات", "/admin/document-access-certification": "اعتماد وصول المستندات", "/admin/document-audit-reconciliation": "مطابقة تدقيق المستندات", "/admin/document-change-calendar": "تقويم تغيير المستندات", "/admin/document-privacy-obligations": "التزامات خصوصية المستندات", "/admin/document-executive-assurance": "التأكيد التنفيذي للمستندات", "/admin/document-cleanup-assurance": "تأكيد تنظيف المستندات", "/admin/document-scan-dispatch-assurance": "تأكيد إرسال فحص المستندات", "/admin/document-scan-polling-assurance": "تأكيد استطلاع فحص المستندات", "/admin/document-scan-recovery-assurance": "تأكيد تعافي فحص المستندات", "/admin/document-quarantine-assurance": "تأكيد عزل المستندات", "/admin/document-retention-control-assurance": "تأكيد ضابط احتفاظ المستندات", "/admin/document-deletion-control-assurance": "تأكيد ضابط حذف المستندات", "/admin/document-legal-hold-enforcement": "إنفاذ الحجز القانوني للمستندات", "/admin/document-maintenance-readiness": "جاهزية صيانة المستندات", "/admin/document-safety-rehearsal-assurance": "تأكيد بروفة سلامة المستندات",
  "/admin/document-continuity-assurance": "تأكيد استمرارية المستندات", "/admin/document-recovery-runbook-assurance": "تأكيد دليل تعافي المستندات", "/admin/document-storage-resilience-assurance": "تأكيد مرونة تخزين المستندات", "/admin/document-scanner-resilience-assurance": "تأكيد مرونة ماسح المستندات", "/admin/document-lifecycle-resilience-assurance": "تأكيد مرونة دورة حياة المستندات", "/admin/document-incident-response-assurance": "تأكيد استجابة حوادث المستندات", "/admin/document-evidence-continuity-assurance": "تأكيد استمرارية دليل المستندات", "/admin/document-ownership-continuity-assurance": "تأكيد استمرارية ملكية المستندات", "/admin/document-dependency-resilience-assurance": "تأكيد مرونة تبعيات المستندات", "/admin/document-resilience-scorecard": "بطاقة مرونة المستندات",
  "/admin/document-policy-alignment-assurance": "تأكيد مواءمة سياسة المستندات", "/admin/document-control-ownership-assurance": "تأكيد ملكية ضوابط المستندات", "/admin/document-release-governance-assurance": "تأكيد حوكمة إطلاق المستندات", "/admin/document-exception-governance-assurance": "تأكيد حوكمة استثناءات المستندات", "/admin/document-risk-signal-assurance": "تأكيد إشارات مخاطر المستندات", "/admin/document-audit-evidence-assurance": "تأكيد دليل تدقيق المستندات", "/admin/document-separation-of-duties-assurance": "تأكيد فصل واجبات المستندات", "/admin/document-review-cadence-assurance": "تأكيد وتيرة مراجعة المستندات", "/admin/document-governance-reporting-assurance": "تأكيد تقارير حوكمة المستندات", "/admin/document-governance-scorecard": "بطاقة حوكمة المستندات",
  "/admin/document-availability-assurance": "تأكيد إتاحة المستندات", "/admin/document-processing-reliability-assurance": "تأكيد موثوقية معالجة المستندات", "/admin/document-queue-reliability-assurance": "تأكيد موثوقية قوائم المستندات", "/admin/document-service-level-assurance": "تأكيد مستوى خدمة المستندات", "/admin/document-capacity-planning-assurance": "تأكيد تخطيط سعة المستندات", "/admin/document-maintenance-governance-assurance": "تأكيد حوكمة صيانة المستندات", "/admin/document-change-risk-assurance": "تأكيد مخاطر تغيير المستندات", "/admin/document-operational-readiness-assurance": "تأكيد الجاهزية التشغيلية للمستندات", "/admin/document-service-reporting-assurance": "تأكيد تقارير خدمة المستندات", "/admin/document-service-management-scorecard": "بطاقة إدارة خدمة المستندات",
  "/admin/integration-access-reviews": "إعادة اعتماد وصول التكامل", "/admin/integration-access-review-governance": "حالة مراجعة وصول التكامل",
  "/admin/integration-residency": "حوكمة إقامة بيانات التكامل ونقلها", "/admin/integration-residency-governance": "حالة إقامة بيانات التكامل",
  "/admin/integration-observability": "حوكمة مراقبة التكامل والتتبع", "/admin/integration-observability-governance": "حالة مراقبة التكامل",
  "/admin/integration-change": "حوكمة تغيير التكامل ونوافذ الإصدار", "/admin/integration-change-governance": "حالة تغييرات التكامل",
  "/admin/integration-resilience": "حوكمة مرونة التكامل والتحويل الاحتياطي", "/admin/integration-resilience-governance": "حالة مرونة التكامل",
  "/admin/integration-traffic": "حوكمة حركة التكامل ومنع الإساءة", "/admin/integration-traffic-governance": "حالة التحكم في الحركة",
  "/admin/integration-payload-security": "حوكمة أمن حمولة التكامل", "/admin/integration-payload-security-governance": "حالة حماية الحمولة",
  "/admin/integration-network": "حوكمة حدود شبكة التكامل", "/admin/integration-network-governance": "حالة حدود الشبكة",
  "/admin/integration-certificates": "حوكمة الشهادات والثقة", "/admin/integration-certificates-governance": "حالة حوكمة الشهادات",
  "/admin/integration-secrets": "حوكمة الأسرار وتدوير المفاتيح", "/admin/integration-secrets-governance": "حالة حوكمة الأسرار",
  "/admin/api-contracts": "إصدارات عقود الواجهة", "/admin/api-deprecations": "خطط إيقاف الواجهات", "/admin/integration-retention": "الاحتفاظ ببيانات التكامل", "/admin/partner-sla": "مستويات خدمة الشركاء", "/admin/exchange-purposes": "تعيين أغراض التبادل", "/admin/integration-lifecycle": "حوكمة دورة حياة التكامل",
  "/admin/exchange-reconciliation": "مطابقة أحداث التكامل",
  "/admin/api-clients": "حوكمة عملاء واجهة البرمجة", "/admin/webhook-endpoints": "حوكمة نقاط استقبال الأحداث", "/admin/partner-conformance": "مطابقة الشركاء", "/admin/terminology-sets": "حوكمة المصطلحات", "/admin/patient-match-exceptions": "استثناءات مطابقة المرضى", "/admin/integration-assurance": "حوكمة ضمان التكامل",
  "/admin/integration-vendors": "سجل موردي التكامل", "/admin/connection-onboarding": "إعداد الاتصال", "/admin/data-mappings": "حوكمة تعيين البيانات", "/admin/migration-rehearsals": "تمارين ترحيل البيانات", "/admin/integration-incidents": "حوادث التكامل", "/admin/integration-operations": "حوكمة عمليات التكامل",
  "/connections": "اتصالات السجلات الخارجية", "/device-connections": "اتصالات الأجهزة القابلة للارتداء", "/admin/interoperability": "ملفات التشغيل البيني", "/admin/data-quality-operations": "عمليات جودة البيانات", "/admin/tenant-experience": "حوكمة تجربة المؤسسة", "/admin/release-two-readiness": "حوكمة جاهزية الإصدار الثاني",
  "/document-capture": "مسودات التقاط المستندات", "/record-index": "فهرس السجلات الصحية", "/sharing-directives": "توجيهات المشاركة", "/access-history": "سجل الوصول للمحفظة", "/data-quality": "ملاحظات جودة البيانات", "/admin/health-wallet-operations": "حوكمة عمليات المحفظة الصحية",
  "/immunizations": "سجل التطعيمات", "/screening-history": "سجل الفحوصات الوقائية", "/health-measurements": "القياسات الصحية", "/symptom-journal": "مفكرة الأعراض", "/wellness-journal": "مفكرة العافية", "/admin/personal-health-tracking": "حوكمة السجلات الصحية الشخصية",
  "/pre-visit-intake": "بيانات ما قبل الزيارة", "/appointment-preparation": "الاستعداد للموعد", "/appointment-accommodations": "تسهيلات الموعد", "/post-visit-actions": "إجراءات ما بعد الزيارة", "/care-timeline": "الخط الزمني لرحلة الرعاية", "/provider/pre-visit-intake": "مراجعة بيانات ما قبل الزيارة", "/provider/preparation-guides": "إرشادات الاستعداد", "/provider/accommodation-requests": "طلبات التسهيلات", "/provider/follow-up-actions": "إجراءات المتابعة", "/admin/appointment-journeys": "حوكمة رحلة الموعد",
  "/care-plan": "خطط كيفايا", "/provider/care-plans": "خطط الرعاية لمقدم الخدمة", "/admin/care-plans": "حوكمة خطط الرعاية", "/diagnostic-imaging": "التصوير التشخيصي", "/provider/diagnostic-imaging": "طلبات التصوير لمقدم الخدمة", "/partner/diagnostic-imaging": "عمليات التصوير", "/admin/diagnostic-imaging": "حوكمة التصوير", "/insurance": "التأمين والتفويض", "/provider/insurance": "تفويضات مقدم الخدمة", "/partner/insurance": "عمليات جهة الدفع", "/admin/insurance": "حوكمة التأمين", "/saved-care": "الرعاية المحفوظة والمقارنة", "/admin/saved-care": "حوكمة الرعاية المحفوظة", "/privacy-rights": "مركز حقوق الخصوصية", "/admin/privacy-rights": "عمليات حقوق الخصوصية", "/health-library": "مكتبة الصحة الموثوقة", "/admin/health-content": "حوكمة المحتوى الصحي", "/emergency-profile": "ملف الطوارئ", "/admin/emergency-profile": "حوكمة ملف الطوارئ", "/health-profile": "ملفي الصحي الشخصي", "/admin/health-profile": "حوكمة الملف الصحي", "/consents": "مركز الموافقات", "/admin/consents": "حوكمة الموافقات", "/complaints": "الشكاوى ومخاوف السلامة", "/admin/complaints": "عمليات الشكاوى", "/account/security": "أمان الحساب", "/admin/account-security": "حوكمة أمان الحساب", "/notification-preferences": "تفضيلات الإشعارات", "/admin/notification-preferences": "حوكمة تفضيلات الإشعارات", "/admin/catalogue": "حوكمة الكتالوج",
  "/settings/accessibility": "اللغة وإمكانية الوصول", "/settings/communications": "تفضيلات التواصل", "/admin/accessibility-settings": "حوكمة إمكانية الوصول", "/facilities": "دليل المنشآت", "/provider/facility-profile": "ملف المنشأة", "/admin/facility-directory": "حوكمة دليل المنشآت", "/admin/release-controls": "ضوابط الإصدار",
  "/account/profile": "ملفي الشخصي", "/account/identity": "كلمة المرور والمصادقة متعددة العوامل", "/admin/patient-profiles": "حوكمة ملفات المرضى", "/provider/organization-settings": "إعدادات المؤسسة", "/admin/tenant-configuration": "حوكمة إعدادات المؤسسات", "/admin/policy-templates": "قوالب السياسات والاتصالات", "/service-status": "حالة الخدمات", "/admin/service-status": "اتصالات حالة الخدمة", "/provider/team-access": "حوكمة الفريق والوصول", "/provider/schedule-rules": "قواعد الجدولة والأثر", "/admin/provider-operations-governance": "حوكمة عمليات المزود", "/provider/credentials": "إعادة التحقق من الاعتماد", "/provider/organization-verification": "تحقق المؤسسة والموقع", "/admin/verification-lifecycle": "حوكمة دورة حياة التحقق", "/provider/workforce-credentials": "اعتماد القوى العاملة", "/provider/clinical-privileges": "الصلاحيات السريرية المفوضة", "/admin/workforce-governance": "حوكمة القوى العاملة والصلاحيات", "/provider/leave-planning": "تخطيط إجازة مقدم الرعاية", "/provider/coverage-assignments": "تغطية البديل", "/admin/coverage-governance": "حوكمة استمرارية التغطية", "/partner/onboarding": "إعداد الشريك والوصول", "/partner/settlements": "تسوية الشريك والمطابقة", "/admin/partner-governance": "حوكمة الشركاء والتسوية",
  "/benefits": "مزاياي", "/partner/benefits": "عمليات مزايا صاحب العمل", "/admin/benefits": "حوكمة المزايا", "/reviews": "مراجعاتي", "/provider/reviews": "مراجعات مقدم الرعاية", "/admin/reviews": "إشراف المراجعات", "/payment-support": "دعم المدفوعات", "/admin/finance-controls": "الضوابط المالية", "/admin/payment-reconciliation": "مطابقة المدفوعات", "/admin/payment-disputes": "نزاعات المدفوعات", "/admin/payment-receipts": "إيصالات المدفوعات", "/admin/payment-lifecycle-rehearsal": "بروفة دورة الدفع", "/admin/payment-acceptance": "قبول اختبار Stripe", "/admin/payment-go-live": "جاهزية إطلاق الدفع", "/admin/payment-activation": "نافذة تفعيل الدفع", "/admin/payment-assurance": "تأكيد استقرار الدفع", "/admin/payment-incidents": "قيادة حوادث الدفع والتعافي", "/admin/document-activation": "تفعيل المستندات الطبية", "/admin/document-assurance": "تأكيد استقرار المستندات الطبية", "/admin/document-incidents": "قيادة حوادث المستندات الطبية والتعافي", "/admin/data-lifecycle-acceptance": "قبول دورة حياة الإنتاج", "/admin/document-governance-setup": "حزمة إعداد حوكمة المستندات", "/admin/ownership-setup": "حزمة إعداد الملكية", "/admin/lifecycle-submission": "مكتب إرسال دورة الحياة", "/admin/lifecycle-review": "المراجعة المستقلة لدورة الحياة", "/admin/governance-handoff": "لوحة تسليم الحوكمة", "/admin/document-launch": "مركز قيادة إطلاق المستندات الطبية", "/admin/document-release": "تفويض إطلاق المستندات الطبية",
  "/encounter-follow-up": "تعديلات الزيارة والمتابعة", "/provider/encounter-continuity": "تعديلات سجل الزيارة", "/admin/encounter-continuity": "حوكمة استمرارية الزيارة", "/pharmacy": "تنفيذ خدمات الصيدلية", "/provider/pharmacy": "مراجعة الصيدلية لمقدم الرعاية", "/partner/pharmacy": "عمليات الصيدلية", "/admin/pharmacy": "حوكمة الصيدلية", "/sample-collection": "جمع العينات من المنزل", "/partner/sample-collection": "عمليات جمع العينات", "/admin/sample-collection": "حوكمة جمع العينات",
  "/queue": "تسجيل الوصول الرقمي", "/provider/queue": "عمليات قائمة الانتظار", "/admin/queue": "حوكمة قائمة الانتظار الرقمية", "/laboratory": "طلبات المختبر", "/provider/laboratory": "طلبات المختبر لمقدم الرعاية", "/partner/laboratory": "تنفيذ خدمات المختبر", "/admin/laboratory": "حوكمة المختبر", "/home-care": "الرعاية المنزلية", "/partner/home-care": "تنفيذ الرعاية المنزلية", "/admin/home-care": "حوكمة الرعاية المنزلية",
  "/waitlist": "قائمة الانتظار", "/provider/waitlist": "قائمة انتظار مقدم الرعاية", "/admin/waitlist": "حوكمة قائمة الانتظار",
  "/": "الرئيسية", "/navigator": "موجّه الرعاية", "/providers": "ابحث عن رعاية", "/appointments": "المواعيد", "/virtual-care": "الرعاية الافتراضية", "/messages": "الرسائل الآمنة", "/referrals": "الإحالات", "/experience": "تجربتي", "/wallet": "السجلات الصحية", "/medication-reminders": "تذكيرات الدواء",
  "/documents": "المستندات الطبية", "/payments": "المدفوعات", "/payment-receipts": "إيصالات الدفع", "/family": "وصول العائلة", "/family/dependents": "دورة حياة التابع والوصي", "/support": "الدعم",
  "/notifications": "الإشعارات", "/auth": "الحساب الآمن", "/sign-in": "تسجيل الدخول", "/sign-up": "إنشاء حساب", "/sign-out": "تسجيل الخروج", "/journeys": "رحلات الرعاية", "/provider": "لوحة مقدم الرعاية",
  "/provider/services": "خدمات مقدم الرعاية", "/provider/settings": "إعدادات مقدم الرعاية", "/provider/patients": "المرضى",
  "/provider/documents": "المستندات المشتركة", "/provider/insights": "إحصاءات مقدم الرعاية", "/provider/experience": "رؤى تجربة المرضى", "/provider/virtual-care": "الرعاية الافتراضية لمقدم الرعاية", "/provider/messages": "رسائل مقدم الرعاية", "/provider/referrals": "إحالات مقدم الرعاية", "/provider/prescription-review": "مراجعة الوصفات", "/provider/report-review": "مراجعة التقارير", "/admin": "نظرة العمليات العامة", "/admin/communications": "عمليات التسليم", "/admin/virtual-care": "حوكمة الرعاية الافتراضية", "/admin/messaging": "حوكمة الرسائل", "/admin/referrals": "حوكمة الإحالات", "/admin/experience": "حوكمة التجربة", "/admin/navigator-governance": "حوكمة موجّه الرعاية", "/admin/prescription-intelligence": "ذكاء الوصفات", "/admin/report-reader": "قارئ التقارير الطبية", "/admin/reminder-readiness": "جاهزية تذكيرات الدواء", "/admin/reminder-delivery-policy": "سياسة إرسال تذكيرات الدواء", "/admin/reminder-activation-readiness": "جاهزية تشغيل تذكيرات الدواء", "/admin/dependent-care": "حوكمة رعاية التابعين", "/admin/dependent-transition": "بروفة انتقال سن الرشد",
};

const routeTitleFor = (pathname: string, arabic: boolean) => {
  const titles = arabic ? arabicRouteTitles : routeTitles;
  const exactTitle = titles[pathname];
  if (exactTitle) return exactTitle;

  // Clerk renders multi-step authentication screens on nested catch-all routes
  // such as /sign-in/factor-one. They are valid parts of the sign-in flow, not
  // missing application pages.
  if (pathname.startsWith("/sign-in/")) return titles["/sign-in"];
  if (pathname.startsWith("/sign-up/")) return titles["/sign-up"];

  return arabic ? "الصفحة غير موجودة" : "Page not found";
};

export default function AccessibilitySync() {
  useEffect(() => {
    let activeDialog: HTMLElement | null = null;
    let dialogOpener: HTMLElement | null = null;
    let dialogSequence = 0;
    let fieldSequence = 0;
    let invalidFocusQueued = false;
    let syncFrame: number | null = null;
    let disposed = false;

    type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

    const validationMessage = (control: FormControl) => {
      const validity = control.validity;
      if (validity.valueMissing) return "This field is required.";
      if (validity.typeMismatch && control instanceof HTMLInputElement && control.type === "email") return "Enter a valid email address.";
      if (validity.tooShort && (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) return `Enter at least ${control.minLength} characters.`;
      if (validity.tooLong && (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) return `Use no more than ${control.maxLength} characters.`;
      if (validity.rangeUnderflow && control instanceof HTMLInputElement) return `Enter ${control.min} or more.`;
      if (validity.rangeOverflow && control instanceof HTMLInputElement) return `Enter ${control.max} or less.`;
      if (validity.patternMismatch) return control.title || "Use the requested format.";
      return control.validationMessage || "Check this field and try again.";
    };

    const clearFieldError = (control: FormControl) => {
      const errorId = control.dataset.validationError;
      if (!errorId) return;
      document.getElementById(errorId)?.remove();
      const describedBy = (control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((id) => id && id !== errorId);
      if (describedBy.length) control.setAttribute("aria-describedby", describedBy.join(" "));
      else control.removeAttribute("aria-describedby");
      control.removeAttribute("aria-invalid");
      delete control.dataset.validationError;
    };

    const showFieldError = (control: FormControl) => {
      if (control.validity.valid) { clearFieldError(control); return; }
      if (!control.id) control.id = `reyati-field-${++fieldSequence}`;
      const errorId = control.dataset.validationError || `${control.id}-error`;
      let message = document.getElementById(errorId);
      if (!message) {
        message = document.createElement("span");
        message.id = errorId;
        message.className = "field-validation-error";
        message.setAttribute("role", "alert");
        const label = control.closest("label");
        if (label?.contains(control)) label.append(message);
        else control.insertAdjacentElement("afterend", message);
      }
      message.textContent = validationMessage(control);
      control.dataset.validationError = errorId;
      control.setAttribute("aria-invalid", "true");
      const describedBy = new Set((control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
      describedBy.add(errorId);
      control.setAttribute("aria-describedby", [...describedBy].join(" "));
    };

    const sync = () => {
      const root = document.querySelector<HTMLElement>("main[dir]");
      const direction = root?.dir === "rtl" ? "rtl" : "ltr";
      const arabic = direction === "rtl";

      document.documentElement.dir = direction;
      document.documentElement.lang = arabic ? "ar" : "en";
      const routeTitle = routeTitleFor(window.location.pathname, arabic);
      document.title = `${routeTitle} · Qivaya`;

      const skipLink = document.querySelector<HTMLAnchorElement>(".skip-link");
      if (skipLink) skipLink.textContent = arabic ? "انتقل إلى المحتوى الرئيسي" : "Skip to main content";

      const main = document.querySelector<HTMLElement>("main");
      if (main && !main.id) main.id = "main-content";

      document.querySelectorAll<HTMLElement>("nav").forEach((nav) => {
        if (!nav.getAttribute("aria-label")) nav.setAttribute("aria-label", arabic ? "التنقل الرئيسي" : "Primary navigation");
      });

      document.querySelectorAll<HTMLAnchorElement>("nav a.active").forEach((link) => {
        link.setAttribute("aria-current", "page");
      });

      document.querySelectorAll<HTMLAnchorElement>('a[href="/notifications"]').forEach((link) => {
        if (!link.getAttribute("aria-label")) link.setAttribute("aria-label", arabic ? "الإشعارات" : "Notifications");
      });

      document.querySelectorAll<HTMLButtonElement>(".drawer-close, .drawer-x, .modal-close").forEach((button) => {
        if (!button.getAttribute("aria-label")) button.setAttribute("aria-label", arabic ? "إغلاق" : "Close");
      });
      document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        if (!button.getAttribute("aria-label") && button.textContent?.trim() === "×") {
          button.setAttribute("aria-label", arabic ? "إخفاء الرسالة" : "Dismiss message");
        }
      });

      document.querySelectorAll<HTMLElement>('[class*="-error"], [class*="-alert"]:not(.success), .moderation-live-state.error, .partner-live-state.error, .programme-live-state.error').forEach((message) => {
        message.setAttribute("role", "alert");
        message.setAttribute("aria-live", "assertive");
        message.setAttribute("aria-atomic", "true");
      });
      document.querySelectorAll<HTMLElement>('[class*="-toast"], [class*="-notice"], [class*="-alert"].success').forEach((message) => {
        if (!message.hasAttribute("role")) message.setAttribute("role", "status");
        if (!message.hasAttribute("aria-live")) message.setAttribute("aria-live", "polite");
        message.setAttribute("aria-atomic", "true");
      });
      document.querySelectorAll<HTMLElement>('[class*="-state"], .system-loading').forEach((state) => {
        state.setAttribute("role", "status");
        state.setAttribute("aria-live", "polite");
        state.setAttribute("aria-atomic", "true");
        if (/loading|checking|preparing|جارٍ|جاري/i.test(state.textContent ?? "")) state.setAttribute("aria-busy", "true");
        else state.removeAttribute("aria-busy");
      });
      document.querySelectorAll<HTMLFormElement>("form").forEach((form) => {
        const pendingButton = [...form.querySelectorAll<HTMLButtonElement>("button:disabled")].find((button) => /…|\.\.\.|جارٍ|جاري/.test(button.textContent ?? ""));
        if (pendingButton) form.setAttribute("aria-busy", "true");
        else form.removeAttribute("aria-busy");
      });

      const note = document.querySelector<HTMLTextAreaElement>(".case-collab textarea");
      const owner = document.querySelector<HTMLSelectElement>(".case-collab select");
      if (note) note.setAttribute("aria-label", arabic ? "ملاحظة داخلية" : "Internal note");
      if (owner) owner.setAttribute("aria-label", arabic ? "مالك الحالة" : "Case owner");

      const modalLayers = document.querySelectorAll<HTMLElement>('[class*="-layer"]');
      modalLayers.forEach((layer) => {
        const dialog = layer.querySelector<HTMLElement>("aside, section, form, [class*='dialog']");
        if (dialog) {
          dialog.setAttribute("role", "dialog");
          dialog.setAttribute("aria-modal", "true");
          if (!dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
          const heading = dialog.querySelector<HTMLElement>("h1, h2");
          if (heading) {
            if (!heading.id) heading.id = `reyati-dialog-title-${++dialogSequence}`;
            dialog.setAttribute("aria-labelledby", heading.id);
          } else if (!dialog.getAttribute("aria-label")) {
            dialog.setAttribute("aria-label", arabic ? "نافذة حوار" : "Dialog");
          }
          const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button")];
          const closeButton = dialog.querySelector<HTMLButtonElement>(".drawer-close, .drawer-x, .modal-close")
            ?? buttons.find((button) => [...button.classList].some((className) => className.endsWith("-close")))
            ?? buttons.find((button) => button.textContent?.trim() === "×")
            ?? buttons.find((button) => /^(close|cancel|go back)$/i.test(button.textContent?.trim() ?? ""));
          if (closeButton) {
            closeButton.dataset.dialogClose = "true";
            const closeLabel = closeButton.getAttribute("aria-label");
            const inheritedDismissLabel = closeLabel === "Dismiss message" || closeLabel === "إخفاء الرسالة";
            if (closeButton.textContent?.trim() === "×" && (!closeLabel || inheritedDismissLabel)) {
              closeButton.setAttribute("aria-label", arabic ? "إغلاق" : "Close");
            }
          }
        }
      });

      const latestDialog = modalLayers.item(modalLayers.length - 1)?.querySelector<HTMLElement>("aside, section, form, [class*='dialog']") ?? null;
      if (latestDialog && latestDialog !== activeDialog) {
        dialogOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        activeDialog = latestDialog;
        queueMicrotask(() => latestDialog.focus());
      } else if (!latestDialog && activeDialog) {
        activeDialog = null;
        const opener = dialogOpener;
        dialogOpener = null;
        if (opener?.isConnected) queueMicrotask(() => opener.focus());
      }

      document.body.classList.toggle("has-open-dialog", modalLayers.length > 0);
    };

    const scheduleSync = () => {
      if (disposed || syncFrame !== null) return;
      syncFrame = window.requestAnimationFrame(() => {
        syncFrame = null;
        if (!disposed) sync();
      });
    };

    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const layers = document.querySelectorAll<HTMLElement>('[class*="-layer"]');
        const activeLayer = layers.item(layers.length - 1);
        const closeButton = activeLayer?.querySelector<HTMLButtonElement>("[data-dialog-close='true'], .drawer-close, .drawer-x, .modal-close");
        if (closeButton) {
          event.preventDefault();
          closeButton.click();
        }
        return;
      }
      if (event.key !== "Tab" || !activeDialog) return;
      const selector = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const focusable = [...activeDialog.querySelectorAll<HTMLElement>(selector)].filter((element) => element.getClientRects().length > 0 && !element.closest('[aria-hidden="true"]'));
      if (!focusable.length) {
        event.preventDefault();
        activeDialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !activeDialog.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !activeDialog.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleInvalid = (event: Event) => {
      const control = event.target;
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return;
      showFieldError(control);
      if (!invalidFocusQueued) {
        invalidFocusQueued = true;
        requestAnimationFrame(() => { control.focus(); invalidFocusQueued = false; });
      }
    };

    const handleFieldInput = (event: Event) => {
      const control = event.target;
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return;
      if (!control.dataset.validationError) return;
      if (control.validity.valid) clearFieldError(control);
      else showFieldError(control);
    };

    document.addEventListener("keydown", handleDialogKeys);
    document.addEventListener("invalid", handleInvalid, true);
    document.addEventListener("input", handleFieldInput);
    document.addEventListener("change", handleFieldInput);
    let observer: MutationObserver | null = null;
    const initialSyncTimer = window.setTimeout(() => {
      if (disposed) return;
      sync();
      observer = new MutationObserver(scheduleSync);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["dir", "class", "disabled"] });
    }, 250);
    return () => {
      disposed = true;
      window.clearTimeout(initialSyncTimer);
      observer?.disconnect();
      if (syncFrame !== null) window.cancelAnimationFrame(syncFrame);
      document.removeEventListener("keydown", handleDialogKeys);
      document.removeEventListener("invalid", handleInvalid, true);
      document.removeEventListener("input", handleFieldInput);
      document.removeEventListener("change", handleFieldInput);
      document.body.classList.remove("has-open-dialog");
      activeDialog = null;
      dialogOpener = null;
    };
  }, []);

  return null;
}
