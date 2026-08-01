"use client";

import { useMemo, useState } from "react";

type Doctor = {
  id: number; name: string; nameAr: string; specialty: string; specialtyAr: string;
  hospital: string; hospitalAr: string; initials: string; color: string; rating: number;
  reviews: number; fee: number; next: string; nextAr: string; language: string;
};

const doctors: Doctor[] = [
  { id: 1, name: "Dr. Laila Al-Kuwari", nameAr: "د. ليلى الكواري", specialty: "Family Medicine", specialtyAr: "طب الأسرة", hospital: "Al Noor Medical Center", hospitalAr: "مركز النور الطبي", initials: "LK", color: "coral", rating: 4.9, reviews: 128, fee: 250, next: "Today, 4:30 PM", nextAr: "اليوم، ٤:٣٠ م", language: "Arabic, English" },
  { id: 2, name: "Dr. Omar Rahman", nameAr: "د. عمر رحمن", specialty: "Internal Medicine", specialtyAr: "الطب الباطني", hospital: "West Bay Clinic", hospitalAr: "عيادة الخليج الغربي", initials: "OR", color: "blue", rating: 4.8, reviews: 94, fee: 300, next: "Tomorrow, 9:00 AM", nextAr: "غداً، ٩:٠٠ ص", language: "Arabic, English, Urdu" },
  { id: 3, name: "Dr. Sara El-Masri", nameAr: "د. سارة المصري", specialty: "Dermatology", specialtyAr: "الأمراض الجلدية", hospital: "Pearl Health Clinic", hospitalAr: "عيادة اللؤلؤة الصحية", initials: "SE", color: "mint", rating: 4.9, reviews: 211, fee: 350, next: "Wed, 11:30 AM", nextAr: "الأربعاء، ١١:٣٠ ص", language: "Arabic, English, French" },
];

const copy = {
  en: {
    nav: ["Find care", "Appointments", "Health wallet"], hello: "Good morning, Mariam",
    subtitle: "How can we help you feel better today?", search: "Search by doctor, specialty, or symptom",
    location: "Doha", button: "Find care", emergency: "For a life-threatening emergency, call 999.",
    categories: "Care for every need", categoriesSub: "Choose a specialty to get started",
    cat: ["Family medicine", "Pediatrics", "Dermatology", "Dentistry", "Mental health", "See all"],
    recommended: "Available near you", see: "See all providers", verified: "Verified provider",
    next: "Next available", book: "Book appointment", appt: "Your next appointment",
    view: "View details", inperson: "In-person", at: "at", qar: "QAR", reviews: "reviews",
    booking: "Book your appointment", select: "Select a time", review: "Review & confirm",
    details: "Appointment details", patient: "Patient", reason: "Reason for visit (optional)",
    reasonPh: "Briefly tell the doctor what brings you in", fee: "Consultation fee", total: "Total",
    confirm: "Confirm appointment", back: "Back", success: "Your appointment is confirmed",
    successSub: "We sent the details and preparation instructions to your phone.", done: "Back to home",
    profile: "Mariam", date: "Sunday, 2 August", slots: ["9:00 AM", "10:30 AM", "1:00 PM", "4:30 PM"]
  },
  ar: {
    nav: ["ابحث عن رعاية", "المواعيد", "محفظتي الصحية"], hello: "صباح الخير، مريم",
    subtitle: "كيف يمكننا مساعدتك لتشعري بتحسن اليوم؟", search: "ابحثي باسم الطبيب أو التخصص أو الأعراض",
    location: "الدوحة", button: "ابحث عن رعاية", emergency: "في الحالات الطارئة المهددة للحياة، اتصلي على ٩٩٩.",
    categories: "رعاية لكل احتياج", categoriesSub: "اختاري التخصص للبدء",
    cat: ["طب الأسرة", "طب الأطفال", "الجلدية", "طب الأسنان", "الصحة النفسية", "عرض الكل"],
    recommended: "متاحون بالقرب منك", see: "عرض جميع الأطباء", verified: "مقدم رعاية موثّق",
    next: "أقرب موعد", book: "احجزي موعداً", appt: "موعدك القادم", view: "عرض التفاصيل",
    inperson: "في العيادة", at: "في", qar: "ر.ق", reviews: "تقييماً", booking: "احجزي موعدك",
    select: "اختاري الوقت", review: "راجعي وأكدي", details: "تفاصيل الموعد", patient: "المريض",
    reason: "سبب الزيارة (اختياري)", reasonPh: "أخبري الطبيب بإيجاز عن سبب الزيارة", fee: "رسوم الاستشارة",
    total: "الإجمالي", confirm: "تأكيد الموعد", back: "رجوع", success: "تم تأكيد موعدك",
    successSub: "أرسلنا التفاصيل وتعليمات الاستعداد إلى هاتفك.", done: "العودة للرئيسية",
    profile: "مريم", date: "الأحد، ٢ أغسطس", slots: ["٩:٠٠ ص", "١٠:٣٠ ص", "١:٠٠ م", "٤:٣٠ م"]
  }
};

