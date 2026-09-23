import type { StatusChangeWorkflow, StatusDefinition } from "./types";

const constitution14 = {
  label: "U.S. Constitution, Amendment XIV, § 1",
  citation: "U.S. Const. amend. XIV, § 1",
  url: "https://constitution.congress.gov/constitution/amendment-14/",
  sourceType: "constitution" as const,
};

const ina101 = {
  label: "Immigration and Nationality Act § 101(a)(22)",
  citation: "8 U.S.C. § 1101(a)(22)",
  url: "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title8-section1101",
  sourceType: "statute" as const,
};

const ina301 = {
  label: "Nationals and citizens at birth",
  citation: "8 U.S.C. § 1401",
  url: "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1401%20edition:prelim)",
  sourceType: "statute" as const,
};

const ina308 = {
  label: "Nationals but not citizens at birth",
  citation: "8 U.S.C. § 1408",
  url: "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1408%20edition:prelim)",
  sourceType: "statute" as const,
};

const ina349 = {
  label: "Loss of nationality by voluntary act with intent",
  citation: "8 U.S.C. § 1481",
  url: "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1481%20edition:prelim)",
  sourceType: "statute" as const,
};

export const STATUS_CATALOG: StatusDefinition[] = [
  {
    id: "us-citizen",
    label: "U.S. citizen",
    aliases: ["citizen of the United States", "United States citizen"],
    category: "citizenship",
    recognition: "recognized_status",
    summary: "A citizenship status recognized by the Constitution and federal nationality law.",
    establishment: [
      "Citizenship at birth when the governing constitutional and statutory requirements are met.",
      "Naturalization under federal law.",
      "Derivative or acquired citizenship in qualifying circumstances.",
    ],
    changeMechanisms: [
      "Naturalization can establish citizenship for eligible non-citizens.",
      "Loss of nationality requires a legally recognized expatriating act performed voluntarily with the required intent.",
    ],
    consequenceNotes: [
      "Citizenship can affect voting, eligibility for certain public offices, passports, immigration sponsorship, and other rights or duties.",
      "Citizenship alone does not answer every jurisdiction question in a particular case.",
    ],
    authorities: [constitution14, ina301, ina349],
  },
  {
    id: "us-national",
    label: "U.S. national",
    category: "nationality",
    recognition: "recognized_status",
    summary: "Federal law defines a U.S. national to include U.S. citizens and certain persons who owe permanent allegiance to the United States.",
    establishment: [
      "U.S. citizenship includes U.S. nationality.",
      "Federal statutes also recognize a narrower category of nationals who are not citizens.",
    ],
    changeMechanisms: [
      "Depends on the person's existing nationality and citizenship facts.",
      "A label or affidavit alone does not create statutory U.S. nationality.",
    ],
    consequenceNotes: [
      "The distinction between citizen-national and non-citizen national matters in limited statutory contexts.",
    ],
    authorities: [ina101, ina301, ina308],
  },
  {
    id: "noncitizen-us-national",
    label: "Non-citizen U.S. national",
    aliases: ["national but not citizen"],
    category: "nationality",
    recognition: "recognized_status",
    summary: "A narrow federal nationality category created by statute; it is not a general alternative status available to any state resident by declaration.",
    establishment: [
      "Facts must fit a federal statute such as 8 U.S.C. § 1408 or another applicable enactment.",
      "Modern examples principally involve American Samoa and Swains Island, subject to statutory details.",
    ],
    changeMechanisms: [
      "A person who already qualifies may document the status through the processes recognized by the Department of State.",
      "Eligibility is statutory; a private declaration does not create it.",
    ],
    consequenceNotes: [
      "A non-citizen national may hold a U.S. passport identifying nationality while not possessing every right attached to U.S. citizenship.",
    ],
    authorities: [
      ina308,
      {
        label: "State Department — Certificates of Non-Citizen Nationality",
        citation: "U.S. Department of State guidance",
        url: "https://travel.state.gov/content/travel/en/legal/travel-legal-considerations/us-citizenship/Certificates-Non-Citizen-Nationality.html",
        sourceType: "agency",
      },
    ],
  },
  {
    id: "california-state-citizen",
    label: "California citizen",
    aliases: ["citizen of California", "California state citizen"],
    category: "citizenship",
    recognition: "recognized_status",
    summary: "State citizenship is a recognized legal concept. The Fourteenth Amendment provides that qualifying U.S. citizens are also citizens of the state in which they reside.",
    establishment: [
      "For Fourteenth Amendment citizenship, state citizenship follows residence in the state under the constitutional text.",
      "For particular doctrines such as diversity jurisdiction, courts commonly analyze domicile rather than a self-selected label.",
    ],
    changeMechanisms: [
      "Changing domicile can change state citizenship for legal doctrines that use domicile.",
      "The exact test depends on the legal context.",
    ],
    consequenceNotes: [
      "State citizenship is not ordinarily an alternative to U.S. citizenship for a person who is a U.S. citizen.",
      "Its relevance depends on the specific issue, such as diversity jurisdiction or state political rights.",
    ],
    authorities: [constitution14],
  },
  {
    id: "california-state-national",
    label: "California State National",
    aliases: ["American State National", "state national"],
    category: "nationality",
    recognition: "asserted_term",
    summary: "This phrase is used in some private political-status materials, but it is not an independently defined federal nationality category merely because a person was born or domiciled in California.",
    establishment: [
      "FairProcess should first identify what recognized status the person actually means: California citizenship, California domicile, U.S. nationality, non-citizen U.S. nationality, or another category.",
      "Any claimed legal consequence must be tested against primary authority separately.",
    ],
    changeMechanisms: [
      "No general federal procedure was identified by which a California resident converts U.S. citizenship into a distinct 'California State National' status through an affidavit or declaration.",
    ],
    consequenceNotes: [
      "The label should not automatically be used to infer immunity from taxes, courts, licensing rules, criminal law, or administrative jurisdiction.",
      "A claimed consequence requires its own constitutional, statutory, regulatory, treaty, or case-law basis.",
    ],
    authorities: [constitution14, ina101, ina308],
    caution: "Treat this as asserted terminology unless a specific governing authority defines it for the matter being analyzed.",
  },
  {
    id: "lawful-permanent-resident",
    label: "Lawful permanent resident",
    aliases: ["LPR", "green card holder"],
    category: "immigration",
    recognition: "recognized_status",
    summary: "A federal immigration status authorizing permanent residence in the United States, subject to immigration law.",
    establishment: [
      "Granted through an immigration process authorized by federal law.",
    ],
    changeMechanisms: [
      "Eligible permanent residents may pursue naturalization.",
      "Status can also be lost or abandoned under governing immigration law.",
    ],
    consequenceNotes: [
      "Immigration status affects admission, removal, work authorization, naturalization eligibility, and related federal rights and duties.",
    ],
    authorities: [
      {
        label: "USCIS — Naturalization",
        citation: "USCIS naturalization guidance",
        url: "https://www.uscis.gov/n-400",
        sourceType: "agency",
      },
    ],
  },
  {
    id: "domiciliary",
    label: "State domiciliary",
    category: "domicile",
    recognition: "context_dependent",
    summary: "Domicile is a legally significant relationship to a place, commonly involving physical presence plus intent to make it one's home.",
    establishment: [
      "Usually established from facts rather than a single document.",
      "Evidence can include residence, voter registration, licensing, taxes, property, family ties, and statements of intent, depending on the legal context.",
    ],
    changeMechanisms: [
      "Move to a new place and form the legally required intent to make it home; the exact test depends on the doctrine involved.",
    ],
    consequenceNotes: [
      "Domicile can affect state citizenship for diversity jurisdiction, tax residence, probate, family law, and other doctrines.",
    ],
    authorities: [
      {
        label: "Constitution Annotated — Diversity Jurisdiction",
        citation: "U.S. Const. art. III, § 2 analysis",
        url: "https://constitution.congress.gov/browse/essay/artIII-S2-C1-6-1/ALDE_00001287/",
        sourceType: "constitution",
      },
    ],
  },
  {
    id: "tribal-citizen",
    label: "Tribal citizen or member",
    category: "tribal",
    recognition: "recognized_status",
    summary: "Citizenship or membership in a federally recognized tribe is governed primarily by the law of the tribe itself, subject to applicable federal law.",
    establishment: [
      "Determined under the enrollment or citizenship rules of the relevant tribe.",
    ],
    changeMechanisms: [
      "Apply or otherwise proceed under the specific tribe's citizenship or enrollment law.",
    ],
    consequenceNotes: [
      "Tribal citizenship can affect political rights within the tribe and may matter in federal Indian law contexts.",
    ],
    authorities: [
      {
        label: "Bureau of Indian Affairs — Tribal Enrollment",
        citation: "BIA guidance",
        url: "https://www.bia.gov/guide/tracing-american-indian-and-alaska-native-aian-ancestry",
        sourceType: "agency",
      },
    ],
  },
  {
    id: "trustee",
    label: "Trustee",
    category: "capacity",
    recognition: "recognized_capacity",
    summary: "Trustee is a fiduciary capacity, not a nationality or citizenship status.",
    establishment: [
      "A valid trust instrument and appointment, acceptance, succession, or court order as applicable.",
    ],
    changeMechanisms: [
      "Appointment, acceptance, resignation, removal, succession, or court order under governing trust law.",
    ],
    consequenceNotes: [
      "Authority depends on the trust instrument and governing law.",
      "Acting as trustee does not change the individual's citizenship or nationality.",
    ],
    authorities: [],
  },
  {
    id: "executor",
    label: "Executor or personal representative",
    category: "capacity",
    recognition: "recognized_capacity",
    summary: "A probate fiduciary capacity arising from a will and/or court appointment, depending on the jurisdiction.",
    establishment: [
      "Probate appointment and issuance of the relevant court authority where required.",
    ],
    changeMechanisms: [
      "Appointment, resignation, removal, substitution, or closure of the estate.",
    ],
    consequenceNotes: [
      "Authority is limited to the estate and governing probate law.",
    ],
    authorities: [],
  },
  {
    id: "attorney-in-fact",
    label: "Attorney-in-fact",
    aliases: ["agent under power of attorney"],
    category: "capacity",
    recognition: "recognized_capacity",
    summary: "A representative capacity created by a valid power of attorney.",
    establishment: [
      "Execution and effectiveness of a valid power of attorney under governing law.",
    ],
    changeMechanisms: [
      "Execution, revocation, expiration, incapacity rules, or termination under governing law.",
    ],
    consequenceNotes: [
      "The agent's powers are only those granted by the instrument and law.",
    ],
    authorities: [],
  },
  {
    id: "corporate-officer",
    label: "Corporate or LLC officer/manager",
    category: "capacity",
    recognition: "recognized_capacity",
    summary: "An organizational role that can carry authority to act for an entity.",
    establishment: [
      "Entity governing documents, resolutions, statutes, or other valid appointment mechanisms.",
    ],
    changeMechanisms: [
      "Appointment, election, removal, resignation, or organizational action.",
    ],
    consequenceNotes: [
      "Authority to bind the entity depends on governing law and the entity's documents.",
    ],
    authorities: [],
  },
];

