"use client";

import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

export function CredentialInput({
  value,
  onChange,
  placeholder,
  disabled,
  plainText = false,
  revealed = false,
  onToggleReveal,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  plainText?: boolean;
  revealed?: boolean;
  onToggleReveal?: () => void;
}) {
  if (plainText) {
    return (
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type="email"
        autoComplete="username"
        placeholder={placeholder}
        disabled={disabled}
      />
    );
  }

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={revealed ? "text" : "password"}
        autoComplete="new-password"
        placeholder={placeholder}
        disabled={disabled}
        className="pr-10"
      />
      <button
        type="button"
        onClick={onToggleReveal}
        disabled={disabled || !value}
        className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-slate-400 transition hover:text-slate-700 disabled:cursor-default disabled:opacity-30"
        aria-label={revealed ? "隐藏凭据" : "显示凭据"}
        title={revealed ? "隐藏" : "显示"}
      >
        {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
