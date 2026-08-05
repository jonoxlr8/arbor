import { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
};

export default function Card({ children }: CardProps) {
  return (
    <div className="w-full max-w-3xl rounded-3xl bg-white p-14 shadow-xl">
      {children}
    </div>
  );
}