"use client";

import { useState } from "react";
import { removeAttendee } from "@/api";
import { Button } from "@/components/Button";
import { Sheet } from "@/components/Sheet";
import { toast } from "@/lib/toast";
import type { User } from "@/lib/types";

// Host takes someone off an upcoming plan. They're refunded in full and told.
export function RemoveAttendee({ activityId, user, paid }: { activityId: string; user: User; paid: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const first = user.name.split(" ")[0];

  const remove = async () => {
    setBusy(true);
    const result = await removeAttendee(activityId, user.id);
    setBusy(false);
    if (!result.ok) {
      toast(result.message);
      return;
    }
    setOpen(false);
    toast(`${first} was removed`);
  };

  return (
    <>
      <Button variant="ghost" className="shrink-0" onClick={() => setOpen(true)}>
        Remove
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Remove ${first}?`}>
        <p className="text-sm text-soft">
          {first} loses their spot and is told{paid ? ", and gets a full refund" : ""}. The next person on
          the waitlist moves up.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={remove} loading={busy}>
            Remove {first}
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Keep them
          </Button>
        </div>
      </Sheet>
    </>
  );
}
