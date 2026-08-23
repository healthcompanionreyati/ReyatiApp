import { UserProfile } from "@clerk/nextjs";
import Link from "next/link";
import styles from "./identity.module.css";

export const metadata = { title: "Password and MFA" };

export default function AccountIdentityPage() {
  return <main className={styles.shell} id="main-content">
    <header className={styles.top}>
      <Link href="/"><img src="/brand/qivaya-logo-primary.png" alt="Qivaya" /></Link>
      <nav><Link href="/account/security">Security sessions</Link><Link href="/account/profile">Account profile</Link></nav>
    </header>
    <section className={styles.hero}>
      <span>SECURE IDENTITY</span>
      <h1>Password and multi-factor authentication</h1>
      <p>Manage the sign-in methods protecting your Qivaya account. Sensitive credentials are handled by Clerk and are never stored or displayed by Qivaya.</p>
    </section>
    <section className={styles.profile}>
      <UserProfile
        path="/account/identity"
        routing="path"
        appearance={{ variables: { colorPrimary: "#087f96", borderRadius: "0.85rem" } }}
      />
    </section>
  </main>;
}
