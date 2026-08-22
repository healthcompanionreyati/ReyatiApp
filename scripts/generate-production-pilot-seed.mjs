import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputArg = process.argv.find((value) => value.startsWith("--output="));
const outputPath = resolve(outputArg?.slice("--output=".length) || "work/qivaya-pilot-synthetic.sql");
const now = Date.now();
const day = 24 * 60 * 60 * 1000;
const hour = 60 * 60 * 1000;
const adminUser = "(SELECT user_id FROM platform_roles WHERE role='platform_admin' AND status='active' ORDER BY created_at LIMIT 1)";

const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const statements = [
  "PRAGMA foreign_keys = ON;",
  "-- Qivaya synthetic production pilot fixture. Additive and idempotent; never deletes or updates account-owned data.",
  `INSERT OR IGNORE INTO organizations (id,name,type,status,verification_version,created_at,updated_at) VALUES ('qv-syn-org-001','Qivaya Pilot Medical Centre','medical_center','active',2,${now},${now});`,
  `INSERT OR IGNORE INTO facilities (id,organization_id,name,area,status,created_at,updated_at) VALUES ('qv-syn-facility-001','qv-syn-org-001','Qivaya West Bay Clinic','West Bay','active',${now},${now});`,
  `INSERT OR IGNORE INTO organization_members (organization_id,user_id,role,status,created_at,updated_at) SELECT 'qv-syn-org-001',${adminUser},'organization_owner','active',${now},${now} WHERE ${adminUser} IS NOT NULL;`,
  `INSERT OR IGNORE INTO organization_verification_reviews (id,organization_id,reviewer_user_id,decision,verification_version,notes,created_at) SELECT 'qv-syn-org-review-001','qv-syn-org-001',${adminUser},'approved',1,'Synthetic pilot organization approved for demonstration and operational rehearsal only.',${now} WHERE ${adminUser} IS NOT NULL;`,
  `INSERT OR IGNORE INTO patient_profiles (id,user_id,date_of_birth,profile_status,created_at,updated_at) SELECT 'qv-syn-patient-owner',${adminUser},'1990-05-14','complete',${now},${now} WHERE ${adminUser} IS NOT NULL;`,
  `INSERT OR IGNORE INTO provider_profiles (id,user_id,organization_id,license_reference,specialty,gender,languages_json,bio_en,bio_ar,years_experience,verification_status,verification_version,published_at,created_at,updated_at) SELECT 'qv-syn-provider-001',${adminUser},'qv-syn-org-001','SYN-QV-0001','Family Medicine','male','["English","Arabic"]','Synthetic provider profile for controlled Qivaya demonstrations.','ملف مزود اصطناعي لعروض قوايا الخاضعة للرقابة.',12,'verified',2,${now},${now},${now} WHERE ${adminUser} IS NOT NULL;`,
];

const providers = [
  [2, "Dr. Layla Al-Kuwari", "Dermatology", "female", 11, 320],
  [3, "Dr. Omar Hassan", "Cardiology", "male", 16, 450],
  [4, "Dr. Noor Al-Sulaiti", "Pediatrics", "female", 9, 280],
  [5, "Dr. Samir Rahman", "Orthopedics", "male", 14, 390],
];

for (const [number, name, specialty, gender, experience, fee] of providers) {
  const suffix = String(number).padStart(3, "0");
  const userId = `qv-syn-provider-user-${suffix}`;
  const providerId = `qv-syn-provider-${suffix}`;
  statements.push(
    `INSERT OR IGNORE INTO users (id,auth_user_id,email,display_name,preferred_language,status,created_at,updated_at) VALUES (${q(userId)},${q(`synthetic:provider:${suffix}`)},${q(`provider.${suffix}@synthetic.qivaya.invalid`)},${q(name)},'en','active',${now},${now});`,
    `INSERT OR IGNORE INTO organization_members (organization_id,user_id,role,status,created_at,updated_at) VALUES ('qv-syn-org-001',${q(userId)},'practitioner','active',${now},${now});`,
    `INSERT OR IGNORE INTO provider_profiles (id,user_id,organization_id,license_reference,specialty,gender,languages_json,bio_en,bio_ar,years_experience,verification_status,verification_version,published_at,created_at,updated_at) VALUES (${q(providerId)},${q(userId)},'qv-syn-org-001',${q(`SYN-QV-${suffix}`)},${q(specialty)},${q(gender)},'["English","Arabic"]',${q(`Synthetic ${specialty.toLowerCase()} profile for controlled Qivaya demonstrations.`)},'ملف مزود اصطناعي لعروض قوايا الخاضعة للرقابة.',${experience},'verified',2,${now},${now},${now});`,
    `INSERT OR IGNORE INTO provider_verification_reviews (id,provider_id,reviewer_user_id,decision,verification_version,notes,created_at) SELECT ${q(`qv-syn-provider-review-${suffix}`)},${q(providerId)},${adminUser},'approved',1,'Synthetic credential evidence approved for demonstration only; not a real licence verification.',${now} WHERE ${adminUser} IS NOT NULL;`,
    `INSERT OR IGNORE INTO provider_service_locations (id,provider_id,facility_id,mode,fee_qar,slot_duration_minutes,accepting_new_patients,status,created_at,updated_at) VALUES (${q(`qv-syn-service-${suffix}`)},${q(providerId)},'qv-syn-facility-001','in_person',${fee},30,1,'active',${now},${now});`,
  );
}

