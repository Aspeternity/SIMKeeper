export type BoundServiceRecord = {
  id: number;
  simId: number;
  serviceName: string;
  category: string;
  bindingType: string;
  accountIdentifier: string | null;
  importance: string;
  status: string;
  website: string | null;
  boundAt: string | null;
  verifiedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  simLabel: string;
  phoneNumber: string | null;
  carrierName: string;
  country: string;
  countryCode: string;
};

export type BoundServiceSimSummary = {
  id: number;
  label: string;
  phoneNumber: string | null;
  carrierName: string;
  country: string;
  countryCode: string;
};
