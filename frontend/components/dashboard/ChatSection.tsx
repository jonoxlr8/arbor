import ArborChat from "@/components/ArborChat";
import SectionHeader from "@/components/dashboard/SectionHeader";
import type { Plan } from "@/lib/types/plan";

type ChatSectionProps = {
  plan: Plan;
};

export default function ChatSection({ plan }: ChatSectionProps) {
  return (
    <section className="pt-8 pb-12">
      <SectionHeader
        eyebrow="Assistant"
        title="Explain my Arbor plan"
        description="Rule-based explanations of your recommended targets and saved projection assumptions—not actual-portfolio or trading advice."
      />

      <ArborChat plan={plan} />
    </section>
  );
}
