import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("shared Arabic formatting owns Qatar dates, numbers, and lifecycle vocabulary", async () => {
  const helper = await source("lib/reyati-i18n.ts");
  assert.match(helper, /"ar-QA" : "en-QA"/);
  assert.match(helper, /timeZone: "Asia\/Qatar"/);
  assert.match(helper, /Intl\.NumberFormat/);
  for (const value of ["pending", "confirmed", "cancelled", "in_person", "continuity_of_care", "quarantined", "recovering"]) assert.match(helper, new RegExp(`${value}:`));
});

test("patient documents localize metadata, consent, notices, and safe error states", async () => {
  const page = await source("app/documents/page.tsx");
  assert.match(page, /reyatiDate, reyatiLabel, reyatiNumber/);
  assert.match(page, /موافقة محددة المدة/);
  assert.match(page, /مقدم الرعاية الموثّق/);
  assert.match(page, /منح الوصول/);
  assert.match(page, /تم إلغاء الوصول/);
  assert.doesNotMatch(page, /purposeLabels/);
  assert.doesNotMatch(page, /Intl\.DateTimeFormat\("en-QA"/);
});

test("provider schedule localizes operational metrics, filters, drawer, and decline confirmation", async () => {
  const page = await source("app/provider/page.tsx");
  assert.match(page, /reyatiDate, reyatiLabel, reyatiNumber/);
  assert.match(page, /تحتاج اهتماماً/);
  assert.match(page, /تحكم آمن في دورة الحياة/);
  assert.match(page, /locale=\{lang\}/);
  assert.match(page, /إغلاق/);
  assert.doesNotMatch(page, /Intl\.DateTimeFormat\("en-QA"/);
});

test("patient booking and appointments localize delegated, date, number, and modal behavior", async () => {
  const discovery = await source("app/providers/page.tsx");
  const appointments = await source("app/appointments/page.tsx");
  assert.match(discovery, /الحجز بموافقة مفوّضة/);
  assert.match(discovery, /slotLabel\(item\.scheduledStart\)/);
  assert.match(discovery, /reyatiNumber\(service\.feeQar, lang\)/);
  assert.match(appointments, /reyatiDate, reyatiLabel/);
  assert.match(appointments, /PatientHeader/);
  const patientHeader = await source("app/components/PatientHeader.tsx");
  assert.match(patientHeader, /href: "\/notifications"/);
  assert.match(patientHeader, /ar: "التحديثات"/);
  assert.match(appointments, /locale=\{lang\}/);
});

test("sensitive confirmations and mixed-direction inputs respect the active locale", async () => {
  const dialog = await source("app/components/ConfirmActionDialog.tsx");
  const unsaved = await source("app/components/UnsavedChangesGuard.tsx");
  const rtl = await source("app/rtl.css");
  assert.match(dialog, /إغلاق التأكيد/);
  assert.match(dialog, /تأكيد إجراء حساس/);
  assert.match(dialog, /رجوع/);
  assert.match(unsaved, /locale=\{locale\}/);
  assert.match(unsaved, /معلومات غير مرسلة/);
  assert.match(rtl, /input\[type="email"\]/);
  assert.match(rtl, /unicode-bidi:isolate/);
  for (const pagePath of ["app/family/page.tsx", "app/admin/access/page.tsx", "app/admin/verification/page.tsx"]) {
    assert.match(await source(pagePath), /ConfirmActionDialog locale=\{lang\}/);
  }
});

test("capability registry states the remaining human-review boundary", async () => {
  const registry = await source("lib/capability-registry.ts");
  const adr = await source("docs/adr/ADR-004-arabic-localization.md");
  assert.match(registry, /id: "arabic_localization"[\s\S]*?status: "live"/);
  assert.match(registry, /Native Arabic terminology review/);
  assert.match(adr, /human linguistic QA pending/);
});
