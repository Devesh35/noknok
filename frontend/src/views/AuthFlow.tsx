"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { registerUser, sendLoginCode, useSession, verifyLoginCode, type Result } from "@/api";
import { Logo } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { Checkbox, Input } from "@/components/Field";
import { SelectMenu, type SelectOption } from "@/components/SelectMenu";
import { USES_EMULATOR } from "@/lib/firebase/client";
import { toast } from "@/lib/toast";
import { CITIES, type City } from "@/lib/types";

type Step = "phone" | "otp" | "details";

const CITY_OPTIONS: SelectOption<City>[] = CITIES.map((city) => ({ value: city, label: city }));
// The invisible reCAPTCHA attaches here; it stays mounted across steps.
const RECAPTCHA_ID = "recaptcha-container";

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

// What to say under the field for a failed call; null means toast it instead.
function inlineMessage(result: Extract<Result<unknown>, { ok: false }>): string | null {
  switch (result.code) {
    case "OTP_INVALID":
      return "That code isn't right. Check the text and try again.";
    case "OTP_EXPIRED":
      return "That code has expired. Resend to get a new one.";
    case "RATE_LIMITED":
      return "Too many attempts. Wait a minute and try again.";
    case "INVALID":
    case "FORBIDDEN":
      return result.message;
    default:
      return null;
  }
}

// Phone → OTP → (new users only) name and city. One flow for login and sign-up.
export function AuthFlow() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { data: session } = useSession();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [signupToken, setSignupToken] = useState("");
  const [name, setName] = useState("");
  const [city, setCityValue] = useState<City | "">("");
  const [terms, setTerms] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [busy, setBusy] = useState(false);

  const done = () => router.replace(next ?? "/u/me");

  const errors = {
    phone: /^\d{10}$/.test(phone) ? "" : "Enter a 10-digit phone number",
    name: name.trim() ? "" : "Enter your full name",
    city: city ? "" : "Pick your city",
    terms: terms ? "" : "Confirm you're 18+ and accept the terms",
  };
  const show = (error: string) => (submitted && error ? error : undefined);

  // Shows a coded failure under the field, or toasts a transient one.
  const fail = (result: Extract<Result<unknown>, { ok: false }>) => {
    const message = inlineMessage(result);
    if (message) setFieldError(message);
    else toast(result.message);
  };

  const sendCode = async () => {
    if (busy) return;
    setBusy(true);
    const result = await sendLoginCode(phone, RECAPTCHA_ID);
    setBusy(false);
    if (!result.ok) {
      fail(result);
      return;
    }
    setOtp("");
    setFieldError("");
    setSubmitted(false);
    setStep("otp");
    // The Firebase emulator keeps the code instead of texting it.
    if (result.data.devCode) toast(`Dev mode: your code is ${result.data.devCode}`);
  };

  const verify = async () => {
    setBusy(true);
    const result = await verifyLoginCode(otp);
    setBusy(false);
    if (!result.ok) {
      fail(result);
      return;
    }
    if (result.data.registered) {
      done();
      return;
    }
    setSignupToken(result.data.signupToken);
    setSubmitted(false);
    setFieldError("");
    setStep("details");
  };

  const register = async () => {
    setBusy(true);
    const result = await registerUser({ signupToken, name, city: city as City });
    setBusy(false);
    if (!result.ok) {
      // A stale sign-up token means the code step has to be redone.
      if (result.code === "OTP_EXPIRED" || result.code === "FORBIDDEN") {
        setStep("phone");
        setOtp("");
        setFieldError("Your session timed out. Send a new code to continue.");
        return;
      }
      fail(result);
      return;
    }
    done();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (session === undefined || busy) return;
    setSubmitted(true);
    setFieldError("");

    if (step === "phone") {
      if (!errors.phone) sendCode();
    } else if (step === "otp") {
      if (otp.length === 6) verify();
      else setFieldError("Enter the 6-digit code from the text.");
    } else if (!errors.name && !errors.city && !errors.terms) {
      register();
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
            onChange={(event) => {
              setPhone(event.target.value.replace(/\D/g, ""));
              setFieldError("");
            }}
            error={show(errors.phone) ?? (fieldError || undefined)}
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
              setFieldError("");
            }}
            error={fieldError || undefined}
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
              error={show(errors.name) ?? (fieldError || undefined)}
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

        <Button type="submit" loading={busy} disabled={session === undefined} className="w-full">
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
          {USES_EMULATOR && (
            <p className="mt-6 rounded-2xl bg-brand-600/8 p-3 text-center text-xs text-soft">
              Development: no SMS is sent. The Firebase emulator keeps the code and it shows up
              here as a notice. A new number creates a fresh account.
            </p>
          )}
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
            onClick={() => {
              setFieldError("");
              setStep("phone");
            }}
            className="min-h-11 text-brand-700 hover:underline"
          >
            Change number
          </button>
        </p>
      )}
      <div id={RECAPTCHA_ID} />
    </div>
  );
}
