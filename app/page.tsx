"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PatientHeader from "@/app/components/PatientHeader";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";

type User = { displayName: string; email: string; status: string };
type Appointment = { id: string; providerName: string; specialty: string; facilityName: string | null; scheduledStart: string; scheduledEnd: string; mode: string; status: string };
type Service = { href: string; code: string; en: string; ar: string; descriptionEn: string; descriptionAr: string };
type ServiceGroup = { en: string; ar: string; descriptionEn: string; descriptionAr: string; services: Service[] };

const serviceGroups: ServiceGroup[] = [
  {
    en: "Care and appointments", ar: "الرعاية والمواعيد", descriptionEn: "Find, prepare for, and manage care.", descriptionAr: "ابحث عن الرعاية واستعد لها وأدرها.",
    services: [
      { href: "/navigator", code: "CG", en: "Care Navigator", ar: "موجّه الرعاية", descriptionEn: "Emergency-first guidance", descriptionAr: "إرشاد يبدأ بفحص الطوارئ" },
      { href: "/providers", code: "FC", en: "Find care", ar: "ابحث عن رعاية", descriptionEn: "Verified providers and availability", descriptionAr: "مقدمو رعاية موثّقون ومواعيد متاحة" },
      { href: "/facilities", code: "FD", en: "Facility directory", ar: "دليل المنشآت", descriptionEn: "Verified facility profiles", descriptionAr: "ملفات منشآت موثّقة" },
      { href: "/appointments", code: "AP", en: "Appointments", ar: "المواعيد", descriptionEn: "Book and manage visits", descriptionAr: "احجز الزيارات وأدرها" },
      { href: "/home-care", code: "HC", en: "Home care", ar: "الرعاية المنزلية", descriptionEn: "Approved services and verified workers", descriptionAr: "خدمات معتمدة وعاملون موثّقون" },
      { href: "/queue", code: "CI", en: "Digital check-in", ar: "تسجيل الوصول", descriptionEn: "Facility-owned queue status", descriptionAr: "حالة الانتظار من المنشأة" },
      { href: "/pre-visit-intake", code: "PV", en: "Pre-visit intake", ar: "ما قبل الزيارة", descriptionEn: "Share structured context", descriptionAr: "شارك سياقاً منظماً" },
      { href: "/appointment-preparation", code: "PR", en: "Visit preparation", ar: "الاستعداد للموعد", descriptionEn: "Provider-authored guidance", descriptionAr: "إرشادات من مقدم الرعاية" },
      { href: "/appointment-accommodations", code: "AC", en: "Accessibility support", ar: "تسهيلات الموعد", descriptionEn: "Request practical accommodations", descriptionAr: "اطلب تسهيلات عملية" },
      { href: "/post-visit-actions", code: "PA", en: "Post-visit actions", ar: "إجراءات ما بعد الزيارة", descriptionEn: "Track follow-up steps", descriptionAr: "تابع خطوات المتابعة" },
      { href: "/saved-care", code: "SC", en: "Saved care", ar: "الرعاية المحفوظة", descriptionEn: "Compare saved providers", descriptionAr: "قارن مقدمي الرعاية المحفوظين" },
      { href: "/reviews", code: "RV", en: "My reviews", ar: "مراجعاتي", descriptionEn: "Completed-visit reviews", descriptionAr: "مراجعات الزيارات المكتملة" },
    ],
  },
  {
    en: "My health", ar: "صحتي", descriptionEn: "Records, results, medicines, and personal tracking.", descriptionAr: "السجلات والنتائج والأدوية والمتابعة الشخصية.",
    services: [
      { href: "/wallet", code: "HR", en: "Health records", ar: "السجلات الصحية", descriptionEn: "Finalized visit information", descriptionAr: "معلومات الزيارات النهائية" },
      { href: "/care-timeline", code: "TL", en: "Care timeline", ar: "رحلة الرعاية", descriptionEn: "Source-labelled history", descriptionAr: "تاريخ موضح المصدر" },
      { href: "/care-plan", code: "CP", en: "Care plan", ar: "خطة الرعاية", descriptionEn: "Goals and follow-up", descriptionAr: "الأهداف والمتابعة" },
      { href: "/laboratory", code: "LB", en: "Laboratory", ar: "المختبر", descriptionEn: "Orders and issued results", descriptionAr: "الطلبات والنتائج الصادرة" },
      { href: "/sample-collection", code: "HS", en: "Home sample collection", ar: "جمع العينات من المنزل", descriptionEn: "Verified collection workflow", descriptionAr: "مسار جمع موثّق" },
      { href: "/diagnostic-imaging", code: "IM", en: "Diagnostic imaging", ar: "التصوير التشخيصي", descriptionEn: "Orders and final reports", descriptionAr: "الطلبات والتقارير النهائية" },
      { href: "/pharmacy", code: "PH", en: "Pharmacy and refills", ar: "الصيدلية والتجديد", descriptionEn: "Controlled fulfilment", descriptionAr: "تنفيذ مضبوط" },
      { href: "/encounter-follow-up", code: "FU", en: "Visit follow-up", ar: "متابعة الزيارة", descriptionEn: "Linked updates and amendments", descriptionAr: "تحديثات وتعديلات مرتبطة" },
      { href: "/health-profile", code: "HP", en: "Health profile", ar: "ملفي الصحي", descriptionEn: "Patient-entered information", descriptionAr: "معلومات تدخلها أنت" },
      { href: "/emergency-profile", code: "EP", en: "Emergency profile", ar: "ملف الطوارئ", descriptionEn: "Critical information you enter", descriptionAr: "معلومات مهمة تدخلها أنت" },
      { href: "/immunizations", code: "IZ", en: "Immunizations", ar: "التطعيمات", descriptionEn: "Private personal history", descriptionAr: "سجل شخصي خاص" },
      { href: "/screening-history", code: "SH", en: "Screening history", ar: "الفحوصات الوقائية", descriptionEn: "Plans and completion status", descriptionAr: "الخطط وحالة الإكمال" },
      { href: "/health-measurements", code: "HM", en: "Health measurements", ar: "القياسات الصحية", descriptionEn: "Values with clear provenance", descriptionAr: "قيم بمصدر واضح" },
      { href: "/symptom-journal", code: "SJ", en: "Symptom journal", ar: "مفكرة الأعراض", descriptionEn: "Private, non-diagnostic notes", descriptionAr: "ملاحظات خاصة غير تشخيصية" },
      { href: "/wellness-journal", code: "WJ", en: "Wellness journal", ar: "مفكرة العافية", descriptionEn: "Sleep, activity, and energy", descriptionAr: "النوم والنشاط والطاقة" },
    ],
  },
  {
    en: "Documents and connections", ar: "المستندات والاتصالات", descriptionEn: "Organize records and connection preferences.", descriptionAr: "نظّم السجلات وتفضيلات الاتصال.",
    services: [
      { href: "/document-capture", code: "DC", en: "Document capture", ar: "مسودات المستندات", descriptionEn: "Human-reviewed drafts", descriptionAr: "مسودات بمراجعة بشرية" },
      { href: "/record-index", code: "RI", en: "Record index", ar: "فهرس السجلات", descriptionEn: "Private source-labelled index", descriptionAr: "فهرس خاص موضح المصدر" },
      { href: "/sharing-directives", code: "SD", en: "Sharing directives", ar: "توجيهات المشاركة", descriptionEn: "Preferences without access grants", descriptionAr: "تفضيلات دون منح الوصول" },
      { href: "/access-history", code: "AH", en: "Access history", ar: "سجل الوصول", descriptionEn: "Recorded Qivaya activity", descriptionAr: "نشاط كيفايا المسجل" },
      { href: "/data-quality", code: "DQ", en: "Data quality", ar: "جودة البيانات", descriptionEn: "Flag an issue for review", descriptionAr: "أشر إلى مشكلة للمراجعة" },
      { href: "/connections", code: "HC", en: "Health connections", ar: "اتصالات السجلات", descriptionEn: "Future connection requests", descriptionAr: "طلبات اتصال مستقبلية" },
      { href: "/device-connections", code: "WD", en: "Wearable connections", ar: "اتصالات الأجهزة", descriptionEn: "Consent-bound requests", descriptionAr: "طلبات مرتبطة بالموافقة" },
    ],
  },
  {
    en: "Account and support", ar: "الحساب والدعم", descriptionEn: "Manage access, preferences, payments, and help.", descriptionAr: "أدر الوصول والتفضيلات والمدفوعات والمساعدة.",
    services: [
      { href: "/account/profile", code: "MP", en: "My profile", ar: "ملفي الشخصي", descriptionEn: "Qivaya profile details", descriptionAr: "بيانات ملف كيفايا" },
      { href: "/family", code: "FA", en: "Family access", ar: "وصول العائلة", descriptionEn: "Revocable delegated access", descriptionAr: "وصول مفوض قابل للسحب" },
      { href: "/insurance", code: "IN", en: "Insurance", ar: "التأمين", descriptionEn: "Eligibility and authorization", descriptionAr: "الأهلية والموافقات" },
      { href: "/benefits", code: "BE", en: "Benefits", ar: "مزاياي", descriptionEn: "Consent-bound eligibility", descriptionAr: "أهلية مرتبطة بالموافقة" },
      { href: "/payments", code: "PY", en: "Payments", ar: "المدفوعات", descriptionEn: "Account-owned ledger status", descriptionAr: "حالة سجل المدفوعات" },
      { href: "/payment-support", code: "PS", en: "Payment support", ar: "دعم المدفوعات", descriptionEn: "Track recorded issues", descriptionAr: "تابع المشكلات المسجلة" },
      { href: "/consents", code: "CN", en: "Consent Center", ar: "مركز الموافقات", descriptionEn: "Purpose-specific consent", descriptionAr: "موافقات محددة الغرض" },
      { href: "/privacy-rights", code: "PR", en: "Privacy rights", ar: "حقوق الخصوصية", descriptionEn: "Export and correction requests", descriptionAr: "طلبات التصدير والتصحيح" },
      { href: "/account/security", code: "AS", en: "Account security", ar: "أمان الحساب", descriptionEn: "Review Qivaya sessions", descriptionAr: "راجع جلسات كيفايا" },
      { href: "/notification-preferences", code: "NP", en: "Notification preferences", ar: "تفضيلات الإشعارات", descriptionEn: "Controls by category and channel", descriptionAr: "تحكم حسب الفئة والقناة" },
      { href: "/settings/accessibility", code: "LA", en: "Language and accessibility", ar: "اللغة وإمكانية الوصول", descriptionEn: "Personal experience preferences", descriptionAr: "تفضيلات التجربة الشخصية" },
      { href: "/support", code: "SU", en: "Support", ar: "الدعم", descriptionEn: "Create and track requests", descriptionAr: "أنشئ الطلبات وتابعها" },
      { href: "/complaints", code: "CS", en: "Complaints and safety", ar: "الشكاوى والسلامة", descriptionEn: "Separate protected routing", descriptionAr: "توجيه منفصل ومحمي" },
      { href: "/service-status", code: "SS", en: "Service status", ar: "حالة الخدمات", descriptionEn: "Known operational updates", descriptionAr: "تحديثات تشغيلية معروفة" },
      { href: "/health-library", code: "HL", en: "Health library", ar: "مكتبة الصحة", descriptionEn: "Reviewed bilingual content", descriptionAr: "محتوى ثنائي اللغة بمراجعة" },
    ],
  },
];

