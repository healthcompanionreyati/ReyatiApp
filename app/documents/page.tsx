"use client";

import { type ChangeEvent, type FormEvent, useCallback, useEffect, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import { reyatiDate, reyatiLabel, reyatiNumber } from "@/lib/reyati-i18n";

type DocumentItem = {
  id: string;
  category: string;
  status: string;
  verificationStatus: string;
  contentType: string;
  sizeBytes: number;
  pageCount: number | null;
  capturedAt: string | null;
  malwareScanStatus: string;
  retentionState: string;
  createdAt: string;
};
type Share = { id: string; documentId: string; providerName: string; organizationName: string | null; purpose: string; status: string; expiresAt: string; revokedAt: string | null };
type Provider = { id: string; name: string; specialty: string; organizationName: string };
type Workspace = {
  documents: DocumentItem[];
  shares: Share[];
  eligibleProviders: Provider[];
  readiness: { uploadEnabled: boolean; deliveryEnabled: boolean; storageConfigured: boolean; malwareScannerConfigured: boolean };
  limits: { maxFileBytes: number; maxPages: number; maxShareDays: number; acceptedTypes: string[] };
};
type UploadSession = { id: string; version: number; status: string; expiresAt: string };

const categories = ["laboratory_report", "radiology_report", "prescription", "discharge_summary", "referral_letter", "vaccination_record", "medical_certificate", "insurance_card", "other"];

function size(bytes: number, lang: "en" | "ar") {
  return bytes < 1024 * 1024
    ? `${reyatiNumber(Math.ceil(bytes / 1024), lang)} KB`
    : `${reyatiNumber(bytes / 1024 / 1024, lang, { maximumFractionDigits: 1 })} MB`;
}

function documentExtension(contentType: string) {
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "image/jpeg") return "jpg";
  return "png";
}

