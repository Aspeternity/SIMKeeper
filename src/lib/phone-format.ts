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
    const nationalNumber = parsed.nationalNumber;

    return {
      callingCode,
      nationalNumber,
      nationalDisplay: nationalNumber,
      internationalDisplay: `${callingCode} ${nationalNumber}`,
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
