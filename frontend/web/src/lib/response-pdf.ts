type ResponsePdfInput = {
  title: string;
  recipientName?: string | null;
  recipientCompany?: string | null;
  recipientAddress1?: string | null;
  recipientAddress2?: string | null;
  recipientCity?: string | null;
  recipientState?: string | null;
  recipientPostalCode?: string | null;
  subject?: string | null;
  body: string;
  finalizedAt: string;
};

function ascii(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\n\r\t]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrap(text: string, max = 92): string[] {
  const output: string[] = [];
  for (const paragraph of text.replace(/\r\n/g, "\n").split("\n")) {
    if (!paragraph.trim()) {
      output.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let line = "";
    for (const word of words) {
      if (!line) line = word;
      else if ((line + " " + word).length <= max) line += " " + word;
      else {
        output.push(line);
        line = word;
      }
    }
    if (line) output.push(line);
  }
  return output;
}

function pageContent(lines: string[], pageNumber: number): string {
  const commands = [
    "BT",
    "/F1 10 Tf",
    "54 750 Td",
    "14 TL",
  ];
  lines.forEach((line, index) => {
    if (index > 0) commands.push("T*");
    commands.push(`(${ascii(line)}) Tj`);
  });
  commands.push("ET", "BT", "/F1 8 Tf", "54 35 Td", `(${pageNumber}) Tj`, "ET");
  return commands.join("\n");
}

export function renderResponsePdf(input: ResponsePdfInput): Uint8Array {
  const address = [
    input.recipientName,
    input.recipientCompany,
    input.recipientAddress1,
    input.recipientAddress2,
    [input.recipientCity, input.recipientState, input.recipientPostalCode].filter(Boolean).join(", "),
  ].filter(Boolean) as string[];

  const lines = [
    input.title,
    "",
    ...address,
    "",
    input.subject ? `Re: ${input.subject}` : "",
    `Finalized: ${input.finalizedAt}`,
    "",
    ...wrap(input.body),
  ];

  const pages: string[][] = [];
  const perPage = 46;
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  if (pages.length === 0) pages.push([input.title]);

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const pageRefs: number[] = [];
  const fontRef = 3;
  const firstPageRef = 4;
  let next = firstPageRef;
  for (let i = 0; i < pages.length; i++) {
    pageRefs.push(next);
    next += 2;
  }
  const kids = pageRefs.map((ref) => `${ref} 0 R`).join(" ");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  for (let i = 0; i < pages.length; i++) {
    const pageRef = pageRefs[i];
    const contentRef = pageRef + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontRef} 0 R >> >> /Contents ${contentRef} 0 R >>`);
    const content = pageContent(pages[i], i + 1);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }

  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}
