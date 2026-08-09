import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditEvents,
  facilities,
  providerAvailabilityWindows,
  providerProfiles,
  providerServiceLocations,
} from "@/db/schema";
import { getActiveMemberships, requireOrganizationRole } from "@/lib/authorization";

export class ProviderManagementValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderManagementValidationError";
  }
}

function textValue(value: unknown, name: string, max = 500, required = true) {
  if (value == null && !required) return null;
  if (typeof value !== "string" || (required && !value.trim()) || value.length > max) {
    throw new ProviderManagementValidationError(`${name} is invalid`);
  }
  return value.trim() || null;
}

function integerValue(value: unknown, name: string, min: number, max: number) {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new ProviderManagementValidationError(`${name} is invalid`);
  }
  return Number(value);
}

function parseLanguages(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    throw new ProviderManagementValidationError("Select between 1 and 8 languages");
  }
  const result = [...new Set(value.map((item) => textValue(item, "language", 40)).filter((item): item is string => Boolean(item)))];
  if (!result.length) throw new ProviderManagementValidationError("At least one language is required");
  return result;
}

async function currentProvider(userId: string) {
  const db = await getDb();
  const rows = await db.select().from(providerProfiles).where(eq(providerProfiles.userId, userId)).limit(1);
  return rows[0] ?? null;
}

async function authorizedProvider(userId: string) {
  const profile = await currentProvider(userId);
  if (!profile || !profile.organizationId) throw new ProviderManagementValidationError("Provider profile not found");
  await requireOrganizationRole(userId, profile.organizationId, ["practitioner", "organization_admin", "organization_owner"]);
  return profile;
}

export async function getProviderSetup(userId: string) {
  const db = await getDb();
  const memberships = (await getActiveMemberships(userId)).filter((membership) =>
    ["practitioner", "organization_admin", "organization_owner"].includes(membership.role)
  );
  const profile = await currentProvider(userId);
  if (!profile) return { profile: null, memberships, canManage: false, facilities: [], services: [], windows: [] };
  const canManage = Boolean(profile.organizationId && memberships.some((membership) => membership.organizationId === profile.organizationId));

  const [organizationFacilities, services] = await Promise.all([
    profile.organizationId
      ? db.select().from(facilities).where(and(eq(facilities.organizationId, profile.organizationId), eq(facilities.status, "active"))).orderBy(asc(facilities.name))
      : [],
    db.select().from(providerServiceLocations).where(eq(providerServiceLocations.providerId, profile.id)).orderBy(asc(providerServiceLocations.createdAt)),
  ]);
  const serviceIds = services.map((service) => service.id);
  const windows = serviceIds.length
    ? await db.select().from(providerAvailabilityWindows).where(inArray(providerAvailabilityWindows.serviceLocationId, serviceIds)).orderBy(asc(providerAvailabilityWindows.weekday), asc(providerAvailabilityWindows.startMinute))
    : [];
  return { profile, memberships, canManage, facilities: organizationFacilities, services, windows };
}

export async function createProviderProfile(userId: string, body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ProviderManagementValidationError("A JSON object is required");
  if (await currentProvider(userId)) throw new ProviderManagementValidationError("A provider profile already exists");
  const value = body as Record<string, unknown>;
  const organizationId = textValue(value.organizationId, "organizationId", 128)!;
  await requireOrganizationRole(userId, organizationId, ["practitioner", "organization_admin", "organization_owner"]);
  const licenseReference = textValue(value.licenseReference, "licenseReference", 64)!.toUpperCase();
  if (!/^[A-Z0-9/-]{4,64}$/.test(licenseReference)) throw new ProviderManagementValidationError("licenseReference is invalid");
  const now = new Date();
  const profile = {
    id: crypto.randomUUID(),
    userId,
    organizationId,
    licenseReference,
    specialty: textValue(value.specialty, "specialty", 100)!,
    gender: value.gender == null ? null : textValue(value.gender, "gender", 30, false),
    languagesJson: JSON.stringify(parseLanguages(value.languages)),
    bioEn: textValue(value.bioEn, "bioEn", 1500, false),
    bioAr: textValue(value.bioAr, "bioAr", 1500, false),
    yearsExperience: integerValue(value.yearsExperience, "yearsExperience", 0, 70),
    verificationStatus: "pending",
    verificationVersion: 1,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const db = await getDb();
  await db.batch([
    db.insert(providerProfiles).values(profile),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId: userId, organizationId,
      action: "provider.application_submitted", resourceType: "provider_profile", resourceId: profile.id,
      outcome: "success", metadataJson: JSON.stringify({ specialty: profile.specialty }), createdAt: now,
    }),
  ]);
  return profile;
}

