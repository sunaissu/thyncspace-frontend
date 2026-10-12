import { evaluateExpression, differentiateExpression, integrateExpression, solveEquation, formatCalculatorResult, type CalculationResult } from "@sunaissu/calculator";

const fence = String.fromCharCode(96).repeat(3);
export function calculationMarkdown(result: CalculationResult) {
  return fence + "thyncspace-calculation\n" + JSON.stringify({ version: 1, ...result }) + "\n" + fence;
}
export function readCalculations(content: string) {
  const pattern = new RegExp("^" + fence + "thyncspace-calculation\\r?\\n([^\\r\\n]{1,16000})\\r?\\n" + fence + "(?=\\r?$)", "gm");
  const results: Array<{ start: number; end: number; source: string; result: CalculationResult }> = [];
  for (const match of content.matchAll(pattern)) {
    if (results.length >= 20) break;
    try {
      const candidate = JSON.parse(match[1]);
      if (candidate.version !== 1 || !["expression", "integral", "derivative", "root"].includes(candidate.kind) || typeof candidate.expression !== "string" || candidate.expression.length > 500 || typeof candidate.value !== "string") continue;
      const context = candidate.context;
      if (context !== undefined) {
        if (!context || typeof context !== "object" || Array.isArray(context)) continue;
        if (context.angleUnit !== undefined && !["rad", "deg"].includes(context.angleUnit)) continue;
        if (["point", "lowerBound", "upperBound"].some(key => context[key] !== undefined && (typeof context[key] !== "string" || context[key].length > 500))) continue;
        if (context.variables !== undefined && (!context.variables || typeof context.variables !== "object" || Array.isArray(context.variables) || Object.keys(context.variables).length > 50 || Object.values(context.variables).some(value => typeof value !== "number" || !Number.isFinite(value)))) continue;
        if (context.format !== undefined && (!context.format || typeof context.format !== "object" || Array.isArray(context.format) || (context.format.notation !== undefined && !["auto", "fixed", "scientific", "engineering", "significant"].includes(context.format.notation)) || (context.format.precision !== undefined && (!Number.isInteger(context.format.precision) || context.format.precision < 0 || context.format.precision > 15)))) continue;
        if (context.tolerance !== undefined && (typeof context.tolerance !== "number" || !Number.isFinite(context.tolerance) || context.tolerance <= 0 || context.tolerance > 1)) continue;
      }
      results.push({ start: match.index!, end: match.index! + match[0].length, source: match[0], result: candidate });
    } catch { /* Unsupported or malformed blocks remain ordinary Markdown. */ }
  }
  return results;
}
export function recalculate(result: CalculationResult, expression: string, variables: unknown): CalculationResult {
  if (!variables || typeof variables !== "object" || Array.isArray(variables) || Object.keys(variables).length > 50) throw new Error("Use an object with at most 50 numeric variables");
  const entries = Object.entries(variables);
  if (entries.some(([key, value]) => !/^[a-z][a-z0-9_]{0,49}$/i.test(key) || typeof value !== "number" || !Number.isFinite(value))) throw new Error("Variables need names and finite numeric values");
  const context = { ...result.context, variables: Object.fromEntries(entries) };
  if (context.angleUnit !== undefined && !["rad", "deg"].includes(context.angleUnit)) throw new Error("Invalid angle unit");
  let numericValue: number;
  let diagnostics: CalculationResult["diagnostics"];
  if (result.kind === "expression") numericValue = evaluateExpression(expression, context);
  else if (result.kind === "derivative") numericValue = differentiateExpression(expression, String(context.point ?? ""), context);
  else if (result.kind === "integral") numericValue = integrateExpression(expression, String(context.lowerBound ?? ""), String(context.upperBound ?? ""), context);
  else {
    const solution = solveEquation(expression, String(context.lowerBound ?? ""), String(context.upperBound ?? ""), context, { tolerance: context.tolerance });
    numericValue = solution.value;
    diagnostics = { residual: solution.residual, iterations: solution.iterations };
  }
  return { ...result, expression, displayExpression: expression, context, numericValue, diagnostics, value: formatCalculatorResult(numericValue, context.format) };
}
