"use client";

import { useEffect, useRef, useState } from "react";
import { chatPlanKey, createChatSession } from "@/lib/chatSession";
import { askArbor } from "@/lib/api";
import type { Plan } from "@/lib/types/plan";
import { ArborMark } from "@/components/Logo";

type ArborChatProps = {
  plan: Plan;
};

type Message = {
  role: "user" | "arbor";
  text: string;
};

function renderBold(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return part;
  });
}

function ArborResponse({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="mt-5 space-y-3 text-[15px] leading-7 text-slate-700">
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={index} className="h-1" />;
        }

        // Remove Arbor's text header because the card already displays it.
        if (
          trimmed === "🌳" ||
          trimmed === "Arbor" ||
          trimmed === "AI Investment Companion"
        ) {
          return null;
        }

        // Markdown headings
        if (trimmed.startsWith("#### ")) {
          return (
            <h4
              key={index}
              className="pt-2 text-base font-semibold text-slate-900"
            >
              {renderBold(trimmed.replace("#### ", ""))}
            </h4>
          );
        }

        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={index} className="pt-3 text-lg font-bold text-slate-900">
              {renderBold(trimmed.replace("### ", ""))}
            </h3>
          );
        }

        if (trimmed.startsWith("## ")) {
          return (
            <h2 key={index} className="pt-3 text-xl font-bold text-slate-900">
              {renderBold(trimmed.replace("## ", ""))}
            </h2>
          );
        }

        // Numbered lists
        const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.*)$/);

        if (numberedMatch) {
          return (
            <div key={index} className="flex items-start gap-3 py-1">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
                {numberedMatch[1]}
              </span>

              <span className="flex-1 pt-0.5">
                {renderBold(numberedMatch[2])}
              </span>
            </div>
          );
        }

        // Bullet lists
        if (trimmed.startsWith("- ")) {
          return (
            <div key={index} className="flex items-start gap-3 py-1">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />

              <span className="flex-1">
                {renderBold(trimmed.substring(2).trim())}
              </span>
            </div>
          );
        }

        // Handle bullet characters produced by some Arbor responses.
        if (trimmed.startsWith("•")) {
          return (
            <div key={index} className="flex items-start gap-3 py-1">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />

              <span className="flex-1">
                {renderBold(trimmed.substring(1).trim())}
              </span>
            </div>
          );
        }

        return (
          <p key={index} className="leading-7">
            {renderBold(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function ArborMessage({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sage-soft">
          <ArborMark className="h-8 w-8" />
        </div>

        <div>
          <h4 className="font-semibold text-slate-900">Arbor</h4>

          <p className="text-xs text-slate-500">Your plan, explained</p>
        </div>
      </div>

      <ArborResponse text={text} />
    </div>
  );
}

export default function ArborChat({ plan }: ArborChatProps) {
  return <PlanChat key={chatPlanKey(plan)} plan={plan} />;
}

function PlanChat({ plan }: ArborChatProps) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const session = useRef<ReturnType<typeof createChatSession> | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    const current = createChatSession(askArbor, state => {
      busy.current = state.status === "loading";
      setLoading(busy.current);
      setError(state.status === "error" ? "We couldn’t explain your plan right now. Please try again." : "");
      if (state.status === "ready") {
        setMessages(previous => [...previous, { role: "user", text: state.data.question }, { role: "arbor", text: state.data.reply }]);
        setQuestion("");
      }
    });
    session.current = current;
    return () => { current.dispose(); session.current = null; };
  }, []);

  const sendMessage = async (prompt: string) => {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt || busy.current) return;
    await session.current?.send(trimmedPrompt);
  };

  const handleAsk = async () => {
    await sendMessage(question);
  };

  const handlePromptClick = async (prompt: string) => {
    await sendMessage(prompt);
  };

  const prompts = [
    "Explain my Arbor plan",
    "What are my target allocations?",
    "What are my projection assumptions?",
    "Does my projection reach my goal?",
  ];

  return (
    <div className="mt-6 min-w-0">
      {/* Intro */}
      <div className="text-sm">
        <p className="leading-7 text-slate-700">
          Hi {plan?.profile?.full_name || "there"}, I&apos;m Arbor. Ask about your target plan—not actual holdings. No live market, tax or trading advice. Each question stands alone.
        </p>
      </div>

      {/* Suggested questions */}
      <div className="mt-6">
        <p className="mb-3 text-sm font-semibold text-slate-500">Try asking:</p>

        <div className="flex flex-wrap gap-2">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => handlePromptClick(prompt)}
              disabled={loading}
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
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="mt-6">
        {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
        <textarea
          aria-label="Your question about your Arbor plan"
          maxLength={1000}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAsk();
            }
          }}
          rows={3}
          disabled={loading}
          placeholder="Ask about Arbor targets, asset roles or projection assumptions..."
          className="
            w-full
            resize-none
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
            disabled:cursor-not-allowed
            disabled:opacity-70
          "
        />

        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Press Enter to send · Shift + Enter for a new line
          </p>

          <p className="text-xs text-slate-400">Personalized to your plan</p>
        </div>

        <button
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          className={`
            mt-4
            w-full
            rounded-xl
            py-4
            font-semibold
            shadow-sm
            transition
            ${
              loading || !question.trim()
                ? "cursor-not-allowed bg-slate-300 text-slate-500"
                : "bg-emerald-600 text-white hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-md"
            }
          `}
        >
          {loading ? "Loading explanation..." : "Explain my Arbor plan"}
        </button>

        {/* Conversation */}
        {messages.length > 0 && (
          <div className="mt-8 space-y-4">
            {messages.map((message, index) =>
              message.role === "arbor" ? (
                <ArborMessage key={index} text={message.text} />
              ) : (
                <div key={index} className="ml-3 rounded-2xl bg-sage-soft p-4 sm:ml-8">
                  <p className="text-sm font-medium text-slate-500">You</p>

                  <p className="mt-1 whitespace-pre-wrap leading-7 text-slate-700">
                    {message.text}
                  </p>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
