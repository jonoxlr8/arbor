"use client";

import { useEffect, useState } from "react";
import {
  createHolding,
  deleteHolding,
  getMyHoldings,
  updateHolding,
  type Holding,
} from "@/lib/api";
import {
  calculatePortfolioSummary,
  comparePortfolio,
  getPortfolioHoldingAlignment,
  getPortfolioAlignmentStatus,
  getPortfolioAlignmentInterpretation,
} from "@/lib/portfolio/calculations";
import Card from "@/components/Card";
import type { Plan } from "@/lib/types/plan";

type HoldingsSectionProps = {
  plan: Plan;
  onHoldingsChanged?: () => void;
};

export default function HoldingsSection({
  plan,
  onHoldingsChanged,
}: HoldingsSectionProps) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [editingHoldingId, setEditingHoldingId] = useState<number | null>(null);
  const [editTicker, setEditTicker] = useState("");
  const [editAssetName, setEditAssetName] = useState("");
  const [editAssetType, setEditAssetType] = useState("ETF");
  const [editQuantity, setEditQuantity] = useState("");
  const [editAverageCost, setEditAverageCost] = useState("");
  const [editCurrency, setEditCurrency] = useState("USD");

  const [ticker, setTicker] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetType, setAssetType] = useState("ETF");
  const [quantity, setQuantity] = useState("");
  const [averageCost, setAverageCost] = useState("");
  const [currency, setCurrency] = useState("USD");

  async function loadHoldings() {
    try {
      setError("");

      const savedHoldings = await getMyHoldings();

      setHoldings(savedHoldings);
    } catch (error) {
      console.error("Failed to load holdings:", error);

      setError(
        error instanceof Error
          ? error.message
          : "Failed to load your holdings.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHoldings();
  }, []);

  const portfolioSummary = calculatePortfolioSummary(holdings);

  const portfolioComparison = comparePortfolio(
    portfolioSummary.holdings,
    plan.portfolio,
  );

  const alignmentStatus = getPortfolioAlignmentStatus(portfolioComparison);
  const alignmentInterpretation =
    getPortfolioAlignmentInterpretation(portfolioComparison);

  function resetForm() {
    setTicker("");
    setAssetName("");
    setAssetType("ETF");
    setQuantity("");
    setAverageCost("");
    setError("");
    setCurrency("USD");
  }

  async function handleAddHolding() {
    setError("");

    const normalizedTicker = ticker.trim().toUpperCase();
    const normalizedAssetName = assetName.trim();
    const parsedQuantity = Number(quantity);
    const parsedAverageCost = Number(averageCost);

    if (!normalizedTicker) {
      setError("Please enter a ticker.");
      return;
    }

    if (!normalizedAssetName) {
      setError("Please enter the asset name.");
      return;
    }

    if (!quantity || parsedQuantity <= 0) {
      setError("Quantity must be greater than 0.");
      return;
    }

    if (!averageCost || parsedAverageCost < 0) {
      setError("Average cost cannot be negative.");
      return;
    }

    setSaving(true);

    try {
      const newHolding = await createHolding({
        ticker: normalizedTicker,
        asset_name: normalizedAssetName,
        asset_type: assetType,
        quantity: parsedQuantity,
        average_cost: parsedAverageCost,
        currency,
      });

      setHoldings((currentHoldings) => [...currentHoldings, newHolding]);
      onHoldingsChanged?.();

      resetForm();
      setShowForm(false);
    } catch (error) {
      console.error("Failed to create holding:", error);

      setError(
        error instanceof Error ? error.message : "Failed to add holding.",
      );
    } finally {
      setSaving(false);
    }
  }

  const startEditingHolding = (holding: Holding) => {
    setEditingHoldingId(holding.id);
    setEditTicker(holding.ticker);
    setEditAssetName(holding.asset_name);
    setEditAssetType(holding.asset_type);
    setEditQuantity(String(holding.quantity));
    setEditAverageCost(String(holding.average_cost));
    setEditCurrency(holding.currency);
    setError("");
  };

  const handleSaveHolding = async () => {
    if (editingHoldingId === null) {
      return;
    }

    if (
      !editTicker.trim() ||
      !editAssetName.trim() ||
      !editQuantity ||
      !editAverageCost
    ) {
      setError("Please fill in all holding fields.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const updatedHolding = await updateHolding(editingHoldingId, {
        ticker: editTicker.trim().toUpperCase(),
        asset_name: editAssetName.trim(),
        asset_type: editAssetType,
        quantity: Number(editQuantity),
        average_cost: Number(editAverageCost),
        currency: editCurrency,
      });

      setHoldings((currentHoldings) =>
        currentHoldings.map((holding) =>
          holding.id === editingHoldingId ? updatedHolding : holding,
        ),
      );

      setEditingHoldingId(null);
      onHoldingsChanged?.();
    } catch (error) {
      console.error("Failed to update holding:", error);
      setError(
        error instanceof Error ? error.message : "Failed to update holding.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHolding = async (holdingId: number) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this holding?",
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteHolding(holdingId);

      setHoldings((currentHoldings) =>
        currentHoldings.filter((holding) => holding.id !== holdingId),
      );

      onHoldingsChanged?.();
    } catch (error) {
      console.error("Failed to delete holding:", error);
      setError(
        error instanceof Error ? error.message : "Failed to delete holding.",
      );
    }
  };

  return (
    <section className="mt-8">
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">My Portfolio</h2>

            <p className="mt-2 text-sm text-slate-600">
              Track the investments you currently own. Arbor will compare these
              holdings with your recommended portfolio.
            </p>

            {holdings.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-slate-500">Total cost basis</p>

                <p className="text-2xl font-bold text-slate-900">
                  USD{" "}
                  {portfolioSummary.total_cost_basis.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setShowForm(!showForm);
              setError("");
            }}
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            {showForm ? "Close" : "Add Holding"}
          </button>
        </div>

        {showForm && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <h3 className="text-lg font-semibold text-slate-900">
              Add an Investment
            </h3>

            <p className="mt-1 text-sm text-slate-600">
              Enter the investment you currently own.
            </p>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Ticker
                </label>

                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  placeholder="QQQM"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 uppercase outline-none focus:border-green-600 focus:ring-4 focus:ring-green-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Asset name
                </label>

                <input
                  type="text"
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  placeholder="Invesco NASDAQ 100 ETF"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Asset type
                </label>

                <select
                  value={assetType}
                  onChange={(e) => setAssetType(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-100"
                >
                  <option value="ETF">ETF</option>
                  <option value="Stock">Stock</option>
                  <option value="Crypto">Crypto</option>
                  <option value="Bond">Bond</option>
                  <option value="Fund">Fund</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Currency
                </label>

                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-100"
                >
                  <option value="USD">USD — US Dollar</option>
                  <option value="NZD">NZD — New Zealand Dollar</option>
                  <option value="PHP">PHP — Philippine Peso</option>
                  <option value="AUD">AUD — Australian Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="CAD">CAD — Canadian Dollar</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Quantity
                </label>

                <input
                  type="number"
                  min="0"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="25"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-100"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Average cost per unit
                </label>

                <input
                  type="number"
                  min="0"
                  step="any"
                  value={averageCost}
                  onChange={(e) => setAverageCost(e.target.value)}
                  placeholder="180"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-100"
                />
              </div>
            </div>

            {error && (
              <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleAddHolding}
                disabled={saving}
                className={`rounded-xl px-5 py-3 font-semibold text-white transition ${
                  saving
                    ? "cursor-not-allowed bg-slate-300"
                    : "bg-emerald-700 hover:bg-emerald-800"
                }`}
              >
                {saving ? "Adding..." : "Add Investment"}
              </button>

              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                disabled={saving}
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="mt-6 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
            Loading your holdings...
          </div>
        )}

        {!loading && !error && holdings.length === 0 && !showForm && (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <h3 className="text-lg font-semibold text-slate-900">
              No holdings added yet
            </h3>

            <p className="mt-2 text-sm text-slate-600">
              Add the investments you currently own so Arbor can analyze your
              actual portfolio.
            </p>
          </div>
        )}

        {!loading && holdings.length > 0 && (
          <div className="mt-8">
            <h3 className="text-xl font-bold text-slate-900">
              Portfolio Alignment
            </h3>

            <p className="mt-2 text-sm font-semibold text-slate-700">
              Alignment status: {alignmentStatus}
            </p>

            <p className="mt-2 text-sm text-slate-600">
              {alignmentInterpretation}
            </p>

            <p className="mt-2 text-sm text-slate-600">
              See how your current portfolio compares with Arbor's recommended
              allocation.
            </p>

            <div className="mt-4 space-y-3">
              {portfolioComparison.map((comparison) => (
                <div
                  key={comparison.ticker}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900">
                        {comparison.ticker}
                      </p>
                      <p className="text-sm text-slate-600">
                        {comparison.asset_name}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-semibold text-slate-900">
                        {comparison.actual_allocation.toFixed(1)}%
                      </p>
                      <p className="text-xs text-slate-500">actual</p>
                    </div>
                  </div>

                  <div className="mt-3 flex justify-between text-sm">
                    <span className="text-slate-600">Arbor target</span>

                    <span className="font-medium text-slate-900">
                      {comparison.target_allocation.toFixed(1)}%
                    </span>
                  </div>

                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-slate-600">Difference</span>

                    <span className="font-semibold text-slate-900">
                      {comparison.difference >= 0 ? "+" : ""}
                      {comparison.difference.toFixed(1)}%
                    </span>
                  </div>

                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-slate-600">Alignment</span>

                    <span className="font-semibold text-slate-900">
                      {getPortfolioHoldingAlignment(comparison.difference)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && holdings.length > 0 && (
          <div className="mt-6 space-y-3">
            {portfolioSummary.holdings.map((holding) => (
              <div
                key={holding.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-900">{holding.ticker}</p>

                    <p className="text-sm text-slate-600">
                      {holding.asset_name}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">
                        {holding.quantity}
                      </p>

                      <p className="text-xs text-slate-500">units</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => startEditingHolding(holding)}
                      className="text-sm font-medium text-slate-600 hover:text-slate-900"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteHolding(holding.id)}
                      className="text-sm font-medium text-red-600 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {editingHoldingId === holding.id && (
                  <div className="mt-5 border-t border-slate-200 pt-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Ticker
                        </label>
                        <input
                          type="text"
                          value={editTicker}
                          onChange={(event) =>
                            setEditTicker(event.target.value)
                          }
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Asset name
                        </label>
                        <input
                          type="text"
                          value={editAssetName}
                          onChange={(event) =>
                            setEditAssetName(event.target.value)
                          }
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Asset type
                        </label>
                        <select
                          value={editAssetType}
                          onChange={(event) =>
                            setEditAssetType(event.target.value)
                          }
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                        >
                          <option value="ETF">ETF</option>
                          <option value="Stock">Stock</option>
                          <option value="Crypto">Crypto</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Quantity
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={editQuantity}
                          onChange={(event) =>
                            setEditQuantity(event.target.value)
                          }
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Average cost
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={editAverageCost}
                          onChange={(event) =>
                            setEditAverageCost(event.target.value)
                          }
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Currency
                        </label>
                        <select
                          value={editCurrency}
                          onChange={(event) =>
                            setEditCurrency(event.target.value)
                          }
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                        >
                          <option value="USD">USD</option>
                          <option value="NZD">NZD</option>
                          <option value="PHP">PHP</option>
                        </select>
                      </div>
                    </div>

                    <div className="mt-5 flex gap-3">
                      <button
                        type="button"
                        onClick={handleSaveHolding}
                        disabled={saving}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save changes"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingHoldingId(null)}
                        disabled={saving}
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
                  <p className="text-sm text-slate-600">
                    Average cost:{" "}
                    <span className="font-medium text-slate-900">
                      {holding.currency} {holding.average_cost.toLocaleString()}
                    </span>
                  </p>

                  <p className="text-sm text-slate-600">
                    Cost basis:{" "}
                    <span className="font-medium text-slate-900">
                      {holding.cost_basis.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </p>

                  <p className="text-sm text-slate-600">
                    Portfolio allocation:{" "}
                    <span className="font-semibold text-slate-900">
                      {holding.allocation.toFixed(1)}%
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
