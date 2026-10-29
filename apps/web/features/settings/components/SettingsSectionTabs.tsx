import type { SettingsSectionId } from "@shared/config/canonical-routes";

const PROFILE_TABS: readonly { readonly id: SettingsSectionId; readonly label: string }[] = [
  { id: "training", label: "生理与区间" },
  { id: "data", label: "数据源与同步" },
  { id: "account", label: "账户与偏好" },
];

/** 档案页下半部的设置分区导航。 */
export function SettingsSectionTabs({
  activeTab,
  onChange,
}: {
  readonly activeTab: SettingsSectionId;
  readonly onChange: (tab: SettingsSectionId) => void;
}) {
  return (
    <div
      className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-overlay p-1 sm:inline-flex sm:flex-wrap"
      role="group"
      aria-label="档案分区"
    >
      {PROFILE_TABS.map((tab) => {
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
