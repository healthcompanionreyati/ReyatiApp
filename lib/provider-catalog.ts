import { and, asc, eq, gt, inArray, isNotNull, lt } from "drizzle-orm";
import { getDb } from "@/db";
import {
  appointmentSlotLocks,
  facilities,
  organizations,
  providerAvailabilityWindows,
  providerProfiles,
  providerServiceLocations,
  users,
} from "@/db/schema";

const QATAR_OFFSET_MS = 3 * 60 * 60 * 1000;
const SLOT_MS = 15 * 60 * 1000;
const CATALOG_DAYS = 14;

function languages(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

function slotLabel(date: Date) {
  return new Intl.DateTimeFormat("en-QA", {
    timeZone: "Asia/Qatar",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export async function getPublishedProviderCatalog() {
  const db = await getDb();
  const rows = await db.select({
    providerId: providerProfiles.id,
    name: users.displayName,
    specialty: providerProfiles.specialty,
    gender: providerProfiles.gender,
    languagesJson: providerProfiles.languagesJson,
    bioEn: providerProfiles.bioEn,
    bioAr: providerProfiles.bioAr,
    yearsExperience: providerProfiles.yearsExperience,
    serviceLocationId: providerServiceLocations.id,
    facilityId: facilities.id,
    facilityName: facilities.name,
    facilityStatus: facilities.status,
    area: facilities.area,
    mode: providerServiceLocations.mode,
    feeQar: providerServiceLocations.feeQar,
    slotDurationMinutes: providerServiceLocations.slotDurationMinutes,
  }).from(providerProfiles)
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .innerJoin(organizations, eq(organizations.id, providerProfiles.organizationId))
    .innerJoin(providerServiceLocations, eq(providerServiceLocations.providerId, providerProfiles.id))
    .leftJoin(facilities, eq(facilities.id, providerServiceLocations.facilityId))
    .where(and(
      eq(providerProfiles.verificationStatus, "verified"),
      isNotNull(providerProfiles.publishedAt),
      eq(users.status, "active"),
      eq(organizations.status, "active"),
      eq(providerServiceLocations.status, "active"),
      eq(providerServiceLocations.acceptingNewPatients, true),
    ))
    .orderBy(asc(users.displayName), asc(providerServiceLocations.feeQar));

  const providers = new Map<string, {
    id: string;
    name: string;
    specialty: string;
    gender: string | null;
    languages: string[];
    bioEn: string | null;
    bioAr: string | null;
    yearsExperience: number | null;
    services: Array<{
      id: string;
      facilityId: string | null;
      facilityName: string | null;
      area: string | null;
      mode: string;
      feeQar: number;
      slotDurationMinutes: number;
    }>;
  }>();

  for (const row of rows) {
    if (!["in_person", "video"].includes(row.mode) || row.feeQar < 0 || row.feeQar > 100000) continue;
    if (row.mode === "in_person" && (!row.facilityId || !row.facilityName || row.facilityStatus !== "active")) continue;
    const provider = providers.get(row.providerId) ?? {
      id: row.providerId,
      name: row.name,
      specialty: row.specialty,
      gender: row.gender,
      languages: languages(row.languagesJson),
      bioEn: row.bioEn,
      bioAr: row.bioAr,
      yearsExperience: row.yearsExperience,
      services: [],
    };
    provider.services.push({
      id: row.serviceLocationId,
      facilityId: row.facilityId,
      facilityName: row.facilityName,
      area: row.area,
      mode: row.mode,
      feeQar: row.feeQar,
      slotDurationMinutes: row.slotDurationMinutes,
    });
    providers.set(row.providerId, provider);
  }
  return [...providers.values()];
}

export async function getProviderAvailability(providerId: string, serviceLocationId?: string) {
  const db = await getDb();
  const services = await db.select({
    id: providerServiceLocations.id,
    providerId: providerServiceLocations.providerId,
    facilityId: providerServiceLocations.facilityId,
    mode: providerServiceLocations.mode,
    duration: providerServiceLocations.slotDurationMinutes,
    facilityStatus: facilities.status,
  }).from(providerServiceLocations)
    .innerJoin(providerProfiles, eq(providerProfiles.id, providerServiceLocations.providerId))
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .innerJoin(organizations, eq(organizations.id, providerProfiles.organizationId))
    .leftJoin(facilities, eq(facilities.id, providerServiceLocations.facilityId))
    .where(and(
      eq(providerServiceLocations.providerId, providerId),
      serviceLocationId ? eq(providerServiceLocations.id, serviceLocationId) : undefined,
      eq(providerServiceLocations.status, "active"),
      eq(providerServiceLocations.acceptingNewPatients, true),
      eq(providerProfiles.verificationStatus, "verified"),
      isNotNull(providerProfiles.publishedAt),
      eq(users.status, "active"),
      eq(organizations.status, "active"),
    ));
  const availableServices = services.filter((service) =>
    service.mode === "video" || (service.mode === "in_person" && service.facilityId && service.facilityStatus === "active")
  );
  if (!availableServices.length) return [];

  const serviceIds = availableServices.map((service) => service.id);
  const windows = await db.select().from(providerAvailabilityWindows).where(and(
    inArray(providerAvailabilityWindows.serviceLocationId, serviceIds),
    eq(providerAvailabilityWindows.status, "active"),
    eq(providerAvailabilityWindows.timezone, "Asia/Qatar"),
  ));
  const now = new Date();
  const horizon = new Date(now.valueOf() + CATALOG_DAYS * 24 * 60 * 60 * 1000);
  const reservations = await db.select({ slotStart: appointmentSlotLocks.slotStart })
    .from(appointmentSlotLocks)
    .where(and(
      eq(appointmentSlotLocks.providerId, providerId),
      gt(appointmentSlotLocks.slotStart, now),
      lt(appointmentSlotLocks.slotStart, horizon),
    ));
  const reserved = new Set(reservations.map((row) => row.slotStart.valueOf()));
  const qatarNow = new Date(now.valueOf() + QATAR_OFFSET_MS);
  const base = Date.UTC(qatarNow.getUTCFullYear(), qatarNow.getUTCMonth(), qatarNow.getUTCDate());
  const slots = [];

  for (let day = 0; day < CATALOG_DAYS; day += 1) {
    const qatarDay = new Date(base + day * 24 * 60 * 60 * 1000);
    for (const service of availableServices) {
      const durationMs = service.duration * 60 * 1000;
      if (service.duration < 15 || service.duration > 180 || durationMs % SLOT_MS !== 0) continue;
      for (const window of windows.filter((item) => item.serviceLocationId === service.id && item.weekday === qatarDay.getUTCDay())) {
        if (window.weekday < 0 || window.weekday > 6 || window.startMinute < 0 || window.endMinute > 1440 || window.startMinute >= window.endMinute || window.startMinute % 15 !== 0) continue;
        for (let minute = window.startMinute; minute + service.duration <= window.endMinute; minute += service.duration) {
          const startMs = qatarDay.valueOf() - QATAR_OFFSET_MS + minute * 60 * 1000;
          const endMs = startMs + durationMs;
          if (startMs <= now.valueOf() + SLOT_MS) continue;
          let available = true;
          for (let segment = startMs; segment < endMs; segment += SLOT_MS) {
            if (reserved.has(segment)) available = false;
          }
          if (!available) continue;
          const start = new Date(startMs);
          slots.push({
            serviceLocationId: service.id,
            providerId,
            facilityId: service.facilityId,
            mode: service.mode,
            scheduledStart: start.toISOString(),
            scheduledEnd: new Date(endMs).toISOString(),
            label: slotLabel(start),
          });
        }
      }
    }
  }
  return slots.slice(0, 24);
}
