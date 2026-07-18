"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  /** Path (with leading slash) or full URL. If a path, we prepend location.origin at click time. */
  url: string;
  label?: string;
};

export function ShareButton({ url, label = "Share" }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const full =
      url.startsWith("http") || typeof window === "undefined"
        ? url
        : `${window.location.origin}${url}`;
    try {
      // navigator.share works on mobile — nicer than a plain copy.
      if (navigator.share) {
        await navigator.share({ url: full });
        return;
      }
    } catch {
      // User cancelled the share sheet — fall through to clipboard.
    }
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — noop */
    }
  };

  return (
    <Button onClick={copy} variant="outline" size="sm" className="min-w-[112px]">
      {copied ? (
        <>
          <Check className="w-4 h-4 animate-pop" />
          Copied
        </>
      ) : (
        <>
          <Share2 className="w-4 h-4" />
          {label}
        </>
      )}
    </Button>
  );
}
