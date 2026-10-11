"use client";

import { useState } from "react";
import { report, type ErrorCode } from "@/api";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { Sheet } from "@/components/Sheet";
import { toast } from "@/lib/toast";

const TRANSIENT = new Set<ErrorCode>(["NETWORK", "SERVER", "RATE_LIMITED"]);

const REASONS = {
  activity: ["Misleading or fake", "Unsafe", "Spam or selling something", "Inappropriate content"],
  user: ["Harassment", "Didn't show up", "Fake profile", "Made me feel unsafe"],
};

interface ReportSheetProps {
  open: boolean;
  onClose: () => void;
  targetType: "activity" | "user";
  targetId: string;
  // Name of what is being reported, for the heading.
  name: string;
}

export function ReportSheet({ open, onClose, targetType, targetId, name }: ReportSheetProps) {
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    setSending(true);
    const result = await report(targetType, targetId, reason);
    setSending(false);
    // Only a transient failure is worth a retry; the sheet stays open for it.
    if (!result.ok && TRANSIENT.has(result.code)) {
      toast(result.message);
      return;
    }
    setReason("");
    onClose();
    toast("Thanks. We'll review your report.");
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Report ${name}`}>
      <p className="text-sm text-soft">
        What&apos;s wrong? Reports are private: {targetType === "user" ? "they" : "the host"}{" "}
        won&apos;t know it was you.
      </p>
      <div role="radiogroup" aria-label="Reason" className="mt-4 flex flex-wrap gap-2">
        {REASONS[targetType].map((option) => (
          <Chip key={option} selected={reason === option} onClick={() => setReason(option)}>
            {option}
          </Chip>
        ))}
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <Button disabled={!reason || sending} onClick={submit}>
          Send report
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Sheet>
  );
}
