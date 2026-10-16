import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import bg from "@/assets/crystal-bg.jpg";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { GoogleIcon } from "@/components/google-icon";
import { getBrandMetadata } from "@/lib/brand.functions";
import {
  AuthError,
  GOOGLE_SIGN_IN_URL,
  loginRequest,
  registerRequest,
  resendCodeRequest,
  verifyEmailRequest,
} from "@/lib/auth-client";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { next?: string; error?: string } => ({
    next: typeof search.next === "string" ? search.next : "/dashboard",
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => ({
    meta: [
      { title: "Sign in — CoralzOne" },
      { name: "description", content: "Sign in or create your CoralzOne account." },
      { property: "og:title", content: "Sign in — CoralzOne" },
      { property: "og:description", content: "Sign in or create your CoralzOne account." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${loaderData?.origin ?? ""}/auth` },
      ...(loaderData?.socialImage ? [
        { property: "og:image", content: loaderData.socialImage },
        { name: "twitter:image", content: loaderData.socialImage },
      ] : []),
      { property: "og:image:alt", content: "CoralzOne royal-blue crystal logo" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${loaderData?.origin ?? ""}/auth` }],
  }),
  component: Auth,
});

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: "Google sign-in isn't set up yet. Use email instead.",
  google_failed: "Google sign-in didn't go through. Try again.",
  google_email_unverified: "That Google account's email isn't verified.",
};

type Mode = "login" | "signup";
type Step = "form" | "verify";

function validateEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function passwordIssue(value: string) {
  if (value.length < 8) return "At least 8 characters";
  if (value.length > 72) return "At most 72 characters";
  if (!/[a-z]/.test(value)) return "Add a lowercase letter";
  if (!/[A-Z]/.test(value)) return "Add an uppercase letter";
  if (!/[0-9]/.test(value)) return "Add a number";
  return null;
}

function Auth() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<Step>("form");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(
    search.error ? GOOGLE_ERROR_MESSAGES[search.error] ?? "Something went wrong. Try again." : null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  function startResendCooldown() {
    setResendCooldown(30);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((seconds) => {
        if (seconds <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
  }

  function resetMessages() {
    setFormError(null);
    setNotice(null);
    setFieldErrors({});
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    resetMessages();

    const errors: Record<string, string> = {};
    if (mode === "signup" && name.trim().length < 2) errors.name = "Enter your name";
    if (!validateEmail(email)) errors.email = "Enter a valid email";
    const pwIssue = mode === "signup" ? passwordIssue(password) : password.length < 1 ? "Enter your password" : null;
    if (pwIssue) errors.password = pwIssue;

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        await registerRequest({ name: name.trim(), email: email.trim(), password });
        setStep("verify");
        setNotice(`We sent a 6-digit code to ${email.trim()}.`);
        startResendCooldown();
      } else {
        const result = await loginRequest({ email: email.trim(), password });
        if ("needsVerification" in result && result.needsVerification) {
          setStep("verify");
          setNotice(`Confirm ${result.email} with the code we just sent.`);
          startResendCooldown();
        } else {
          navigate({ to: search.next || "/dashboard" });
        }
      }
    } catch (error) {
      setFormError(error instanceof AuthError ? error.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    resetMessages();

    if (!/^\d{6}$/.test(code)) {
      setFieldErrors({ code: "Enter the 6-digit code" });
      return;
    }

    setLoading(true);
    try {
      await verifyEmailRequest({ email: email.trim(), code });
      navigate({ to: search.next || "/dashboard" });
    } catch (error) {
      setFormError(error instanceof AuthError ? error.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    resetMessages();
    try {
      await resendCodeRequest({ email: email.trim() });
      setNotice("New code sent.");
      startResendCooldown();
    } catch (error) {
      setFormError(error instanceof AuthError ? error.message : "Couldn't resend the code. Try again.");
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-5">
      <img src={bg} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-overlay" />
      <div className="auth-card w-full max-w-sm p-8">
        <Link to="/" className="font-display text-lg font-normal text-foreground">CoralzOne</Link>

        {step === "form" ? (
          <>
            <h1 className="mt-4 font-display text-3xl font-normal text-foreground">
              {mode === "login" ? "Welcome back" : "Create account"}
            </h1>

            <form className="mt-6 space-y-3" onSubmit={handleSubmit} noValidate>
              {mode === "signup" && (
                <Field
                  value={name}
                  onChange={setName}
                  placeholder="Name"
                  autoComplete="name"
                  error={fieldErrors.name}
                />
              )}
              <Field
                value={email}
                onChange={setEmail}
                type="email"
                placeholder="Email"
                autoComplete="email"
                error={fieldErrors.email}
              />
              <Field
                value={password}
                onChange={setPassword}
                type="password"
                placeholder="Password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                error={fieldErrors.password}
              />

              {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}

              <Button
                type="submit"
                variant="crystal"
                disabled={loading}
                className="h-auto w-full py-3 font-semibold"
              >
                {loading ? <Loader2 className="animate-spin" /> : mode === "login" ? "Sign in" : "Sign up"}
                {!loading && <ArrowRight />}
              </Button>

              <Button asChild variant="glass" type="button" className="h-auto w-full rounded-full py-3 text-sm">
                <a href={GOOGLE_SIGN_IN_URL}>
                  <GoogleIcon className="h-4 w-4" />
                  Continue with Google
                </a>
              </Button>
            </form>

            <Button
              variant="ghost"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                resetMessages();
              }}
              className="mt-5 w-full text-center text-sm text-muted-foreground"
            >
              {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
            </Button>
          </>
        ) : (
          <>
            <h1 className="mt-4 font-display text-3xl font-normal text-foreground">Confirm your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter the 6-digit code we sent to <span className="text-foreground">{email}</span>.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleVerify} noValidate>
              <InputOTP
                maxLength={6}
                value={code}
                onChange={(value) => setCode(value.replace(/\D/g, ""))}
                containerClassName="justify-center"
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <InputOTPSlot key={index} index={index} className="h-11 w-10 border-glass-border text-foreground" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              {fieldErrors.code && (
                <p className="text-center text-sm text-destructive" role="alert">{fieldErrors.code}</p>
              )}
              {notice && !formError && <p className="text-center text-sm text-muted-foreground">{notice}</p>}
              {formError && <p className="text-center text-sm text-destructive" role="alert">{formError}</p>}

              <Button
                type="submit"
                variant="crystal"
                disabled={loading}
                className="h-auto w-full py-3 font-semibold"
              >
                {loading ? <Loader2 className="animate-spin" /> : "Verify & continue"}
                {!loading && <ArrowRight />}
              </Button>
            </form>

            <div className="mt-5 flex items-center justify-between text-sm">
              <Button
                variant="ghost"
                onClick={() => {
                  setStep("form");
                  resetMessages();
                }}
                className="text-muted-foreground"
              >
                Back
              </Button>
              <Button
                variant="ghost"
                onClick={handleResend}
                disabled={resendCooldown > 0}
                className="text-muted-foreground"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  autoComplete?: string;
  error?: string;
}) {
  return (
    <div>
      <input
        className="auth-input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-label={placeholder}
      />
      {error && <p className="mt-1 px-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
