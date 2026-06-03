import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { MemoryType } from '@prisma/client';

/**
 * Extract plain text from an uploaded buffer based on its mime type / filename.
 * Supports PDF, DOCX, and plain text / markdown.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<string> {
  const lower = fileName.toLowerCase();

  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return result.text.trim();
    } finally {
      await parser.destroy();
    }
  }

  if (
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  // txt, md, csv, json, and other text formats.
  return buffer.toString('utf8').trim();
}

const EPISODIC_TAGS = new Set([
  'past_performance',
  'past_campaign',
  'campaign_report',
  'past_decisions',
]);
const PROCEDURAL_TAGS = new Set([
  'playbook',
  'marketing_playbook',
  'workflow',
  'successful_workflow',
]);

/**
 * Maps content tags to a memory type:
 *  - episodic   → past campaigns / runs / decisions
 *  - procedural → repeatable workflows / playbooks
 *  - semantic   → brand voice, compliance rules, audience knowledge (default)
 */
export function memoryTypeForTags(tags: string[]): MemoryType {
  if (tags.some((t) => EPISODIC_TAGS.has(t))) return MemoryType.episodic;
  if (tags.some((t) => PROCEDURAL_TAGS.has(t))) return MemoryType.procedural;
  return MemoryType.semantic;
}
