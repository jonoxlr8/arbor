"use client";

import { useState } from "react";
import ArborChat from "@/components/ArborChat";
import LearnSection from "./LearnSection";
import type { AccountPlan } from "@/lib/types/planV2";

type ChatSectionProps = {
  plan: AccountPlan | null;
};

export default function ChatSection({ plan }: ChatSectionProps) {
  const [tab, setTab] = useState<"chat" | "learn">("chat");
  const [draft, setDraft] = useState<{ text: string; id: number } | null>(null);
  return (
    <section className="chat-canvas">
      <div className="ask-tabs" role="tablist" aria-label="Ask Arbor views">
        <button type="button" role="tab" aria-selected={tab === "chat"} onClick={() => setTab("chat")}>Chat</button>
        <button type="button" role="tab" aria-selected={tab === "learn"} onClick={() => setTab("learn")}>Learn</button>
      </div>
      <div role="tabpanel" aria-label="Chat" hidden={tab !== "chat"}><ArborChat plan={plan} requestedDraft={draft}/></div>
      <div role="tabpanel" aria-label="Learn" hidden={tab !== "learn"}><LearnSection onAsk={text => { setDraft(previous => ({text, id: (previous?.id ?? 0) + 1})); setTab("chat"); }}/></div>
    </section>
  );
}
