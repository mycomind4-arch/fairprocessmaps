export type RecognitionLevel =
  | "recognized_status"
  | "recognized_capacity"
  | "context_dependent"
  | "asserted_term";

export type StatusCategory =
  | "citizenship"
  | "nationality"
  | "immigration"
  | "domicile"
  | "tribal"
  | "capacity"
  | "entity"
  | "property_financial";

export interface AuthoritySource {
  label: string;
  citation: string;
  url: string;
  sourceType: "constitution" | "statute" | "agency" | "state_law" | "tribal_law";
}

export interface StatusDefinition {
  id: string;
  label: string;
  aliases?: string[];
  category: StatusCategory;
  recognition: RecognitionLevel;
  summary: string;
  establishment: string[];
  changeMechanisms: string[];
  consequenceNotes: string[];
  authorities: AuthoritySource[];
  caution?: string;
}

export interface StatusChangeWorkflow {
  id: string;
  title: string;
  from: string;
  to: string;
  authorityClass: "federal" | "state" | "court" | "private_instrument" | "tribal" | "fact_pattern";
  summary: string;
  prerequisites: string[];
  steps: string[];
  evidence: string[];
  irreversibleOrHighConsequence?: boolean;
}

export interface StatusClaimInput {
  statusId: string;
  claimedConsequence?: string;
  matterContext?: string;
}

export interface StatusClaimAnalysis {
  status: StatusDefinition;
  recognitionLabel: string;
  canBeChangedByDeclarationAlone: boolean;
  consequenceNeedsSeparateAuthority: boolean;
  questions: string[];
  warnings: string[];
}
