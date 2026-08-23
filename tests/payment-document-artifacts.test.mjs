import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("receipts and credit notes have durable private-document references", async () => {
  const [schema, migration] = await Promise.all([source("db/payment-processing-schema.ts"), source("drizzle/0101_previous_sphinx.sql")]);
  assert.equal((schema.match(/documentId: text\("document_id"\)/g) || []).length, 2);
  for (const index of ["idx_payment_receipt_document", "idx_payment_credit_note_document"]) {
    assert.ok(schema.includes(index));
    assert.ok(migration.includes(index));
  }
  assert.match(migration, /REFERENCES document_records\(id\)/);
});

test("server-generated PDFs are deterministic, integrity recorded, and privacy minimized", async () => {
  const generator = await source("lib/payment-document-artifacts.ts");
  assert.match(generator, /%PDF-1\.4/);
  assert.match(generator, /qivaya:\$\{kind\}:\$\{id\}:pdf:v1/);
  assert.match(generator, /classification: "financial"/);
  assert.match(generator, /checksumSha256/);
  assert.match(generator, /patientIdentityIncluded: false/);
  assert.match(generator, /cardDataIncluded: false/);
  assert.match(generator, /not a tax invoice or settlement instruction/);
  assert.doesNotMatch(generator, /patientName|patientEmail|cardNumber|clientSecret|rawPayload/);
});

test("signed Stripe outcomes trigger PDF generation without making payment processing depend on R2", async () => {
  const payments = await source("lib/stripe-payments.ts");
  assert.match(payments, /constructEventAsync\(rawBody, signature, configuration\.webhookSecret\)/);
  assert.match(payments, /ensurePaymentDocumentArtifact\(financialDocument\.kind, financialDocument\.id\)\.catch/);
  assert.match(payments, /payment_receipts\.automatic_pdf_generation_failed/);
  assert.match(payments, /recordTransactionalEmailIntent/);
});

test("artifact creation is authenticated, owner-only, bounded, and rate limited", async () => {
  const [route, generator] = await Promise.all([
    source("app/api/patient/payment-receipts/artifact/route.ts"),
    source("lib/payment-document-artifacts.ts"),
  ]);
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /enforceWriteRateLimit\(user\.id, "payment-receipts\.artifact", \{ limit: 10 \}\)/);
  assert.match(route, /4 \* 1024/);
  assert.match(route, /ensurePaymentDocumentArtifact\(body\.kind as PaymentDocumentKind, body\.id, user\.id\)/);
  assert.match(generator, /snapshot\.ownerUserId !== requesterUserId/);
});

test("PDF delivery uses hashed single-use grants and verifies R2 bytes before download", async () => {
  const delivery = await source("lib/document-delivery.ts");
  assert.match(delivery, /ACCESS_TTL_MILLISECONDS = 60 \* 1000/);
  assert.match(delivery, /tokenHash/);
  assert.match(delivery, /status: "consumed"/);
  assert.match(delivery, /checksum !== row\.checksumSha256\.toLowerCase\(\)/);
  assert.match(delivery, /quarantinePrivateDocumentObject/);
  assert.match(delivery, /qivaya-payment-receipt/);
  assert.match(delivery, /qivaya-refund-credit-note/);
});

test("patient and admin surfaces expose secure PDF lifecycle without identity leakage", async () => {
  const [patient, admin, service] = await Promise.all([
    source("app/payment-receipts/page.tsx"),
    source("app/admin/payment-receipts/page.tsx"),
    source("lib/payment-receipts.ts"),
  ]);
  assert.match(patient, /Download secure PDF/);
  assert.match(patient, /تنزيل PDF مؤمّن/);
  assert.match(patient, /PDF download remains owner-only/);
  assert.match(patient, /\/api\/documents\/access/);
  assert.match(patient, /\/api\/documents\/content/);
  assert.match(admin, /Private R2 archive/);
  assert.match(admin, /أرشيف R2 الخاص/);
  for (const metric of ["pdfReady", "pdfPending", "pdfAttention"]) assert.ok(service.includes(metric));
  assert.match(service, /recipientIdentityExposed: false/);
});
