import { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  compactOnMobile?: boolean;
};

export default function Card({ children, compactOnMobile = false }: CardProps) {
  return (
    <div className={`w-full min-w-0 max-w-3xl rounded-3xl bg-white ${compactOnMobile ? "p-4 sm:p-14" : "p-14"} shadow-xl`}>
      {children}
    </div>
  );
}
