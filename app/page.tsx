'use client';

import { useState } from 'react';

export default function Home() {

  // -----------------------------
  // STATES
  // -----------------------------
  const [file, setFile] =
    useState<File | null>(null);

  const [
    documentVectors,
    setDocumentVectors,
  ] = useState<any[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [question, setQuestion] =
    useState('');

  const [
    chatHistory,
    setChatHistory,
  ] = useState<
    {
      role: string;
      content: string;
      source?: string;
    }[]
  >([]);

  const [chatLoading, setChatLoading] =
    useState(false);

  // -----------------------------
  // HANDLE PDF UPLOAD
  // -----------------------------
  const handleUpload = async (
    e: React.FormEvent
  ) => {

    e.preventDefault();

    if (!file) return;

    setLoading(true);

    const formData = new FormData();

    formData.append('file', file);

    try {

      const response = await fetch(
        '/api/upload',
        {
          method: 'POST',
          body: formData,
        }
      );

      const data =
        await response.json();

      console.log(
        'UPLOAD RESPONSE:',
        data
      );

      // IMPORTANT FIX
      if (data.documentVectors) {

        setDocumentVectors(
          data.documentVectors
        );

        setChatHistory([
          {
            role: 'bot',
            content:
              'Document loaded successfully! Ask me anything about it.',
          },
        ]);

      } else {

        console.error(
          'No document vectors found'
        );

        alert(
          data.error ||
          'Failed to process PDF'
        );
      }

    } catch (error) {

      console.error(
        'Upload error:',
        error
      );

      alert('Upload failed');

    } finally {

      setLoading(false);
    }
  };

  // -----------------------------
  // HANDLE CHAT
  // -----------------------------
  const handleChat = async (
    e: React.FormEvent
  ) => {

    e.preventDefault();

    if (
      !question.trim() ||
      documentVectors.length === 0
    ) {
      return;
    }

    const currentQuestion =
      question;

    setQuestion('');

    setChatHistory((prev) => [
      ...prev,
      {
        role: 'user',
        content: currentQuestion,
      },
    ]);

    setChatLoading(true);

    try {

      const response = await fetch(
        '/api/chat',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            question: currentQuestion,
            documentVectors,
          }),
        }
      );

      const data =
        await response.json();

      setChatHistory((prev) => [
        ...prev,
        {
          role: 'bot',
          content:
            data.answer ||
            'Failed to generate answer.',
        },
      ]);

    } catch (error) {

      console.error(
        'Chat error:',
        error
      );

      setChatHistory((prev) => [
        ...prev,
        {
          role: 'bot',
          content:
            'Something went wrong.',
        },
      ]);

    } finally {

      setChatLoading(false);
    }
  };

  // -----------------------------
  // UI
  // -----------------------------
  return (

    <main className="min-h-screen bg-gray-100 text-black p-8 flex flex-col items-center">

      <h1 className="text-4xl font-bold mb-8">
        Document AI Chatbot
      </h1>

      {/* ----------------------------- */}
      {/* UPLOAD SECTION */}
      {/* ----------------------------- */}

      <form
        onSubmit={handleUpload}
        className="bg-white shadow rounded-lg p-6 w-full max-w-2xl mb-8 flex flex-col gap-4"
      >

        <input
          type="file"
          accept=".pdf"
          onChange={(e) =>
            setFile(
              e.target.files?.[0] || null
            )
          }
          className="border p-2 rounded"
        />

        <button
          type="submit"
          disabled={!file || loading}
          className="bg-blue-600 text-white p-3 rounded font-bold disabled:bg-gray-400"
        >

          {loading
            ? 'Vectorizing Document...'
            : 'Upload PDF'}

        </button>

      </form>

      {/* ----------------------------- */}
      {/* CHAT SECTION */}
      {/* ----------------------------- */}

      {documentVectors.length > 0 && (

        <div className="bg-white shadow rounded-lg w-full max-w-2xl h-[600px] flex flex-col p-4">

          {/* CHAT HISTORY */}

          <div className="flex-1 overflow-y-auto border rounded p-4 mb-4 flex flex-col gap-4">

            {chatHistory.map(
              (msg, index) => (

                <div
                  key={index}
                  className={`flex ${
                    msg.role === 'user'
                      ? 'justify-end'
                      : 'justify-start'
                  }`}
                >

                  <div
                    className={`max-w-[80%] p-3 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-black'
                    }`}
                  >

                    {msg.content}

                  </div>

                </div>
              )
            )}

            {chatLoading && (

              <div className="text-gray-500 italic">

                Thinking...

              </div>
            )}

          </div>

          {/* INPUT */}

          <form
            onSubmit={handleChat}
            className="flex gap-2"
          >

            <input
              type="text"
              value={question}
              onChange={(e) =>
                setQuestion(
                  e.target.value
                )
              }
              placeholder="Ask a question about the document..."
              className="flex-1 border p-2 rounded"
            />

            <button
              type="submit"
              disabled={
                chatLoading ||
                !question.trim()
              }
              className="bg-green-600 text-white px-4 rounded font-bold disabled:bg-gray-400"
            >

              Send

            </button>

          </form>

        </div>
      )}

    </main>
  );
}