import { FormulaValue, EvaluationContext, FunctionDefinition, FunctionCategory } from './types'

export const builtInFunctions: Record<string, FunctionDefinition> = {}

export function registerFunction(def: FunctionDefinition): void {
  builtInFunctions[def.name] = def
}

export function executeFunction(
  name: string,
  args: FormulaValue[],
  context: EvaluationContext
): FormulaValue {
  const func = builtInFunctions[name.toUpperCase()]
  if (!func) {
    throw new Error(`Unknown function: ${name}`)
  }
  return func.evaluate(args, context)
}

export function getFunctionsByCategory(): Record<FunctionCategory, FunctionDefinition[]> {
  const result: Record<FunctionCategory, FunctionDefinition[]> = {
    math: [],
    text: [],
    logic: [],
    date: [],
    aggregate: [],
  }

  for (const func of Object.values(builtInFunctions)) {
    result[func.category].push(func)
  }

  for (const category of Object.keys(result) as FunctionCategory[]) {
    result[category].sort((a, b) => a.name.localeCompare(b.name))
  }

  return result
}

