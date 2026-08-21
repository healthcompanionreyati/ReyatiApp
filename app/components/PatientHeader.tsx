"use client";

type PatientHeaderProps = {
  ar: boolean;
  displayName: string;
  onLocaleChange: () => void;
  active?: "home" | "care" | "appointments" | "health" | "messages" | "account";
};

const navigation = [
  { key: "home", href: "/", en: "Home", ar: "الرئيسية" },
  { key: "care", href: "/providers", en: "Find care", ar: "ابحث عن رعاية" },
  { key: "appointments", href: "/appointments", en: "Appointments", ar: "المواعيد" },
  { key: "health", href: "/wallet", en: "Health", ar: "صحتي" },
  { key: "messages", href: "/notifications", en: "Updates", ar: "التحديثات" },
] as const;

function initials(value: string) {
  return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "QV";
}

export default function PatientHeader({ ar, displayName, onLocaleChange, active = "home" }: PatientHeaderProps) {
  return <header className="app-header patient-app-header">
    <a className="app-brand" href="/" aria-label={ar ? "كيفايا الرئيسية" : "Qivaya home"}>
      <img src="/brand/qivaya-logo-primary.png" alt="Qivaya" />
    </a>
    <nav className="app-primary-nav" aria-label={ar ? "التنقل الرئيسي" : "Primary navigation"}>
      {navigation.map((item) => <a key={item.key} className={active === item.key ? "active" : ""} aria-current={active === item.key ? "page" : undefined} href={item.href}>{ar ? item.ar : item.en}</a>)}
    </nav>
    <div className="app-header-actions">
      <button className="app-locale" type="button" onClick={onLocaleChange}>{ar ? "English" : "العربية"}</button>
      <a className="app-account" href="/auth" aria-label={ar ? "فتح الحساب الآمن" : "Open secure account"}>
        <span className="app-avatar" aria-hidden="true">{initials(displayName)}</span>
        <span>{ar ? "الحساب" : "Account"}</span>
      </a>
    </div>
  </header>;
}
