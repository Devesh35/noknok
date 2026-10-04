"use client";

import { Button, buttonClass } from "@/components/Button";
import { Sheet } from "@/components/Sheet";
import { toast } from "@/lib/toast";

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  title: string; // activity title
  url: string; // full link, including ?ref= / ?invite=
  shortUrl: string;
  // The link carries an invite token that unlocks a private activity.
  isInvite: boolean;
}

async function copy(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    toast("Couldn't copy. Long-press the link to copy it.");
  }
}

export function ShareSheet({ open, onClose, title, url, shortUrl, isInvite }: ShareSheetProps) {
  const text = `Join me at ${title} on NokNok`;
  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text, url });
      onClose();
    } catch {
      // Share sheet dismissed: nothing to do.
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Invite people">
      <p className="text-sm text-soft">
        {isInvite
          ? "This is your invite link. Anyone who opens it can see and join this private plan."
          : "Anyone you send this to will see that you invited them."}
      </p>
      <p className="mt-3 truncate rounded-2xl border border-line bg-surface/70 px-3 py-2.5 font-mono text-sm text-body">
        {url}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {canNativeShare && <Button onClick={nativeShare}>Share…</Button>}
        <Button
          variant={canNativeShare ? "secondary" : "primary"}
          onClick={() => copy(url, "Link copied")}
        >
          Copy link
        </Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass("secondary")}
        >
          Send on WhatsApp
        </a>
        <Button variant="secondary" onClick={() => copy(shortUrl, "Short link copied")}>
          Copy short link
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted">
        Instagram stories can&apos;t carry links: copy the link and add it as a link sticker.
        {isInvite ? " The short link does not include the invite." : ""}
      </p>
    </Sheet>
  );
}
