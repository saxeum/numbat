import { ArrowRight, ExternalLink } from "lucide-react";
import { Link } from "react-router";

import { AppShell } from "@/components/app-shell";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";

const providers = [
  {
    name: "Google Gemini",
    url: "https://aistudio.google.com/app/apikey",
    cta: "Open AI Studio",
    note: "Free daily request limits in Google AI Studio.",
    steps: [
      "Sign in with a Google account.",
      "Accept the terms (a Cloud project is created for you).",
      "Click Create API key and copy the value.",
    ],
    format: "AIza…",
  },
  {
    name: "NVIDIA",
    url: "https://build.nvidia.com",
    cta: "Open NVIDIA build",
    note: "Free developer credits on NVIDIA NIM.",
    steps: [
      "Sign up or sign in at build.nvidia.com.",
      "Open a model and click Get API Key.",
      "Copy the key.",
    ],
    format: "nvapi-…",
  },
  {
    name: "Groq",
    url: "https://console.groq.com/keys",
    cta: "Open Groq Console",
    note: "Free, rate-limited inference on open models.",
    steps: [
      "Sign up or sign in at console.groq.com.",
      "Open API Keys → Create API Key.",
      "Copy the key.",
    ],
    format: "gsk_…",
  },
];

const troubleshooting = [
  {
    symptom: "“The <provider> key was rejected (HTTP 401)”",
    fix: "Wrong key, wrong provider selected, or you pasted a whole .env line. Paste only the value (AIza…, nvapi-…, gsk_…).",
  },
  {
    symptom: "“Could not reach <provider> to verify the key”",
    fix: "No network egress to the provider from the Worker. Retry in a moment.",
  },
  {
    symptom: "400 NO_CREDENTIAL",
    fix: "No key connected for that model's provider — add one first.",
  },
  {
    symptom: "404 MODEL_NOT_FOUND",
    fix: "Model id not in the seeded catalog. Pick one from GET /api/models, or pass an explicit provider alongside the model.",
  },
  {
    symptom: "429 from a provider",
    fix: "You hit that provider's free-tier rate limit. Wait, or switch to another connected provider or model.",
  },
];

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-card p-4 font-mono text-xs leading-relaxed text-foreground/90">
      {children}
    </pre>
  );
}

const origin =
  typeof window === "undefined" ? "https://foonix.net" : window.location.origin;

export function GuidePage() {
  return (
    <AppShell>
      <div className="flex min-h-full flex-col">
        <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
          <header className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.06] px-3 py-1.5 text-xs font-medium tracking-[0.14em] text-foreground uppercase">
              Free tokens
            </span>
            <h1 className="mt-5 text-4xl font-extrabold tracking-[-0.035em] text-balance sm:text-5xl">
              Get free AI tokens
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Foonix is a gateway for the free tiers of Google Gemini, NVIDIA,
              and Groq. Create a free key with a provider, connect it here, and
              use one OpenAI-compatible endpoint for all of them.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/gateway">
                  Open the gateway
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#connect">How to connect</a>
              </Button>
            </div>
          </header>

          <section className="mt-14">
            <h2 className="text-2xl font-bold tracking-tight">
              1. Create a free key
            </h2>
            <p className="mt-2 text-muted-foreground">
              Pick any provider — you can connect all three. Free tiers and
              limits change over time; check each provider's own terms.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {providers.map((provider) => (
                <div
                  key={provider.name}
                  className="flex flex-col rounded-2xl border border-border bg-card p-5"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{provider.name}</h3>
                    <span className="font-mono text-xs text-muted-foreground">
                      {provider.format}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {provider.note}
                  </p>
                  <ol className="mt-4 flex flex-1 flex-col gap-2 text-sm text-muted-foreground">
                    {provider.steps.map((step, index) => (
                      <li key={step} className="flex gap-2">
                        <span className="font-mono text-foreground">
                          {index + 1}.
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  <a
                    href={provider.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {provider.cta}
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              ))}
            </div>
          </section>

          <section id="connect" className="mt-16 scroll-mt-24">
            <h2 className="text-2xl font-bold tracking-tight">
              2. Connect it to Foonix
            </h2>
            <p className="mt-2 text-muted-foreground">
              In the dashboard, open{" "}
              <Link
                to="/gateway"
                className="text-foreground underline-offset-4 hover:underline"
              >
                Provider credentials
              </Link>
              , pick the provider, paste the key, and click <b>Add key</b>.
              Foonix verifies it against the provider, then stores it encrypted
              — it is never shown again.
            </p>
            <p className="mt-4 text-muted-foreground">
              Or connect through the API:
            </p>
            <CodeBlock>{`BASE=${origin}
# sign in (dev email/password shown) and keep the session cookie
curl -s -c /tmp/foonix.txt -X POST $BASE/api/auth/sign-up/email \\
  -H 'content-type: application/json' \\
  -d '{"email":"you@example.com","password":"password1234","name":"You"}'

# connect a key (repeat per provider: gemini | nvidia | groq)
curl -s -b /tmp/foonix.txt -X POST $BASE/api/credentials \\
  -H 'content-type: application/json' \\
  -d '{"provider":"nvidia","apiKey":"nvapi-…"}'`}</CodeBlock>
          </section>

          <section className="mt-16">
            <h2 className="text-2xl font-bold tracking-tight">
              3. Send a request
            </h2>
            <p className="mt-2 text-muted-foreground">
              For scripts and SDKs, create an <b>API token</b> in the dashboard
              (shown once) and use it as{" "}
              <code>Authorization: Bearer nbk_…</code>. Any OpenAI-compatible
              client works with base URL <code>{origin}/api</code>.
            </p>
            <CodeBlock>{`curl ${origin}/api/chat/completions \\
  -H "authorization: Bearer nbk_…" \\
  -H 'content-type: application/json' \\
  -d '{"model":"openai/gpt-oss-20b",
       "messages":[{"role":"user","content":"pong"}]}'`}</CodeBlock>
            <CodeBlock>{`from openai import OpenAI

client = OpenAI(base_url="${origin}/api", api_key="nbk_…")
print(
    client.chat.completions.create(
        model="meta/llama-3.3-70b-instruct",
        messages=[{"role": "user", "content": "pong"}],
    ).choices[0].message.content
)`}</CodeBlock>
          </section>

          <section className="mt-16">
            <h2 className="text-2xl font-bold tracking-tight">
              Troubleshooting
            </h2>
            <dl className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {troubleshooting.map((row) => (
                <div
                  key={row.symptom}
                  className="grid gap-1 p-4 sm:grid-cols-[1fr_1.4fr] sm:gap-6"
                >
                  <dt className="font-mono text-sm text-foreground">
                    {row.symptom}
                  </dt>
                  <dd className="text-sm text-muted-foreground">{row.fix}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-16">
            <h2 className="text-2xl font-bold tracking-tight">Good to know</h2>
            <ul className="mt-4 flex flex-col gap-2 text-muted-foreground">
              <li>
                Keys are stored <b>encrypted</b> (envelope encryption); only
                ciphertext is written to the database.
              </li>
              <li>
                Connect more than one provider so you can fall back when one is
                rate-limited.
              </li>
              <li>
                The seeded model catalog is static; pass an explicit{" "}
                <code>provider</code> on a request to use any model id the
                provider accepts.
              </li>
            </ul>
          </section>
        </main>

        <SiteFooter />
      </div>
    </AppShell>
  );
}
