# FairProcess Demo Narrative

## The One-Sentence Pitch
FairProcess automatically detects when government agencies skip required due-process steps — and builds the evidence case to prove it.

## The Demo Case: 2026 Kneeland Cannabis Abatement

**The Story:**
A property owner in rural Humboldt County had three unpermitted greenhouse structures. On July 10, 2026, the county posted a Notice of Violation giving them 10 days to comply. Three days later — before the compliance window expired — county contractors demolished the structures. No hearing was ever held. The owner was never told they could appeal.

**What FairProcess Caught:**

| Finding | Severity | What Happened |
|---------|----------|---------------|
| Abatement Without Proper Notice Period | 🔴 Critical | Abated 3 days after notice; 10-day compliance window was still open |
| Adverse Action Without Hearing | 🔴 Critical | Structures demolished with zero hearing — pre- or post-deprivation |
| Missing Appeal Rights Notice | 🟡 Warning | No mention of appeal/review rights in any document |
| Abatement Before Compliance Window | 🟡 Warning | Action taken before the notice's own compliance deadline |

**Due Process Score: 50/100** (−50 from two critical findings)

## Demo Walkthrough (5 minutes)

1. **Map Home** — Click on the Kneeland Rd parcel in Humboldt County. Popup shows APN, zoning (Agriculture Exclusive), acreage (38.5). Click "Open as Project."

2. **Project Overview** — Score ring shows 50/100. Critical findings badge: 2. Recent timeline shows the sequence: Notice → Abatement → Owner report → Deadline passed.

3. **Timeline Panel** — Walk through the chronology. The timeline makes the violation obvious: 3-day gap between notice and abatement, no hearing event, no appeal event.

4. **Due Process Discrepancies** — This is the money slide. Four findings with severity colors, each linking to the specific evidence document that triggered it. Status: all open.

5. **Evidence Vault** — Three documents: the Notice of Violation, the County Abatement Report, and the owner's email. Each links back to the timeline events and findings it supports.

6. **Investigation View** (if available) — Click "Investigate" to see the relationship graph. Case node → Property → Code Enforcement Case → Evidence + Findings. Shows the causal chain visually.

## Why This Demo Works

- **Real violation pattern** — This exact scenario (abatement before compliance window, no hearing) is documented in multiple California property rights cases.
- **The analyzer does the work** — No manual legal analysis needed. The rules engine catches all four findings automatically from the timeline events and evidence.
- **Evidence-backed** — Every finding links to the specific document. This isn't opinion — it's documented procedural failure.
- **Sellable to attorneys** — A property rights attorney could take this output directly to a hearing or lawsuit.

## Target Customer Reactions

**Property rights attorney:** "This saves me 20 hours of timeline reconstruction per case. The findings report is basically a draft of my due-process claim."

**Advocacy org:** "We could run this on every code enforcement action in the county and find patterns of systemic violations."

**Government watchdog:** "This is an audit tool. Every jurisdiction should be running this on their own processes."
