import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const delivery = await readFile(new URL("../lib/document-delivery.ts", import.meta.url), "utf8");
const storage = await readFile(new URL("../lib/document-storage.ts", import.meta.url), "utf8");
const flags = await readFile(new URL("../lib/foundation-flags.ts", import.meta.url), "utf8");
const issueRoute = await readFile(new URL("../app/api/documents/access/route.ts", import.meta.url), "utf8");
const contentRoute = await readFile(new URL("../app/api/documents/content/route.ts", import.meta.url), "utf8");

test("private document delivery remains unreachable until activation review", () => {
  assert.match(flags, /privateDocumentDelivery: false/);
  assert.match(issueRoute, /if \(!foundationFlags\.privateDocumentDelivery\).*not_found/);
  assert.match(contentRoute, /if \(!foundationFlags\.privateDocumentDelivery\).*not_found/);
  assert.match(delivery, /if \(!foundationFlags\.privateDocumentDelivery\).*not_found/g);
});

test("access grants are random, hashed, short-lived, requester-bound, and single-use", () => {
  assert.match(delivery, /crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
  assert.match(delivery, /tokenHash = await sha256\(token\)/);
  assert.match(delivery, /ACCESS_TTL_MILLISECONDS = 60 \* 1000/);
  assert.match(delivery, /eq\(documentAccessGrants\.requesterUserId, userId\)/);
  assert.match(delivery, /eq\(documentAccessGrants\.status, "active"\)/);
  assert.match(delivery, /status: "consumed", consumedAt: now/);
  assert.match(delivery, /\.returning\(\{ id: documentAccessGrants\.id \}\)/);
  assert.match(delivery, /Object\.keys\(body\).*key !== "documentId"/);
  assert.match(delivery, /Object\.keys\(body\).*key !== "token"/);
});

test("patient delivery requires ownership and provider delivery revalidates role, share, and consent", () => {
  assert.match(delivery, /document\.ownerUserId !== userId/);
  assert.match(delivery, /requireActiveProvider\(userId\)/g);
  assert.match(delivery, /eq\(documentShares\.recipientProviderId, provider\.id\)/g);
  assert.match(delivery, /eq\(documentShares\.status, "active"\)/g);
  assert.match(delivery, /eq\(consents\.status, "active"\)/g);
  assert.match(delivery, /gt\(consents\.expiresAt, now\)/g);
});

test("delivery revalidates clean active metadata and full object integrity", () => {
  assert.match(delivery, /eq\(documentRecords\.status, "ready"\)/g);
  assert.match(delivery, /eq\(documentRecords\.malwareScanStatus, "clean"\)/g);
  assert.match(delivery, /eq\(documentRecords\.retentionState, "active"\)/g);
  assert.match(delivery, /sha256Bytes\(bytes\)/);
  assert.match(delivery, /checksum !== row\.checksumSha256\.toLowerCase\(\)/);
  assert.match(delivery, /quarantinePrivateDocumentObject/);
  assert.match(delivery, /delivery_integrity_mismatch/);
});

test("content remains server-streamed with no object key or public URL response", () => {
  assert.match(storage, /readPrivateDocumentObject/);
  assert.match(contentRoute, /new Response\(content\.body/);
  assert.match(delivery, /Content-Disposition/);
  assert.match(delivery, /Cache-Control/);
  assert.match(delivery, /X-Content-Type-Options/);
  assert.doesNotMatch(delivery, /publicUrl|presignedUrl|signedUrl/);
  const publicReturn = delivery.slice(delivery.indexOf("return { token, expiresAt }"));
  assert.doesNotMatch(publicReturn, /return \{[^\n]*objectKey/);
  assert.match(issueRoute, /MAX_BODY_BYTES = 4 \* 1024/);
  assert.match(contentRoute, /MAX_BODY_BYTES = 4 \* 1024/);
  assert.doesNotMatch(issueRoute, /request\.json\(\)/);
  assert.doesNotMatch(contentRoute, /request\.json\(\)/);
});

test("grant issuance, denial, integrity blocking, and successful delivery are audited", () => {
  for (const action of ["document.access_grant_issued", "document.access_grant_denied", "document.access_denied", "document.content_delivery_blocked", "document.content_delivered"]) assert.match(delivery, new RegExp(action.replace(".", "\\.")));
  const auditMetadata = [...delivery.matchAll(/metadataJson: JSON\.stringify\(([^\n]+)\)/g)].map((match) => match[1]).join("\n");
  assert.doesNotMatch(auditMetadata, /tokenHash|objectKey|checksumSha256/);
  assert.match(issueRoute, /enforceWriteRateLimit/);
  assert.match(contentRoute, /enforceWriteRateLimit/);
});
