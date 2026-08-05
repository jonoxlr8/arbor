"use client";

import { useState } from "react";
import { askArbor } from "@/lib/api";

type ArborChatProps = {
  plan: any;
};

export default function ArborChat({ plan }: ArborChatProps) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<
    { role: "user" | "arbor"; text: string }[]
  >([]);
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!question.trim()) return;

    setLoading(true);

    try {
      const result = await askArbor(question, plan);

      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          text: question,
        },
        {
          role: "arbor",
          text: result.reply,
        },
      ]);

      setQuestion("");
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "arbor",
          text: "Sorry, something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handlePromptClick = async (prompt: string) => {
    setLoading(true);

    try {
      const result = await askArbor(prompt, plan);

      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          text: prompt,
        },
        {
          role: "arbor",
          text: result.reply,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "arbor",
          text: "Sorry, something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8">
      <div className="rounded-2xl bg-emerald-50 p-5">
        <p className="leading-7 text-slate-700">
          Hi {plan.profile.full_name}, I'm Arbor 🌳. I can help explain your
          portfolio, answer investing questions, and help you stay focused on
          your long-term wealth goals.
        </p>
      </div>

      <div className="mt-6">
        <p className="mb-3 text-sm font-semibold text-slate-500">Try asking:</p>

        <div className="flex flex-wrap gap-2">
          {[
            "Why this portfolio?",
            "Should I buy more Bitcoin?",
            "Explain QQQM",
            "How can I retire earlier?",
          ].map((prompt) => (
            <button
              key={prompt}
              onClick={() => handlePromptClick(prompt)}
              className="
        rounded-full
        border
        border-slate-300
        bg-white
        px-4
        py-2
        text-sm
        font-medium
        text-slate-700
        transition
        hover:border-emerald-400
        hover:bg-emerald-50
        "
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <textarea
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAsk();
            }
          }}
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything about your investment plan..."
          className="
          w-full
          rounded-2xl
          border
          border-slate-300
          bg-slate-50
          p-4
          text-slate-900
          placeholder:text-slate-400
          outline-none
          transition
          focus:border-emerald-500
          focus:bg-white
          "
        />

        <button
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          className={`
    mt-4
    w-full
    rounded-xl
    py-4
    font-semibold
    transition
    ${
      loading || !question.trim()
        ? "cursor-not-allowed bg-slate-300 text-slate-500"
        : "bg-emerald-600 text-white hover:bg-emerald-700"
    }
  `}
        >
          {loading ? "Thinking..." : "Ask Arbor 🌳"}
        </button>

        {messages.length > 0 && (
          <div className="mt-6 space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={
                  message.role === "arbor"
                    ? "rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm"
                    : "rounded-2xl bg-slate-100 p-4"
                }
              >
                {message.role === "arbor" && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white">
                      🌳
                    </div>

                    <div>
                      <h4 className="font-semibold text-slate-900">Arbor</h4>

                      <p className="text-xs text-slate-500">
                        AI Investment Companion
                      </p>
                    </div>
                  </div>
                )}

                <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-700">
                  {message.text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
