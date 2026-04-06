import type { Locale } from "date-fns";
import { enUS, fr } from "date-fns/locale";

export const getDateFnsLocale = (lng: string): Locale => {
  if (lng === "fr") return fr;
  return enUS;
};
