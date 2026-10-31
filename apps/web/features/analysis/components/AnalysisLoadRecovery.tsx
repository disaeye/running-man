import { AnalysisLoad } from "./AnalysisLoad";
import { AnalysisIntensity } from "./AnalysisIntensity";
import { AnalysisRecovery } from "./AnalysisRecovery";

export function AnalysisLoadRecovery() {
  return <div className="space-y-4"><AnalysisLoad /><AnalysisIntensity /><AnalysisRecovery /></div>;
}
