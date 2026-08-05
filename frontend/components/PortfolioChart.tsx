import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { getPortfolioAnalysis } from "@/lib/portfolioAnalysis";

type PortfolioChartProps = {
  portfolio: any[] | undefined;
};

export default function PortfolioChart({ portfolio }: PortfolioChartProps) {
  if (!portfolio || portfolio.length === 0) {
    return null;
  }

  const analysis = getPortfolioAnalysis(portfolio);

  const COLORS = [
    "#16a34a", // emerald
    "#22c55e", // green
    "#059669", // teal
    "#f59e0b", // bitcoin
    "#f97316", // ethereum
  ];

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkScreen = () => {
      setIsMobile(window.innerWidth < 640);
    };

    checkScreen();
    window.addEventListener("resize", checkScreen);

    return () => window.removeEventListener("resize", checkScreen);
  }, []);

  return (
    <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-2xl font-bold text-slate-900">
        Portfolio Allocation
      </h2>

      <div className="h-64 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={portfolio}
              dataKey="allocation"
              nameKey="ticker"
              cx="50%"
              cy="50%"
              innerRadius={isMobile ? 45 : 60}
              outerRadius={isMobile ? 75 : 100}
              label={false}
            >
              {portfolio.map((asset, index) => (
                <Cell key={asset.ticker} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>

            <text
              x="50%"
              y="47%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-slate-900 text-xl font-bold"
            >
              100%
            </text>

            <text
              x="50%"
              y="57%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-slate-500 text-sm"
            >
              Allocated
            </text>

            <Tooltip formatter={(value) => [`${value}%`, "Allocation"]} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 space-y-3">
        {portfolio.map((asset, index) => (
          <div key={asset.ticker} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: COLORS[index] }}
              />

              <div>
                <p className="font-semibold text-slate-900">{asset.ticker}</p>

                <p className="text-sm text-slate-500">{asset.asset_name}</p>
              </div>
            </div>

            <p className="font-bold text-slate-900">{asset.allocation}%</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl bg-emerald-50 p-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Arbor Analysis
        </p>

        <p className="mt-2 leading-7 text-slate-700">{analysis}</p>
      </div>
    </div>
  );
}