function formatVisit(value: string, lang: "en" | "ar") {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-QA" : "en-QA", { timeZone: "Asia/Qatar", dateStyle: "full", timeStyle: "short" }).format(new Date(value));
}

export default function Home() {
  const [lang, setLang] = useReyatiLocale();
  const ar = lang === "ar";
  const [user, setUser] = useState<User | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [serviceQuery, setServiceQuery] = useState("");
  const [referenceTime] = useState(() => Date.now());

  const loadWorkspace = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const [identityResponse, appointmentResponse] = await Promise.all([
        fetch("/api/me", { cache: "no-store", signal }),
        fetch("/api/appointments", { cache: "no-store", signal }),
      ]);
      if (identityResponse.status === 401 || appointmentResponse.status === 401) {
        window.location.assign(`/signin-with-chatgpt?return_to=${encodeURIComponent("/")}`); return;
      }
      const identity = await identityResponse.json().catch(() => ({})) as { user?: User; error?: string };
      const schedule = await appointmentResponse.json().catch(() => ({})) as { appointments?: Appointment[]; error?: string };
      if (!identityResponse.ok) throw new Error(identity.error || "Your Qivaya identity is temporarily unavailable");
      if (!appointmentResponse.ok) throw new Error(schedule.error || "Appointments are temporarily unavailable");
      setUser(identity.user || null); setAppointments(schedule.appointments || []);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Qivaya is temporarily unavailable");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void loadWorkspace(controller.signal); });
    return () => controller.abort();
  }, [loadWorkspace]);

  const nextAppointment = useMemo(() => appointments
    .filter((item) => ["pending", "confirmed"].includes(item.status) && new Date(item.scheduledEnd).valueOf() > referenceTime)
    .sort((a, b) => new Date(a.scheduledStart).valueOf() - new Date(b.scheduledStart).valueOf())[0] || null, [appointments, referenceTime]);

  const filteredGroups = useMemo(() => {
    const query = serviceQuery.trim().toLocaleLowerCase(lang === "ar" ? "ar" : "en");
    if (!query) return serviceGroups;
    return serviceGroups.map((group) => ({ ...group, services: group.services.filter((service) => `${service.en} ${service.ar} ${service.descriptionEn} ${service.descriptionAr}`.toLocaleLowerCase().includes(query)) })).filter((group) => group.services.length);
  }, [lang, serviceQuery]);

  const displayName = user?.displayName || (ar ? "عضو كيفايا" : "Qivaya member");

  return <main id="main-content" className={`home-experience${ar ? " arabic" : ""}`} dir={ar ? "rtl" : "ltr"}>
    <PatientHeader ar={ar} displayName={displayName} onLocaleChange={() => setLang(ar ? "en" : "ar")} active="home" />

    <section className="home-hero-v2">
      <div className="home-hero-copy">
        <p className="home-kicker">{ar ? "رعاية مترابطة بذكاء" : "CARE, INTELLIGENTLY CONNECTED"}</p>
        <h1>{loading ? (ar ? "مرحباً بك في كيفايا" : "Welcome to Qivaya") : (ar ? `مرحباً، ${displayName}` : `Welcome, ${displayName}`)}</h1>
        <p className="home-lead">{ar ? "رعايتك ومواعيدك وسجلاتك في مساحة آمنة وواضحة، مصممة لتساعدك على معرفة الخطوة التالية." : "Your care, appointments, and records in one secure, clear workspace—designed to make the next step easy to understand."}</p>
        <div className="home-primary-actions">
          <a className="home-button primary" href="/providers">{ar ? "ابحث عن رعاية" : "Find care"}</a>
          <a className="home-button secondary" href="/navigator">{ar ? "ابدأ بموجّه الرعاية" : "Start with Care Navigator"}</a>
        </div>
        <p className="home-emergency"><span aria-hidden="true">999</span>{ar ? "لحالة طارئة تهدد الحياة في قطر، اتصل على 999 فوراً." : "For a life-threatening emergency in Qatar, call 999 immediately."}</p>
      </div>
      <div className="home-hero-visual" aria-hidden="true">
        <img src="/brand/care-conversation.webp" alt="" width="960" height="640" decoding="async" fetchPriority="high" />
        <span className="home-weave cyan" /><span className="home-weave white" /><span className="home-weave sand" />
      </div>
    </section>

    <section className="home-dashboard" aria-label={ar ? "مساحة الرعاية" : "Care workspace"}>
      {error && <div className="home-alert" role="alert"><span>{error}</span><button type="button" onClick={() => void loadWorkspace()}>{ar ? "حاول مرة أخرى" : "Try again"}</button></div>}

      <section className="home-priority-grid">
        <article className="home-appointment-card">
          <div className="home-section-title"><div><span>{ar ? "موعدك القادم" : "NEXT APPOINTMENT"}</span><h2>{ar ? "خطة رعايتك التالية" : "Your next care step"}</h2></div><a href="/appointments">{ar ? "كل المواعيد" : "All appointments"}</a></div>
          {loading ? <div className="home-state"><span className="home-skeleton" /><div><b>{ar ? "جارٍ تحميل جدولك…" : "Loading your schedule…"}</b><small>{ar ? "نتحقق من أحدث حالة." : "Checking the latest status."}</small></div></div>
            : error ? <div className="home-state error"><span aria-hidden="true">!</span><div><b>{ar ? "حالة الموعد غير متاحة" : "Appointment status unavailable"}</b><small>{ar ? "تعذر تأكيد أحدث جدول. حاول مرة أخرى قبل الاعتماد على هذا القسم." : "The latest schedule could not be confirmed. Try again before relying on this section."}</small></div><button type="button" onClick={() => void loadWorkspace()}>{ar ? "إعادة المحاولة" : "Retry"}</button></div>
            : nextAppointment ? <div className="home-next-appointment"><time dateTime={nextAppointment.scheduledStart}><b>{new Date(nextAppointment.scheduledStart).toLocaleDateString(lang === "ar" ? "ar-QA" : "en-QA", { day: "2-digit" })}</b><span>{new Date(nextAppointment.scheduledStart).toLocaleDateString(lang === "ar" ? "ar-QA" : "en-QA", { month: "short" })}</span></time><div><span className="home-status">{nextAppointment.status.replaceAll("_", " ")}</span><h3>{nextAppointment.providerName}</h3><p>{formatVisit(nextAppointment.scheduledStart, lang)} · {nextAppointment.specialty}</p><small>{nextAppointment.facilityName || (ar ? "استشارة فيديو" : "Video consultation")}</small></div><a href="/appointments">{ar ? "عرض التفاصيل" : "View details"}</a></div>
            : <div className="home-empty-state"><span aria-hidden="true">01</span><div><h3>{ar ? "لا يوجد موعد قادم" : "No upcoming appointment"}</h3><p>{ar ? "ابحث عن مقدم رعاية موثّق واختر وقتاً منشوراً عندما تكون مستعداً." : "Choose a verified provider and a published time whenever you are ready."}</p></div><a href="/providers">{ar ? "ابحث عن رعاية" : "Find care"}</a></div>}
        </article>

        <aside className="home-quick-panel">
          <div className="home-section-title"><div><span>{ar ? "الوصول السريع" : "QUICK ACCESS"}</span><h2>{ar ? "ما الذي تحتاجه؟" : "What do you need?"}</h2></div></div>
          <div className="home-quick-links">
            <a href="/appointments"><span>AP</span><div><b>{ar ? "إدارة المواعيد" : "Manage appointments"}</b><small>{ar ? "الحجز والمراجعة والإلغاء" : "Book, review, or cancel"}</small></div></a>
            <a href="/wallet"><span>HR</span><div><b>{ar ? "فتح السجلات الصحية" : "Open health records"}</b><small>{ar ? "الزيارات والنتائج النهائية" : "Visits and final results"}</small></div></a>
            <a href="/notifications"><span>UP</span><div><b>{ar ? "عرض التحديثات" : "View updates"}</b><small>{ar ? "إشعارات آمنة ومملوكة للحساب" : "Secure account-owned notices"}</small></div></a>
            <a href="/support"><span>SU</span><div><b>{ar ? "الحصول على الدعم" : "Get support"}</b><small>{ar ? "أنشئ طلباً وتابعه" : "Create and track a request"}</small></div></a>
          </div>
        </aside>
      </section>

      <section className="home-hubs">
        <div className="home-section-title wide"><div><span>{ar ? "مساحة رعايتك" : "YOUR CARE WORKSPACE"}</span><h2>{ar ? "كل ما تحتاجه، منظماً حولك" : "Everything you need, organized around you"}</h2><p>{ar ? "ابدأ بالوجهة المناسبة بدلاً من البحث في قائمة طويلة." : "Start with the right destination instead of scanning a long list."}</p></div></div>
        <div className="home-hub-grid">
          <a href="/providers" className="home-hub-card care"><span>01</span><div><small>{ar ? "ابحث واحجز" : "DISCOVER AND BOOK"}</small><h3>{ar ? "العثور على الرعاية" : "Find the right care"}</h3><p>{ar ? "مقدمو رعاية موثّقون ومنشآت وأوقات متاحة." : "Verified providers, facilities, and published availability."}</p><b>{ar ? "استكشف الرعاية" : "Explore care"}</b></div></a>
          <a href="/wallet" className="home-hub-card health"><span>02</span><div><small>{ar ? "السجلات والمتابعة" : "RECORDS AND FOLLOW-UP"}</small><h3>{ar ? "فهم حالتك الصحية" : "Understand your health"}</h3><p>{ar ? "السجلات والنتائج والأدوية وخطة الرعاية في مكان واحد." : "Records, results, medicines, and your care plan in one place."}</p><b>{ar ? "افتح صحتي" : "Open My Health"}</b></div></a>
          <a href="/auth" className="home-hub-card account"><span>03</span><div><small>{ar ? "الوصول والتفضيلات" : "ACCESS AND PREFERENCES"}</small><h3>{ar ? "إدارة حسابك" : "Manage your account"}</h3><p>{ar ? "العائلة والخصوصية والموافقات والأمان والتفضيلات." : "Family, privacy, consent, security, and preferences."}</p><b>{ar ? "إعدادات الحساب" : "Account settings"}</b></div></a>
        </div>
      </section>

      <section className="home-service-catalogue">
        <div className="home-catalogue-heading">
          <div><span>{ar ? "جميع الخدمات" : "ALL SERVICES"}</span><h2>{ar ? "ابحث عن أي خدمة في كيفايا" : "Find any Qivaya service"}</h2><p>{ar ? "الخدمات المتخصصة مجمّعة حسب ما تريد إنجازه." : "Specialist services are grouped by what you want to accomplish."}</p></div>
          <label className="home-service-search"><span className="sr-only">{ar ? "البحث في الخدمات" : "Search services"}</span><input type="search" value={serviceQuery} onChange={(event) => setServiceQuery(event.target.value)} placeholder={ar ? "ابحث في الخدمات…" : "Search services…"} /></label>
        </div>
        <div className="home-service-groups">
          {filteredGroups.length ? filteredGroups.map((group, index) => <details key={group.en} open={Boolean(serviceQuery) || index === 0}>
            <summary><div><h3>{ar ? group.ar : group.en}</h3><p>{ar ? group.descriptionAr : group.descriptionEn}</p></div><span>{group.services.length}</span></summary>
            <div className="home-service-list">{group.services.map((service) => <a href={service.href} key={service.href}><span>{service.code}</span><div><b>{ar ? service.ar : service.en}</b><small>{ar ? service.descriptionAr : service.descriptionEn}</small></div><i aria-hidden="true">→</i></a>)}</div>
          </details>) : <div className="home-no-results"><b>{ar ? "لم نجد خدمة مطابقة" : "No matching service found"}</b><p>{ar ? "جرّب كلمة أخرى أو امسح البحث لعرض جميع الخدمات." : "Try another term or clear the search to see every service."}</p><button type="button" onClick={() => setServiceQuery("")}>{ar ? "مسح البحث" : "Clear search"}</button></div>}
        </div>
      </section>

      <section className="home-trust-strip"><span aria-hidden="true">i</span><div><b>{ar ? "بيانات حقيقية فقط" : "Only real account activity"}</b><p>{ar ? "لا تخترع كيفايا معلومات لهذه الصفحة. تبقى الحالات الفارغة فارغة حتى تنشئ نشاطاً عبر مسارات كيفايا الآمنة." : "Qivaya does not invent information for this page. Empty states remain empty until activity is created through secure Qivaya workflows."}</p></div><a href="/privacy-rights">{ar ? "الخصوصية" : "Privacy"}</a></section>
    </section>

    <footer className="home-footer-v2"><div><img src="/brand/qivaya-logo-primary.png" alt="Qivaya" /><p>{ar ? "رعاية مترابطة بذكاء." : "Care, intelligently connected."}</p></div><nav aria-label={ar ? "روابط التذييل" : "Footer links"}><a href="/support">{ar ? "الدعم" : "Support"}</a><a href="/privacy-rights">{ar ? "الخصوصية" : "Privacy"}</a><a href="/settings/accessibility">{ar ? "إمكانية الوصول" : "Accessibility"}</a><a href="/service-status">{ar ? "حالة الخدمات" : "Service status"}</a></nav><small>{ar ? "مساحة مريض موثقة" : "Authenticated patient workspace"}</small></footer>
  </main>;
}
