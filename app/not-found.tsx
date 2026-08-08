export default function NotFound() {
  return <main className="system-state" id="main-content">
    <a href="/"><img src="/brand/reyati-logo.svg" alt="Reyati" /></a>
    <span aria-hidden="true">404</span>
    <p>PAGE NOT FOUND</p>
    <h1>This care journey has moved.</h1>
    <small>The page may have a new address. Return home or browse verified care providers.</small>
    <div><a className="state-primary" href="/">Return home</a><a href="/providers">Find care</a></div>
  </main>;
}