export default function Home() {
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [step, setStep] = useState(0);
  const [slot, setSlot] = useState(3);
  const [search, setSearch] = useState("");
  const t = copy[lang]; const ar = lang === "ar";
  const filtered = useMemo(() => doctors.filter(d => `${d.name} ${d.nameAr} ${d.specialty} ${d.specialtyAr}`.toLowerCase().includes(search.toLowerCase())), [search]);
  const startBooking = (d: Doctor) => { setDoctor(d); setStep(1); document.body.classList.add("modal-open"); };
  const close = () => { setDoctor(null); setStep(0); document.body.classList.remove("modal-open"); };

  return <main dir={ar ? "rtl" : "ltr"} className={ar ? "arabic" : ""}>
    <header>
      <a className="brand" href="#" aria-label="Reyati home"><img src="/brand/reyati-logo.svg" alt="Reyati" /></a>
      <nav>{t.nav.map((n, i) => <a className={i === 0 ? "active" : ""} key={n} href={`#${i}`}>{n}</a>)}</nav>
      <div className="header-actions"><button className="lang" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><button className="bell" aria-label="Notifications">●</button><span className="avatar">MA</span><span className="profile">{t.profile}<small>⌄</small></span></div>
    </header>

    <section className="hero">
      <div className="hero-inner"><p className="eyebrow">{ar ? "رعاية متصلة بذكاء" : "Care, intelligently connected."}</p><h1>{t.hello}</h1><p className="lead">{t.subtitle}</p>
        <div className="search-box"><span className="search-icon">⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.search}/><span className="divider"/><button className="location">⌖ {t.location}⌄</button><button className="search-button">{t.button}</button></div>
        <p className="emergency"><span>＋</span>{t.emergency}</p>
      </div>
      <div className="hero-art" aria-hidden="true"><img src="/brand/care-conversation.png" alt=""/><span className="weave-path weave-cyan"/><span className="weave-path weave-white"/></div>
    </section>

    <section className="content">
      <div className="section-heading"><div><h2>{t.categories}</h2><p>{t.categoriesSub}</p></div></div>
      <div className="categories">{["♡", "♧", "✦", "◇", "☼", "＋"].map((icon, i) => <button key={i} onClick={() => i < 5 && setSearch(t.cat[i])}><span>{icon}</span>{t.cat[i]}</button>)}</div>
      <div className="section-heading providers-heading"><div><h2>{t.recommended}</h2><p>{ar ? "مواعيد حقيقية من مقدمين موثّقين" : "Real availability from verified providers"}</p></div><button>{t.see} →</button></div>
      <div className="doctor-grid">{filtered.map(d => <article className="doctor-card" key={d.id}>
        <div className="doctor-main"><div className={`doctor-avatar ${d.color}`}>{d.initials}<span>✓</span></div><div><p className="verified">✓ {t.verified}</p><h3>{ar ? d.nameAr : d.name}</h3><p className="specialty">{ar ? d.specialtyAr : d.specialty}</p><p className="hospital">⌖ {ar ? d.hospitalAr : d.hospital}</p><p className="rating"><b>★ {d.rating}</b> <span>({d.reviews} {t.reviews})</span></p></div></div>
        <div className="availability"><div><small>{t.next}</small><b>{ar ? d.nextAr : d.next}</b></div><div className="price"><b>{d.fee} {t.qar}</b><small>{ar ? "شامل الرسوم" : "incl. fees"}</small></div></div>
        <button className="book" onClick={() => startBooking(d)}>{t.book}</button>
      </article>)}</div>
      <section className="next-appt"><div className="date-block"><b>02</b><span>AUG</span></div><div><p>{t.appt}</p><h3>{ar ? doctors[0].nameAr : doctors[0].name}</h3><span>{t.date} · 4:30 PM · {t.inperson}</span></div><div className="appt-location"><span>⌖</span><div><b>{ar ? doctors[0].hospitalAr : doctors[0].hospital}</b><small>Al Waab Street, Doha</small></div></div><button>{t.view}</button></section>
    </section>

    <footer><img src="/brand/reyati-logo.svg" alt="Reyati"/><p>{ar ? "رعاية متصلة بذكاء" : "Care, intelligently connected."}</p><small>Prototype with synthetic data · Not for medical use</small></footer>

    {doctor && <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="booking-title"><div className="modal">
      <button className="modal-close" onClick={close} aria-label="Close">×</button>
      {step < 3 && <><p className="modal-kicker">{step === 1 ? `1 / 2 · ${t.select}` : `2 / 2 · ${t.review}`}</p><h2 id="booking-title">{t.booking}</h2><div className="selected-doctor"><div className={`doctor-avatar ${doctor.color}`}>{doctor.initials}<span>✓</span></div><div><h3>{ar ? doctor.nameAr : doctor.name}</h3><p>{ar ? doctor.specialtyAr : doctor.specialty} · {ar ? doctor.hospitalAr : doctor.hospital}</p></div></div></>}
      {step === 1 && <div className="step"><h3>{t.select}</h3><div className="day-picker"><button>‹</button><div><small>{ar ? "الأحد" : "SUN"}</small><b>02</b><span>{ar ? "أغسطس" : "AUG"}</span></div><div><small>{ar ? "الاثنين" : "MON"}</small><b>03</b><span>{ar ? "أغسطس" : "AUG"}</span></div><div><small>{ar ? "الثلاثاء" : "TUE"}</small><b>04</b><span>{ar ? "أغسطس" : "AUG"}</span></div><button>›</button></div><div className="slots">{t.slots.map((s, i) => <button className={slot === i ? "selected" : ""} onClick={() => setSlot(i)} key={s}>{s}</button>)}</div><button className="primary" onClick={() => setStep(2)}>{ar ? "متابعة" : "Continue"}</button></div>}
      {step === 2 && <div className="step review"><h3>{t.details}</h3><dl><div><dt>{t.patient}</dt><dd>{ar ? "مريم أحمد" : "Mariam Ahmed"}</dd></div><div><dt>{ar ? "التاريخ والوقت" : "Date & time"}</dt><dd>{t.date}, {t.slots[slot]}</dd></div><div><dt>{ar ? "نوع الزيارة" : "Visit type"}</dt><dd>{t.inperson}</dd></div></dl><label>{t.reason}<textarea placeholder={t.reasonPh}/></label><div className="total"><span>{t.fee}</span><b>{doctor.fee} {t.qar}</b></div><div className="total grand"><span>{t.total}</span><b>{doctor.fee} {t.qar}</b></div><p className="policy">🔒 {ar ? "لن يتم تحصيل أي مبلغ في هذا النموذج التجريبي." : "No payment is collected in this prototype."}</p><div className="button-row"><button className="secondary" onClick={() => setStep(1)}>{t.back}</button><button className="primary" onClick={() => setStep(3)}>{t.confirm}</button></div></div>}
      {step === 3 && <div className="success"><div className="success-mark">✓</div><h2>{t.success}</h2><p>{t.successSub}</p><div className="confirmation"><b>{t.date} · {t.slots[slot]}</b><span>{ar ? doctor.nameAr : doctor.name} · {ar ? doctor.hospitalAr : doctor.hospital}</span></div><button className="primary" onClick={close}>{t.done}</button></div>}
    </div></div>}
  </main>;
}
