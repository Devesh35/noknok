"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  DEMO_OTP,
  DEMO_PHONE,
  logIn,
  registerUser,
  useDb,
  userByPhone,
  verifyOtp,
} from "@/api";
import { Logo } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { Checkbox, Input } from "@/components/Field";
import { SelectMenu, type SelectOption } from "@/components/SelectMenu";
import { toast } from "@/lib/toast";
import { CITIES, type City } from "@/lib/types";

type Step = "phone" | "otp" | "details";

const CITY_OPTIONS: SelectOption<City>[] = CITIES.map((city) => ({ value: city, label: city }));
const SEND_MS = 600; // pretend to send an SMS

const HEADINGS: Record<Step, { title: string; body: string }> = {
  phone: {
    title: "What's your number?",
    body: "We'll text you a code to log in or create your account.",
  },
  otp: { title: "Enter the code", body: "We sent a 6-digit code to" },
  details: { title: "Almost there", body: "Tell us who you are so hosts know who's coming." },
};

// Only allow in-app paths as the post-login destination.
function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : null;
}

// Phone → OTP → (new users only) name and city. One flow for login and sign-up.
export function AuthFlow() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const db = useDb();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [city, setCityValue] = useState<City | "">("");
  const [terms, setTerms] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [busy, setBusy] = useState(false);

  const done = () => router.replace(next ?? "/u/me");

  const errors = {
    phone: /^\d{10}$/.test(phone) ? "" : "Enter a 10-digit phone number",
    name: name.trim() ? "" : "Enter your full name",
    city: city ? "" : "Pick your city",
    terms: terms ? "" : "Confirm you're 18+ and accept the terms",
  };
  const show = (error: string) => (submitted && error ? error : undefined);

  const sendCode = async () => {
    setBusy(true);
    await new Promise((resolve) => setTimeout(resolve, SEND_MS));
    setBusy(false);
    setOtp("");
    setOtpError("");
    setSubmitted(false);
    setStep("otp");
    toast(`Demo: your code is ${DEMO_OTP}`);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!db) return;
    setSubmitted(true);

    if (step === "phone") {
      if (!errors.phone) sendCode();
    } else if (step === "otp") {
      if (!verifyOtp(otp)) {
        setOtpError("That code isn't right. Check the text and try again.");
        return;
      }
      const existing = userByPhone(db, phone);
      if (existing) {
        logIn(existing.id);
        done();
      } else {
        setSubmitted(false);
        setStep("details");
      }
    } else if (!errors.name && !errors.city && !errors.terms) {
      registerUser({ name, phone, city: city as City });
      done();
    }
  };

  const heading = HEADINGS[step];

  return (
    <div className="stagger mx-auto w-full max-w-md px-4 py-8 md:my-12 md:rounded-[2rem] md:border md:border-line md:bg-surface/60 md:p-8 md:shadow-xl md:shadow-brand-600/10 md:backdrop-blur-xl">
      <Logo className="text-2xl md:hidden" />
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink md:mt-0">
        {heading.title}
      </h1>
      <p className="mt-1 text-sm text-soft">
        {heading.body}
        {step === "otp" && <span className="font-semibold text-ink"> +91 {phone}</span>}
      </p>

      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        {step === "phone" && (
          <Input
            label="Phone"
            prefix="+91"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            autoFocus
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, ""))}
            error={show(errors.phone)}
          />
        )}

        {step === "otp" && (
          <Input
            label="6-digit code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            value={otp}
            onChange={(event) => {
              setOtp(event.target.value.replace(/\D/g, ""));
              setOtpError("");
            }}
            error={otpError || undefined}
            className="text-center font-mono text-2xl tracking-[0.5em]"
          />
        )}

        {step === "details" && (
          <>
            <Input
              label="Full name"
              autoComplete="name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={show(errors.name)}
            />
            <SelectMenu
              variant="field"
              label="City"
              placeholder="Select your city"
              value={city}
              onChange={setCityValue}
              options={CITY_OPTIONS}
              error={show(errors.city)}
            />
            <Checkbox
              label="I'm 18+ and accept the terms"
              checked={terms}
              onChange={(event) => setTerms(event.target.checked)}
              error={show(errors.terms)}
            />
          </>
        )}

        <Button type="submit" loading={busy} disabled={!db} className="w-full">
          {step === "phone" ? "Send code" : step === "otp" ? "Verify" : "Create account"}
        </Button>
      </form>

      {step === "phone" && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-ink/10" />
            or
            <span className="h-px flex-1 bg-ink/10" />
          </div>
          <Button variant="secondary" disabled className="w-full">
            Continue with Google (coming soon)
          </Button>
          <div className="mt-6 rounded-2xl bg-brand-600/8 p-3 text-center text-xs text-soft">
            <p>
              Prototype: no SMS is sent, the code is always{" "}
              <span className="font-mono font-semibold">{DEMO_OTP}</span>. A new number creates a
              fresh account.
            </p>
            <button
              type="button"
              onClick={() => setPhone(DEMO_PHONE)}
              className="min-h-11 font-semibold text-brand-700 hover:underline"
            >
              Use the demo account (Aarav, with friends and plans)
            </button>
          </div>
        </>
      )}

      {step === "otp" && (
        <p className="mt-4 flex justify-center gap-6 text-sm font-semibold">
          <button
            type="button"
            onClick={sendCode}
            className="min-h-11 text-brand-700 hover:underline"
          >
            Resend code
          </button>
          <button
            type="button"
            onClick={() => setStep("phone")}
            className="min-h-11 text-brand-700 hover:underline"
          >
            Change number
          </button>
        </p>
      )}
    </div>
  );
}
