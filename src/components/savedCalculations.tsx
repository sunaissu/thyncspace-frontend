import { useState } from "react";
import { evaluateVariables, type CalculationResult } from "@sunaissu/calculator";
import { calculationMarkdown, readCalculations, recalculate } from "../util/savedCalculations";

function CalculationCard({ result, readOnly, onSave }: { result: CalculationResult; readOnly?: boolean; onSave: (result: CalculationResult) => void }) {
  const [expression, setExpression] = useState(result.expression);
  const [variables, setVariables] = useState(Object.entries(result.context?.variables ?? {}).map(([name, value]) => name + " = " + value).join("\n"));
  const [error, setError] = useState("");
  return <form className="saved-calculation" onSubmit={event => {
    event.preventDefault(); if (readOnly) return;
    try { const next = recalculate(result, expression, evaluateVariables(variables)); onSave(next); setError(""); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not recalculate"); }
  }}>
    <label>Expression<input value={expression} maxLength={500} readOnly={readOnly} onChange={event => setExpression(event.target.value)} /></label>
    <label>Variables, one per line<textarea value={variables} maxLength={8000} readOnly={readOnly} onChange={event => setVariables(event.target.value)} /></label>
    <p>{result.kind} · {result.context?.angleUnit ?? "rad"} · Result: <strong>{result.value}</strong></p>
    {result.kind !== "expression" && <p>Point/range: {String(result.context?.point ?? result.context?.lowerBound ?? "")} {String(result.context?.upperBound ?? "")}</p>}
    {error && <p role="alert">{error}</p>}
    {!readOnly && <button className="btn-primary">Recalculate and save</button>}
  </form>;
}
export default function SavedCalculations({ content, readOnly, onChange }: { content: string; readOnly?: boolean; onChange: (value: string, previous?: string) => void }) {
  const calculations = readCalculations(content);
  if (!calculations.length) return <p>No saved calculations in this note. Insert a calculator result to keep its inputs here.</p>;
  return <section aria-label="Saved calculations"><h3>Saved calculations</h3>{calculations.map((item, index) =>
    <CalculationCard key={index + item.source} result={item.result} readOnly={readOnly} onSave={result => {
      if (readOnly) return;
      onChange(content.slice(0, item.start) + calculationMarkdown(result) + content.slice(item.end), content);
    }} />
  )}</section>;
}
