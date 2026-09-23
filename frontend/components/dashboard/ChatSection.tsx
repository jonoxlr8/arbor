import ArborChat from "@/components/ArborChat";
import SectionHeader from "@/components/dashboard/SectionHeader";
import type { AccountPlan } from "@/lib/types/planV2";

type ChatSectionProps = {
  plan: AccountPlan;
};

export default function ChatSection({ plan }: ChatSectionProps) {
  return (
    <section className="arbor-panel mx-auto max-w-3xl">
      <SectionHeader
        title="Understand your plan"
      />

      <ArborChat plan={plan} />
    </section>
  );
}
