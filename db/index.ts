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

const schema = { ...coreSchema, ...digitalQueueSchema, ...homeCareSchema, ...laboratorySchema, ...encounterContinuitySchema, ...pharmacyFulfilmentSchema, ...sampleCollectionSchema, ...employerBenefitsSchema, ...patientReviewsSchema, ...financeControlsSchema, ...carePlansSchema, ...diagnosticImagingSchema, ...insuranceAuthorizationSchema, ...savedCareSchema, ...privacyRightsSchema, ...healthContentSchema, ...emergencyProfileSchema };

export async function getDb() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
