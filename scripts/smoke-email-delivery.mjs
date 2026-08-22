const endpoint = "https://api.resend.com/emails";
const enabled = process.env.QIVAYA_EMAIL_TEST_DELIVERY?.trim().toLowerCase() === "true";
const apiKey = process.env.RESEND_API_KEY?.trim();
const from = process.env.RESEND_FROM_EMAIL?.trim();
const replyTo = process.env.RESEND_REPLY_TO_EMAIL?.trim();
const recipient = process.env.QIVAYA_EMAIL_TEST_RECIPIENT?.trim();

if (!enabled) throw new Error("Controlled email smoke delivery is disabled");
if (!apiKey || !from || !recipient) throw new Error("Controlled email smoke delivery is not configured");

const day = new Date().toISOString().slice(0, 10);
const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Idempotency-Key": `qivaya-controlled-smoke-${day}`,
  },
  body: JSON.stringify({
    from,
    to: [recipient],
    subject: "Qivaya transactional email test",
    text: "Qivaya transactional email delivery is configured. This synthetic message contains no account or health information.",
    html: '<div style="font-family:Arial,sans-serif;color:#062c43;line-height:1.6"><h1 style="font-size:24px">Qivaya email delivery test</h1><p>Transactional email delivery is configured.</p><p>This synthetic message contains no account or health information.</p></div>',
    ...(replyTo ? { reply_to: replyTo } : {}),
  }),
});

if (!response.ok) throw new Error(`Resend rejected the controlled smoke message with status ${response.status}`);
const payload = await response.json().catch(() => null);
if (!payload || typeof payload.id !== "string") throw new Error("Resend returned an invalid smoke-test response");

console.log("Controlled Qivaya email smoke message accepted by Resend.");
