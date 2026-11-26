"use client";

import { ArrowLeft, Check, Copy, Eye, EyeOff, KeyRound, Mail, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Suspense, useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { BrandLockup, BrandMark } from "@/components/brand";
import { OtpInput } from "@/components/otp-input";
import { Alert, Button, Field, Input, Spinner, cx } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/api";
import { mmss } from "@/lib/format";
import { HOME_PATH } from "@/lib/features";
import { useNow } from "@/lib/hooks";
import type { MfaMethod } from "@/lib/types";

type LoginResult = { preauth_token: string; method: MfaMethod; needs_enrollment: boolean; email_hint: string; first_name: string };
type StepProps = { pre: LoginResult; onDone: () => void; onRestart: () => void };

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const [pre, setPre] = useState<LoginResult | null>(null);

  const finish = () => {
    const next = params.get("next");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : HOME_PATH);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <BrandPanel />
      <div className="flex flex-col px-6 py-8 sm:px-10">
        <div className="lg:hidden">
          <BrandMark />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[380px]">
            {!pre ? (
              <CredentialsStep onDone={setPre} />
            ) : (
              <SecondStep key={pre.preauth_token} pre={pre} onDone={finish} onRestart={() => setPre(null)} />
            )}
          </div>
        </div>
        <p className="text-center text-[12.5px] text-faint">Authorised Tarmeem Hospital staff only. Activity is logged.</p>
      </div>
    </div>
  );
}

function BrandPanel() {
  return (
    <div className="grid-lines relative hidden overflow-hidden bg-brand-800 text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div className="absolute -right-32 -top-32 size-[420px] rounded-full border border-white/[0.07]" />
      <div className="absolute -right-12 -top-12 size-[260px] rounded-full border border-white/[0.07]" />
      <div className="relative">
        <BrandLockup inverted />
      </div>

      <div className="relative max-w-md">
        <h1 className="text-[34px] font-semibold leading-[1.15] tracking-[-0.03em]">Sick leave management</h1>
        <ul className="mt-10 flex items-center gap-3 border-t border-white/10 pt-6 text-[14px] font-semibold">
          {["Extract", "Match", "Confirm"].map((step, i) => (
            <li key={step} className="flex items-center gap-3">
              {i > 0 ? <span className="text-brand-200/50" aria-hidden>
                →
              </span> : null}
              <span>{step}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative text-[12.5px] text-brand-200/80">© {new Date().getFullYear()} Tarmeem Hospital, United Arab Emirates</div>
    </div>
  );
}

/* Step 1: email and password ---------------------------------------------- */

function CredentialsStep({ onDone }: { onDone: (r: LoginResult) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      onDone(await api<LoginResult>("/auth/login", { body: { email, password } }));
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="animate-fade-in space-y-5">
      <div className="mb-8">
        <h2 className="text-[24px] font-semibold tracking-[-0.025em]">Sign in</h2>
        <p className="mt-1.5 text-[14px] text-muted">Use the work account your administrator created for you.</p>
      </div>

      {error && <Alert tone="bad">{error}</Alert>}

      <Field label="Work email" htmlFor="email">
        <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@tarmeem.ae" autoFocus />
      </Field>

      <Field label="Password" htmlFor="password">
        <div className="relative">
          <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted hover:text-ink" aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>

      <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
        Continue
      </Button>
    </form>
  );
}

/* Step 2: the method assigned by the administrator ------------------------ */

function SecondStep(props: StepProps) {
  const { pre, onRestart } = props;
  const meta = {
    captcha: { icon: <ShieldCheck className="size-5" />, sub: "Confirm you are not an automated program." },
    email_otp: { icon: <Mail className="size-5" />, sub: "Enter the code we email to you." },
    authenticator: {
      icon: <Smartphone className="size-5" />,
      sub: pre.needs_enrollment ? "Connect Microsoft Authenticator to finish signing in." : "Enter the code from Microsoft Authenticator.",
    },
  }[pre.method];

  return (
    <div className="animate-fade-in">
      <button onClick={onRestart} className="mb-8 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" /> Use a different account
      </button>
      <div className="mb-7">
        <div className="mb-4 grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">{meta.icon}</div>
        <h2 className="text-[24px] font-semibold tracking-[-0.025em]">{pre.first_name ? `Welcome back, ${pre.first_name}` : "One more step"}</h2>
        <p className="mt-1.5 text-[14px] text-muted">{meta.sub}</p>
      </div>
      {pre.method === "captcha" && <CaptchaStep {...props} />}
      {pre.method === "email_otp" && <EmailStep {...props} />}
      {pre.method === "authenticator" && <AuthenticatorStep {...props} />}
    </div>
  );
}

function useVerify({ pre, onDone, onRestart }: StepProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const verify = async (body: Record<string, string>): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await api("/auth/mfa/verify", { body: { preauth_token: pre.preauth_token, ...body } });
      onDone();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && (err.status === 401 || err.status === 423)) setTimeout(onRestart, 2200);
      setLoading(false);
      return false;
    }
  };
  return { error, setError, loading, verify };
}

