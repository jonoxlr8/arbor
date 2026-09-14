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
        eyebrow="Your plan, explained"
        title="Ask Arbor about your plan."
        description="Understand your target portfolio, allocations, projections, goals, and why each investment is included."
      />

      <ArborChat plan={plan} />
    </section>
  );
}
