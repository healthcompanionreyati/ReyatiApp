"use client";
import { useReyatiLocale as useLocaleTuple } from "@/app/components/useReyatiLocale";
export function useReyatiLocale() { const [lang, setLang] = useLocaleTuple(); return { lang, setLang }; }