export async function updateProviderProfile(userId: string, body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ProviderManagementValidationError("A JSON object is required");
  const profile = await authorizedProvider(userId);
  const value = body as Record<string, unknown>;
  const now = new Date();
  const update = {
    gender: value.gender == null ? null : textValue(value.gender, "gender", 30, false),
    languagesJson: JSON.stringify(parseLanguages(value.languages)),
    bioEn: textValue(value.bioEn, "bioEn", 1500, false),
    bioAr: textValue(value.bioAr, "bioAr", 1500, false),
    yearsExperience: integerValue(value.yearsExperience, "yearsExperience", 0, 70),
    updatedAt: now,
  };
  const db = await getDb();
  await db.batch([
    db.update(providerProfiles).set(update).where(eq(providerProfiles.id, profile.id)),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId: userId, organizationId: profile.organizationId,
      action: "provider.public_profile_updated", resourceType: "provider_profile", resourceId: profile.id,
      outcome: "success", metadataJson: null, createdAt: now,
    }),
  ]);
  return { ...profile, ...update };
}

export async function saveProviderService(userId: string, body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ProviderManagementValidationError("A JSON object is required");
  const profile = await authorizedProvider(userId);
  if (!profile || profile.verificationStatus !== "verified" || !profile.organizationId) {
    throw new ProviderManagementValidationError("Provider verification is required before services can be configured");
  }
  const value = body as Record<string, unknown>;
  const serviceId = value.id == null ? null : textValue(value.id, "id", 128);
  const mode = textValue(value.mode, "mode", 20)!;
  if (mode !== "in_person" && mode !== "video") throw new ProviderManagementValidationError("mode is invalid");
  const facilityId = mode === "video" ? null : textValue(value.facilityId, "facilityId", 128)!;
  const db = await getDb();
  if (facilityId) {
    const facility = await db.select({ id: facilities.id }).from(facilities).where(and(
      eq(facilities.id, facilityId), eq(facilities.organizationId, profile.organizationId), eq(facilities.status, "active"),
    )).limit(1);
    if (!facility[0]) throw new ProviderManagementValidationError("facilityId is invalid");
  }
  let existing = null;
  if (serviceId) {
    const rows = await db.select().from(providerServiceLocations).where(and(eq(providerServiceLocations.id, serviceId), eq(providerServiceLocations.providerId, profile.id))).limit(1);
    existing = rows[0] ?? null;
    if (!existing) throw new ProviderManagementValidationError("Service not found");
  }
  const now = new Date();
  const service = {
    id: existing?.id ?? crypto.randomUUID(), providerId: profile.id, facilityId, mode,
    feeQar: integerValue(value.feeQar, "feeQar", 0, 100000),
    slotDurationMinutes: integerValue(value.slotDurationMinutes, "slotDurationMinutes", 15, 180),
    acceptingNewPatients: value.acceptingNewPatients !== false,
    status: existing?.status ?? "draft", createdAt: existing?.createdAt ?? now, updatedAt: now,
  };
  if (service.slotDurationMinutes % 15 !== 0) throw new ProviderManagementValidationError("Duration must use 15-minute increments");
  await db.batch([
    existing
      ? db.update(providerServiceLocations).set(service).where(eq(providerServiceLocations.id, service.id))
      : db.insert(providerServiceLocations).values(service),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId: userId, organizationId: profile.organizationId,
      action: existing ? "provider.service_updated" : "provider.service_created", resourceType: "provider_service", resourceId: service.id,
      outcome: "success", metadataJson: JSON.stringify({ mode, status: service.status }), createdAt: now,
    }),
  ]);
  return service;
}

