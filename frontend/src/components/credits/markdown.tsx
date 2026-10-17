import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Minimal markdown renderer for admin-authored credit instructions. */
export function MarkdownContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const blocks = content.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);

  return (
    <div className={cn("space-y-3 text-sm leading-7 text-foreground", className)}>
      {blocks.map((block, index) => {
        const lines = block.split("\n");
        if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
          return (
            <ul key={index} className="list-disc space-y-1 pr-5">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{formatInline(line.replace(/^\s*[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }

        if (/^#{1,3}\s+/.test(lines[0] ?? "")) {
          const match = (lines[0] ?? "").match(/^(#{1,3})\s+(.*)$/);
          const level = match?.[1]?.length ?? 1;
          const text = [match?.[2] ?? "", ...lines.slice(1)].join(" ");
          const Tag = level === 1 ? "h3" : level === 2 ? "h4" : "h5";
          return (
            <Tag key={index} className="font-bold">
              {formatInline(text)}
            </Tag>
          );
        }

        return (
          <p key={index}>
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 && <br />}
                {formatInline(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function formatInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-muted px-1 py-0.5 text-xs" dir="ltr">
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <a
          key={index}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline"
        >
          {link[1]}
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
}
