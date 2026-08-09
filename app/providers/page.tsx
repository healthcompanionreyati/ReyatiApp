"use client";

import { useEffect, useMemo, useState } from "react";

type Service = {
  id: string;
  facilityId: string | null;
  facilityName: string | null;
  area: string | null;
  mode: string;
  feeQar: number;
  slotDurationMinutes: number;
};

type Provider = {
  id: string;
  name: string;
  specialty: string;
  gender: string | null;
  languages: string[];
  bioEn: string | null;
  bioAr: string | null;
  yearsExperience: number | null;
  services: Service[];
};

type Slot = {
  serviceLocationId: string;
  providerId: string;
  facilityId: string | null;
  mode: "in_person" | "video";
  scheduledStart: string;
  scheduledEnd: string;
  label: string;
};

type BookingState = "idle" | "submitting" | "confirmed" | "error";

const colors = ["coral", "blue", "mint", "gold", "violet"];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function colorFor(id: string) {
  return colors[[...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % colors.length];
}

export default function ProviderDiscovery() {
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("All");
  const [gender, setGender] = useState("Any");
  const [sort, setSort] = useState("Recommended");
  const [selected, setSelected] = useState<Provider | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [bookingKey, setBookingKey] = useState("");
  const [booking, setBooking] = useState<BookingState>("idle");
  const [bookingMessage, setBookingMessage] = useState("");
  const ar = lang === "ar";

  useEffect(() => {
    const controller = new AbortController();
    async function loadCatalog() {
      try {
        setLoading(true);
        const response = await fetch("/api/providers", { signal: controller.signal });
        if (!response.ok) throw new Error("catalog unavailable");
        const data = await response.json() as { providers?: Provider[] };
        setProviders(Array.isArray(data.providers) ? data.providers : []);
        setCatalogError(false);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setCatalogError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadCatalog();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selected || !serviceId) return;
    const controller = new AbortController();
    async function loadAvailability() {
      try {
        setSlotsLoading(true);
        setAvailabilityError(false);
        setSlots([]);
        setSlot(null);
        setBooking("idle");
        const params = new URLSearchParams({ providerId: selected!.id, serviceLocationId: serviceId });
        const response = await fetch(`/api/providers?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("availability unavailable");
        const data = await response.json() as { slots?: Slot[] };
        setSlots(Array.isArray(data.slots) ? data.slots : []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSlots([]);
          setAvailabilityError(true);
          setBookingMessage(ar ? "تعذر تحميل المواعيد. حاول مرة أخرى." : "Availability could not be loaded. Please try again.");
        }
      } finally {
        if (!controller.signal.aborted) setSlotsLoading(false);
      }
    }
    loadAvailability();
    return () => controller.abort();
  }, [selected, serviceId, ar]);

  const filtered = useMemo(() => providers
    .filter((provider) => specialty === "All" || provider.specialty === specialty)
    .filter((provider) => gender === "Any" || provider.gender === gender)
    .filter((provider) => {
      const text = `${provider.name} ${provider.specialty} ${provider.services.map((service) => `${service.facilityName ?? ""} ${service.area ?? ""}`).join(" ")}`;
      return text.toLowerCase().includes(query.toLowerCase());
    })
    .sort((a, b) => {
      if (sort === "Price") return Math.min(...a.services.map((service) => service.feeQar)) - Math.min(...b.services.map((service) => service.feeQar));
      return a.name.localeCompare(b.name);
    }), [providers, specialty, gender, query, sort]);

  const activeService = selected?.services.find((service) => service.id === serviceId) ?? null;

  function openProvider(provider: Provider) {
    setSelected(provider);
    setServiceId(provider.services[0]?.id ?? "");
    setSlots([]);
    setSlot(null);
    setBooking("idle");
    setBookingMessage("");
  }

  function chooseSlot(nextSlot: Slot) {
    setSlot(nextSlot);
    setBookingKey(crypto.randomUUID());
    setBooking("idle");
    setBookingMessage("");
  }

  async function confirmBooking() {
    if (!selected || !slot || booking === "submitting") return;
    setBooking("submitting");
    setBookingMessage("");
    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": bookingKey || crypto.randomUUID(),
        },
        body: JSON.stringify({
          providerId: selected.id,
          serviceLocationId: slot.serviceLocationId,
          facilityId: slot.facilityId,
          scheduledStart: slot.scheduledStart,
          scheduledEnd: slot.scheduledEnd,
          mode: slot.mode,
        }),
      });
      const data = await response.json() as { error?: string; message?: string };
      if (response.status === 401) {
        window.location.assign("/signin-with-chatgpt?return_to=/providers");
        return;
      }
      if (!response.ok) throw new Error(data.message || data.error || "booking failed");
      setBooking("confirmed");
    } catch (error) {
      setBooking("error");
      setBookingMessage(error instanceof Error ? error.message : "booking failed");
    }
  }

  return <main className={`providers-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"}>
    <header className="providers-header">
      <a className="brand" href="/"><img src="/brand/reyati-logo.svg" alt="Reyati" /></a>
      <nav aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}>
        <a className="active" href="/providers">{ar ? "ابحث عن رعاية" : "Find care"}</a>
        <a href="/appointments">{ar ? "المواعيد" : "Appointments"}</a>
        <a href="/wallet">{ar ? "المحفظة الصحية" : "Health wallet"}</a>
      </nav>
      <div><button onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications" aria-label="Notifications">●</a><span>MA</span></div>
    </header>

    <section className="provider-search-hero">
      <div>
        <p>{ar ? "بحث موثوق وشفاف" : "TRUSTED, TRANSPARENT DISCOVERY"}</p>
        <h1>{ar ? "اعثر على الرعاية المناسبة لك" : "Find care that fits you"}</h1>
        <span>{ar ? "قارن مقدمي الرعاية الموثّقين والأسعار والتوفر الفعلي بثقة." : "Compare verified providers, transparent prices, and real availability with confidence."}</span>
        <label><i>⌕</i><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? "الطبيب أو التخصص أو المنشأة" : "Doctor, specialty, or facility"} aria-label={ar ? "البحث عن الرعاية" : "Search care"} /><b>⌖ {ar ? "الدوحة" : "Doha"}</b><button type="button">{ar ? "بحث" : "Search"}</button></label>
      </div>
    </section>

    <section className="providers-workspace">
      <div className="filter-row">
        <select value={specialty} onChange={(event) => setSpecialty(event.target.value)} aria-label={ar ? "التخصص" : "Specialty"}>
          <option value="All">{ar ? "كل التخصصات" : "All specialties"}</option>
          {[...new Set(providers.map((provider) => provider.specialty))].map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={gender} onChange={(event) => setGender(event.target.value)} aria-label={ar ? "الجنس" : "Gender"}>
          <option value="Any">{ar ? "أي جنس" : "Any gender"}</option><option value="Female">{ar ? "طبيبة" : "Female"}</option><option value="Male">{ar ? "طبيب" : "Male"}</option>
        </select>
        <button className="clear" onClick={() => { setSpecialty("All"); setGender("Any"); setQuery(""); }}>{ar ? "مسح الفلاتر" : "Clear filters"}</button>
      </div>
      <div className="results-head">
        <div><h2>{loading ? (ar ? "جارٍ تحميل مقدمي الرعاية" : "Loading verified providers") : `${filtered.length} ${ar ? "مقدمي رعاية موثّقين" : "verified providers"}`}</h2><p>{ar ? "يتم التحقق من الترخيص والانتماء قبل النشر." : "Licence and affiliation are checked before publication."}</p></div>
        <label>{ar ? "ترتيب" : "Sort"}<select value={sort} onChange={(event) => setSort(event.target.value)}><option>Recommended</option><option>Price</option></select></label>
      </div>

      <div className="provider-results">
        <section className="provider-list" aria-live="polite">
          {catalogError && <article className="catalog-state error"><span>!</span><div><h2>{ar ? "تعذر تحميل مقدمي الرعاية" : "We couldn’t load providers"}</h2><p>{ar ? "يرجى تحديث الصفحة بعد قليل." : "Please refresh the page in a moment."}</p></div></article>}
          {!loading && !catalogError && filtered.length === 0 && <article className="catalog-state"><span>✓</span><div><h2>{ar ? "لا يوجد مقدمو رعاية منشورون بعد" : "No providers are published yet"}</h2><p>{ar ? "ستظهر الملفات هنا بعد إكمال التحقق ونشر جدول المواعيد من المنشأة." : "Profiles will appear here after an organization completes verification and publishes real availability."}</p><a href="/provider/services">{ar ? "إعداد خدمات مقدم الرعاية" : "Set up provider services"} →</a></div></article>}
          {filtered.map((provider) => {
            const service = provider.services[0];
            return <article className="provider-result" key={provider.id}>
              <div className={`provider-photo ${colorFor(provider.id)}`}>{initials(provider.name)}<span>✓</span></div>
              <div className="provider-info"><p>✓ {ar ? "مقدم رعاية موثّق" : "Verified provider"}</p><button className="provider-name" onClick={() => openProvider(provider)}>{provider.name}</button><h3>{provider.specialty}</h3><span>⌖ {service.facilityName ?? (ar ? "زيارة فيديو" : "Video consultation")}{service.area ? ` · ${service.area}` : ""}</span><div className="provider-tags">{provider.languages.map((language) => <i key={language}>{language}</i>)}{service.mode === "in_person" && <i>♿ {ar ? "تحقق من إمكانية الوصول" : "Accessibility details"}</i>}</div></div>
              <aside><div><small>{ar ? "نوع الزيارة" : "Visit type"}</small><b>{service.mode === "video" ? (ar ? "فيديو" : "Video") : (ar ? "في العيادة" : "In person")}</b></div><div><strong>{service.feeQar} {ar ? "ر.ق" : "QAR"}</strong><small>{ar ? "السعر المنشور" : "published price"}</small></div><button onClick={() => openProvider(provider)}>{ar ? "عرض الملف والمواعيد" : "View profile & times"}</button></aside>
            </article>;
          })}
        </section>
        <aside className="trust-panel"><span>♙</span><h2>{ar ? "كيف نبني الثقة" : "How Reyati builds trust"}</h2><p>{ar ? "نعرض فقط الملفات المنشورة لمقدمي الرعاية والمنشآت النشطين بعد التحقق." : "Only published profiles belonging to active, verified providers and organizations appear here."}</p><ul><li><b>{ar ? "ترخيص موثّق" : "Verified licence"}</b><small>{ar ? "قبل نشر الملف" : "Before profile publication"}</small></li><li><b>{ar ? "سعر واضح" : "Clear price"}</b><small>{ar ? "من إعداد المنشأة" : "Published by the organization"}</small></li><li><b>{ar ? "توفر فعلي" : "Real availability"}</b><small>{ar ? "مع منع الحجز المزدوج" : "Protected against double booking"}</small></li></ul></aside>
      </div>
    </section>

    {selected && <div className="profile-layer" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><aside className="provider-profile" aria-label={ar ? "ملف مقدم الرعاية" : "Provider profile"}>
      <button className="drawer-close" onClick={() => setSelected(null)} aria-label={ar ? "إغلاق" : "Close"}>×</button>
      {booking === "confirmed" ? <div className="profile-confirmed"><span>✓</span><p>{ar ? "تم الحجز" : "BOOKING CONFIRMED"}</p><h2>{ar ? "تم تأكيد موعدك" : "Your appointment is confirmed"}</h2><b>{slot?.label} · {selected.name}</b><small>{ar ? "تم حفظ الموعد بأمان في حسابك." : "The appointment is securely saved to your account."}</small><a href="/appointments">{ar ? "عرض مواعيدي" : "View my appointments"}</a></div> : <>
        <div className="profile-head"><div className={`provider-photo large ${colorFor(selected.id)}`}>{initials(selected.name)}<span>✓</span></div><div><p>✓ {ar ? "مقدم رعاية موثّق" : "Verified provider"}</p><h2>{selected.name}</h2><span>{selected.specialty}</span></div></div>
        <div className="verification-strip"><span>♙</span><p><b>{ar ? "تم التحقق من الترخيص والانتماء" : "Licence and affiliation verified"}</b>{ar ? "تم نشر الملف من منشأة نشطة" : "Published by an active organization"}</p></div>
        <section className="profile-about"><h3>{ar ? "عن مقدم الرعاية" : "About"}</h3><p>{ar ? selected.bioAr || selected.bioEn || "لم تُضف نبذة بعد." : selected.bioEn || "The provider has not added a public biography yet."}</p><div><article><b>{selected.yearsExperience ?? "—"}</b><small>{ar ? "سنوات خبرة" : "Years experience"}</small></article><article><b>{selected.languages.join(" · ") || "—"}</b><small>{ar ? "اللغات" : "Languages"}</small></article><article><b>✓</b><small>{ar ? "هوية موثقة" : "Verified identity"}</small></article></div></section>
        <section className="profile-location"><h3>{ar ? "الخدمة والموقع" : "Service & location"}</h3><select className="service-location-select" value={serviceId} onChange={(event) => setServiceId(event.target.value)} aria-label={ar ? "اختر الخدمة" : "Choose service"}>{selected.services.map((service) => <option value={service.id} key={service.id}>{service.mode === "video" ? (ar ? "زيارة فيديو" : "Video consultation") : service.facilityName} · {service.feeQar} QAR</option>)}</select>{activeService && <div><span>⌖</span><p><b>{activeService.facilityName ?? (ar ? "زيارة فيديو" : "Video consultation")}</b><small>{activeService.area ? `${activeService.area}, Doha · ` : ""}{activeService.slotDurationMinutes} {ar ? "دقيقة" : "minutes"}</small></p><strong>{activeService.feeQar} {ar ? "ر.ق" : "QAR"}<small>{ar ? "السعر المنشور" : "published price"}</small></strong></div>}</section>
        <section className="profile-slots"><div><h3>{ar ? "اختر موعداً" : "Choose a time"}</h3><span>{ar ? "الأيام الـ ١٤ القادمة" : "Next 14 days"}</span></div><div>{slotsLoading ? <p className="slot-state">{ar ? "جارٍ تحميل المواعيد…" : "Loading availability…"}</p> : availabilityError ? <p className="slot-state error">{ar ? "تعذر تحميل المواعيد. حاول مرة أخرى." : "Availability could not be loaded. Please try again."}</p> : slots.length ? slots.map((item) => <button className={slot?.scheduledStart === item.scheduledStart ? "active" : ""} key={`${item.serviceLocationId}-${item.scheduledStart}`} onClick={() => chooseSlot(item)}>{item.label}</button>) : <p className="slot-state">{ar ? "لا توجد مواعيد متاحة حالياً." : "No bookable times are currently available."}</p>}</div></section>
        {booking === "error" && <p className="booking-error" role="alert">{bookingMessage === "The requested time is no longer available" ? (ar ? "هذا الموعد لم يعد متاحاً. اختر موعداً آخر." : "That time was just booked. Please choose another slot.") : (ar ? "تعذر تأكيد الحجز. يرجى المحاولة مرة أخرى." : "We couldn’t confirm the booking. Please try again.")}</p>}
        <div className="profile-book"><div><small>{ar ? "الإجمالي" : "Total"}</small><b>{activeService?.feeQar ?? "—"} {ar ? "ر.ق" : "QAR"}</b></div><button disabled={!slot || booking === "submitting"} onClick={confirmBooking}>{booking === "submitting" ? (ar ? "جارٍ التأكيد…" : "Confirming…") : slot ? (ar ? "تأكيد الموعد" : "Confirm appointment") : (ar ? "اختر وقتاً للمتابعة" : "Select a time to continue")}</button></div>
      </>}
    </aside></div>}
  </main>;
}