export async function saveProviderAvailability(userId: string, body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ProviderManagementValidationError("A JSON object is required");
  const profile = await authorizedProvider(userId);
  if (!profile || profile.verificationStatus !== "verified") throw new ProviderManagementValidationError("Provider verification is required");
  const value = body as Record<string, unknown>;
  const serviceLocationId = textValue(value.serviceLocationId, "serviceLocationId", 128)!;
  const db = await getDb();
  const service = await db.select().from(providerServiceLocations).where(and(eq(providerServiceLocations.id, serviceLocationId), eq(providerServiceLocations.providerId, profile.id))).limit(1);
  if (!service[0]) throw new ProviderManagementValidationError("Service not found");
  if (!Array.isArray(value.windows) || value.windows.length < 1 || value.windows.length > 21) throw new ProviderManagementValidationError("Between 1 and 21 availability windows are required");
  const normalized = value.windows.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new ProviderManagementValidationError("Availability window is invalid");
    const window = item as Record<string, unknown>;
    const weekday = integerValue(window.weekday, "weekday", 0, 6);
    const startMinute = integerValue(window.startMinute, "startMinute", 0, 1425);
    const endMinute = integerValue(window.endMinute, "endMinute", 15, 1440);
    if (startMinute >= endMinute || startMinute % 15 !== 0 || endMinute % 15 !== 0) throw new ProviderManagementValidationError("Availability must use valid 15-minute boundaries");
    return { weekday, startMinute, endMinute };
  }).sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1]; const current = normalized[index];
    if (previous.weekday === current.weekday && previous.endMinute > current.startMinute) throw new ProviderManagementValidationError("Availability windows cannot overlap");
  }
  const now = new Date();
  const rows = normalized.map((window) => ({
    id: crypto.randomUUID(), serviceLocationId, ...window, timezone: "Asia/Qatar", status: "active", createdAt: now, updatedAt: now,
  }));
  await db.batch([
    db.delete(providerAvailabilityWindows).where(eq(providerAvailabilityWindows.serviceLocationId, serviceLocationId)),
    db.insert(providerAvailabilityWindows).values(rows),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId: userId, organizationId: profile.organizationId,
      action: "provider.availability_replaced", resourceType: "provider_service", resourceId: serviceLocationId,
      outcome: "success", metadataJson: JSON.stringify({ windowCount: rows.length, timezone: "Asia/Qatar" }), createdAt: now,
    }),
  ]);
  return rows;
}

export async function publishProviderService(userId: string, serviceLocationId: string) {
  const profile = await authorizedProvider(userId);
  if (!profile || profile.verificationStatus !== "verified" || !profile.organizationId) throw new ProviderManagementValidationError("Provider verification is required");
  const languageList = JSON.parse(profile.languagesJson) as unknown;
  if (!profile.bioEn || !profile.yearsExperience || !Array.isArray(languageList) || !languageList.length) {
    throw new ProviderManagementValidationError("Complete the public profile before publishing");
  }
  const db = await getDb();
  const service = await db.select().from(providerServiceLocations).where(and(eq(providerServiceLocations.id, serviceLocationId), eq(providerServiceLocations.providerId, profile.id))).limit(1);
  if (!service[0]) throw new ProviderManagementValidationError("Service not found");
  const windows = await db.select({ id: providerAvailabilityWindows.id }).from(providerAvailabilityWindows).where(and(
    eq(providerAvailabilityWindows.serviceLocationId, serviceLocationId), eq(providerAvailabilityWindows.status, "active"),
  )).limit(1);
  if (!windows[0]) throw new ProviderManagementValidationError("Add availability before publishing");
  const now = new Date();
  await db.batch([
    db.update(providerServiceLocations).set({ status: "active", updatedAt: now }).where(eq(providerServiceLocations.id, serviceLocationId)),
    db.update(providerProfiles).set({ publishedAt: profile.publishedAt ?? now, updatedAt: now }).where(eq(providerProfiles.id, profile.id)),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId: userId, organizationId: profile.organizationId,
      action: "provider.service_published", resourceType: "provider_service", resourceId: serviceLocationId,
      outcome: "success", metadataJson: null, createdAt: now,
    }),
  ]);
}
