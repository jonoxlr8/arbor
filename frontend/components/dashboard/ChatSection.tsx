import ArborChat from "@/components/ArborChat";
import SectionHeader from "@/components/dashboard/SectionHeader";

type ChatSectionProps = {
  plan: any;
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