function CaptchaStep(props: StepProps) {
  const { error, setError, loading, verify } = useVerify(props);
  const [captcha, setCaptcha] = useState<{ captcha_id: string; svg: string } | null>(null);
  const [answer, setAnswer] = useState("");

  const load = useCallback(async () => {
    setAnswer("");
    try {
      setCaptcha(await api("/auth/captcha"));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [setError]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!captcha) return;
    const ok = await verify({ captcha_id: captcha.captcha_id, captcha_answer: answer });
    if (!ok) load();
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <Alert tone="bad">{error}</Alert>}
      <Field label="Security check" htmlFor="captcha" hint="Letters are not case sensitive.">
        <div className="flex gap-2">
          <div className="grid h-14 w-[180px] shrink-0 place-items-center overflow-hidden rounded-lg border border-line-strong bg-[#F4F3EF]">
            {captcha ? <div className="[&>svg]:block" dangerouslySetInnerHTML={{ __html: captcha.svg }} /> : <Spinner />}
          </div>
          <button type="button" onClick={load} className="grid h-14 w-11 shrink-0 place-items-center rounded-lg border border-line-strong bg-surface text-muted hover:bg-subtle hover:text-ink" aria-label="Load a new image">
            <RefreshCw className="size-4" />
          </button>
        </div>
        <Input
          id="captcha"
          required
          autoFocus
          value={answer}
          onChange={(e) => setAnswer(e.target.value.toUpperCase())}
          maxLength={8}
          autoComplete="off"
          spellCheck={false}
          className="mt-2 font-mono tracking-[0.3em]"
          placeholder="Type the characters"
        />
      </Field>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading} disabled={!answer || !captcha}>
        Sign in
      </Button>
    </form>
  );
}

