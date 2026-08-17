"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

type GrowthChartProps = {
  projection: {
    yearly_projection: {
      year: number;
      value: number;
    }[];
  };
  goalAmount: number;
  currency: string;
};

export default function GrowthChart({
  projection,
  goalAmount,
  currency,
}: GrowthChartProps) {
  const chartData = projection.yearly_projection.map((item) => ({
    ...item,
    goal: goalAmount,
  }));

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-6 text-xl font-bold text-slate-900">
        Your Wealth Growth Journey
      </h3>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{
              top: 10,
              right: 20,
              left: 10,
              bottom: 10,
            }}
          >
            <XAxis
              dataKey="year"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />

            <YAxis
              tickFormatter={(value) =>
                new Intl.NumberFormat("en-US", {
                  notation: "compact",
                  maximumFractionDigits: 0,
                }).format(value)
              }
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />

            <Tooltip
              formatter={(value: number, name: string) => [
                formatCurrency(Number(value)),
                name === "value" ? "Estimated Portfolio" : "Goal",
              ]}
            />

            <Line
              type="monotone"
              dataKey="value"
              stroke="#16a34a"
              strokeWidth={4}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />

            <Line
              type="monotone"
              dataKey="goal"
              stroke="#94a3b8"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex flex-wrap gap-5 text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
          Estimated Portfolio
        </div>

        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
          Goal
        </div>
      </div>
    </div>
  );
}
