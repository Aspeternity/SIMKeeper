export type DeletedSimBindingSummary = {
  serviceName: string;
  action: "migrate" | "delete";
  target?: {
    label: string;
    phoneNumber: string | null;
    carrierName: string;
  } | null;
};

export type DeletedSimRecord = {
  id: number;
  originalSimId: number;
  label: string;
  phoneNumber: string | null;
  country: string;
  countryCode: string;
  carrierName: string;
  simType: string;
  iccid: string | null;
  balance: number | null;
  currencyCode: string | null;
  activationDate: string | null;
  validUntil: string | null;
  tariffPlanName: string | null;
  identityStatus: string;
  identityName: string | null;
  identityDocumentType: string | null;
  identityCountry: string | null;
  identityCountryCode: string | null;
  notes: string | null;
  bindingSummary: DeletedSimBindingSummary[];
  deletedAt: string;
};
