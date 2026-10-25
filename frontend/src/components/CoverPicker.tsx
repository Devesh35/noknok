"use client";

import { useRef, useState } from "react";
import { uploadImage } from "@/api";
import { UploadIcon } from "@/components/icons";
import { COVER_PRESETS, coverFor, coverOptions } from "@/lib/activity";
import { toast } from "@/lib/toast";
import type { Category } from "@/lib/types";

const TILE =
  "overflow-hidden rounded-2xl border-2 transition duration-200 active:scale-95";
const SELECTED = "border-brand-600 shadow-lg shadow-brand-600/30";
const IDLE = "border-transparent opacity-70 hover:opacity-100";

// Stock covers for the chosen type, the generic ones, and "upload your own".
// An empty value means the stock cover for the sub-activity, which is what a
// plan gets when the host never touches this. An uploaded photo shows as a
// tile too, so switching back to a preset and forth keeps it.
export function CoverPicker({
  value,
  category,
  subcategory,
  onChange,
}: {
  value: string;
  category: Category;
  subcategory?: string;
  onChange: (url: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const auto = coverFor(category, subcategory);
  const stock = coverOptions(category, subcategory);
  const known = new Set([
    ...stock.map((c) => c.url),
    ...COVER_PRESETS.map((c) => c.url),
  ]);
  const [uploaded, setUploaded] = useState<string | null>(
    value && !known.has(value) ? value : null,
  );
  const [busy, setBusy] = useState(false);
  const current = value || auto;

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

  const tile = (url: string, label: string, pickUrl: string) => (
    <button
      key={url}
      type="button"
      aria-label={label}
      aria-pressed={current === url}
      onClick={() => onChange(pickUrl)}
      className={`${TILE} ${current === url ? SELECTED : IDLE}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        loading="lazy"
        className="h-16 w-full object-cover md:h-20"
      />
    </button>
  );

  return (
    <div className="grid grid-cols-4 gap-2">
      {uploaded && tile(uploaded, "Your photo", uploaded)}
      {/* The sub-activity's own photo is the default; picking it stores "" so
          a later change of type follows along. */}
      {stock.map((cover) =>
        tile(cover.url, cover.label, cover.url === auto ? "" : cover.url),
      )}
      {COVER_PRESETS.map((cover) => tile(cover.url, cover.label, cover.url))}
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
