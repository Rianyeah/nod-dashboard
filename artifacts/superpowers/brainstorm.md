# Brainstorm: Features from `traktor_data` for NOD Dashboard

## Goal
Identify high-value dashboard features that leverage the `traktor_data` table (69,472 rows, 7,149 sites, 10 months of data) containing revenue, payload, and traffic metrics per site per month — combined with `data_site_master` for geographic/infrastructure context.

## Constraints
- Data is monthly granularity (`trx_month`), not daily
- Must join with `data_site_master` via `site_id ↔ Siteid` to get Kabupaten, Site Class, Battery, etc.
- Revenue columns are in IDR (bigint), payload in KB/MB (bigint), traffic is subscriber count
- Revenue breakdown: `rev_voice`, `rev_bb`, `rev_dig`, `rev_sms`, `rev_ir`, `rev_2g`, `rev_3g`, `rev_4g`
- Payload breakdown: `pld_2g`, `pld_3g`, `pld_4g`, `pld_5g`, `pld_upcc`
- Traffic breakdown: `trf_2g`, `trf_3g`, `trf_4g`
- Kabupaten values: SIDOARJO, PASURUAN, MOJOKERTO, JOMBANG, KOTA MOJOKERTO, KOTA PASURUAN
- Site Class: Diamond, Platinum, Gold, Silver, Bronze
- Battery Type: Lithium, VRLA, Tidak ada
- Current dashboard only has: Availability monitoring (map, site table, worst sites, availability chart)

## Known Context
- Stack: Vite + React frontend, FastAPI backend, Neon Postgres DB
- Existing pages: DashboardPage (map + availability), LoginPage
- Existing router: `react-router-dom` with PrivateRoute
- Backend routers: `map.py`, `availability.py`, `sites.py`, `admin.py`
- API service layer using Axios at `/api/v1`
- Availability data is already joined with traktor for `revenue_payload_semester2_2025` view

## Risks
- Large JOIN queries (traktor × site_master) could be slow without proper indexing — mitigated by existing `idx_month_site` index
- Revenue numbers are very large bigints — need formatting (Miliar/Juta) on frontend
- Some `Site Class` values contain `#N/A` errors from original Excel import — need filtering
- Adding too many features at once could slow down development

## Options (4)

### Option 1: Network Reporting Page (Regional Revenue & Infrastructure Analytics)
**A dedicated reporting page focused on Kabupaten-level breakdowns.**
- **Scorecards**: Total Sites, Total Revenue, Total Payload, Network Availability
- **Revenue & Payload Table**: Pivot by Kabupaten/Kota with revenue breakdown (Voice, BB, Digital, SMS, IR) and payload breakdown (2G/3G/4G/5G)
- **Site Class Table**: Cross-tab of Kabupaten × Site Class (Diamond/Platinum/Gold/Silver/Bronze)
- **Battery Type Table**: Cross-tab of Kabupaten × Battery Type (Lithium/VRLA/None)
- **Month selector filter**: Choose period for the report
- Best for: **Monthly operational reporting** to management

### Option 2: Revenue Trend Analytics Page
**A time-series focused page showing revenue/payload evolution.**
- **Line charts**: Revenue trend over 10 months (total, by Kabupaten, by technology)
- **Technology Migration View**: 2G vs 4G revenue shift over time
- **Growth Rate Cards**: MoM revenue growth %, payload growth %
- **Top/Bottom Performers**: Sites with highest revenue growth/decline
- Best for: **Strategic trend analysis** and capacity planning

### Option 3: Site Revenue Heatmap & Efficiency Dashboard
**A performance efficiency analysis page.**
- **Revenue per User (RPU) Map**: Color-code sites by `pld_per_usr` on map
- **Revenue Efficiency Matrix**: Scatter plot — Revenue vs Payload per site
- **Revenue Class Distribution**: How much revenue comes from each site class
- **Underperforming Detection**: Sites with high traffic but low revenue
- Best for: **Revenue optimization** and identifying underperforming assets

### Option 4: Integrated Revenue Tab in Existing Dashboard
**Add revenue data directly to the current dashboard instead of a new page.**
- Add revenue/payload columns to existing SiteTable
- Add revenue summary cards to SummaryCards
- Add revenue overlay to MapboxMap (color by revenue)
- Add revenue data to SiteDetailModal
- Best for: **Quick win** with minimal architecture change, but clutters existing page

## Recommendation
**Option 1 (Network Reporting Page)** is recommended as the primary deliverable because:
1. It directly matches the user's request for regional reporting
2. Creates a clean separation from the availability-focused main dashboard
3. The pivot-table style suits management reporting workflows
4. Can be extended later with chart elements from Option 2

**Additionally**, elements from Option 3 (RPU map, efficiency metrics) should be considered as future Phase 2 enhancements to the reporting page.

## Acceptance Criteria
- [ ] New "Network Reporting" page accessible via navigation from Header
- [ ] Scorecards showing: Total Sites, Total Revenue (formatted IDR), Total Payload (formatted GB), Avg Availability %
- [ ] Revenue & Payload breakdown table pivoted by Kabupaten/Kota
- [ ] Site Class distribution table pivoted by Kabupaten/Kota  
- [ ] Battery Type distribution table pivoted by Kabupaten/Kota
- [ ] Month/Year filter to select reporting period
- [ ] All revenue numbers formatted as Miliar/Juta IDR
- [ ] Backend API endpoint(s) for aggregated reporting queries
- [ ] Responsive design matching existing dashboard aesthetic
