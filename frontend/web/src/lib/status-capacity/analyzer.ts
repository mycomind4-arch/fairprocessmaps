import { getStatusById } from "./catalog";
import type { StatusClaimAnalysis, StatusClaimInput } from "./types";

const RECOGNITION_LABELS = {
  recognized_status: "Recognized legal status",
  recognized_capacity: "Recognized legal capacity",
  context_dependent: "Context-dependent legal classification",
  asserted_term: "Asserted terminology — verify claimed legal effect",
} as const;

export function analyzeStatusClaim(input: StatusClaimInput): StatusClaimAnalysis {
  const status = getStatusById(input.statusId);
  if (!status) {
    throw new Error(`Unknown status definition: ${input.statusId}`);
  }

  const questions = [
    "What exact legal consequence is being claimed from this status or capacity?",
    "Which jurisdiction and type of matter make the classification relevant?",
    "What event, instrument, statute, court order, or fact pattern is claimed to establish it?",
    "What primary authority supports the claimed consequence?",
  ];

  if (status.category === "capacity") {
    questions.push("What document or appointment defines the scope of authority in this capacity?");
  }

  if (status.id === "california-state-national") {
    questions.push(
      "Does the person actually mean California citizenship, California domicile, U.S. nationality, or non-citizen U.S. nationality?"
    );
  }

  const warnings: string[] = [];
  if (status.recognition === "asserted_term") {
    warnings.push(
      "Do not infer immunity, jurisdictional consequences, tax consequences, or nationality changes from the label alone."
    );
  }
  if (input.claimedConsequence?.trim()) {
    warnings.push(
      "The claimed consequence must be researched independently; recognition of a status does not automatically establish that consequence."
    );
  }
  if (status.caution) warnings.push(status.caution);

  return {
    status,
    recognitionLabel: RECOGNITION_LABELS[status.recognition],
    canBeChangedByDeclarationAlone: false,
    consequenceNeedsSeparateAuthority: true,
    questions,
    warnings,
  };
}
