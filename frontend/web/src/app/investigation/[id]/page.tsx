"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * This page used to be a second, disconnected view of a case (graph + timeline
 * + detail panel) built against the same case-based API as /project/[id].
 * It never linked back to the main case workspace and the main workspace
 * never linked to it, so a case had two live URLs with different data
 * fetching and no way to move between them.
 *
 * The graph + activity feed it showed now live inside /project/[id] as the
 * "Case Graph" section (see components/panels/CaseGraphPanel.tsx), so this
 * route just forwards there. Kept as a route (rather than deleted) so any
 * old bookmarked/shared /investigation/:id links keep working.
 */
export default function InvestigationRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (id) router.replace(`/project/${id}?section=graph`);
  }, [id, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-fp-bg text-fp-text-muted text-sm gap-2">
      <Loader2 className="w-4 h-4 animate-spin text-fp-blue" />
      Redirecting to case workspace…
    </div>
  );
}
