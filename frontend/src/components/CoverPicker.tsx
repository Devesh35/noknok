"use client";

import { useRef, useState } from "react";
import { uploadImage } from "@/api";
import { UploadIcon } from "@/components/icons";
import { COVER_PRESETS } from "@/lib/activity";
import { toast } from "@/lib/toast";

const TILE = "overflow-hidden rounded-2xl border-2 transition duration-200 active:scale-95";
const SELECTED = "border-brand-600 shadow-lg shadow-brand-600/30";
const IDLE = "border-transparent opacity-70 hover:opacity-100";

// Stock covers plus "upload your own". An uploaded photo shows as a tile too,
// so switching back to a preset and forth keeps it.
export function CoverPicker({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploaded, setUploaded] = useState<string | null>(
    COVER_PRESETS.some((c) => c.url === value) ? null : value || null,
  );
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    const result = await uploadImage(file);
    setBusy(false);
    if (!result.ok) {
      toast(result.message);
      return;
    }
    setUploaded(result.data.url);
    onChange(result.data.url);
  };

  return (
    <div className="grid grid-cols-4 gap-2">
      {uploaded && (
        <button
          type="button"
          aria-label="Your photo"
          aria-pressed={value === uploaded}
          onClick={() => onChange(uploaded)}
          className={`${TILE} ${value === uploaded ? SELECTED : IDLE}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={uploaded} alt="" className="h-16 w-full object-cover md:h-20" />
        </button>
      )}
      {COVER_PRESETS.map((cover) => (
        <button
          key={cover.url}
          type="button"
          aria-label={cover.label}
          aria-pressed={value === cover.url}
          onClick={() => onChange(cover.url)}
          className={`${TILE} ${value === cover.url ? SELECTED : IDLE}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover.url} alt="" className="h-16 w-full object-cover md:h-20" />
        </button>
      ))}
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className={`${TILE} flex h-16 flex-col items-center justify-center gap-1 border-dashed border-line bg-surface/50 text-xs font-semibold text-soft hover:border-brand-600 hover:text-brand-700 disabled:opacity-60 md:h-20`}
      >
        <UploadIcon className="h-5 w-5" />
        {busy ? "Uploading…" : "Upload"}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}
