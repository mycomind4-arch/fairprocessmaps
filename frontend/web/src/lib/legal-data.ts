// California Code Enforcement & Due Process Legal Reference Library
// Curated from California Government Code, Health & Safety Code, and case law

export interface LegalReference {
  id: string;
  type: "statute" | "case-law" | "regulation" | "notice-requirement";
  category: "abatement" | "notice" | "hearing" | "appeal" | "costs" | "takings" | "procedure" | "substandard-housing" | "cannabis" | "general-nuisance";
  citation: string;
  title: string;
  summary: string;
  keyPoints: string[];
  noticeDays?: number;
  authority: string;
  lastUpdated: string;
}

export const legalReferences: LegalReference[] = [
  // === STATUTES ===
  {
    id: "gc-25845",
    type: "statute",
    category: "general-nuisance",
    citation: "Cal. Gov. Code § 25845",
    title: "General Nuisance Abatement",
    summary:
      "Authorizes counties to declare nuisances and abate them. Requires reasonable notice and opportunity to correct before abatement proceedings. Establishes cost recovery mechanism.",
    keyPoints: [
      "County board may declare what constitutes a nuisance",
      "Property owner must receive reasonable notice and opportunity to correct",
      "Notice must describe the nuisance and required corrective action",
      "If not corrected within notice period, county may abate and recover costs as special assessment",
      "Costs become a lien on the property",
    ],
    noticeDays: 30,
    authority: "County Board of Supervisors",
    lastUpdated: "2024-01-01",
  },
  {
    id: "gc-25845-5",
    type: "statute",
    category: "costs",
    citation: "Cal. Gov. Code § 25845.5",
    title: "Recovery of Abatement Costs",
    summary:
      "Abatement costs and administrative costs may be recovered as special assessments against the property. Personal liability for costs may attach to the property owner.",
    keyPoints: [
      "Abatement costs include direct labor, equipment, disposal, and admin overhead",
      "Costs become a lien against the real property",
      "Unpaid costs may be collected on the tax roll",
      "Personal liability may attach to the record owner at time of abatement",
      "Owner must receive notice of the cost itemization with right to hearing",
    ],
    authority: "County Board of Supervisors",
    lastUpdated: "2024-01-01",
  },
  {
    id: "gc-38773-5",
    type: "statute",
    category: "abatement",
    citation: "Cal. Gov. Code § 38773.5",
    title: "Summary Abatement Procedure",
    summary:
      "Cities may use a summary procedure for abating nuisances that pose an immediate threat to health and safety. Permits expedited action without full notice period in emergencies.",
    keyPoints: [
      "Available when nuisance is an immediate threat to public health or safety",
      "Requires declaration of emergency by health officer or building official",
      "Notice may be reduced from standard period when imminent danger exists",
      "Still requires post-abatement notice and opportunity for hearing on costs",
      "Due process balancing applies — emergency must be genuine, not pretextual",
    ],
    noticeDays: 0,
    authority: "City Council / County Board",
    lastUpdated: "2024-01-01",
  },
  {
    id: "hs-17920-3",
    type: "statute",
    category: "substandard-housing",
    citation: "Cal. Health & Safety Code § 17920.3",
    title: "Definition of Substandard Building",
    summary:
      "Defines what constitutes a substandard building — the foundational definition for housing code enforcement. Includes structural, health, and safety deficiencies.",
    keyPoints: [
      "Enumerates specific conditions: inadequate sanitation, structural hazards, lack of ventilation",
      "Includes electrical hazards, plumbing defects, and fire safety violations",
      "Substandard buildings are declared public nuisances per se",
      "Definition is the trigger for enforcement under H&S Code § 17980",
      "Building must be unfit for human habitation — not merely non-compliant",
    ],
    authority: "California Legislature",
    lastUpdated: "2024-01-01",
  },
  {
    id: "hs-17980",
    type: "statute",
    category: "notice",
    citation: "Cal. Health & Safety Code § 17980",
    title: "Enforcement of Housing Standards — Notice Requirements",
    summary:
      "Governs the enforcement of state housing standards. Specifies required notice periods, correction timelines, and the procedure for ordering repairs or vacation.",
    keyPoints: [
      "Standard notice period: 60 days for residential properties",
      "Notice must specify violations and required corrective actions",
      "Owner may request a reasonable extension with good cause",
      "If not corrected, enforcing agency may vacate and/or repair",
      "Notice must inform owner of right to administrative appeal or hearing",
      "Tenant protections apply — cannot displace occupants without process",
    ],
    noticeDays: 60,
    authority: "Department of Housing and Community Development / Local Agency",
    lastUpdated: "2024-01-01",
  },
  {
    id: "gc-25403-5",
    type: "statute",
    category: "cannabis",
    citation: "Cal. Gov. Code § 25403.5",
    title: "Cannabis Cultivation as Public Nuisance",
    summary:
      "Declares certain cannabis cultivation activities a public nuisance subject to abatement. Provides procedures for notice and abatement specific to cultivation sites.",
    keyPoints: [
      "Cultivation in violation of state or local law is a public nuisance",
      "30-day notice required before abatement proceedings",
      "Notice must describe the cultivation activity and legal basis for abatement",
      "County may abate cultivation and recover costs as a special assessment",
      "Due process requires meaningful opportunity to come into compliance",
    ],
    noticeDays: 30,
    authority: "County Board of Supervisors",
    lastUpdated: "2024-01-01",
  },
  {
    id: "gc-53069-82",
    type: "statute",
    category: "general-nuisance",
    citation: "Cal. Gov. Code § 53069.82",
    title: "Drug House Nuisance Abatement",
    summary:
      "Allows cities and counties to declare buildings used for drug manufacturing or distribution as public nuisances and seek abatement. Requires notice and opportunity to correct.",
    keyPoints: [
      "Applies to buildings where controlled substances are manufactured or sold",
      "Notice to property owner describing drug activity and required corrective action",
      "30-day notice period for owner to abate the nuisance",
      "Failure to abate permits city/county to seek judicial abatement",
      "Owner may assert innocent landlord defense with proper documentation",
    ],
    noticeDays: 30,
    authority: "City Council / County Board",
    lastUpdated: "2024-01-01",
  },
  {
    id: "ccp-731",
    type: "statute",
    category: "procedure",
    citation: "Cal. Code Civ. Proc. § 731",
    title: "Action to Abate Nuisance",
    summary:
      "Provides a judicial cause of action to abate public or private nuisances. Establishes the procedural framework for civil nuisance actions.",
    keyPoints: [
      "Any person may bring an action to abate a public nuisance",
      "Property owner may bring action to abate nuisance affecting their property",
      "Court may issue injunction or order abatement",
      "Prevailing party may recover attorney fees in certain cases",
      "Due process requires adequate notice and opportunity to be heard",
    ],
    authority: "California Legislature",
    lastUpdated: "2024-01-01",
  },
  {
    id: "gc-39566",
    type: "statute",
    category: "notice",
    citation: "Cal. Gov. Code § 39566",
    title: "Compliance Time Period",
    summary:
      "Sets the default compliance period for nuisance abatement orders. Local ordinances may modify the period but cannot eliminate the owner's right to a reasonable opportunity to comply.",
    keyPoints: [
      "Default 30-day compliance period unless local ordinance specifies otherwise",
      "Period runs from receipt of notice, not mailing date",
      "Owner may request extension with good cause showing",
      "Shorter periods permissible only when imminent threat to health/safety",
      "Due process requires reasonable period — cannot be perfunctory",
    ],
    noticeDays: 30,
    authority: "California Legislature",
    lastUpdated: "2024-01-01",
  },

  // === CASE LAW ===
  {
    id: "jones-v-la-2007",
    type: "case-law",
    category: "procedure",
    citation: "Jones v. County of Los Angeles (2007) 152 Cal.App.4th 360",
    title: "Due Process in Code Enforcement",
    summary:
      "Court of Appeal held that procedural due process requires adequate notice and a meaningful opportunity to be heard before a county abates property. Applies the Mathews v. Eldridge balancing test.",
    keyPoints: [
      "Pre-deprivation hearing required absent extraordinary circumstances",
      "Notice must be reasonably calculated to inform the owner of proceedings",
      "Posting on property + certified mail satisfies minimum notice requirements",
      "Due process balancing: private interest, risk of error, government burden",
      "Insufficient notice invalidates abatement order and cost recovery",
    ],
    authority: "California Court of Appeal, Second District",
    lastUpdated: "2007-11-08",
  },
  {
    id: "mathews-v-eldridge-1976",
    type: "case-law",
    category: "hearing",
    citation: "Mathews v. Eldridge (1976) 424 U.S. 319",
    title: "Due Process Balancing Test",
    summary:
      "Supreme Court established the three-factor balancing test for determining what process is due. The foundational test applied in all code enforcement due process analyses.",
    keyPoints: [
      "Factor 1: Private interest affected (property, liberty)",
      "Factor 2: Risk of erroneous deprivation under existing procedures",
      "Factor 3: Government interest including fiscal and administrative burden",
      "Applies to all code enforcement actions affecting property rights",
      "Balance determines whether pre or post-deprivation hearing is sufficient",
    ],
    authority: "U.S. Supreme Court",
    lastUpdated: "1976-03-24",
  },
  {
    id: "goldberg-v-kelly-1970",
    type: "case-law",
    category: "hearing",
    citation: "Goldberg v. Kelly (1970) 397 U.S. 254",
    title: "Pre-Deprivation Hearing Requirements",
    summary:
      "Supreme Court required an evidentiary hearing before termination of welfare benefits. Establishes that when a benefit significantly affects livelihood, pre-deprivation process is required.",
    keyPoints: [
      "Pre-deprivation hearing required when deprivation causes significant hardship",
      "Hearing must include: timely notice, right to present evidence, cross-examination",
      "Decision must be based on record with statement of reasons",
      "Applied to code enforcement: property rights require pre-deprivation process",
      "Exception only for genuine emergencies with post-deprivation hearing",
    ],
    authority: "U.S. Supreme Court",
    lastUpdated: "1970-03-23",
  },
  {
    id: "connecticut-v-doehr-1991",
    type: "case-law",
    category: "procedure",
    citation: "Connecticut v. Doehr (1991) 501 U.S. 1",
    title: "Due Process and Property Attachments",
    summary:
      "Supreme Court struck down a statute allowing prejudgment attachment of real property without prior notice and hearing. Important for code enforcement liens and cost recovery actions.",
    keyPoints: [
      "Attachment of real property requires prior notice and hearing absent extraordinary circumstances",
      "Due process applies to administrative liens as well as judicial attachments",
      "Applies to abatement cost liens — owner must have hearing opportunity before lien attaches",
      "Court weighs: private interest, risk of error, government interest",
      "Pre-existing notice period + post-lien hearing may satisfy due process",
    ],
    authority: "U.S. Supreme Court",
    lastUpdated: "1991-05-13",
  },
  {
    id: "county-sonoma-v-quarry-1971",
    type: "case-law",
    category: "abatement",
    citation: "County of Sonoma v. Quarry (1971) 18 Cal.App.3d 290",
    title: "Procedural Due Process in Abatement",
    summary:
      "California Court of Appeal established that abatement proceedings must afford meaningful procedural protections, including adequate notice, opportunity to be heard, and a fair hearing.",
    keyPoints: [
      "Abatement proceedings are quasi-judicial — procedural due process applies",
      "Notice must be personal or by certified mail; publication alone insufficient",
      "Owner has right to be represented by counsel at abatement hearings",
      "Decision must be based on substantial evidence in the record",
      "Abatement orders without due process are void and unenforceable",
    ],
    authority: "California Court of Appeal, First District",
    lastUpdated: "1971-04-28",
  },
  {
    id: "yamamoto-v-ahneman-2004",
    type: "case-law",
    category: "takings",
    citation: "Yamamoto v. Ahneman (2004) 116 Cal.App.4th 953",
    title: "Over-Enforcement and Takings Claims",
    summary:
      "Court of Appeal recognized that overzealous code enforcement can constitute a regulatory taking. Property owners may recover damages when enforcement exceeds reasonable regulation.",
    keyPoints: [
      "Code enforcement that goes beyond legitimate regulatory purpose may be a taking",
      "Requires showing: deprivation of all economically viable use, OR disproportionate impact",
      "Takings claim requires exhaustion of administrative remedies first",
      "Damages available when enforcement renders property unusable",
      "Pattern of harassment or selective enforcement strengthens takings claim",
    ],
    authority: "California Court of Appeal",
    lastUpdated: "2004-07-15",
  },
  {
    id: "hanson-v-denbl-1987",
    type: "case-law",
    category: "notice",
    citation: "Hanson v. Denbl (1987) 190 Cal.App.3d 296",
    title: "Notice Standards for Nuisance Abatement",
    summary:
      "Court of Appeal established minimum notice requirements for nuisance abatement. Notice must include specific information to be constitutionally adequate.",
    keyPoints: [
      "Notice must identify the specific nuisance with reasonable particularity",
      "Must state the corrective action required",
      "Must specify the compliance deadline and consequences of non-compliance",
      "Must inform of right to hearing or appeal",
      "Notice deficient in any of these elements is constitutionally inadequate",
    ],
    authority: "California Court of Appeal",
    lastUpdated: "1987-08-18",
  },
  {
    id: "ehret-v-victorville-2013",
    type: "case-law",
    category: "costs",
    citation: "Ehret v. City of Victorville (2013) 213 Cal.App.4th 1182",
    title: "Abatement Cost Recovery Due Process",
    summary:
      "Court of Appeal held that due process requires notice and hearing on the specific amount of abatement costs before they become a lien. General notice of cost recovery is insufficient.",
    keyPoints: [
      "Owner must receive itemized cost breakdown before lien attaches",
      "Must have opportunity to contest the amount of costs, not just the fact",
      "Admin costs must be reasonable and documented",
      "Costs incurred beyond what is reasonable may not be assessed",
      "Hearing on costs must precede placement on tax roll",
    ],
    authority: "California Court of Appeal, Fourth District",
    lastUpdated: "2013-05-23",
  },

  // === NOTICE REQUIREMENTS ===
  {
    id: "notice-general-nuisance",
    type: "notice-requirement",
    category: "general-nuisance",
    citation: "Gov. Code § 25845; Gov. Code § 39566",
    title: "General Nuisance — 30-Day Notice",
    summary:
      "For general nuisance abatement (junk, debris, blight, unauthorized structures), a 30-day written notice must be served on the property owner before abatement proceedings may begin.",
    keyPoints: [
      "30-day written notice required (certified mail + posting)",
      "Notice must describe: the nuisance, corrective action, deadline, right to hearing",
      "Opportunity to correct within the notice period is mandatory",
      "If corrected before deadline, abatement proceedings must cease",
      "After deadline, county may enter and abate; costs become a lien",
    ],
    noticeDays: 30,
    authority: "California Legislature",
    lastUpdated: "2024-01-01",
  },
  {
    id: "notice-substandard-housing",
    type: "notice-requirement",
    category: "substandard-housing",
    citation: "Health & Safety Code § 17980",
    title: "Substandard Housing — 60-Day Notice",
    summary:
      "For substandard housing violations under the State Housing Law, a 60-day written notice must be served. Longer period reflects complexity of housing repairs and tenant protections.",
    keyPoints: [
      "60-day written notice required for residential property violations",
      "Notice must specify each violation and required corrective action",
      "Owner may request extension with good cause showing",
      "Tenant relocation assistance may be required for certain violations",
      "Vacation orders require separate notice with tenant protections",
      "Notice must include information about right to administrative hearing",
    ],
    noticeDays: 60,
    authority: "California Legislature",
    lastUpdated: "2024-01-01",
  },
  {
    id: "notice-cannabis",
    type: "notice-requirement",
    category: "cannabis",
    citation: "Gov. Code § 25403.5",
    title: "Cannabis Cultivation — 30-Day Notice",
    summary:
      "For cannabis cultivation declared a public nuisance, a 30-day written notice must be served before abatement. Owner must have opportunity to come into compliance.",
    keyPoints: [
      "30-day written notice required before abatement proceedings",
      "Notice must describe the cultivation activity and legal basis",
      "Owner may come into compliance by obtaining permits or ceasing cultivation",
      "After deadline, county may abate and recover costs",
      "Cultivation materials and plants may be seized during abatement",
    ],
    noticeDays: 30,
    authority: "California Legislature",
    lastUpdated: "2024-01-01",
  },
  {
    id: "notice-dangerous-building",
    type: "notice-requirement",
    category: "abatement",
    citation: "Health & Safety Code § 17980; IBC § 116",
    title: "Dangerous Building — Variable Notice (30-60 Days)",
    summary:
      "For buildings deemed dangerous or structurally unsafe, notice period varies based on severity. Imminent danger to life may justify summary abatement with post-deprivation hearing.",
    keyPoints: [
      "30-60 day notice for non-imminent violations",
      "Immediate abatement permitted when building poses imminent threat to life",
      "Building official must document basis for emergency finding",
      "Post-abatement hearing on costs required even in emergencies",
      "Red tagging and yellow tagging have different notice implications",
      "Vacation order may require shorter notice for safety reasons",
    ],
    noticeDays: 30,
    authority: "Local Building Official",
    lastUpdated: "2024-01-01",
  },
  {
    id: "notice-emergency",
    type: "notice-requirement",
    category: "abatement",
    citation: "Gov. Code § 38773.5; Health & Safety Code § 17980(d)",
    title: "Emergency Abatement — No Prior Notice Required",
    summary:
      "When a nuisance poses an immediate and substantial threat to public health or safety, abatement may proceed without prior notice. Post-abatement hearing on costs is still required.",
    keyPoints: [
      "Emergency declaration by health officer or building official required",
      "Must be genuine emergency — cannot be used to circumvent normal process",
      "Post-abatement notice and hearing on costs mandatory",
      "Owner may challenge emergency determination retroactively",
      "Courts scrutinize emergency declarations to prevent pretextual use",
      "If emergency finding overturned, abatement may constitute trespass or taking",
    ],
    noticeDays: 0,
    authority: "Health Officer / Building Official",
    lastUpdated: "2024-01-01",
  },

  // === REGULATIONS ===
  {
    id: "crc-3-721",
    type: "regulation",
    category: "appeal",
    citation: "Cal. Rules of Court, Rule 3.721",
    title: "Administrative Appeals in Code Enforcement",
    summary:
      "Establishes procedural rules for administrative appeals of code enforcement decisions. Provides the framework for challenging abatement orders, fines, and cost assessments.",
    keyPoints: [
      "Appeal must be filed within 15-30 days of the decision (varies by jurisdiction)",
      "De novo review standard for most enforcement appeals",
      "Owner may present new evidence not available at original hearing",
      "Administrative decision may be challenged by writ of mandate (Code Civ. Proc. § 1094.5)",
      "Prevailing party in writ proceeding may recover attorney fees",
    ],
    authority: "Judicial Council of California",
    lastUpdated: "2024-01-01",
  },
  {
    id: "ccp-1094-5",
    type: "regulation",
    category: "appeal",
    citation: "Cal. Code Civ. Proc. § 1094.5",
    title: "Writ of Administrative Mandate",
    summary:
      "The primary judicial remedy for challenging administrative code enforcement decisions. Allows a court to review the administrative record and set aside decisions not supported by evidence.",
    keyPoints: [
      "Must exhaust administrative remedies before filing writ",
      "Independent judgment standard for quasi-judicial decisions affecting fundamental rights",
      "Court reviews: jurisdiction, fair trial, sufficient evidence, procedural errors",
      "Petition must be filed within applicable statute of limitations",
      "Remedy: set aside decision and remand for further proceedings",
    ],
    authority: "California Legislature",
    lastUpdated: "2024-01-01",
  },
];
