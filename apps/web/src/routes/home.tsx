import { useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  ExternalLink,
  Globe,
  KeyRound,
  PlugZap,
  ShieldCheck,
  Terminal,
  Zap,
} from "lucide-react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

const providers = ["Google Gemini", "NVIDIA", "Groq", "OpenAI-compatible"];

const freeProviders = [
  {
    name: "Google Gemini",
    url: "https://aistudio.google.com/app/apikey",
    note: "Free daily quota in Google AI Studio. Keys start with AIza.",
  },
  {
    name: "NVIDIA",
    url: "https://build.nvidia.com",
    note: "Free developer credits on NVIDIA NIM. Keys start with nvapi-.",
  },
  {
    name: "Groq",
    url: "https://console.groq.com/keys",
    note: "Fast free inference on open models. Keys start with gsk_.",
  },
];

const features = [
  {
    icon: PlugZap,
    title: "Free tiers, your keys",
    body: "Connect free keys from Google Gemini, NVIDIA, or Groq. Foonix verifies each key against the provider before saving it.",
  },
  {
    icon: Terminal,
    title: "OpenAI-compatible",
    body: "The chat endpoint speaks the OpenAI wire format, so existing SDKs and tools work with one base URL change.",
  },
  {
    icon: ShieldCheck,
    title: "Encrypted key vault",
    body: "Provider credentials are sealed with envelope encryption and never shown again — not even to you.",
  },
  {
    icon: KeyRound,
    title: "Scoped API tokens",
    body: "Issue bearer tokens for CLI and server access, then revoke them at any time from one place.",
  },
  {
    icon: Zap,
    title: "Streaming responses",
    body: "Ask for server-sent events and stream tokens back to your users as the provider generates them.",
  },
  {
    icon: Globe,
    title: "Same-origin, no CORS",
    body: "The dashboard and the API share one origin, so there is nothing to configure and no preflights to debug.",
  },
];

const steps = [
  {
    n: "01",
    title: "Get a free provider key",
    body: "Grab a free key from Google AI Studio, NVIDIA build, or Groq Console — our guide walks you through each.",
  },
  {
    n: "02",
    title: "Connect it to Foonix",
    body: "Paste it into the gateway. Foonix verifies it against the provider, then stores it encrypted.",
  },
  {
    n: "03",
    title: "Create an API token",
    body: "Mint a bearer token for your app or CLI from the gateway dashboard.",
  },
  {
    n: "04",
    title: "Call the gateway",
    body: "POST to /api/chat/completions with any OpenAI-compatible client — no new SDK.",
  },
];

function quickstart(origin: string) {
  return `curl ${origin}/api/chat/completions \\
  -H "authorization: Bearer $FOONIX_KEY" \\
  -H 'content-type: application/json' \\
  -d '{"model":"openai/gpt-oss-20b",
       "messages":[{"role":"user","content":"pong"}]}'`;
}

function TerminalCard() {
  const [copied, setCopied] = useState(false);
  const origin =
    typeof window === "undefined"
      ? "https://foonix.net"
      : window.location.origin;
  const snippet = quickstart(origin);

  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
      <div className="flex items-center gap-2 border-b border-border bg-white/[0.02] px-4 py-3">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 font-mono text-xs text-muted-foreground">
          quickstart.sh
        </span>
        <button
          type="button"
          onClick={copy}
          className="ml-auto rounded-md border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-foreground/90">
        {snippet}
      </pre>
      <div className="border-t border-border px-5 py-3 font-mono text-xs text-muted-foreground">
        <span className="text-primary">200 OK</span> · routed via groq ·
        streaming ready
      </div>
    </div>
  );
}

export function HomePage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-40 left-1/3 h-[560px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--primary)_18%,transparent),transparent)]"
          />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
            <div>
              <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.06] px-3 py-1.5 text-xs font-medium tracking-[0.14em] text-primary uppercase">
                ● Free AI tokens · Bring your own key
              </span>
              <h1 className="text-5xl font-extrabold tracking-[-0.035em] text-balance sm:text-6xl">
                All your free AI tokens.
                <br />
                <span className="bg-[linear-gradient(120deg,var(--primary),var(--brand-2))] bg-clip-text text-transparent">
                  One gateway.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                Foonix puts the free tiers of Google Gemini, NVIDIA, and Groq
                behind one OpenAI-compatible endpoint. Bring your own keys and
                build for{" "}
                <span className="font-medium text-foreground">$0</span>.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link to="/gateway">
                    Start free
                    <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/guide">Get free API keys</Link>
                </Button>
              </div>
              <p className="mt-5 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  Free tiers of Gemini, NVIDIA &amp; Groq
                </span>{" "}
                · No credit card · No CORS to configure
              </p>
            </div>
            <TerminalCard />
          </div>
        </section>

        {/* Providers */}
        <div className="border-y border-border py-7">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-6 px-6">
            <span className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
              Free tiers from
            </span>
            <div className="flex flex-wrap items-center gap-x-10 gap-y-3 text-lg font-bold tracking-tight text-muted-foreground/60">
              {providers.map((provider) => (
                <span key={provider}>{provider}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Free keys */}
        <section className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="rounded-2xl border border-border bg-card p-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-xl">
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Get a free key in minutes
                </h2>
                <p className="mt-2 text-muted-foreground">
                  Every supported provider has a free tier. Create a key, paste
                  it into Foonix, and you are live.
                </p>
              </div>
              <Link
                to="/guide"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Full onboarding guide →
              </Link>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {freeProviders.map((provider) => (
                <a
                  key={provider.name}
                  href={provider.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group rounded-xl border border-border bg-background/40 p-5 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{provider.name}</h3>
                    <ExternalLink className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {provider.note}
                  </p>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-20">
          <div className="mb-12 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything between your app and the provider
            </h2>
            <p className="mt-4 text-muted-foreground">
              Stop rebuilding gateway plumbing in every project. Foonix handles
              the boring parts so you can ship on the free tier.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/35"
              >
                <div className="mb-5 grid size-10 place-items-center rounded-xl border border-primary/20 bg-primary/[0.08] text-primary">
                  <feature.icon className="size-5" />
                </div>
                <h3 className="text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-24">
          <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <div key={step.n} className="bg-card p-7">
                <span className="font-mono text-sm text-primary">{step.n}</span>
                <h3 className="mt-3 text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
