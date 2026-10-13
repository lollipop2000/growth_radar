export const goalTypes = ["BUSINESS_CONVERSION", "MICRO_CONVERSION", "NAVIGATION", "IGNORE"] as const;
export type GoalType = typeof goalTypes[number];
export type GoalRef = { id: string; name: string };
export type GoalConfig = { goals: GoalRef[]; goalTypes: Record<string, GoalType> };
export type GoalGroup = { configured: boolean; reaches: number | null; rate: number | null; goals: (GoalRef & { reaches: number | null })[] };
export type GoalGroups = Record<GoalType, GoalGroup>;

export function goalConfig(input: { goals?: GoalRef[]; goalTypes?: unknown }): GoalConfig {
  const goals = input.goals ?? [];
  const map = input.goalTypes && typeof input.goalTypes === "object" && !Array.isArray(input.goalTypes)
    ? input.goalTypes as Record<string, unknown> : {};
  return { goals, goalTypes: Object.fromEntries(goals.map(g => [g.id, goalTypes.includes(map[g.id] as GoalType) ? map[g.id] : "IGNORE"])) as Record<string, GoalType> };
}

// Report selection and analytical meaning are independent. No assignment is inferred from names.
export function reportGoalIds(input: { goals?: GoalRef[]; primaryGoals?: string[]; goalTypes?: unknown }) {
  const c = goalConfig(input);
  return [...new Set([...(input.primaryGoals ?? []), ...c.goals.filter(g => c.goalTypes[g.id] !== "IGNORE").map(g => g.id)])];
}

export function validateGoalTypes(input: unknown, goals: GoalRef[]): Record<string, GoalType> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_GOAL_TYPES");
  const map = input as Record<string, unknown>;
  if (Object.keys(map).some(id => !goals.some(g => g.id === id) || !goalTypes.includes(map[id] as GoalType))) throw new Error("INVALID_GOAL_TYPES");
  return goalConfig({ goals, goalTypes: map }).goalTypes;
}

export function aggregateGoalGroups(rows: { visits: number; goalConversionsJson: unknown }[], config: GoalConfig): GoalGroups {
  const visits = rows.reduce((sum, r) => sum + r.visits, 0);
  return Object.fromEntries(goalTypes.map(type => {
    const goals = config.goals.filter(g => config.goalTypes[g.id] === type).map(g => {
      const values = rows.map(r => (r.goalConversionsJson as Record<string, unknown> | null)?.[g.id]);
      const reaches = rows.length && values.every(v => typeof v === "number" && Number.isFinite(v) && v >= 0)
        ? (values as number[]).reduce((sum, v) => sum + v, 0) : null;
      return { ...g, reaches };
    });
    const reaches = goals.length && goals.every(g => g.reaches != null) ? goals.reduce((sum, g) => sum + g.reaches!, 0) : null;
    return [type, { configured: goals.length > 0, goals, reaches, rate: reaches != null && visits > 0 ? 100 * reaches / visits : null }];
  })) as GoalGroups;
}