export const STATUS_CHANGE_WORKFLOWS: StatusChangeWorkflow[] = [
  {
    id: "naturalization",
    title: "Naturalization",
    from: "Eligible non-citizen, commonly a lawful permanent resident",
    to: "U.S. citizen",
    authorityClass: "federal",
    summary: "Determine eligibility, assemble evidence, file the governing naturalization application, complete required processing, and take the oath if approved.",
    prerequisites: [
      "A statutory basis for naturalization.",
      "Residence, physical-presence, character, English/civics, and other requirements as applicable.",
    ],
    steps: [
      "Identify the naturalization basis.",
      "Run eligibility and disqualifier checks.",
      "Collect identity, residence, travel, tax, family, and immigration evidence.",
      "Prepare and file the application.",
      "Complete biometrics if requested.",
      "Attend interview and testing unless exempt.",
      "If approved, complete the oath process.",
    ],
    evidence: ["Immigration records", "Residence/travel history", "Identity records", "Tax and family records when relevant"],
  },
  {
    id: "expatriation",
    title: "Relinquishment or renunciation of U.S. nationality",
    from: "U.S. national",
    to: "Loss of U.S. nationality if statutory requirements are satisfied",
    authorityClass: "federal",
    summary: "Analyze a claimed expatriating act, voluntariness, and intent under 8 U.S.C. § 1481; formal renunciation abroad is one statutory route.",
    prerequisites: [
      "Existing U.S. nationality.",
      "A qualifying statutory act.",
      "Voluntariness and the legally required intent.",
    ],
    steps: [
      "Identify the specific statutory expatriating act.",
      "Document intent and voluntariness.",
      "Evaluate immigration, tax, family, property, and travel consequences before action.",
      "Use the applicable Department of State procedure where required.",
      "Preserve the official determination and supporting record.",
    ],
    evidence: ["Citizenship/nationality records", "Identity documents", "Evidence of intent", "State Department records"],
    irreversibleOrHighConsequence: true,
  },
  {
    id: "change-domicile",
    title: "Change of domicile",
    from: "Domicile in one state",
    to: "Domicile in another state",
    authorityClass: "fact_pattern",
    summary: "Build a documented factual record showing physical presence and the intent required by the legal doctrine at issue.",
    prerequisites: ["Actual relocation or other facts sufficient under the applicable domicile test."],
    steps: [
      "Identify which legal doctrine makes domicile relevant.",
      "Establish physical presence.",
      "Document intent to make the new place home.",
      "Update records that truthfully reflect the change.",
      "Resolve inconsistent evidence from the former domicile.",
    ],
    evidence: ["Housing", "Licenses", "Voting records", "Tax records", "Employment", "Family/community ties"],
  },
  {
    id: "tribal-citizenship",
    title: "Tribal citizenship or enrollment",
    from: "Applicant or descendant",
    to: "Tribal citizen/member if approved",
    authorityClass: "tribal",
    summary: "Follow the citizenship or enrollment law of the specific tribe; eligibility and procedure are tribe-specific.",
    prerequisites: ["Eligibility under the relevant tribe's law."],
    steps: [
      "Identify the correct tribe.",
      "Obtain the tribe's current citizenship/enrollment law.",
      "Build the required lineage and identity evidence.",
      "Submit through the tribe's process.",
      "Use tribal appeal or review procedures if available and necessary.",
    ],
    evidence: ["Vital records", "Lineage records", "Existing tribal records", "Application materials"],
  },
  {
    id: "trustee-capacity",
    title: "Enter or exit trustee capacity",
    from: "Individual",
    to: "Trustee, successor trustee, or former trustee",
    authorityClass: "private_instrument",
    summary: "Determine the governing trust instrument and law, then document appointment/acceptance, succession, resignation, or removal.",
    prerequisites: ["A valid trust relationship and authority for the role change."],
    steps: [
      "Review the trust instrument.",
      "Verify appointment or succession conditions.",
      "Document acceptance if required.",
      "Identify powers, limits, and property actually held in trust.",
      "Record or notify third parties where legally required.",
    ],
    evidence: ["Trust instrument", "Certificates of trust", "Acceptance/resignation documents", "Title and account records"],
  },
  {
    id: "executor-capacity",
    title: "Become estate personal representative",
    from: "Nominee or interested person",
    to: "Court-authorized executor/administrator where required",
    authorityClass: "court",
    summary: "Use the applicable probate procedure to obtain authority to act for an estate.",
    prerequisites: ["A decedent's estate and a basis for appointment."],
    steps: [
      "Identify the correct probate court and procedure.",
      "File the required petition/application.",
      "Provide notices and supporting records.",
      "Obtain appointment and letters or equivalent proof of authority.",
      "Track fiduciary duties and reporting requirements.",
    ],
    evidence: ["Death certificate", "Will if any", "Petition", "Court order", "Letters/testamentary or equivalent"],
  },
];

export function getStatusById(id: string) {
  return STATUS_CATALOG.find((status) => status.id === id);
}