statements.push(
  `INSERT OR IGNORE INTO provider_verification_reviews (id,provider_id,reviewer_user_id,decision,verification_version,notes,created_at) SELECT 'qv-syn-provider-review-001','qv-syn-provider-001',${adminUser},'approved',1,'Synthetic credential evidence approved for demonstration only; not a real licence verification.',${now} WHERE ${adminUser} IS NOT NULL;`,
  `INSERT OR IGNORE INTO provider_service_locations (id,provider_id,facility_id,mode,fee_qar,slot_duration_minutes,accepting_new_patients,status,created_at,updated_at) VALUES ('qv-syn-service-001','qv-syn-provider-001','qv-syn-facility-001','in_person',250,30,1,'active',${now},${now});`,
);

for (let provider = 1; provider <= 5; provider += 1) {
  const suffix = String(provider).padStart(3, "0");
  for (let weekday = 0; weekday <= 4; weekday += 1) {
    statements.push(`INSERT OR IGNORE INTO provider_availability_windows (id,service_location_id,weekday,start_minute,end_minute,timezone,status,created_at,updated_at) VALUES (${q(`qv-syn-availability-${suffix}-${weekday}`)},${q(`qv-syn-service-${suffix}`)},${weekday},480,960,'Asia/Qatar','active',${now},${now});`);
  }
}

for (let patient = 2; patient <= 50; patient += 1) {
  const suffix = String(patient).padStart(3, "0");
  const userId = `qv-syn-patient-user-${suffix}`;
  const patientId = `qv-syn-patient-${suffix}`;
  statements.push(
    `INSERT OR IGNORE INTO users (id,auth_user_id,email,display_name,preferred_language,status,created_at,updated_at) VALUES (${q(userId)},${q(`synthetic:patient:${suffix}`)},${q(`patient.${suffix}@synthetic.qivaya.invalid`)},${q(`Synthetic Patient ${suffix}`)},${patient % 4 === 0 ? q("ar") : q("en")},'active',${now},${now});`,
    `INSERT OR IGNORE INTO patient_profiles (id,user_id,date_of_birth,profile_status,created_at,updated_at) VALUES (${q(patientId)},${q(userId)},${q(`${1970 + (patient % 35)}-${String((patient % 12) + 1).padStart(2, "0")}-15`)},'complete',${now},${now});`,
  );
}

