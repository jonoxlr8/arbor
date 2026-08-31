export type PortfolioHolding = {
  ticker: string;
  asset_name: string;
  allocation: number;
  asset_type?: string;
};

export type YearlyProjection = {
  year: number;
  value: number;
};

export type Profile = {
  full_name: string;
  country: string;
  currency: string;
  goal_target: number;
  investment_horizon: number;
  risk_tolerance: string;
  risk_level?: string;
  monthly_investment: number;
  current_portfolio_value: number;
};

export type Projection = {
  starting_value: number;
  projected_value: number;
  investment_period_years: number;
  assumed_return: number;
  monthly_contribution: number;
  required_monthly_investment: number;
  yearly_projection: YearlyProjection[];
};

export type Insight = {
  priority: string;
  type: string;
  text: string;
};

export type Health = {
  score?: number;
  strengths?: string[];
  warnings?: string[];
};

export type Explanation = {
  summary: string;
  reasons: string[];
};

export type Plan = {
  profile: Profile;
  portfolio: PortfolioHolding[];
  projection: Projection;
  insights?: Insight[];
  health?: Health;
  portfolio_health?: number;
  portfolio_health_score?: number;
  explanation: Explanation;
};
