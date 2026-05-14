import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { generateEmbedding } from '@/app/utils/embeddings';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

// -----------------------------
// COSINE SIMILARITY
// -----------------------------
function cosineSimilarity(vecA: number[], vecB: number[]) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// -----------------------------
// CLEAN TEXT
// -----------------------------
function cleanText(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
}

// -----------------------------
// LIMIT CHUNK SIZE
// Prevents massive token usage
// -----------------------------
function trimChunk(text: string, maxChars = 1200) {
  const cleaned = cleanText(text);

  if (cleaned.length <= maxChars) {
    return cleaned;
  }

  return cleaned.slice(0, maxChars) + '...';
}

export async function POST(request: Request) {
  try {
    // -----------------------------
    // 1. GET REQUEST BODY
    // -----------------------------
    const body = await request.json();

    const question = body.question;
    const documentVectors = body.documentVectors;

    // -----------------------------
    // 2. VALIDATION
    // -----------------------------
    if (!question || typeof question !== 'string') {
      return NextResponse.json(
        { error: 'Question is required' },
        { status: 400 }
      );
    }

    if (
      !documentVectors ||
      !Array.isArray(documentVectors) ||
      documentVectors.length === 0
    ) {
      return NextResponse.json(
        { error: 'Document vectors are required' },
        { status: 400 }
      );
    }

    // -----------------------------
    // 3. GENERATE QUESTION EMBEDDING
    // -----------------------------
    const questionEmbedding = await generateEmbedding(question);

    // -----------------------------
    // 4. SCORE DOCUMENT CHUNKS
    // -----------------------------
    const scoredChunks = documentVectors
      .filter(
        (doc: any) =>
          doc &&
          typeof doc.text === 'string' &&
          Array.isArray(doc.embedding)
      )
      .map((doc: any) => {
        const score = cosineSimilarity(
          questionEmbedding,
          doc.embedding
        );

        return {
          text: trimChunk(doc.text),
          score,
        };
      });

    // -----------------------------
    // 5. SORT BY BEST MATCH
    // -----------------------------
    scoredChunks.sort((a, b) => b.score - a.score);

    // -----------------------------
    // 6. TAKE TOP RELEVANT CHUNKS
    // -----------------------------
    const topMatches = scoredChunks.slice(0, 3);

    // -----------------------------
    // 7. BUILD CONTEXT
    // -----------------------------
    const topChunks = topMatches
      .map(
        (chunk, index) =>
          `Chunk ${index + 1}:\n${chunk.text}`
      )
      .join('\n\n');

    if (!topChunks) {
      return NextResponse.json(
        { error: 'No relevant content found' },
        { status: 400 }
      );
    }

    // -----------------------------
    // 8. SYSTEM PROMPT
    // -----------------------------
    const systemPrompt = `
You are a strict AI document assistant.

You MUST answer ONLY from the provided document chunks.

Rules:
- Do not make up information
- Do not use outside knowledge
- Keep answers concise and accurate
- If answer is missing, reply exactly with:
"I'm sorry, but I cannot find the answer to that in the provided document."

DOCUMENT CHUNKS:
${topChunks}
`;

    // -----------------------------
    // 9. SEND TO OPENROUTER
    // -----------------------------
    const completion = await openai.chat.completions.create({
      model: 'openai/gpt-4.1-mini',

      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: question,
        },
      ],

      max_tokens: 500,
      temperature: 0.2,
    });

    // -----------------------------
    // 10. SAFE RESPONSE EXTRACTION
    // -----------------------------
    const answer =
      completion.choices?.[0]?.message?.content?.trim() ||
      'No response generated';

    // -----------------------------
    // 11. SEND SMALL SOURCE PREVIEW
    // Hidden issue fixed:
    // Don't send giant chunks back
    // -----------------------------
    const sourcePreview = topMatches.map((chunk, index) => ({
      chunk: index + 1,
      score: Number(chunk.score.toFixed(4)),
      preview: chunk.text.slice(0, 200) + '...',
    }));

    return NextResponse.json({
      answer,
      sources: sourcePreview,
    });

  } catch (error: any) {
    console.error('Chat error:', error);

    // OpenRouter specific errors
    if (error?.status === 402) {
      return NextResponse.json(
        {
          error:
            'OpenRouter credits exhausted or token limit exceeded',
        },
        { status: 402 }
      );
    }

    return NextResponse.json(
      {
        error:
          error?.message || 'Failed to generate response',
      },
      { status: 500 }
    );
  }
}