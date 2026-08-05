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
};

export default function GrowthChart({ projection }: GrowthChartProps) {
  const data = projection.yearly_projection;

  const chartData = data.map((item) => ({
    ...item,
    goal: 1000000,
  }));

  return (
    <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-6 text-xl font-bold text-slate-900">
        Your Wealth Growth Journey
      </h3>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis dataKey="year" />

            <YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}k`} />

            <Tooltip
              formatter={(value: number) => [
                `$${Number(value).toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}`,
                "Estimated Portfolio",
              ]}
            />

            <Line
              type="monotone"
              dataKey="value"
              stroke="#16a34a"
              strokeWidth={4}
              dot={{ r: 6 }}
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
    </div>
  );
}
