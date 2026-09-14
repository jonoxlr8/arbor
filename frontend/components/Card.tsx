import { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  compactOnMobile?: boolean;
};

export default function Card({ children, compactOnMobile = false }: CardProps) {
  return (
    <div className={`w-full min-w-0 rounded-3xl border border-slate-200/80 bg-white ${compactOnMobile ? "p-4 sm:p-6" : "max-w-xl p-6 sm:p-10"} shadow-sm`}>
      {children}
    </div>
  );
}