export default function MedicalDocumentsPage() {
  const [lang, setLang] = useReyatiLocale();
  const ar = lang === "ar";
  const title = useCallback((value: string) => reyatiLabel(value, lang), [lang]);
  const date = useCallback((value: string | null) => value ? reyatiDate(value, lang, { dateStyle: "medium" }) : ar ? "غير مسجل" : "Not recorded", [ar, lang]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revoking, setRevoking] = useState("");
  const [downloading, setDownloading] = useState("");
  const [sharingDocument, setSharingDocument] = useState<DocumentItem | null>(null);
  const [providerId, setProviderId] = useState("");
  const [purpose, setPurpose] = useState("continuity_of_care");
  const [expiryDays, setExpiryDays] = useState(7);
  const [sharing, setSharing] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState("other");
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState("");

  const load = useCallback(async (signal?: AbortSignal, quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/patient/documents", { cache: "no-store", signal });
      if (response.status === 401) { window.location.assign("/sign-in?redirect_url=/documents"); return; }
      const payload = await response.json().catch(() => ({})) as { data?: Workspace; message?: string };
      if (!response.ok || !payload.data) throw new Error(ar ? "مستنداتك الطبية غير متاحة مؤقتاً." : payload.message || "Your medical documents are temporarily unavailable.");
      setWorkspace(payload.data);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(ar ? "مستنداتك الطبية غير متاحة مؤقتاً." : caught instanceof Error ? caught.message : "Your medical documents are temporarily unavailable.");
    } finally {
      if (!signal?.aborted && !quiet) setLoading(false);
    }
  }, [ar]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(controller.signal));
    return () => controller.abort();
  }, [load]);

  const hasProcessingDocument = workspace?.documents.some((document) => document.status === "scanning" || document.malwareScanStatus === "pending") ?? false;
  useEffect(() => {
    if (!hasProcessingDocument) return;
    const timer = window.setInterval(() => void load(undefined, true), 8_000);
    return () => window.clearInterval(timer);
  }, [hasProcessingDocument, load]);

  async function revoke(shareId: string) {
    setRevoking(shareId); setError("");
    try {
      const response = await fetch("/api/patient/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revoke_share", shareId }) });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(ar ? "تعذر إلغاء الوصول." : payload.message || "The share could not be revoked.");
      setNotice(ar ? "تم إلغاء وصول مقدم الرعاية فوراً." : "Provider access was revoked immediately.");
      await load(undefined, true);
    } catch (caught) { setError(ar ? "تعذر إلغاء الوصول." : caught instanceof Error ? caught.message : "The share could not be revoked."); }
    finally { setRevoking(""); }
  }

  async function share(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sharingDocument || !providerId) return;
    setSharing(true); setError("");
    try {
      const response = await fetch("/api/patient/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "share", documentId: sharingDocument.id, providerId, purpose, expiryDays }) });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(ar ? "تعذر منح الوصول." : payload.message || "Access could not be granted.");
      setSharingDocument(null); setProviderId("");
      setNotice(ar ? "تم منح وصول محدد المدة وتسجيله في سجل التدقيق." : "Time-limited provider access granted and recorded in the audit ledger.");
      await load(undefined, true);
    } catch (caught) { setError(ar ? "تعذر منح الوصول." : caught instanceof Error ? caught.message : "Access could not be granted."); }
    finally { setSharing(false); }
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError("");
    if (!file || !workspace) { setUploadFile(file); return; }
    if (!workspace.limits.acceptedTypes.includes(file.type)) {
      setUploadFile(null);
      setError(ar ? "اختر ملف PDF أو JPEG أو PNG." : "Choose a PDF, JPEG, or PNG file.");
      event.target.value = "";
      return;
    }
    if (file.size < 1 || file.size > workspace.limits.maxFileBytes) {
      setUploadFile(null);
      setError(ar ? "يجب ألا يتجاوز حجم المستند 10 ميغابايت." : "The document must be no larger than 10 MB.");
      event.target.value = "";
      return;
    }
    setUploadFile(file);
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uploadFile || !workspace?.readiness.uploadEnabled) return;
    setUploading(true); setError(""); setUploadStage(ar ? "جارٍ إنشاء جلسة رفع محمية…" : "Creating protected upload session…");
    let session: UploadSession | null = null;
    try {
      const requestResponse = await fetch("/api/patient/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_upload", idempotencyKey: crypto.randomUUID(), category: uploadCategory, contentType: uploadFile.type, sizeBytes: uploadFile.size }),
      });
      const requestPayload = await requestResponse.json().catch(() => ({})) as { data?: UploadSession; message?: string };
      if (!requestResponse.ok || !requestPayload.data) throw new Error(requestPayload.message || (ar ? "تعذر بدء الرفع." : "The upload could not be started."));
      session = requestPayload.data;
      setUploadStage(ar ? "جارٍ تشفير النقل وتخزين المستند بشكل خاص…" : "Transferring securely to private storage…");
      const uploadResponse = await fetch("/api/documents/upload", {
        method: "POST",
        headers: { "Content-Type": uploadFile.type, "x-qivaya-upload-session-id": session.id, "x-qivaya-upload-version": String(session.version) },
        body: uploadFile,
      });
      const uploadPayload = await uploadResponse.json().catch(() => ({})) as { data?: { documentId: string }; error?: string };
      if (!uploadResponse.ok || !uploadPayload.data) throw new Error(uploadPayload.error || (ar ? "تعذر إكمال الرفع." : "The upload could not be completed."));
      setUploadOpen(false); setUploadFile(null); setUploadCategory("other");
      setNotice(ar ? "تم رفع المستند. يتم فحصه الآن قبل إتاحته." : "Document uploaded. It is being scanned before it becomes available.");
      await load(undefined, true);
    } catch (caught) {
      if (session) {
        await fetch("/api/patient/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel_upload", uploadSessionId: session.id, expectedVersion: session.version }) }).catch(() => undefined);
      }
      setError(caught instanceof Error ? caught.message : ar ? "تعذر رفع المستند." : "The document could not be uploaded.");
    } finally { setUploading(false); setUploadStage(""); }
  }

  async function download(document: DocumentItem) {
    setDownloading(document.id); setError("");
    try {
      const grantResponse = await fetch("/api/documents/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: document.id }) });
      const grant = await grantResponse.json().catch(() => ({})) as { data?: { token: string }; error?: string };
      if (!grantResponse.ok || !grant.data) throw new Error(grant.error || (ar ? "تعذر فتح المستند." : "The document could not be opened."));
      const contentResponse = await fetch("/api/documents/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: grant.data.token }) });
      if (!contentResponse.ok) throw new Error(ar ? "تعذر تنزيل المستند." : "The document could not be downloaded.");
      const url = URL.createObjectURL(await contentResponse.blob());
      const anchor = window.document.createElement("a");
      anchor.href = url; anchor.download = `qivaya-${document.category}.${documentExtension(document.contentType)}`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (caught) { setError(caught instanceof Error ? caught.message : ar ? "تعذر تنزيل المستند." : "The document could not be downloaded."); }
    finally { setDownloading(""); }
  }

  const uploadEnabled = workspace?.readiness.uploadEnabled ?? false;
  const deliveryEnabled = workspace?.readiness.deliveryEnabled ?? false;

  return <main className={`documents-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"} id="main-content">
    <header className="documents-header">
      <a href="/" className="brand"><img src="/brand/qivaya-logo-primary.png" alt="Qivaya"/></a>
      <nav aria-label={ar ? "تنقل المريض" : "Patient navigation"}><a href="/providers">{ar ? "ابحث عن رعاية" : "Find care"}</a><a href="/appointments">{ar ? "المواعيد" : "Appointments"}</a><a href="/wallet">{ar ? "السجلات الصحية" : "Health records"}</a><a className="active" href="/documents">{ar ? "المستندات" : "Documents"}</a><a href="/support">{ar ? "الدعم" : "Support"}</a></nav>
      <div className="documents-header-actions"><button className="lang" type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications" className="documents-account">{ar ? "الإشعارات" : "Notifications"}</a></div>
    </header>
    <section className="documents-hero"><div><p>{ar ? "خزنة مستندات مملوكة للمريض" : "Patient-owned document vault"}</p><h1>{ar ? "مستنداتك الطبية، تحت سيطرتك" : "Your medical documents, under your control"}</h1><span>{ar ? "ارفع المستندات بأمان، تابع فحصها، وشاركها لفترة محددة مع مقدمي الرعاية الموثّقين." : "Upload securely, follow every scan, and share for a limited time with verified care providers."}</span></div><button type="button" disabled={!uploadEnabled} onClick={() => setUploadOpen(true)}>{uploadEnabled ? (ar ? "رفع مستند" : "Upload document") : (ar ? "الرفع غير متاح" : "Upload unavailable")}</button></section>

    <section className={`documents-boundary ${uploadEnabled ? "active" : ""}`}><span>{uploadEnabled ? "✓" : "i"}</span><div><b>{uploadEnabled ? (ar ? "مسار المستند المحمي نشط." : "Protected document path is active.") : (ar ? "مسار المستند يعمل بوضع القراءة فقط." : "Document vault is in read-only mode.")}</b><p>{uploadEnabled ? (ar ? "يتم تخزين الملفات بشكل خاص وفحصها قبل إتاحتها، ولا يتم نشر روابط تخزين عامة." : "Files are stored privately and scanned before access; public storage links are never exposed.") : (ar ? "تم إعداد التخزين الخاص، لكن الرفع سيظل مغلقاً حتى اكتمال تهيئة الفاحص التجاري وضوابط المعالجة." : "Private storage is prepared, but uploads remain closed until the commercial scanner and processing gates are fully configured.")}</p></div></section>

    {notice && <div className="documents-notice" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label={ar ? "إخفاء" : "Dismiss"}>×</button></div>}
    {error && <div className="documents-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>{ar ? "إغلاق" : "Dismiss"}</button></div>}
    {loading ? <section className="documents-state"><span>◌</span><h2>{ar ? "جارٍ تحميل مساحة مستنداتك" : "Loading your document vault"}</h2><p>{ar ? "جارٍ التحقق من مستنداتك ومنح الوصول." : "Checking your documents and access grants."}</p></section> : workspace && <div className="documents-grid">
      <section className="documents-card documents-readiness"><div className="documents-card-head"><div><p>{ar ? "حماية المستند" : "DOCUMENT PROTECTION"}</p><h2>{ar ? "حالة مسار المستند" : "Document pipeline status"}</h2></div><span className={`documents-status ${uploadEnabled ? "ready" : "pending"}`}>{uploadEnabled ? (ar ? "نشط" : "Active") : (ar ? "قراءة فقط" : "Read only")}</span></div><ul>
        <li className={workspace.readiness.storageConfigured ? "ready" : ""}><span>{workspace.readiness.storageConfigured ? "✓" : "1"}</span><div><b>{ar ? "تخزين خاص" : "Private storage"}</b><small>{workspace.readiness.storageConfigured ? (ar ? "R2 متصل من الخادم فقط" : "Server-only R2 connected") : (ar ? "بانتظار التكوين" : "Awaiting configuration")}</small></div></li>
        <li className={workspace.readiness.malwareScannerConfigured ? "ready" : ""}><span>{workspace.readiness.malwareScannerConfigured ? "✓" : "2"}</span><div><b>{ar ? "فحص وحجر" : "Scan and quarantine"}</b><small>{workspace.readiness.malwareScannerConfigured ? (ar ? "الفاحص الخاص متصل" : "Private scanner connected") : (ar ? "بانتظار الفاحص التجاري" : "Awaiting commercial scanner")}</small></div></li>
        <li className={deliveryEnabled ? "ready" : ""}><span>{deliveryEnabled ? "✓" : "3"}</span><div><b>{ar ? "تسليم مصرح به" : "Authorized delivery"}</b><small>{deliveryEnabled ? (ar ? "تنزيلات قصيرة العمر ومدققة" : "Short-lived, audited downloads") : (ar ? "التنزيل غير مفعل" : "Download gate inactive")}</small></div></li>
      </ul><p className="documents-limits">PDF, JPEG, PNG · {size(workspace.limits.maxFileBytes, lang)} · {reyatiNumber(workspace.limits.maxPages, lang)} {ar ? "صفحة كحد أقصى" : "pages maximum"} · {ar ? "مشاركة حتى" : "share for up to"} {reyatiNumber(workspace.limits.maxShareDays, lang)} {ar ? "يوماً" : "days"}</p></section>

      <section className="documents-card documents-library"><div className="documents-card-head"><div><p>{ar ? "مكتبتك" : "YOUR LIBRARY"}</p><h2>{ar ? "المستندات المملوكة لك" : "Your documents"}</h2></div><span>{reyatiNumber(workspace.documents.length, lang)} {ar ? "عنصر" : "items"}</span></div>{workspace.documents.length === 0 ? <div className="documents-empty"><span>▤</span><h3>{ar ? "لا توجد مستندات بعد" : "No documents yet"}</h3><p>{uploadEnabled ? (ar ? "ارفع أول مستند لتبدأ خزنتك." : "Upload your first document to start your vault.") : (ar ? "سيظهر مستندك الأول هنا عند تفعيل الرفع." : "Your first document will appear here when upload is activated.")}</p></div> : <div className="documents-list">{workspace.documents.map((document) => {
        const ready = document.status === "ready" && document.malwareScanStatus === "clean" && document.retentionState === "active";
        const processing = document.status === "scanning" || document.malwareScanStatus === "pending";
        return <article key={document.id}><span className="document-icon">▤</span><div><b>{title(document.category)}</b><small>{date(document.capturedAt || document.createdAt)} · {size(document.sizeBytes, lang)}{document.pageCount ? ` · ${reyatiNumber(document.pageCount, lang)} ${ar ? "صفحة" : "pages"}` : ""}</small><em>{processing ? (ar ? "قيد الفحص الأمني" : "Security scan in progress") : `${title(document.verificationStatus)} · ${title(document.status)}`}</em></div><div className="document-actions">{ready && deliveryEnabled ? <button type="button" className="open" disabled={downloading === document.id} onClick={() => void download(document)}>{downloading === document.id ? (ar ? "جارٍ الفتح…" : "Opening…") : (ar ? "تنزيل" : "Download")}</button> : null}{ready && workspace.eligibleProviders.length ? <button type="button" className="share" onClick={() => setSharingDocument(document)}>{ar ? "مشاركة" : "Share"}</button> : null}{!ready ? <span className={`documents-status ${document.malwareScanStatus === "clean" ? "ready" : "pending"}`}>{processing ? (ar ? "فحص" : "Scanning") : title(document.malwareScanStatus)}</span> : null}</div></article>;
      })}</div>}</section>

      <section className="documents-card documents-shares"><div className="documents-card-head"><div><p>{ar ? "التحكم في الوصول" : "ACCESS CONTROL"}</p><h2>{ar ? "وصول مقدم الرعاية" : "Provider access"}</h2></div><span>{reyatiNumber(workspace.shares.filter((share) => share.status === "active").length, lang)} {ar ? "نشط" : "active"}</span></div>{workspace.shares.length === 0 ? <div className="documents-empty"><span>⌁</span><h3>{ar ? "لم تمنح وصولاً بعد" : "No access granted"}</h3><p>{ar ? "يمكنك المشاركة فقط مع مقدمي الرعاية الموثّقين المرتبطين بمواعيدك." : "You can share only with verified providers connected to your appointments."}</p></div> : <div className="documents-list">{workspace.shares.map((share) => <article key={share.id}><span className="document-icon">♙</span><div><b>{share.providerName}</b><small>{share.organizationName || (ar ? "مقدم رعاية موثّق" : "Verified provider")} · {title(share.purpose)}</small><em>{share.status === "active" ? `${ar ? "ينتهي" : "Expires"} ${date(share.expiresAt)}` : `${title(share.status)} ${date(share.revokedAt)}`}</em></div>{share.status === "active" ? <button type="button" disabled={revoking === share.id} onClick={() => void revoke(share.id)}>{revoking === share.id ? (ar ? "جارٍ الإلغاء…" : "Revoking…") : (ar ? "إلغاء" : "Revoke")}</button> : <span className="documents-status">{title(share.status)}</span>}</article>)}</div>}</section>
    </div>}

    {uploadOpen && workspace ? <div className="documents-dialog-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !uploading && setUploadOpen(false)}><section className="documents-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-document-title"><button className="documents-dialog-close" type="button" disabled={uploading} onClick={() => setUploadOpen(false)} aria-label={ar ? "إغلاق" : "Close"}>×</button><p>{ar ? "رفع خاص وآمن" : "PRIVATE, SECURE UPLOAD"}</p><h2 id="upload-document-title">{ar ? "إضافة مستند طبي" : "Add a medical document"}</h2><span>{ar ? "لن يصبح المستند قابلاً للفتح أو المشاركة حتى يكتمل الفحص الأمني بنجاح." : "The document cannot be opened or shared until its security scan completes successfully."}</span><form onSubmit={upload}><label>{ar ? "نوع المستند" : "Document type"}<select value={uploadCategory} disabled={uploading} onChange={(event) => setUploadCategory(event.target.value)}>{categories.map((category) => <option key={category} value={category}>{title(category)}</option>)}</select></label><label>{ar ? "الملف" : "File"}<input className="documents-file-input" type="file" required disabled={uploading} accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={selectFile}/></label>{uploadFile ? <div className="documents-file-summary"><span>▤</span><div><b>{uploadFile.name}</b><small>{size(uploadFile.size, lang)} · {uploadFile.type}</small></div></div> : null}{uploadStage ? <p className="documents-upload-stage" role="status">{uploadStage}</p> : null}<div className="documents-dialog-actions"><button type="button" disabled={uploading} onClick={() => setUploadOpen(false)}>{ar ? "إلغاء" : "Cancel"}</button><button className="primary" type="submit" disabled={uploading || !uploadFile}>{uploading ? (ar ? "جارٍ الرفع…" : "Uploading…") : (ar ? "رفع وفحص" : "Upload and scan")}</button></div></form></section></div> : null}

    {sharingDocument && workspace ? <div className="documents-dialog-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSharingDocument(null)}><section className="documents-dialog" role="dialog" aria-modal="true" aria-labelledby="share-document-title"><button className="documents-dialog-close" type="button" onClick={() => setSharingDocument(null)} aria-label={ar ? "إغلاق" : "Close"}>×</button><p>{ar ? "موافقة محددة المدة" : "TIME-LIMITED CONSENT"}</p><h2 id="share-document-title">{ar ? `مشاركة ${title(sharingDocument.category)}` : `Share ${title(sharingDocument.category)}`}</h2><span>{deliveryEnabled ? (ar ? "سيتمكن مقدم الرعاية المحدد من فتح نسخة محمية خلال مدة الموافقة فقط." : "The selected provider can open a protected copy only while this consent remains active.") : (ar ? "سيظهر وصول البيانات الوصفية فقط حتى يتم تفعيل التسليم المحمي." : "Only metadata access is available until protected delivery is activated.")}</span><form onSubmit={share}><label>{ar ? "مقدم الرعاية الموثّق" : "Verified provider"}<select required value={providerId} onChange={(event) => setProviderId(event.target.value)}><option value="">{ar ? "اختر مقدم رعاية مرتبطاً بموعد" : "Choose an appointment-linked provider"}</option>{workspace.eligibleProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.specialty} · {provider.organizationName}</option>)}</select></label><label>{ar ? "الغرض" : "Purpose"}<select value={purpose} onChange={(event) => setPurpose(event.target.value)}><option value="continuity_of_care">{title("continuity_of_care")}</option><option value="follow_up">{title("follow_up")}</option><option value="second_opinion">{title("second_opinion")}</option></select></label><label>{ar ? "مدة الوصول" : "Access duration"}<select value={expiryDays} onChange={(event) => setExpiryDays(Number(event.target.value))}>{[1, 7, 14, 30].map((days) => <option key={days} value={days}>{reyatiNumber(days, lang)} {ar ? (days === 1 ? "يوم" : "أيام") : days === 1 ? "day" : "days"}</option>)}</select></label><div className="documents-dialog-actions"><button type="button" onClick={() => setSharingDocument(null)}>{ar ? "إلغاء" : "Cancel"}</button><button className="primary" type="submit" disabled={sharing || !providerId}>{sharing ? (ar ? "جارٍ المنح…" : "Granting…") : (ar ? "منح الوصول" : "Grant access")}</button></div></form></section></div> : null}
  </main>;
}
