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
        title="Ask Arbor"
        description="Get personalized answers about your portfolio, investing, and long-term strategy."
      />

      <ArborChat plan={plan} />
    </section>
  );
}
