export const dataClassifications = {
  public: {
    description: "Approved product, capability, and public provider information.",
    telemetry: "allowed",
    retention: "Retain while published; archive according to the product record schedule.",
  },
  operational: {
    description: "Non-personal service health, event codes, route names, and aggregate counters.",
    telemetry: "allowed",
    retention: "30 days by default; longer retention requires an approved operational purpose.",
  },
  account: {
    description: "Identity, contact, authentication, authorization, and account-owned activity.",
    telemetry: "prohibited",
    retention: "Keep only for the active account and approved legal or security obligations.",
  },
  clinical: {
    description: "Health, encounter, diagnosis, prescription, test, and care-plan information.",
    telemetry: "prohibited",
    retention: "Policy owner and Qatar legal review required before a production schedule is set.",
  },
  financial: {
    description: "Payment, benefit, invoice, settlement, and funding information.",
    telemetry: "prohibited",
    retention: "Policy owner and Qatar legal review required before a production schedule is set.",
  },
  secret: {
    description: "Credentials, session tokens, reset tokens, signing keys, and raw webhook secrets.",
    telemetry: "prohibited",
    retention: "Never store in logs; persist only encrypted or irreversibly hashed when required.",
  },
} as const;

export type DataClassification = keyof typeof dataClassifications;

export const prohibitedTelemetryKeys = new Set([
  "email", "phone", "mobile", "name", "displayname", "address", "dob", "dateofbirth",
  "diagnosis", "clinicalnote", "encounter", "prescription", "testresult", "payment",
  "card", "iban", "token", "authorization", "cookie", "password", "secret", "payload",
  "body", "message", "userid", "patientid", "providerid", "organizationid",
]);
