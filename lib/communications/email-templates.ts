export type TransactionalEmailTemplateId = "email_verification" | "family_invitation" | "appointment_update" | "provider_verification" | "record_finalized" | "family_access" | "support_update" | "security_notice" | "payment_update";
export type SupportedEmailLocale = "en" | "ar";

export type EmailTemplateInput = {
  actionPath: string;
};

type RenderedEmail = { subject: string; text: string; html: string };

function safeActionPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//") || value.length > 240) throw new Error("invalid_action_path");
  const parsed = new URL(value, "https://app.local");
  if (parsed.origin !== "https://app.local") throw new Error("invalid_action_path");
  return `${parsed.pathname}${parsed.search}`;
}

function safeAppUrl(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("invalid_app_url");
  return parsed.origin;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

const copy: Record<TransactionalEmailTemplateId, Record<SupportedEmailLocale, { subject: string; heading: string; body: string; cta: string }>> = {
  email_verification: {
    en: { subject: "Verify your email for Qivaya", heading: "Verify your email", body: "Confirm this email address for future Qivaya account updates. This secure link expires shortly.", cta: "Verify email" },
    ar: { subject: "تحقق من بريدك الإلكتروني لكيفايا", heading: "تحقق من بريدك الإلكتروني", body: "أكد عنوان البريد الإلكتروني هذا لتحديثات حساب كيفايا مستقبلاً. تنتهي صلاحية هذا الرابط الآمن قريباً.", cta: "تحقق من البريد" },
  },
  family_invitation: {
    en: { subject: "You have a Qivaya care-access invitation", heading: "Review a care-access invitation", body: "A Qivaya account invited this email address to review specific care permissions. Sign in with this exact email to accept or decline. The invitation expires in seven days.", cta: "Review invitation" },
    ar: { subject: "لديك دعوة وصول للرعاية في كيفايا", heading: "راجع دعوة وصول للرعاية", body: "دعا حساب في كيفايا عنوان البريد هذا لمراجعة صلاحيات رعاية محددة. سجّل الدخول باستخدام البريد نفسه للقبول أو الرفض. تنتهي صلاحية الدعوة خلال سبعة أيام.", cta: "مراجعة الدعوة" },
  },
  appointment_update: {
    en: { subject: "Your Qivaya appointment was updated", heading: "Appointment update", body: "There is an update to an appointment in your secure Qivaya account. Sign in to view the details.", cta: "View appointment" },
    ar: { subject: "تم تحديث موعدك في كيفايا", heading: "تحديث الموعد", body: "يوجد تحديث لموعد في حسابك الآمن في كيفايا. سجّل الدخول لعرض التفاصيل.", cta: "عرض الموعد" },
  },
  provider_verification: {
    en: { subject: "Your Qivaya provider status was updated", heading: "Provider status update", body: "There is an update to your provider status in Qivaya. Sign in to review the decision and next steps.", cta: "Review provider status" },
    ar: { subject: "تم تحديث حالة مقدم الرعاية في كيفايا", heading: "تحديث حالة مقدم الرعاية", body: "يوجد تحديث لحالة مقدم الرعاية في كيفايا. سجّل الدخول لمراجعة القرار والخطوات التالية.", cta: "مراجعة حالة مقدم الرعاية" },
  },
  record_finalized: {
    en: { subject: "A Qivaya visit record is ready", heading: "Visit record ready", body: "A protected record for a completed visit is now available in your Qivaya account. Sign in to view it securely.", cta: "View visit record" },
    ar: { subject: "سجل زيارة جاهز في كيفايا", heading: "سجل الزيارة جاهز", body: "أصبح سجل محمي لزيارة مكتملة متاحاً في حسابك في كيفايا. سجّل الدخول لعرضه بأمان.", cta: "عرض سجل الزيارة" },
  },
  family_access: {
    en: { subject: "Your Qivaya family access was updated", heading: "Family access update", body: "There is an update to family access in your Qivaya account. Sign in to review the active permissions.", cta: "Review family access" },
    ar: { subject: "تم تحديث وصول العائلة في كيفايا", heading: "تحديث وصول العائلة", body: "يوجد تحديث لوصول العائلة في حسابك في كيفايا. سجّل الدخول لمراجعة الصلاحيات النشطة.", cta: "مراجعة وصول العائلة" },
  },
  support_update: {
    en: { subject: "Your Qivaya support request was updated", heading: "Support update", body: "There is an update to your secure Qivaya support request. Sign in to view the response.", cta: "View support request" },
    ar: { subject: "تم تحديث طلب الدعم في كيفايا", heading: "تحديث الدعم", body: "يوجد تحديث لطلب الدعم الآمن في كيفايا. سجّل الدخول لعرض الرد.", cta: "عرض طلب الدعم" },
  },
  security_notice: {
    en: { subject: "Security notice from Qivaya", heading: "Account security notice", body: "A security-related change was recorded for your Qivaya account. Sign in directly to review your account.", cta: "Review account" },
    ar: { subject: "إشعار أمني من كيفايا", heading: "إشعار أمان الحساب", body: "تم تسجيل تغيير متعلق بالأمان في حسابك في كيفايا. سجّل الدخول مباشرة لمراجعة حسابك.", cta: "مراجعة الحساب" },
  },
  payment_update: {
    en: { subject: "Your Qivaya payment status was updated", heading: "Payment status update", body: "Your payment provider reported a change to an appointment payment in Qivaya. Sign in to review the confirmed status and payment record.", cta: "Review payment" },
    ar: { subject: "تم تحديث حالة الدفع في كيفايا", heading: "تحديث حالة الدفع", body: "أبلغ مزود الدفع عن تغيير في دفعة موعد داخل كيفايا. سجّل الدخول لمراجعة الحالة المؤكدة وسجل الدفع.", cta: "مراجعة الدفع" },
  },
};

export function validateEmailTemplateInput(input: EmailTemplateInput) {
  return { actionPath: safeActionPath(input.actionPath) };
}

export function renderTransactionalEmail(templateId: TransactionalEmailTemplateId, locale: SupportedEmailLocale, input: EmailTemplateInput, appUrl: string): RenderedEmail {
  const template = copy[templateId]?.[locale];
  if (!template) throw new Error("unknown_email_template");
  const actionUrl = `${safeAppUrl(appUrl)}${safeActionPath(input.actionPath)}`;
  const escapedUrl = escapeHtml(actionUrl);
  return {
    subject: template.subject,
    text: `${template.heading}\n\n${template.body}\n\n${template.cta}: ${actionUrl}\n\nQivaya will never ask for your password, verification code, or payment credentials by email.`,
    html: `<div style="font-family:Arial,sans-serif;color:#062c43;line-height:1.6"><h1 style="font-size:24px">${escapeHtml(template.heading)}</h1><p>${escapeHtml(template.body)}</p><p><a href="${escapedUrl}" style="display:inline-block;background:#007f9f;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">${escapeHtml(template.cta)}</a></p><p style="font-size:12px;color:#587184">Qivaya will never ask for your password, verification code, or payment credentials by email.</p></div>`,
  };
}
