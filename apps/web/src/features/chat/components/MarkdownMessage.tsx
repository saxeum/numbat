import { useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

function extractLanguage(children: ReactNode): string {
  const nodes = Array.isArray(children) ? children : [children];
  for (const node of nodes) {
    if (node && typeof node === "object" && "props" in node) {
      const className =
        (node as { props?: { className?: string } }).props?.className ?? "";
      const match = /language-([\w-]+)/.exec(className);
      if (match) return match[1];
    }
  }
  return "";
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const language = extractLanguage(children);

  async function copy() {
    await navigator.clipboard.writeText(preRef.current?.textContent ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-mono">{language || "code"}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        ref={preRef}
        className="overflow-x-auto p-3 font-mono text-[12.5px] leading-relaxed"
      >
        {children}
      </pre>
    </div>
  );
}

const components: Components = {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-foreground underline underline-offset-2"
    >
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const isBlock =
      typeof className === "string" && /language-|hljs/.test(className);
    if (isBlock) return <code className={className}>{children}</code>;
    return (
      <code className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[0.85em]">
        {children}
      </code>
    );
  },
};

/** Lazy-loaded so react-markdown + highlight.js stay out of the initial bundle. */
export default function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
