import { drizzle } from "drizzle-orm/d1";
import * as coreSchema from "./schema";
import * as digitalQueueSchema from "./digital-queue-schema";
import * as homeCareSchema from "./home-care-schema";
import * as laboratorySchema from "./laboratory-schema";
import * as encounterContinuitySchema from "./encounter-continuity-schema";
import * as pharmacyFulfilmentSchema from "./pharmacy-fulfilment-schema";
import * as sampleCollectionSchema from "./sample-collection-schema";
import * as employerBenefitsSchema from "./employer-benefits-schema";
import * as patientReviewsSchema from "./patient-reviews-schema";
import * as financeControlsSchema from "./finance-controls-schema";
import * as carePlansSchema from "./care-plans-schema";
import * as diagnosticImagingSchema from "./diagnostic-imaging-schema";
import * as insuranceAuthorizationSchema from "./insurance-authorization-schema";
import * as savedCareSchema from "./saved-care-schema";
import * as privacyRightsSchema from "./privacy-rights-schema";
import * as healthContentSchema from "./health-content-schema";
import * as emergencyProfileSchema from "./emergency-profile-schema";
import * as personalHealthProfileSchema from "./personal-health-profile-schema";
import * as consentCenterSchema from "./consent-center-schema";
import * as complaintsSchema from "./complaints-schema";
import * as accountSecuritySchema from "./account-security-schema";
import * as notificationPreferencesModuleSchema from "./notification-preferences-schema";
import * as catalogueGovernanceSchema from "./catalogue-governance-schema";
import * as accessibilitySettingsModuleSchema from "./accessibility-settings-schema";
import * as facilityDirectorySchema from "./facility-directory-schema";
import * as releaseControlsSchema from "./release-controls-schema";
import * as patientProfileSettingsModuleSchema from "./patient-profile-settings-schema";
import * as tenantConfigurationSchema from "./tenant-configuration-schema";
import * as policyTemplatesSchema from "./policy-templates-schema";
import * as serviceStatusSchema from "./service-status-schema";
import * as providerOperationsSchema from "./provider-operations-schema";
import * as partnerGovernanceSchema from "./partner-governance-schema";

const schema = { ...coreSchema, ...digitalQueueSchema, ...homeCareSchema, ...laboratorySchema, ...encounterContinuitySchema, ...pharmacyFulfilmentSchema, ...sampleCollectionSchema, ...employerBenefitsSchema, ...patientReviewsSchema, ...financeControlsSchema, ...carePlansSchema, ...diagnosticImagingSchema, ...insuranceAuthorizationSchema, ...savedCareSchema, ...privacyRightsSchema, ...healthContentSchema, ...emergencyProfileSchema, ...personalHealthProfileSchema, ...consentCenterSchema, ...complaintsSchema, ...accountSecuritySchema, ...notificationPreferencesModuleSchema, ...catalogueGovernanceSchema, ...accessibilitySettingsModuleSchema, ...facilityDirectorySchema, ...releaseControlsSchema, ...patientProfileSettingsModuleSchema, ...tenantConfigurationSchema, ...policyTemplatesSchema, ...serviceStatusSchema, ...providerOperationsSchema, ...partnerGovernanceSchema };

export async function getDb() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
