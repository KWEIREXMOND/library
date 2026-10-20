/** Minimal, dependency-free PDF writer used to generate sample digital resources. */

function sanitize(value: string) {
  return String(value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u2000-\u200B]/g, ' ')
    .replace(/[^\x20-\x7E]/g, '?');
}

function esc(value: string) {
  return sanitize(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrap(text: string, maxChars: number) {
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current.length) current = word;
    else if ((current + ' ' + word).length <= maxChars) current += ' ' + word;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length) lines.push(current);
  return lines.length ? lines : [''];
}

export type PdfOptions = {
  title: string;
  subtitle?: string;
  meta?: string[];
  body?: string[];
  accent?: string;
};

export function makePdf(opts: PdfOptions): Buffer {
  const accent = opts.accent && /^#[0-9a-fA-F]{6}$/.test(opts.accent) ? opts.accent : '#1F4A35';
  const rgb = [
    parseInt(accent.slice(1, 3), 16) / 255,
    parseInt(accent.slice(3, 5), 16) / 255,
    parseInt(accent.slice(5, 7), 16) / 255,
  ].map((v) => v.toFixed(3));

  const bodyLines: string[] = [];
  for (const paragraph of opts.body ?? []) {
    if (!paragraph.trim()) {
      bodyLines.push('');
      continue;
    }
    bodyLines.push(...wrap(paragraph, 88));
    bodyLines.push('');
  }

  const PER_PAGE = 38;
  const chunks: string[][] = [];
  for (let i = 0; i < bodyLines.length; i += PER_PAGE) chunks.push(bodyLines.slice(i, i + PER_PAGE));
  if (!chunks.length) chunks.push(['']);

  const totalPages = chunks.length;
  const pages = chunks.map((lines, index) => {
    const commands: string[] = [];
    if (index === 0) {
      commands.push(`${rgb.join(' ')} rg`);
      commands.push(`BT /F1 22 Tf 56 716 Td (${esc(opts.title)}) Tj ET`);
      let y = 692;
      if (opts.subtitle) {
        commands.push(`0.25 0.32 0.28 rg BT /F2 13 Tf 56 ${y} Td (${esc(opts.subtitle)}) Tj ET`);
        y -= 24;
      }
      for (const meta of opts.meta ?? []) {
        commands.push(`0.42 0.46 0.42 rg BT /F2 10 Tf 56 ${y} Td (${esc(meta)}) Tj ET`);
        y -= 16;
      }
      commands.push(`${rgb.join(' ')} RG 1.2 w 56 ${y - 6} m 539 ${y - 6} l S`);
      y -= 34;
      lines.forEach((line, i) => {
        if (!line) return;
        commands.push(`0.11 0.14 0.12 rg BT /F2 11 Tf 56 ${y - i * 16} Td (${esc(line)}) Tj ET`);
      });
    } else {
      lines.forEach((line, i) => {
        if (!line) return;
        commands.push(`0.11 0.14 0.12 rg BT /F2 11 Tf 56 ${754 - i * 16} Td (${esc(line)}) Tj ET`);
      });
    }
    commands.push(`0.55 0.58 0.55 RG 0.6 w 56 52 m 539 52 l S`);
    commands.push(`0.42 0.46 0.42 rg BT /F2 8.5 Tf 56 38 Td (Tema Secondary Library  |  Libra digital resource centre) Tj ET`);
    commands.push(`0.42 0.46 0.42 rg BT /F2 8.5 Tf 470 38 Td (Page ${index + 1} of ${totalPages}) Tj ET`);
    return commands.join('\n');
  });

  const objects: string[] = [];
  const pageObjectNumbers: number[] = [];
  for (let i = 0; i < totalPages; i++) pageObjectNumbers.push(5 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${totalPages} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  pages.forEach((content, index) => {
    const pageNum = 5 + index * 2;
    const contentNum = pageNum + 1;
    objects[pageNum] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNum} 0 R >>`;
    objects[contentNum] = `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
  });

  const maxObject = objects.length;
  const parts: Buffer[] = [];
  let offset = 0;
  const push = (text: string) => {
    const buf = Buffer.from(text, 'latin1');
    parts.push(buf);
    offset += buf.length;
  };
  push('%PDF-1.4\n');
  const offsets: number[] = [];
  for (let i = 1; i < maxObject; i++) {
    offsets[i] = offset;
    push(`${i} 0 obj\n${objects[i]}\nendobj\n`);
  }
  const xrefStart = offset;
  let xref = `xref\n0 ${maxObject}\n0000000000 65535 f \n`;
  for (let i = 1; i < maxObject; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${maxObject} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);
  return Buffer.concat(parts);
}

/** Build a plausible past-question paper for the demo library. */
export function wasscePaper(subject: string, year: number, paper: string) {
  const questions = [
    `1. (a) State four reasons why ${subject.toLowerCase()} is important to the development of Ghana.`,
    `(b) Explain three challenges associated with the study of ${subject.toLowerCase()} in senior high schools.`,
    `2. Study the passage below and answer the questions that follow.`,
    `   "Education is the most powerful weapon which you can use to change the world."`,
    `(a) Identify the main idea of the passage.`,
    `(b) Suggest two ways the idea can be applied in your school.`,
    `3. (a) Define the term "sustainable development".`,
    `(b) Discuss four ways in which ${subject.toLowerCase()} contributes to sustainable development.`,
    `4. With the aid of a well-labelled diagram, describe the process outlined in the question paper.`,
    `5. Write short notes on ANY TWO of the following:`,
    `   (i) Continuous assessment   (ii) Group work   (iii) Project-based learning   (iv) Peer tutoring`,
  ];
  return {
    body: [
      `SECTION A — OBJECTIVE AND SHORT ANSWER QUESTIONS (40 marks)`,
      `Answer ALL questions in this section.`,
      ...questions,
      `SECTION B — ESSAY QUESTIONS (60 marks)`,
      `Answer TWO questions only. Each question carries 30 marks.`,
      `6. Discuss the role of ${subject.toLowerCase()} in the curriculum of Ghanaian senior high schools.`,
      `7. Compare and contrast two approaches to teaching ${subject.toLowerCase()}, giving examples from your own experience.`,
      `8. Analyse the relationship between ${subject.toLowerCase()} and national development, using at least four examples.`,
      `9. Examine the challenges facing the implementation of the standard-based curriculum in your subject area.`,
      `Suggested answers and a marking scheme are provided with the teacher's copy.`,
      `This is a sample paper prepared for the Libra digital library demonstration.`,
      `Examination: West African Senior School Certificate Examination (WASSCE)`,
      `Subject: ${subject}`,
      `Year: ${year}  |  Paper: ${paper}  |  Duration: 2 hours 30 minutes`,
    ],
  };
}
