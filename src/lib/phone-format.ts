import { parsePhoneNumberFromString } from "libphonenumber-js";

export type PhoneDisplayParts = {
  callingCode: string;
  nationalNumber: string;
  nationalDisplay: string;
  internationalDisplay: string;
};

export function getPhoneDisplayParts(value: string | null | undefined): PhoneDisplayParts | null {
  const raw = value?.trim();
  if (!raw) return null;

  try {
    const parsed = parsePhoneNumberFromString(raw);
    if (!parsed) return null;

    const callingCode = `+${parsed.countryCallingCode}`;
    const international = parsed.formatInternational();
    const nationalDisplay = international.startsWith(callingCode)
      ? international.slice(callingCode.length).trim()
      : parsed.nationalNumber;

    return {
      callingCode,
      nationalNumber: parsed.nationalNumber,
      nationalDisplay: nationalDisplay || parsed.nationalNumber,
      internationalDisplay: `${callingCode} ${nationalDisplay || parsed.nationalNumber}`.trim(),
    };
  } catch {
    return null;
  }
}

export function formatPhoneNumber(value: string | null | undefined, fallback = "未填写号码") {
  const raw = value?.trim();
  if (!raw) return fallback;
  return getPhoneDisplayParts(raw)?.internationalDisplay ?? raw;
}
