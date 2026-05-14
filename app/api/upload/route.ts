import { NextResponse } from 'next/server';
import { generateEmbedding } from '@/app/utils/embeddings';

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Prevent worker issues
pdfjsLib.GlobalWorkerOptions.workerSrc =
  new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

// -----------------------------
// CLEAN TEXT
// -----------------------------
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
}

// -----------------------------
// SPLIT INTO CHUNKS
// -----------------------------
function splitIntoChunks(
  text: string,
  chunkSize = 500
): string[] {

  const words = text.split(' ');

  const chunks: string[] = [];

  for (
    let i = 0;
    i < words.length;
    i += chunkSize
  ) {

    const chunk = words
      .slice(i, i + chunkSize)
      .join(' ')
      .trim();

    if (chunk.length > 50) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

// -----------------------------
// EXTRACT PDF TEXT
// -----------------------------
async function extractTextFromPDF(
  buffer: Buffer
): Promise<string> {

  const uint8Array =
    new Uint8Array(buffer);

  const pdf =
    await pdfjsLib.getDocument({
      data: uint8Array,
    }).promise;

  let fullText = '';

  for (
    let pageNum = 1;
    pageNum <= pdf.numPages;
    pageNum++
  ) {

    const page =
      await pdf.getPage(pageNum);

    const textContent =
      await page.getTextContent();

    const pageText =
      textContent.items
        .map((item: any) => item.str)
        .join(' ');

    fullText += '\n' + pageText;
  }

  return cleanText(fullText);
}

// -----------------------------
// API ROUTE
// -----------------------------
export async function POST(
  request: Request
): Promise<Response> {

  try {

    // -----------------------------
    // GET FORM DATA
    // -----------------------------
    const formData =
      await request.formData();

    const file =
      formData.get('file') as File | null;

    // -----------------------------
    // VALIDATE FILE
    // -----------------------------
    if (!file) {

      return NextResponse.json(
        {
          error: 'No PDF uploaded',
        },
        {
          status: 400,
        }
      );
    }

    if (
      file.type !== 'application/pdf'
    ) {

      return NextResponse.json(
        {
          error:
            'Only PDF files are allowed',
        },
        {
          status: 400,
        }
      );
    }

    // -----------------------------
    // FILE TO BUFFER
    // -----------------------------
    const arrayBuffer =
      await file.arrayBuffer();

    const buffer =
      Buffer.from(arrayBuffer);

    // -----------------------------
    // EXTRACT TEXT
    // -----------------------------
    const extractedText =
      await extractTextFromPDF(
        buffer
      );

    if (
      !extractedText ||
      extractedText.length < 20
    ) {

      return NextResponse.json(
        {
          error:
            'Could not extract text from PDF',
        },
        {
          status: 400,
        }
      );
    }

    // -----------------------------
    // CHUNKING
    // -----------------------------
    const chunks =
      splitIntoChunks(
        extractedText,
        500
      );

    // -----------------------------
    // EMBEDDINGS
    // -----------------------------
    const documentVectors =
      await Promise.all(

        chunks.map(
          async (chunk) => {

            const embedding =
              await generateEmbedding(
                chunk
              );

            return {
              text: chunk,
              embedding,
            };
          }
        )
      );

    // -----------------------------
    // RESPONSE
    // -----------------------------
    return NextResponse.json({
      success: true,

      totalChunks:
        documentVectors.length,

      documentVectors,
    });

  } catch (error: any) {

    console.error(
      'Upload error:',
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          'Failed to process PDF',
      },
      {
        status: 500,
      }
    );
  }
}