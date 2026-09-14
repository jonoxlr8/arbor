import ArborChat from "@/components/ArborChat";
import SectionHeader from "@/components/dashboard/SectionHeader";
import type { Plan } from "@/lib/types/plan";

type ChatSectionProps = {
  plan: Plan;
};

export default function ChatSection({ plan }: ChatSectionProps) {
  return (
    <section className="arbor-panel mx-auto max-w-3xl">
      <SectionHeader
        title="Understand your plan, allocations and projections."
      />

      <ArborChat plan={plan} />
    </section>
  );
}
