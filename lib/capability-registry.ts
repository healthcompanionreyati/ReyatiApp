export type CapabilityStatus = "live" | "read_only" | "role_gated" | "inactive" | "foundation";
export type ReyatiEnvironment = "production" | "investor_demo" | "local";

export type CapabilityDefinition = {
  id: string;
  name: string;
  status: CapabilityStatus;
  supportedEnvironments: readonly ReyatiEnvironment[];
  permittedRoles: readonly string[];
  externalDependencies: readonly string[];
  responsibleOwner: string;
  knownLimitations: string;
  safetyRegulatoryGate: string | null;
  lastValidatedAt: string;
};

const validated = "2026-08-14";
const owner = "TBD — Product and Engineering";
const allEnvironments = ["production", "investor_demo", "local"] as const;

export const capabilityRegistry = [
  { id: "patient_home", name: "Patient home", status: "live", supportedEnvironments: allEnvironments, permittedRoles: ["patient"], externalDependencies: ["ChatGPT identity", "D1"], responsibleOwner: owner, knownLimitations: "Current platform identity only; independent public authentication is not active.", safetyRegulatoryGate: null, lastValidatedAt: validated },
  { id: "provider_discovery", name: "Provider discovery", status: "live", supportedEnvironments: allEnvironments, permittedRoles: ["patient"], externalDependencies: ["D1"], responsibleOwner: owner, knownLimitations: "Search is limited to verified, published Reyati catalog records.", safetyRegulatoryGate: null, lastValidatedAt: validated },
  { id: "appointment_booking", name: "Appointment booking", status: "live", supportedEnvironments: allEnvironments, permittedRoles: ["patient", "provider"], externalDependencies: ["D1"], responsibleOwner: owner, knownLimitations: "No external hospital scheduling integration is connected.", safetyRegulatoryGate: null, lastValidatedAt: validated },
  { id: "health_records", name: "Health records", status: "live", supportedEnvironments: allEnvironments, permittedRoles: ["patient", "provider"], externalDependencies: ["D1"], responsibleOwner: owner, knownLimitations: "Only finalized Reyati encounter records are exposed.", safetyRegulatoryGate: "Clinical documentation and retention approval before wider rollout.", lastValidatedAt: validated },
  { id: "family_access", name: "Family access", status: "live", supportedEnvironments: allEnvironments, permittedRoles: ["patient"], externalDependencies: ["D1"], responsibleOwner: owner, knownLimitations: "Explicit scoped delegation only; guardian workflows are not active.", safetyRegulatoryGate: "Minor and legal-guardian policy approval.", lastValidatedAt: validated },
  { id: "payment_records", name: "Payment records", status: "read_only", supportedEnvironments: allEnvironments, permittedRoles: ["patient", "platform_admin"], externalDependencies: ["D1"], responsibleOwner: owner, knownLimitations: "No checkout, refund, settlement, or money movement.", safetyRegulatoryGate: "Payment provider, finance controls, and regulatory approval.", lastValidatedAt: validated },
  { id: "in_app_notifications", name: "In-app notifications", status: "live", supportedEnvironments: allEnvironments, permittedRoles: ["patient", "provider", "platform_admin"], externalDependencies: ["D1"], responsibleOwner: owner, knownLimitations: "Email and SMS delivery are not enabled.", safetyRegulatoryGate: "Approved templates, consent, and vendor data-processing review.", lastValidatedAt: validated },
  { id: "communication_preferences", name: "Communication preferences", status: "live", supportedEnvironments: allEnvironments, permittedRoles: ["patient", "provider", "platform_admin"], externalDependencies: ["ChatGPT identity", "D1"], responsibleOwner: owner, knownLimitations: "Language and email opt-in are durable; email verification and delivery remain inactive.", safetyRegulatoryGate: "Verified contact and approved delivery service before outbound activation.", lastValidatedAt: validated },
  { id: "support_cases", name: "Support cases", status: "live", supportedEnvironments: allEnvironments, permittedRoles: ["patient", "support_agent", "platform_admin"], externalDependencies: ["D1"], responsibleOwner: owner, knownLimitations: "No external ticketing integration or automated escalation.", safetyRegulatoryGate: "Incident ownership and escalation rota required for pilot.", lastValidatedAt: validated },
  { id: "provider_schedule", name: "Provider schedule", status: "role_gated", supportedEnvironments: allEnvironments, permittedRoles: ["provider"], externalDependencies: ["D1"], responsibleOwner: owner, knownLimitations: "Requires active provider and organization membership.", safetyRegulatoryGate: null, lastValidatedAt: validated },
  { id: "provider_patients", name: "Provider patient directory", status: "role_gated", supportedEnvironments: allEnvironments, permittedRoles: ["provider"], externalDependencies: ["D1"], responsibleOwner: owner, knownLimitations: "Minimum identity and appointment context only.", safetyRegulatoryGate: null, lastValidatedAt: validated },
  { id: "provider_catalog", name: "Provider services and availability", status: "role_gated", supportedEnvironments: allEnvironments, permittedRoles: ["provider", "organization_owner"], externalDependencies: ["D1"], responsibleOwner: owner, knownLimitations: "Publishing requires verified provider and service-location records.", safetyRegulatoryGate: null, lastValidatedAt: validated },
  { id: "provider_insights", name: "Provider appointment insights", status: "read_only", supportedEnvironments: allEnvironments, permittedRoles: ["provider"], externalDependencies: ["D1"], responsibleOwner: owner, knownLimitations: "Privacy-thresholded operational aggregates only.", safetyRegulatoryGate: null, lastValidatedAt: validated },
  { id: "organization_access", name: "Organization access", status: "role_gated", supportedEnvironments: allEnvironments, permittedRoles: ["organization_owner", "organization_admin"], externalDependencies: ["ChatGPT identity", "D1"], responsibleOwner: owner, knownLimitations: "Invitation is bound to the verified account email.", safetyRegulatoryGate: null, lastValidatedAt: validated },
  { id: "encounter_notes", name: "Encounter notes", status: "role_gated", supportedEnvironments: allEnvironments, permittedRoles: ["provider"], externalDependencies: ["D1"], responsibleOwner: owner, knownLimitations: "Finalization is immutable; amendments are not yet implemented.", safetyRegulatoryGate: "Clinical documentation and amendment policy approval.", lastValidatedAt: validated },
  { id: "partner_workspace", name: "Employer workspace", status: "inactive", supportedEnvironments: allEnvironments, permittedRoles: ["partner_admin"], externalDependencies: ["Employer registry", "Eligibility roster", "Funding ledger"], responsibleOwner: owner, knownLimitations: "No employer, employee, benefit, funding, or invoice source is connected.", safetyRegulatoryGate: "Employment-health privacy separation and benefit governance approval.", lastValidatedAt: validated },
  { id: "partner_program", name: "Programme setup", status: "inactive", supportedEnvironments: allEnvironments, permittedRoles: ["partner_admin"], externalDependencies: ["Employer registry", "Eligibility roster", "Funding ledger"], responsibleOwner: owner, knownLimitations: "Programme creation and publication are deliberately unavailable.", safetyRegulatoryGate: "Benefit approval evidence and immutable funding controls.", lastValidatedAt: validated },
  { id: "platform_overview", name: "Platform overview", status: "role_gated", supportedEnvironments: allEnvironments, permittedRoles: ["platform_admin"], externalDependencies: ["D1"], responsibleOwner: owner, knownLimitations: "Operational aggregates only.", safetyRegulatoryGate: null, lastValidatedAt: validated },
  { id: "provider_verification", name: "Provider verification", status: "role_gated", supportedEnvironments: allEnvironments, permittedRoles: ["platform_admin", "verifier"], externalDependencies: ["D1", "Manual source verification"], responsibleOwner: owner, knownLimitations: "Verification remains a manual, auditable decision.", safetyRegulatoryGate: "Approved verification SOP and accountable verifier roster.", lastValidatedAt: validated },
  { id: "finance_ledger", name: "Finance ledger", status: "read_only", supportedEnvironments: allEnvironments, permittedRoles: ["platform_admin"], externalDependencies: ["D1"], responsibleOwner: owner, knownLimitations: "No settlement, reconciliation, refund, or payout controls.", safetyRegulatoryGate: "Finance operating model and payment provider approval.", lastValidatedAt: validated },
  { id: "support_operations", name: "Support operations", status: "role_gated", supportedEnvironments: allEnvironments, permittedRoles: ["support_agent", "platform_admin"], externalDependencies: ["D1"], responsibleOwner: owner, knownLimitations: "No external ticketing integration.", safetyRegulatoryGate: "Named pilot owner and escalation rota.", lastValidatedAt: validated },
  { id: "review_moderation", name: "Review moderation", status: "inactive", supportedEnvironments: allEnvironments, permittedRoles: ["moderator", "platform_admin"], externalDependencies: ["Review source"], responsibleOwner: owner, knownLimitations: "No patient review source is connected.", safetyRegulatoryGate: "Moderation policy, appeals, and accountable reviewer roster.", lastValidatedAt: validated },
  { id: "audit_ledger", name: "Audit ledger", status: "role_gated", supportedEnvironments: allEnvironments, permittedRoles: ["platform_admin", "auditor"], externalDependencies: ["D1"], responsibleOwner: owner, knownLimitations: "Application audit events are append-only; external SIEM export is not connected.", safetyRegulatoryGate: "Retention and incident-access policy approval.", lastValidatedAt: validated },
  { id: "platform_identity", name: "Secure account", status: "live", supportedEnvironments: allEnvironments, permittedRoles: ["patient", "provider", "platform_admin"], externalDependencies: ["ChatGPT identity"], responsibleOwner: owner, knownLimitations: "Suitable for the hosted prototype; independent consumer sign-up and MFA are not active.", safetyRegulatoryGate: "Authentication architecture decision and independent security review before a public pilot.", lastValidatedAt: validated },
  { id: "independent_authentication", name: "Independent authentication", status: "foundation", supportedEnvironments: ["local"], permittedRoles: [], externalDependencies: ["Identity provider decision"], responsibleOwner: owner, knownLimitations: "Schema only; no sign-up, password, passkey, OTP, recovery, or session runtime is enabled.", safetyRegulatoryGate: "Architecture decision, threat model, security review, and recovery policy.", lastValidatedAt: validated },
  { id: "outbound_communications", name: "Outbound communications", status: "foundation", supportedEnvironments: ["local"], permittedRoles: [], externalDependencies: ["Email provider", "SMS provider", "Approved templates"], responsibleOwner: owner, knownLimitations: "Outbox and delivery records only; no vendor call or webhook endpoint is enabled.", safetyRegulatoryGate: "Consent, template, data-processing, deliverability, and incident review.", lastValidatedAt: validated },
] as const satisfies readonly CapabilityDefinition[];

export function getCapability(id: string) {
  return capabilityRegistry.find((capability) => capability.id === id);
}

export function publicCapabilityRegistry() {
  return capabilityRegistry.map(({ externalDependencies, ...capability }) => ({
    ...capability,
    dependencyCount: externalDependencies.length,
  }));
}
