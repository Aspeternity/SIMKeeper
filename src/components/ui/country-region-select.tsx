"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { COUNTRY_REGIONS, getCountryRegion } from "@/lib/countries";

type CountryRegionSelectProps = {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
};

export function CountryRegionSelect({ value, onChange, disabled = false }: CountryRegionSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = getCountryRegion(value);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return COUNTRY_REGIONS;

    return COUNTRY_REGIONS.filter((region) =>
      region.name.toLowerCase().includes(keyword) || region.code.toLowerCase().includes(keyword),
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function select(code: string) {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          setQuery("");
        }}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm outline-none transition hover:border-slate-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      >
        <span className={selected ? "truncate text-slate-700" : "truncate text-slate-400"}>
          {selected ? `${selected.name} (${selected.code})` : "请选择国家 / 地区"}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[70] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索国家 / 地区或代码"
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-9 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-100"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="清空搜索"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          <div role="listbox" className="max-h-64 overflow-y-auto p-1.5">
            {filtered.length ? (
              filtered.map((region) => {
                const active = region.code === value;
                return (
                  <button
                    key={region.code}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => select(region.code)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                      active ? "bg-slate-50 font-medium text-slate-950" : "text-slate-700"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{region.name}</span>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">{region.code}</span>
                    <Check className={`h-4 w-4 shrink-0 ${active ? "text-slate-950" : "invisible"}`} />
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-8 text-center text-sm text-slate-400">没有匹配的国家 / 地区</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
