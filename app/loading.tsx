export default function Loading() {
  return <main className="route-loading" id="main-content" role="status" aria-live="polite" aria-busy="true">
    <img src="/brand/qivaya-logo-primary.png" alt="Qivaya"/>
    <div className="route-loading-mark" aria-hidden="true"><span/><span/><span/></div>
    <h1>Preparing your secure workspace</h1>
    <p>Loading the latest information available to your Qivaya account.</p>
    <small>No care, payment, or access status is assumed while this page loads.</small>
  </main>;
}
