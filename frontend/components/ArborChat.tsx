"use client";

import { useEffect, useRef, useState } from "react";
import { chatPlanKey, chatPrompts, chatErrorMessage, createChatSession } from "@/lib/chatSession";
import { askArbor } from "@/lib/api";
import type { AccountPlan } from "@/lib/types/planV2";
import { ArborMark } from "@/components/Logo";
import { useAccountAccess } from "./AccountAccess";
import { FREE_LIMIT_MESSAGE, type AskUsage } from "@/lib/entitlements";
import { providerDisplayText } from "@/lib/investmentIdentity";

type ArborChatProps = {
  plan: AccountPlan;
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
    <div className="chat-answer-row"><span className="chat-avatar"><ArborMark className="h-7 w-7"/><span className="sr-only">Arbor</span></span><div className="chat-reply"><ArborResponse text={providerDisplayText(text)} /></div></div>
  );
}

export default function ArborChat({ plan }: ArborChatProps) {
  return <PlanChat key={chatPlanKey(plan)} v2={"strategy_engine_version" in plan && plan.strategy_engine_version === "2.0"} />;
}

function PlanChat({ v2 }: { v2: boolean }) {
  const access = useAccountAccess();
  const updateUsage = access?.updateUsage;
  const [usage, setUsage] = useState<AskUsage | null>(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const session = useRef<ReturnType<typeof createChatSession> | null>(null);
  const busy = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(()=>{if(messages.length)bottom.current?.scrollIntoView({block:"nearest",behavior:"instant"});},[messages.length]);
  useEffect(() => {
    const current = createChatSession(askArbor, state => {
      busy.current = state.status === "loading";
      setLoading(busy.current);
      setError(state.status === "error" ? chatErrorMessage(state.error) : "");
      if (state.status === "ready") {
        if (state.data.ask_usage) { setUsage(state.data.ask_usage); updateUsage?.(state.data.ask_usage); }
        setMessages(previous => [...previous, { role: "user", text: state.data.question }, { role: "arbor", text: state.data.reply }]);
        setQuestion("");
      }
    });
    session.current = current;
    return () => { current.dispose(); session.current = null; };
  }, [updateUsage]);

  const sendMessage = async (prompt: string) => {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt || busy.current || limited) return;
    await session.current?.send(trimmedPrompt);
  };

  const handleAsk = async () => {
    await sendMessage(question);
  };

  const handlePromptClick = async (prompt: string) => {
    await sendMessage(prompt);
  };

  const livePortfolio = v2 && access?.value?.availability?.live_portfolio === true && access.value.features.includes("live_portfolio");
  const prompts = chatPrompts(v2, livePortfolio);
  const currentUsage = usage ?? access?.value?.ask_usage;
  const limited = error === FREE_LIMIT_MESSAGE || currentUsage?.remaining === 0;

  return (
    <div className="chat-thread min-w-0">
      {/* Intro */}
      <div className="text-sm">
        {access?.value?.effective_tier === "plus" && <p className="mb-2 text-xs font-medium text-slate-500">Arbor Plus · Full Ask Arbor access</p>}
        {access?.value?.effective_tier === "free" && <p className="mb-2 text-xs font-medium text-slate-500">Arbor Free · Ask about your plan</p>}
        {currentUsage && !limited && <p role="status" className="mb-2 text-sm text-slate-600">{currentUsage.remaining} Free questions remaining this month.</p>}
        {limited && <div role="status" className="mb-4 rounded-xl border border-slate-200 p-4"><p className="text-slate-700">{FREE_LIMIT_MESSAGE}</p><a className="entry-link mt-2 inline-flex min-h-11 items-center" href="#settings/plus">Explore Arbor Plus</a></div>}
        {access?.value?.ask_usage_available === false && <p role="status" className="mb-3 text-sm text-slate-600">Ask Arbor usage is temporarily unavailable. Your saved plan remains accessible.</p>}
      </div>

      {/* Suggested questions */}
      {messages.length === 0 && <div className="mt-6">
        <div className="chat-intro-bubble"><ArborMark className="h-7 w-7"/><p>{livePortfolio ? "Let’s make sense of your investments. Ask about your portfolio, your plan or your next step." : "Your plan is a starting point. I’m here to help you understand it, one question at a time."}</p></div>
        <p className="mb-3 mt-5 text-xs font-medium text-slate-500">A few places to start</p>

        <div className="chat-suggestions">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => handlePromptClick(prompt)}
              disabled={loading || limited}
              className="
                rounded-full
                min-h-11
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
              <span aria-hidden="true" className="suggestion-spark">✧</span>{prompt}
            </button>
          ))}
        </div>
      </div>}

        {/* Conversation */}
        {messages.length > 0 && (
          <div role="log" aria-label="Conversation with Arbor" aria-live="polite" className="chat-messages mt-8 space-y-4 break-words">
            {messages.map((message, index) =>
              message.role === "arbor" ? (
                <ArborMessage key={index} text={message.text} />
              ) : (
                <div key={index} className="chat-user">
                  <p className="sr-only">You</p>

                  <p className="mt-1 whitespace-pre-wrap leading-7 text-slate-700">
                    {message.text}
                  </p>
                </div>
              ),
            )}
          </div>
        )}
      {messages.length > 0 && v2 && <nav aria-label="Explore your plan" className="mt-4 flex gap-5 text-sm"><a className="entry-link min-h-11" href="#portfolio/plan">View your plan</a><a className="entry-link min-h-11" href="#portfolio">View portfolio</a></nav>}
      <div ref={bottom}/>
      {/* Input */}
      <div className="chat-composer">
        {error && error !== FREE_LIMIT_MESSAGE && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
        <textarea
          aria-label="Your question about your Arbor plan"
          maxLength={1000}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleAsk();
            }
          }}
          rows={1}
          disabled={loading || limited}
          placeholder="Ask Arbor…"
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

        <div className="send-row">
          <p className="text-xs text-slate-400">
            Enter to send · Shift + Enter for a new line
          </p>

        <button
          onClick={handleAsk}
          disabled={loading || limited || !question.trim()}
          aria-label={loading ? "Loading explanation..." : "Ask Arbor"}
          className="entry-primary disabled:opacity-50"
        >
          <span aria-hidden="true">{loading ? "…" : "↑"}</span>
        </button></div>
        {loading && <p role="status" className="mt-2 text-sm text-slate-500">Explaining your saved plan…</p>}
      </div>
      <details className="chat-about"><summary className="text-xs text-slate-500">About your Arbor answers</summary><p className="text-sm leading-6 text-slate-700">{livePortfolio ? "Understand your selected plan and recorded holdings. Values may include amounts you entered." : "About your target plan—not actual holdings."} No live market, tax or trading advice. Each question stands alone.</p></details>
    </div>
  );
}
