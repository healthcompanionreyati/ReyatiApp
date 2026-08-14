export type TransactionalEmailTemplateId = "appointment_update" | "support_update" | "security_notice";
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
  appointment_update: {
    en: { subject: "Your Reyati appointment was updated", heading: "Appointment update", body: "There is an update to an appointment in your secure Reyati account. Sign in to view the details.", cta: "View appointment" },
    ar: { subject: "تم تحديث موعدك في ريّاتي", heading: "تحديث الموعد", body: "يوجد تحديث لموعد في حسابك الآمن في ريّاتي. سجّل الدخول لعرض التفاصيل.", cta: "عرض الموعد" },
  },
  support_update: {
    en: { subject: "Your Reyati support request was updated", heading: "Support update", body: "There is an update to your secure Reyati support request. Sign in to view the response.", cta: "View support request" },
    ar: { subject: "تم تحديث طلب الدعم في ريّاتي", heading: "تحديث الدعم", body: "يوجد تحديث لطلب الدعم الآمن في ريّاتي. سجّل الدخول لعرض الرد.", cta: "عرض طلب الدعم" },
  },
  security_notice: {
    en: { subject: "Security notice from Reyati", heading: "Account security notice", body: "A security-related change was recorded for your Reyati account. Sign in directly to review your account.", cta: "Review account" },
    ar: { subject: "إشعار أمني من ريّاتي", heading: "إشعار أمان الحساب", body: "تم تسجيل تغيير متعلق بالأمان في حسابك في ريّاتي. سجّل الدخول مباشرة لمراجعة حسابك.", cta: "مراجعة الحساب" },
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
    text: `${template.heading}\n\n${template.body}\n\n${template.cta}: ${actionUrl}\n\nReyati will never ask for your password, verification code, or payment credentials by email.`,
    html: `<div style="font-family:Arial,sans-serif;color:#062c43;line-height:1.6"><h1 style="font-size:24px">${escapeHtml(template.heading)}</h1><p>${escapeHtml(template.body)}</p><p><a href="${escapedUrl}" style="display:inline-block;background:#007f9f;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">${escapeHtml(template.cta)}</a></p><p style="font-size:12px;color:#587184">Reyati will never ask for your password, verification code, or payment credentials by email.</p></div>`,
  };
}
