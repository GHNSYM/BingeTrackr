"use client";

import { Star, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  rateMediaAction,
  unrateMediaAction,
} from "@/lib/tracking/actions";

type Props = {
  mediaId: string;
  initialScore: number | null;
};

const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function RateButton({ mediaId, initialScore }: Props) {
  const [score, setScore] = useState<number | null>(initialScore);
  const [hover, setHover] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const commitRating = (n: number) => {
    // Tap the same score to clear.
    if (n === score) {
      setScore(null);
      startTransition(async () => {
        await unrateMediaAction(mediaId);
      });
      return;
    }
    setScore(n);
    startTransition(async () => {
      await rateMediaAction({ mediaId, score: n });
    });
  };

  const clear = () => {
    setScore(null);
    startTransition(async () => {
      await unrateMediaAction(mediaId);
    });
  };

  const displayScore = hover ?? score;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={pending}
          className="min-w-[100px]"
        >
          {score !== null ? (
            <>
              <Star
                className="w-4 h-4"
                fill="currentColor"
                strokeWidth={0}
              />
              {score}/10
            </>
          ) : (
            <>
              <Star className="w-4 h-4" />
              Rate
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="p-4 w-[280px]"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-semibold tracking-[0.15em] uppercase text-meta">
              Your rating
            </p>
            {displayScore !== null && (
              <p className="text-lg font-bold tracking-tight">
                {displayScore}
                <span className="text-meta text-sm font-normal">/10</span>
              </p>
            )}
          </div>

          <div
            className="flex gap-1"
            onMouseLeave={() => setHover(null)}
          >
            {SCALE.map((n) => {
              const active = displayScore !== null && n <= displayScore;
              return (
                <button
                  key={n}
                  type="button"
                  aria-label={`Rate ${n} out of 10`}
                  onMouseEnter={() => setHover(n)}
                  onClick={() => commitRating(n)}
                  className="h-8 flex-1 rounded-md transition"
                  style={{
                    background: active ? "var(--primary)" : "var(--surface2)",
                    border: "1px solid var(--border)",
                  }}
                />
              );
            })}
          </div>

          <div className="flex justify-between items-center text-xs text-meta">
            <span>Terrible</span>
            <span>Masterpiece</span>
          </div>

          {score !== null && (
            <button
              type="button"
              onClick={clear}
              className="flex items-center justify-center gap-1.5 text-xs font-semibold rounded-md py-1.5 hover:brightness-110 transition"
              style={{
                color: "var(--status-dropped)",
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <X size={12} />
              Remove rating
            </button>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
