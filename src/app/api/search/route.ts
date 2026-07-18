import { NextResponse } from "next/server";
import {
  posterUrl,
  searchMulti,
  titleFromResult,
  yearFromResult,
} from "@/lib/tmdb/client";

export const dynamic = "force-dynamic";

export type SearchApiResult = {
  id: number;
  type: "movie" | "tv";
  title: string;
  year: number | null;
  posterPath: string | null;
  posterUrl: string | null;
};

export type SearchApiResponse = {
  results: SearchApiResult[];
  totalResults: number;
};

/**
 * TMDB search proxy for the topbar dropdown. Public — no auth required.
 * Returns up to 8 results for the dropdown; the full count is exposed via
 * totalResults so the "See all N results" footer can show the true number.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  if (q.length < 2) {
    return NextResponse.json<SearchApiResponse>({ results: [], totalResults: 0 });
  }

  try {
    const raw = await searchMulti(q);
    // searchMulti already filters to movie + tv (drops people).
    const shaped: SearchApiResult[] = raw.slice(0, 8).map((r) => ({
      id: r.id,
      type: r.media_type as "movie" | "tv",
      title: titleFromResult(r),
      year: yearFromResult(r),
      posterPath: r.poster_path,
      posterUrl: posterUrl(r.poster_path, "w185"),
    }));
    return NextResponse.json<SearchApiResponse>({
      results: shaped,
      totalResults: raw.length,
    });
  } catch (err) {
    console.error("search error", err);
    return NextResponse.json<SearchApiResponse>(
      { results: [], totalResults: 0 },
      { status: 500 },
    );
  }
}
