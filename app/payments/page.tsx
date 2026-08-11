"use client";

import { useEffect, useMemo, useState } from "react";

type LedgerEntry = {
  appointmentId: string;
  appointmentStatus: string;
  scheduledStart: string;
  providerName: string;
  specialty: string;
  facilityName: string | null;
  amountQar: number | null;
  currency: string;
  paymentStatus: string;
  providerReference: string | null;
  refundAmountQar: number | null;
  statusUpdatedAt: string | null;
  ledgerVersion: number | null;
};

type Filter = "all" | "not_charged" | "paid" | "refunds" | "unavailable";

function label(value: string) {
  const labels: Record<string, string> = {
    not_charged: "No charge recorded",
    unavailable: "Status unavailable",
    authorized: "Authorized",
    refund_pending: "Refund confirmed — pending",
    refunded: "Refunded",
    failed: "Payment failed",
  };
  return labels[value] || value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function formatMoney(amount: number | null, currency = "QAR") {
  return amount === null ? "Amount unavailable" : `${currency} ${amount.toLocaleString("en-QA")}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-QA", { timeZone: "Asia/Qatar", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function Payments() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<LedgerEntry | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/patient/payments", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as { entries?: LedgerEntry[]; error?: string };
      if (response.status === 401) {
        window.location.assign("/signin-with-chatgpt?return_to=/payments");
        throw new Error("Authentication required");
      }
      if (!response.ok) throw new Error(payload.error || "Payment records are temporarily unavailable.");
      return payload.entries || [];
    }).then((items) => { if (active) setEntries(items); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "Payment records are temporarily unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => entries.filter((entry) => {
    const matchesFilter = filter === "all" || entry.paymentStatus === filter || (filter === "refunds" && ["refund_pending", "refunded"].includes(entry.paymentStatus));
    const normalized = query.trim().toLowerCase();
    return matchesFilter && (!normalized || `${entry.providerName} ${entry.specialty} ${entry.appointmentId} ${entry.providerReference || ""}`.toLowerCase().includes(normalized));
  }), [entries, filter, query]);

  const paidTotal = entries.filter((entry) => entry.paymentStatus === "paid").reduce((sum, entry) => sum + (entry.amountQar || 0), 0);
  const notChargedTotal = entries.filter((entry) => entry.paymentStatus === "not_charged").reduce((sum, entry) => sum + (entry.amountQar || 0), 0);
  const refunds = entries.filter((entry) => ["refund_pending", "refunded"].includes(entry.paymentStatus)).length;

  return <main className="payments-shell payments-live-shell" id="main-content">
    <header className="payments-header"><a className="brand" href="/"><img src="/brand/reyati-logo.svg" alt="Reyati"/></a><nav><a href="/providers">Find care</a><a href="/appointments">Appointments</a><a href="/wallet">Health records</a><a className="active" href="/payments">Payments</a><a href="/support">Support</a></nav><div><a href="/notifications">Notifications</a><span>RY</span></div></header>
    <section className="payments-hero"><div><p>ACCOUNT-OWNED FINANCIAL STATUS</p><h1>Payments & billing</h1><span>See the recorded payment state tied to each of your appointments—without confusing schedule changes with refunds.</span></div><a href="/support">Payment support</a></section>
    <section className="payments-workspace">
      <div className="payment-safety"><span>i</span><p><b>No payment provider is connected yet.</b> New bookings are recorded as “No charge recorded” using the provider’s published fee. Reyati will never claim a payment or refund unless a trusted payment integration confirms it.</p></div>

      <div className="payment-metrics payments-live-metrics"><article><span>Q</span><div><p>Confirmed paid</p><b>{formatMoney(paidTotal)}</b><small>From recorded paid entries only</small></div></article><article><span>○</span><div><p>No charge recorded</p><b>{formatMoney(notChargedTotal)}</b><small>Published fees, not money collected</small></div></article><article><span>↻</span><div><p>Recorded refunds</p><b>{refunds}</b><small>Only provider-confirmed refund states</small></div></article></div>

      <section className="payment-panel payments-live-panel"><div className="panel-title"><div><h2>Appointment payment ledger</h2><p>Only appointments owned by your signed-in patient account appear here.</p></div></div>
        <div className="payments-live-toolbar"><div>{(["all", "not_charged", "paid", "refunds", "unavailable"] as Filter[]).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All" : item === "refunds" ? "Refunds" : label(item)}</button>)}</div><label aria-label="Search payment records">⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search provider or reference"/></label></div>
        {error && <div className="payments-live-error"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
        {loading ? <div className="payments-live-state"><span>◌</span><h2>Loading your payment ledger</h2><p>Checking the latest recorded status.</p></div>
          : visible.length === 0 ? <div className="payments-live-state"><span>Q</span><h2>{query || filter !== "all" ? "No matching entries" : "No appointment payment records yet"}</h2><p>Payment status will appear after you book with a provider that publishes a fee.</p><a href="/providers">Find care</a></div>
          : <div className="payments-live-list">{visible.map((entry) => <button key={entry.appointmentId} onClick={() => setSelected(entry)}><time>{formatDate(entry.scheduledStart)}<small>{entry.appointmentId}</small></time><div><b>{entry.providerName}</b><small>{entry.specialty} · {entry.facilityName || "Facility not recorded"}</small></div><span>Appointment: {label(entry.appointmentStatus)}</span><i className={entry.paymentStatus}>{label(entry.paymentStatus)}</i><strong>{formatMoney(entry.amountQar, entry.currency)}</strong><em>›</em></button>)}</div>}
      </section>
    </section>

    {selected && <div className="checkout-layer" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><section className="receipt-dialog payments-live-detail"><button className="drawer-close" onClick={() => setSelected(null)} aria-label="Close">×</button><img src="/brand/reyati-logo.svg" alt="Reyati"/><p>PAYMENT STATUS RECORD</p><h2>{formatMoney(selected.amountQar, selected.currency)}</h2><span className={`payment-status-large ${selected.paymentStatus}`}>{label(selected.paymentStatus)}</span><dl><div><dt>Provider</dt><dd>{selected.providerName}</dd></div><div><dt>Appointment</dt><dd>{formatDate(selected.scheduledStart)}</dd></div><div><dt>Appointment status</dt><dd>{label(selected.appointmentStatus)}</dd></div><div><dt>Payment reference</dt><dd>{selected.providerReference || "No provider reference recorded"}</dd></div><div><dt>Refund amount</dt><dd>{selected.refundAmountQar === null ? "No confirmed refund" : formatMoney(selected.refundAmountQar, selected.currency)}</dd></div><div><dt>Ledger version</dt><dd>{selected.ledgerVersion || "Legacy appointment — untracked"}</dd></div></dl><div className="refund-truth"><span>i</span><p><b>Schedule and payment states are separate.</b>Cancelling an appointment does not prove that money was collected, that a refund is owed, or that a refund was completed.</p></div><a href="/support">Ask about this payment</a></section></div>}
  </main>;
}