function EmailStep(props: StepProps) {
  const { pre } = props;
  const { error, setError, loading, verify } = useVerify(props);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ sent_to: string; at: number; dev_code?: string } | null>(null);
  const now = useNow(1000, !!sent);
  const cooldown = sent ? Math.max(0, 30 - Math.floor((now - sent.at) / 1000)) : 0;
  const expiresIn = sent ? Math.max(0, 300 - Math.floor((now - sent.at) / 1000)) : 0;

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const r = await api<{ sent_to: string; dev_code?: string }>("/auth/mfa/email", { body: { preauth_token: pre.preauth_token } });
      setSent({ ...r, at: Date.now() });
      setCode("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const submit = async (value = code) => {
    if (value.length !== 6) return;
    if (!(await verify({ code: value }))) setCode("");
  };

  if (!sent) {
    return (
      <div className="space-y-5">
        {error && <Alert tone="bad">{error}</Alert>}
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-muted" />
            <p className="text-[13.5px] text-ink-2">
              We will email a 6 digit code to <span className="font-medium text-ink">{pre.email_hint}</span>. It is valid for 5 minutes.
            </p>
          </div>
          <Button variant="primary" className="mt-4 w-full" onClick={send} loading={sending}>
            Send code
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && <Alert tone="bad">{error}</Alert>}
      <p className="text-[13.5px] text-ink-2">
        Enter the code sent to <span className="font-medium text-ink">{sent.sent_to}</span>.
      </p>
      {sent.dev_code && (
        <Alert tone="warn" title="Development mode">
          Email delivery is not configured. Your code is <span className="font-mono font-semibold tracking-wider">{sent.dev_code}</span>
        </Alert>
      )}
      <OtpInput value={code} onChange={setCode} onComplete={submit} disabled={loading || expiresIn === 0} autoFocus />
      <div className="flex items-center justify-between text-[13px]">
        <span className={cx("tabular", expiresIn === 0 ? "text-bad" : "text-muted")}>{expiresIn === 0 ? "Code expired" : `Expires in ${mmss(expiresIn)}`}</span>
        <button onClick={send} disabled={cooldown > 0 || sending} className="font-medium text-brand-600 hover:text-brand-800 disabled:text-faint">
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </div>
      <Button variant="primary" size="lg" className="w-full" loading={loading} disabled={code.length !== 6} onClick={() => submit()}>
        Verify and sign in
      </Button>
    </div>
  );
}

function AuthenticatorStep(props: StepProps) {
  const { pre } = props;
  const { error, setError, loading, verify } = useVerify(props);
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!pre.needs_enrollment) return;
    api<{ secret: string; otpauth_url: string }>("/auth/mfa/authenticator/setup", { body: { preauth_token: pre.preauth_token } })
      .then(setSetup)
      .catch((err) => setError(errorMessage(err)));
  }, [pre, setError]);

  const submit = async (value = code) => {
    if (value.length !== 6) return;
    if (!(await verify({ code: value }))) setCode("");
  };

  const codeEntry: ReactNode = (
    <>
      <OtpInput value={code} onChange={setCode} onComplete={submit} disabled={loading} autoFocus={!pre.needs_enrollment} />
      <Button variant="primary" size="lg" className="w-full" loading={loading} disabled={code.length !== 6} onClick={() => submit()}>
        {pre.needs_enrollment ? "Connect and sign in" : "Verify and sign in"}
      </Button>
    </>
  );

  if (!pre.needs_enrollment) {
    return (
      <div className="space-y-5">
        {error && <Alert tone="bad">{error}</Alert>}
        <p className="text-[13.5px] text-ink-2">Open Microsoft Authenticator and enter the 6 digit code shown for Tarmeem Hospital.</p>
        {codeEntry}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && <Alert tone="bad">{error}</Alert>}
      <ol className="space-y-1.5 text-[13.5px] text-ink-2">
        {["Open Microsoft Authenticator on your phone.", "Tap Add account, choose Work or school, then Scan a QR code.", "Enter the 6 digit code the app shows."].map((t, i) => (
          <li key={t} className="flex gap-2.5">
            <span className="tabular grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700">{i + 1}</span>
            {t}
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4">
        <div className="grid size-[132px] shrink-0 place-items-center rounded-lg border border-line bg-white p-2">
          {setup ? <QRCodeSVG value={setup.otpauth_url} size={114} level="M" fgColor="#141c1b" /> : <Spinner />}
        </div>
        <div className="min-w-0 text-[12.5px] text-muted">
          <div>Cannot scan? Enter this key in the app.</div>
          {setup && (
            <div className="mt-2 flex items-start gap-2">
              <span className="break-all font-mono text-[12px] leading-relaxed tracking-wider text-ink-2">{setup.secret.match(/.{1,4}/g)?.join(" ")}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(setup.secret).catch(() => {});
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="shrink-0 text-muted hover:text-ink"
                aria-label="Copy setup key"
              >
                {copied ? <Check className="size-4 text-good" /> : <Copy className="size-4" />}
              </button>
            </div>
          )}
        </div>
      </div>
      {codeEntry}
    </div>
  );
}
