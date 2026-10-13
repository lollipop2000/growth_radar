import { t, number } from "../lib/i18n/ru";
import { aggregateGoalGroups, goalConfig, type GoalConfig, type GoalGroups } from "../lib/yandex/goal-types";
import { publicData } from "../lib/public-data";

export function GoalGroupsPanel({ groups, config, benchmark }: { groups?: GoalGroups; config?: GoalConfig; benchmark?: number | null }) {
  const values=publicData(groups??aggregateGoalGroups([],config??goalConfig({})));
  return <>
    {(["BUSINESS_CONVERSION","MICRO_CONVERSION","NAVIGATION"] as const).map(type=>{
      const group=values[type],business=type==="BUSINESS_CONVERSION",navigation=type==="NAVIGATION";
      return <section className="panel" key={type}><h2>{t(business?"businessGroup":navigation?"navigationGroup":"microGroup")}</h2>
        {!group.configured?<p>{t(business?"businessGoalsMissing":"noGoalsInGroup")}</p>:<>
          <dl className="metric-grid"><div><dt>{t("goalReaches")}</dt><dd>{number(group.reaches)}</dd></div>{!navigation&&<div><dt>{t(business?"businessConversion":"microConversion")}</dt><dd>{number(group.rate)}</dd></div>}{business&&benchmark!==undefined&&<div><dt>{t("businessBenchmark")}</dt><dd>{number(benchmark)}</dd></div>}</dl>
          <table><thead><tr><th>{t("Цель")}</th><th>{t("ID")}</th><th>{t("goalReaches")}</th></tr></thead><tbody>{group.goals.map(g=><tr key={g.id}><td data-source-value>{g.name}</td><td>{g.id}</td><td>{number(g.reaches)}</td></tr>)}</tbody></table>
        </>}<p className="muted">{t(business?"businessGoalFormula":navigation?"navigationGoalHelp":"microGoalHelp")}</p>
      </section>;
    })}
    {!!values.IGNORE.goals.length&&<details className="panel"><summary>{t("ignoredGroup")}</summary><table><thead><tr><th>{t("Цель")}</th><th>{t("ID")}</th><th>{t("goalReaches")}</th></tr></thead><tbody>{values.IGNORE.goals.map(g=><tr key={g.id}><td data-source-value>{g.name}</td><td>{g.id}</td><td>{number(g.reaches)}</td></tr>)}</tbody></table></details>}
  </>;
}
