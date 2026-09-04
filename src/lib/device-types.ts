export type DeviceType = "phone" | "tablet" | "esim_adapter" | "router" | "storage" | "other";

export type DeviceRecord = {
  id: number;
  name: string;
  type: DeviceType;
  brand: string | null;
  model: string | null;
  notes: string | null;
  simCount: number;
  createdAt: string;
  updatedAt: string;
};

export const DEVICE_TYPES: Array<{ value: DeviceType; label: string }> = [
  { value: "phone", label: "手机" },
  { value: "tablet", label: "平板" },
  { value: "esim_adapter", label: "eSIM 适配器" },
  { value: "router", label: "路由器 / 随身 Wi-Fi" },
  { value: "storage", label: "SIM 卡收纳" },
  { value: "other", label: "其他" },
];

export function getDeviceTypeLabel(value: string | null | undefined) {
  return DEVICE_TYPES.find((item) => item.value === value)?.label ?? "其他";
}