for (let index = 1; index <= 40; index += 1) {
  const suffix = String(index).padStart(3, "0");
  const providerNumber = ((index - 1) % 5) + 1;
  const providerSuffix = String(providerNumber).padStart(3, "0");
  const isOwnerJourney = index <= 12;
  const patientId = isOwnerJourney ? "qv-syn-patient-owner" : `qv-syn-patient-${String(index + 10).padStart(3, "0")}`;
  const completed = index % 5 === 0 || index === 2 || index === 4;
  const cancelled = index % 11 === 0;
  const status = cancelled ? "cancelled" : completed ? "completed" : index % 3 === 0 ? "pending" : "confirmed";
  const start = completed ? now - (index + 3) * day : now + (index + 1) * day + (9 + (index % 6)) * hour;
  const end = start + 30 * 60 * 1000;
  const appointmentId = `qv-syn-appointment-${suffix}`;
  statements.push(
    `INSERT OR IGNORE INTO appointments (id,patient_id,provider_id,service_location_id,facility_id,scheduled_start,scheduled_end,mode,status,cancelled_at,idempotency_key,version,created_at,updated_at) VALUES (${q(appointmentId)},${q(patientId)},${q(`qv-syn-provider-${providerSuffix}`)},${q(`qv-syn-service-${providerSuffix}`)},'qv-syn-facility-001',${start},${end},'in_person',${q(status)},${cancelled ? start - day : "NULL"},${q(`qv-synthetic-booking-${suffix}`)},1,${now},${now});`,
    `INSERT OR IGNORE INTO payment_ledger_entries (id,appointment_id,patient_id,amount_qar,currency,status,provider_reference,refund_amount_qar,status_updated_at,version,created_at,updated_at) VALUES (${q(`qv-syn-payment-${suffix}`)},${q(appointmentId)},${q(patientId)},${200 + providerNumber * 50},'QAR','not_charged',NULL,NULL,${now},1,${now},${now});`,
  );
  if (completed) {
    const author = providerNumber === 1 ? adminUser : q(`qv-syn-provider-user-${providerSuffix}`);
    statements.push(`INSERT OR IGNORE INTO encounter_notes (id,appointment_id,author_user_id,status,history_text,assessment_text,plan_text,patient_instructions,version,finalized_at,created_at,updated_at) SELECT ${q(`qv-syn-encounter-${suffix}`)},${q(appointmentId)},${author},'finalized','Synthetic visit history for product demonstration.','Synthetic assessment; not clinical advice or a real diagnosis.','Synthetic follow-up plan for interface demonstration.','This is synthetic demonstration content. Contact a licensed clinician for real care.',1,${start + hour},${now},${now} WHERE ${author} IS NOT NULL;`);
  }
}

const notifications = [
  ["welcome", "Your Qivaya pilot workspace is ready", "Explore the patient, provider, and platform experiences using synthetic data.", "/"],
  ["appointment", "Upcoming appointment confirmed", "A synthetic appointment is ready to review in your care timeline.", "/appointments"],
  ["record", "Visit record available", "A finalized synthetic visit record is available in Health.", "/wallet"],
  ["provider", "Provider workspace activated", "Your synthetic provider schedule and patient list are ready.", "/provider"],
  ["operations", "Operations baseline established", "Production D1, R2, email, and scheduled maintenance checks are connected.", "/admin/operations"],
  ["security", "Synthetic data boundary active", "All seeded people and care activity are explicitly synthetic demonstration records.", "/admin/audit"],
];

notifications.forEach(([type, title, body, path], index) => {
  const suffix = String(index + 1).padStart(3, "0");
  statements.push(`INSERT OR IGNORE INTO notifications (id,user_id,type,title,body,action_path,resource_type,resource_id,dedupe_key,status,read_at,created_at) SELECT ${q(`qv-syn-notification-${suffix}`)},${adminUser},${q(type)},${q(title)},${q(body)},${q(path)},'synthetic_pilot','qv-syn-org-001',${q(`qv-synthetic-notification-${suffix}`)},${index < 2 ? q("unread") : q("read")},${index < 2 ? "NULL" : now},${now - index * hour} WHERE ${adminUser} IS NOT NULL;`);
});

statements.push(
  `INSERT OR IGNORE INTO audit_events (id,actor_user_id,organization_id,action,resource_type,resource_id,outcome,metadata_json,created_at) SELECT 'qv-syn-audit-provisioned',${adminUser},'qv-syn-org-001','synthetic_pilot.provisioned','synthetic_pilot','qv-syn-org-001','success','{"dataMode":"synthetic_only","providers":5,"patients":50,"appointments":40}',${now} WHERE ${adminUser} IS NOT NULL;`,
  "SELECT 'synthetic_pilot' AS fixture, (SELECT COUNT(*) FROM organizations WHERE id='qv-syn-org-001') AS organizations, (SELECT COUNT(*) FROM provider_profiles WHERE id LIKE 'qv-syn-provider-%') AS providers, (SELECT COUNT(*) FROM patient_profiles WHERE id LIKE 'qv-syn-patient-%') AS patients, (SELECT COUNT(*) FROM appointments WHERE id LIKE 'qv-syn-appointment-%') AS appointments;",
);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${statements.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ outputPath, statements: statements.length, providers: 5, patients: 50, appointments: 40, dataMode: "synthetic_only" }, null, 2));
