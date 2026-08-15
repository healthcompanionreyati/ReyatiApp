import type { ReyatiLocale } from "@/app/components/useReyatiLocale";

const arabicTerms: Record<string, string> = {
  active: "نشط", cancelled: "ملغى", clean: "آمن", completed: "مكتمل", confirmed: "مؤكد", continuity_of_care: "استمرارية الرعاية",
  created: "تم الإنشاء", declined: "مرفوض", expired: "منتهي", failed: "فشل", follow_up: "رعاية المتابعة", in_person: "في العيادة",
  infected: "مصاب", no_show: "لم يحضر", pending: "قيد الانتظار", quarantined: "محجور", ready: "جاهز", rejected: "مرفوض",
  revoked: "ملغى الوصول", scanning: "قيد الفحص", second_opinion: "رأي ثانٍ", uploaded: "تم الرفع", uploading: "جارٍ الرفع",
  unverified: "غير موثّق", verified: "موثّق", video: "فيديو", cleaned: "تم التنظيف", recovering: "قيد الاسترداد",
  lab_report: "تقرير مختبر", prescription: "وصفة طبية", radiology: "أشعة", referral: "إحالة", discharge_summary: "ملخص خروج", other: "مستند آخر",
};

export function reyatiLabel(value: string, locale: ReyatiLocale) {
  if (locale === "ar" && arabicTerms[value]) return arabicTerms[value];
  return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

export function reyatiDate(value: string | Date, locale: ReyatiLocale, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-QA" : "en-QA", { timeZone: "Asia/Qatar", ...options }).format(new Date(value));
}

export function reyatiNumber(value: number, locale: ReyatiLocale, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-QA" : "en-QA", options).format(value);
}
