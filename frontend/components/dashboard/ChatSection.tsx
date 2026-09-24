import ArborChat from "@/components/ArborChat";
import { ArborMark } from "../Logo";
import type { AccountPlan } from "@/lib/types/planV2";

type ChatSectionProps = {
  plan: AccountPlan;
};

export default function ChatSection({ plan }: ChatSectionProps) {
  return (
    <section className="chat-canvas">
      <header className="chat-welcome"><span className="companion-mark"><ArborMark className="h-8 w-8"/></span><div><h2>Your investing companion</h2><p>Clarity for the plan you chose.</p></div></header>

      <ArborChat plan={plan} />
    </section>
  );
}
