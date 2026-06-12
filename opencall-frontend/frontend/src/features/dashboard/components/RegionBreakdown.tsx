// Region-wise Breakdown section extracted from app/page.tsx (Phase 6.12).
// JSX preserved verbatim; role gating and isActive/highlight conditions preserved
// exactly. The "Show All Regions" partial-reset implementation stays in page.tsx
// and is passed in as onShowAllRegions (only the inline arrow was swapped for the
// prop reference; the button markup is otherwise unchanged). Renders RegionCard for
// the synthetic "ALL" card (role-gated) and one per active region with count > 0,
// preserving the `region-card-${aspCode || regionName}` key generation.
import { RegionCard, type RegionFilterArgs } from "./RegionCard";
import type { RegionStats, PrintCaseFilter } from "../types";

export function RegionBreakdown({
  canShowAllRegions,
  overallStats,
  activeRegionBreakdown,
  selectedRegion,
  selectedWoOtcCode,
  showConsumerOnly,
  showCommercialOnly,
  showWarrantyOnly,
  showNonWarrantyOnly,
  showPcOnly,
  showCissOnly,
  showRcaOnly,
  printCaseFilter,
  openRecordsWithFilter,
  onShowAllRegions,
}: Readonly<{
  canShowAllRegions: boolean;
  overallStats: RegionStats;
  activeRegionBreakdown: Array<RegionStats & { aspCode: string; regionName: string }>;
  selectedRegion: string | null;
  selectedWoOtcCode: string | null;
  showConsumerOnly: boolean;
  showCommercialOnly: boolean;
  showWarrantyOnly: boolean;
  showNonWarrantyOnly: boolean;
  showPcOnly: boolean;
  showCissOnly: boolean;
  showRcaOnly: boolean;
  printCaseFilter: PrintCaseFilter | null;
  openRecordsWithFilter: (args: RegionFilterArgs) => void;
  onShowAllRegions: () => void;
}>) {
  return (
    <div className="regionBreakdownSection">
      <div className="sectionHeader">
        <h3>Region-wise Breakdown</h3>
        {selectedRegion && (
          <button
            className="secondaryButton"
            onClick={onShowAllRegions}
            style={{ minHeight: '32px', padding: '0 12px', fontSize: '12px' }}
          >
            Show All Regions
          </button>
        )}
      </div>
      <div className="regionGrid">
        {canShowAllRegions && (
          <RegionCard
            key="region-card-ALL"
            aspCode="ALL"
            regionName="All Regions"
            subtitle="Overall"
            stats={overallStats}
            isActive={selectedRegion === "ALL" && !selectedWoOtcCode && !showConsumerOnly && !showCommercialOnly && !showWarrantyOnly && !showNonWarrantyOnly}
            selectedRegion={selectedRegion}
            selectedWoOtcCode={selectedWoOtcCode}
            showConsumerOnly={showConsumerOnly}
            showCommercialOnly={showCommercialOnly}
            showWarrantyOnly={showWarrantyOnly}
            showNonWarrantyOnly={showNonWarrantyOnly}
            showPcOnly={showPcOnly}
            showCissOnly={showCissOnly}
            showRcaOnly={showRcaOnly}
            printCaseFilter={printCaseFilter}
            openRecordsWithFilter={openRecordsWithFilter}
          />
        )}

        {activeRegionBreakdown.filter((entry) => entry.count > 0).map((entry) => (
          <RegionCard
            key={`region-card-${entry.aspCode || entry.regionName}`}
            aspCode={entry.aspCode}
            regionName={entry.regionName}
            subtitle={entry.aspCode}
            stats={entry}
            isActive={selectedRegion === entry.aspCode && !selectedWoOtcCode && !showConsumerOnly && !showCommercialOnly && !showWarrantyOnly && !showNonWarrantyOnly}
            selectedRegion={selectedRegion}
            selectedWoOtcCode={selectedWoOtcCode}
            showConsumerOnly={showConsumerOnly}
            showCommercialOnly={showCommercialOnly}
            showWarrantyOnly={showWarrantyOnly}
            showNonWarrantyOnly={showNonWarrantyOnly}
            showPcOnly={showPcOnly}
            showCissOnly={showCissOnly}
            showRcaOnly={showRcaOnly}
            printCaseFilter={printCaseFilter}
            openRecordsWithFilter={openRecordsWithFilter}
          />
        ))}
      </div>
    </div>
  );
}
