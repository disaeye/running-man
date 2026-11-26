import type { SettingsSectionId } from "@shared/config/canonical-routes";

const SETTINGS_SECTIONS: readonly { readonly id: SettingsSectionId; readonly label: string }[] = [
  { id: "training", label: "生理与区间" },
  { id: "data", label: "数据源与同步" },
  { id: "account", label: "账户与偏好" },
];

/** 设置页的设置分类导航。 */
export function SettingsSectionTabs({
  activeTab,
  onChange,
}: {
  readonly activeTab: SettingsSectionId;
  readonly onChange: (tab: SettingsSectionId) => void;
}) {
  return (
    <div
      className="grid w-full grid-cols-3 gap-1 rounded-2xl bg-surface-overlay p-1"
      role="group"
      aria-label="设置分类"
    >
      {SETTINGS_SECTIONS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            data-testid={`settings-section-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`focus-ring flex min-h-11 min-w-0 items-center justify-center rounded-lg px-2 text-caption1 font-medium transition-colors sm:px-4 ${isActive ? "bg-surface-card text-text-primary shadow-[var(--shadow-sm)]" : "text-text-secondary hover:text-text-primary"}`}
            aria-pressed={isActive}
          >
            <span className="truncate" data-testid={`settings-section-label-${tab.id}`}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
