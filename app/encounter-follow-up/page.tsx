"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./encounter-continuity.module.css";

type Amendment = {
  id: string;
  amendmentType: string;
  patientSummary: string;
  reasonCode: string;
  createdAt: string;
};

type RecordItem = {
  appointmentId: string;
  noteId: string;
  originalSummary: string;
  finalizedAt: string;
  scheduledStart: string;
  providerName: string;
  amendments: Amendment[];
};

type FollowUp = {
  id: string;
  appointmentId: string;
  taskType: string;
  title: string;
  patientInstructions: string;
  dueWindowStart: string;
  dueWindowEnd: string;
  status: string;
  acknowledgedAt: string | null;
  version: number;
};

type Data = {
  records: RecordItem[];
  followUps: FollowUp[];
  boundary: string;
};

async function request(init?: RequestInit) {
  const response = await fetch("/api/encounter-continuity", { cache: "no-store", credentials: "same-origin", ...init });
  if (response.status === 401) {
    location.assign("/signin-with-chatgpt?return_to=/encounter-follow-up");
    throw Error("Authentication required");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.data === undefined) throw Error(payload.message || payload.error || "Visit continuity is unavailable");
  return payload.data as Data;
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-QA", { timeZone: "Asia/Qatar", dateStyle: "medium" }).format(new Date(value));
}

export default function EncounterFollowUpPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setData(await request());
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load().catch((e) => setError(e.message)));
  }, [load]);

  async function acknowledge(task: FollowUp) {
    setBusy(task.id);
    setError("");
    try {
      await request({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge_follow_up", taskId: task.id, version: task.version }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to acknowledge");
    } finally {
      setBusy("");
    }
  }

  const followUpCount = data?.followUps.length ?? 0;
  const recordCount = data?.records.length ?? 0;
  const amendmentCount = data?.records.reduce((total, record) => total + record.amendments.length, 0) ?? 0;

  return (
    <main className={styles.shell} id="main-content">
      <header className={styles.top}>
        <a href="/"><img src="/brand/reyati-logo.svg" alt="Reyati" /></a>
        <nav>
          <a href="/appointments">Appointments</a>
          <a href="/wallet">Health records</a>
          <a href="/notifications">Notifications</a>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>VISIT CONTINUITY</p>
          <h1>Your original record, with every later update clearly linked.</h1>
          <p>Review finalized visit instructions, attributed amendment history, and provider-recommended next steps without changing clinical content.</p>
        </div>
        <aside className={styles.heroCard}>
          <small>AT A GLANCE</small>
          <h2>Follow-up stays attached to the finalized visit</h2>
          <p>Every task and amendment remains tied to the original appointment record, so the patient view stays calm and easy to trust.</p>
          <dl className={styles.heroStats}>
            <div>
              <dt>Open follow-ups</dt>
              <dd>{followUpCount}</dd>
            </div>
            <div>
              <dt>Finalized visits</dt>
              <dd>{recordCount}</dd>
            </div>
            <div>
              <dt>Linked amendments</dt>
              <dd>{amendmentCount}</dd>
            </div>
          </dl>
        </aside>
      </section>

      <div className={styles.workspace}>
        {error && <p className={`${styles.notice} ${styles.error}`}>{error}</p>}
        <p className={styles.boundary}>{data?.boundary || "Opening your protected visit continuity record…"}</p>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>FOLLOW-UP TASKS</p>
              <h2>Recommended next steps</h2>
            </div>
            <span className={styles.pill}>{followUpCount} tasks</span>
          </div>

          <div className={styles.grid}>
            {data?.followUps.map((task) => (
              <article className={styles.card} key={task.id}>
                <span className={styles.pill}>{task.taskType.replaceAll("_", " ")} · {task.status}</span>
                <h3>{task.title}</h3>
                <p>{task.patientInstructions}</p>
                <p className={styles.meta}>Due between {date(task.dueWindowStart)} and {date(task.dueWindowEnd)}</p>
                {task.status === "recommended" ? (
                  <button className={styles.button} disabled={busy === task.id} onClick={() => void acknowledge(task)}>
                    {busy === task.id ? "Acknowledging…" : "Acknowledge recommendation"}
                  </button>
                ) : (
                  <p className={styles.success}>✓ Acknowledged {task.acknowledgedAt ? date(task.acknowledgedAt) : ""}</p>
                )}
              </article>
            ))}
            {data && !data.followUps.length && (
              <article className={styles.card}>
                <h3>No follow-up recommendations</h3>
                <p className={styles.muted}>Provider-recommended next steps will appear here after a finalized visit.</p>
              </article>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>FINALIZED VISITS</p>
              <h2>Original summaries and linked history</h2>
            </div>
          </div>

          {data?.records.map((record) => (
            <article className={styles.card} key={record.noteId}>
              <div className={styles.row}>
                <span className={styles.pill}>Original · finalized</span>
                <span className={styles.meta}>{date(record.scheduledStart)} · {record.providerName}</span>
              </div>
              <h3>Original patient-facing summary</h3>
              <p>{record.originalSummary || "No patient-facing instructions were recorded for this visit."}</p>
              {record.amendments.length > 0 && (
                <div className={styles.timeline}>
                  {record.amendments.map((item) => (
                    <article key={item.id}>
                      <div className={styles.row}>
                        <span className={styles.pill}>{item.amendmentType}</span>
                        <span className={styles.meta}>{date(item.createdAt)} · {item.reasonCode.replaceAll("_", " ")}</span>
                      </div>
                      <p>{item.patientSummary}</p>
                    </article>
                  ))}
                </div>
              )}
              {!record.amendments.length && <p className={styles.muted}>No amendments have been linked to this original record.</p>}
            </article>
          ))}

          {data && !data.records.length && (
            <article className={styles.card}>
              <h3>No finalized visits</h3>
              <p className={styles.muted}>Finalized patient-facing visit records will appear here.</p>
            </article>
          )}
        </section>
      </div>
    </main>
  );
}
