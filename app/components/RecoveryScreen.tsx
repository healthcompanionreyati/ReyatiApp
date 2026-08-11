"use client";

type RecoveryScreenProps = {
  title: string;
  message: string;
  retry?: () => void;
};

export default function RecoveryScreen({ title, message, retry }: RecoveryScreenProps) {
  return <main className="recovery-shell" id="main-content">
    <section className="recovery-card" role="alert">
      <img src="/brand/reyati-logo.svg" alt="Reyati"/>
      <span className="recovery-mark" aria-hidden="true">!</span>
      <p>SAFE RECOVERY</p>
      <h1>{title}</h1>
      <p className="recovery-message">{message}</p>
      <div className="recovery-actions">
        {retry && <button type="button" onClick={retry}>Try again</button>}
        <a href="/">Return home</a>
        <a className="secondary" href="/support">Contact support</a>
      </div>
      <small>Your secure Reyati data is not displayed on this recovery screen.</small>
    </section>
  </main>;
}
