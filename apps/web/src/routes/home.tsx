import { Link } from "react-router";
import {
  ArrowRight,
  ExternalLink,
  Globe,
  KeyRound,
  MessageSquare,
  PlugZap,
  ShieldCheck,
  Terminal,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";

const providers = ["Google Gemini", "NVIDIA", "Groq"];

const freeProviders = [
  {
    name: "Google Gemini",
    url: "https://aistudio.google.com/app/apikey",
    note: "A free daily quota in Google AI Studio.",
  },
  {
    name: "NVIDIA",
    url: "https://build.nvidia.com",
    note: "Free developer credits on NVIDIA NIM.",
  },
  {
    name: "Groq",
    url: "https://console.groq.com/keys",
    note: "Fast, free inference on open models.",
  },
];

const features = [
  {
    icon: PlugZap,
    title: "Bring your own key",
    body: "Connect a free key from Gemini, NVIDIA, or Groq. We verify it, then store it encrypted.",
  },
  {
    icon: Globe,
    title: "One API, every model",
    body: "A single OpenAI-compatible endpoint for all of your providers.",
  },
  {
    icon: MessageSquare,
    title: "Chat in the browser",
    body: "A built-in chat with streaming and history. No setup.",
  },
  {
    icon: Terminal,
    title: "Drop-in compatible",
    body: "Point any OpenAI SDK at one base URL. Nothing else changes.",
  },
  {
    icon: ShieldCheck,
    title: "Keys stay yours",
    body: "Credentials are encrypted at rest and never shown again.",
  },
  {
    icon: KeyRound,
    title: "Scoped API tokens",
    body: "Mint bearer tokens for your app or CLI, and revoke them anytime.",
  },
];

const steps = [
  {
    n: "01",
    title: "Get a free key",
    body: "From Google AI Studio, NVIDIA, or Groq. Takes a minute.",
  },
  {
    n: "02",
    title: "Connect it",
    body: "Paste it into Foonix. It's verified and stored encrypted.",
  },
  {
    n: "03",
    title: "Chat or call the API",
    body: "Use the built-in chat, or point any OpenAI client at one URL.",
  },
];

export function HomePage() {
  return (
    <AppShell>
      <div className="flex min-h-full flex-col">
        <main className="flex-1">
          {/* Hero */}
          <section className="relative overflow-hidden">
            <div className="relative mx-auto w-full max-w-6xl px-6 py-20 lg:py-28">
              <div className="max-w-2xl">
                <h1 className="text-5xl font-extrabold tracking-[-0.035em] text-balance sm:text-6xl">
                  Your free AI keys.
                  <br />
                  <span className="text-primary">One smooth endpoint.</span>
                </h1>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                  Connect a free key from Google Gemini, NVIDIA, or Groq, then
                  chat in the browser or call one OpenAI-compatible API. No
                  setup, no credit card.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Button asChild size="lg">
                    <Link to="/gateway">
                      Open the gateway
                      <ArrowRight />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link to="/guide">Get a free key</Link>
                  </Button>
                </div>
                <p className="mt-5 text-sm text-muted-foreground">
                  Bring your own key · Free tiers only · Chat + API
                </p>
              </div>
            </div>
          </section>

          {/* Providers */}
          <div className="border-y border-border py-7">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-6 px-6">
              <span className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
                Works with
              </span>
              <div className="flex flex-wrap items-center gap-x-10 gap-y-3 text-lg font-semibold tracking-tight text-muted-foreground">
                {providers.map((provider) => (
                  <span key={provider}>{provider}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Free keys */}
          <section className="mx-auto w-full max-w-6xl px-6 py-16">
            <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-xl">
                  <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    Get a free key in minutes
                  </h2>
                  <p className="mt-2 text-muted-foreground">
                    Every provider has a free tier. Create a key, paste it into
                    Foonix, and you're live.
                  </p>
                </div>
                <Link
                  to="/guide"
                  className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
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
                    className="group rounded-xl border border-border p-5 transition-colors hover:border-primary/50"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">{provider.name}</h3>
                      <ExternalLink className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
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
                Everything handled for you
              </h2>
              <p className="mt-4 text-muted-foreground">
                Keys, models, chat, and API — Foonix takes care of the plumbing
                so you can build.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-2xl border border-border bg-card p-6 shadow-sm"
                >
                  <div className="mb-5 grid size-10 place-items-center rounded-xl border border-border bg-muted text-foreground">
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
            <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
              {steps.map((step) => (
                <div key={step.n} className="bg-card p-7">
                  <span className="text-sm font-semibold text-primary">
                    {step.n}
                  </span>
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
    </AppShell>
  );
}
