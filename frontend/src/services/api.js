/**
 * API service — Axios instance + all API call functions.
 * Communicates with FastAPI backend.
 */
import axios from 'axios';
import { withTransportRetry } from './transportQualityRequest.js';

const API_BASE_URL = '/api/v1';

let unauthorizedHandler = null;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  withCredentials: true,
});

api.interceptors.response.use(undefined, (error) => {
  const path = error.config?.url || '';
  const isAuthEndpoint = path.startsWith('/auth/');
  if (error.response?.status === 401 && !isAuthEndpoint) {
    unauthorizedHandler?.();
  }
  return Promise.reject(error);
});

// ===== Auth =====

export async function authLogin(username, password) {
  const { data } = await api.post('/auth/login', { username, password });
  return data;
}

export async function authSession() {
  const { data } = await api.get('/auth/session');
  return data;
}

export async function authLogout() {
  const { data } = await api.post('/auth/logout');
  return data;
}

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null;
    }
  };
}


// ===== Map =====

export async function fetchMapSites(bulan, tahun, nop, signal) {
  const { data } = await api.get('/map/sites', {
    params: { bulan, tahun, nop: nop || undefined },
    timeout: 60000,
    signal,
  });
  return data;
}

export async function fetchMapSectors({ nop, siteId, signal } = {}) {
  const { data } = await api.get('/map/sectors', {
    params: {
      nop: nop || undefined,
      site_id: siteId || undefined,
    },
    timeout: 60000,
    signal,
  });
  return data;
}

export async function fetchSitePopup(siteId, bulan, tahun, signal) {
  const { data } = await api.get(`/map/sites/${siteId}/popup`, {
    params: { bulan, tahun },
    signal,
  });
  return data;
}

// ===== Availability =====

export async function fetchSummary(bulan, tahun, filters = {}) {
  const { data } = await api.get('/availability/summary', {
    params: { bulan, tahun, ...filters },
  });
  return data;
}

export async function fetchLatestPeriod() {
  const { data } = await api.get('/availability/latest-period');
  return data;
}

export async function fetchByKabupaten(bulan, tahun) {
  const { data } = await api.get('/availability/by-kabupaten', { params: { bulan, tahun } });
  return data;
}

export async function fetchSiteAvailability(siteId, bulan, tahun, signal) {
  const { data } = await api.get(`/availability/site/${siteId}`, {
    params: { bulan, tahun },
    signal,
  });
  return data;
}

export async function fetchTrend(siteId, tahun, bulan, signal) {
  const { data } = await api.get(`/availability/trend/${siteId}`, {
    params: { tahun, bulan },
    signal,
  });
  return data;
}

export async function fetchWorstSites(bulan, tahun, limit = 10, filters = {}) {
  const { data } = await api.get('/availability/worst', {
    params: { bulan, tahun, limit, ...filters },
  });
  return data;
}

// ===== Sites =====

export async function fetchSites({ bulan, tahun, kabupaten, cluster, status, kelas, nop, q, page = 1, limit = 20 } = {}) {
  const { data } = await api.get('/sites', {
    params: { bulan, tahun, kabupaten, cluster, status, kelas, nop, q, page, limit },
  });
  return data;
}

export async function fetchSiteDetail(siteId, bulan, tahun, signal) {
  const { data } = await api.get(`/sites/${siteId}/detail`, {
    params: { bulan, tahun },
    signal,
  });
  return data;
}

export async function searchSites(q) {
  const { data } = await api.get('/sites/search', { params: { q } });
  return data;
}

export async function fetchFilterOptions() {
  const { data } = await api.get('/sites/filters/options');
  return data;
}

// ===== Health =====

export async function healthCheck() {
  const { data } = await api.get('/health');
  return data;
}

// ===== Overview =====

export async function fetchOverview({ bulan, tahun, period, nop } = {}, signal) {
  const { data } = await api.get('/overview', {
    params: {
      bulan: bulan || undefined,
      tahun: tahun || undefined,
      period_start: period?.start || undefined,
      period_end: period?.end || undefined,
      nop: nop || undefined,
    },
    signal,
  });
  return data;
}

// ===== Reporting =====

export async function fetchReportingAvailableMonths() {
  const { data } = await api.get('/reporting/available-months');
  return data;
}

function monthPeriodParams(period) {
  if (typeof period === 'string') return { trx_month: period };
  return {
    period_start: period?.start || undefined,
    period_end: period?.end || undefined,
  };
}

export async function fetchReportingScorecards(period, nop) {
  const { data } = await api.get('/reporting/scorecards', {
    params: { ...monthPeriodParams(period), nop: nop || undefined },
  });
  return data;
}

export async function fetchRevenueByKabupaten(period, nop) {
  const { data } = await api.get('/reporting/revenue-by-kabupaten', {
    params: { ...monthPeriodParams(period), nop: nop || undefined },
  });
  return data;
}

export async function fetchSiteClassByKabupaten(period, nop) {
  const { data } = await api.get('/reporting/site-class-by-kabupaten', {
    params: { ...monthPeriodParams(period), nop: nop || undefined },
  });
  return data;
}

export async function fetchRevenueTrend(period, nop) {
  const { data } = await api.get('/reporting/trend', {
    params: { ...monthPeriodParams(period), nop: nop || undefined },
  });
  return data;
}

export async function fetchSitePerformance(siteId, signal) {
  const { data } = await api.get(`/reporting/site/${siteId}/performance`, { signal });
  return data;
}

// ===== Impact Service =====

export async function fetchImpactServiceFilters() {
  const { data } = await api.get('/impact-service/filters', {});
  return data;
}

export async function fetchImpactServiceSummary(params) {
  const { data } = await api.get('/impact-service/summary', { params: params });
  return data;
}

export async function fetchImpactServiceDailyTrend(params) {
  const { data } = await api.get('/impact-service/daily-trend', { params: params });
  return data;
}

export async function fetchImpactServiceLast7DaysTrend(params) {
  const { data } = await api.get('/impact-service/last-7-days-trend', { params: params });
  return data;
}

export async function fetchImpactServiceDistributions(params) {
  const { data } = await api.get('/impact-service/distributions', { params: params });
  return data;
}

export async function fetchImpactServiceTopAlarms(params) {
  const { data } = await api.get('/impact-service/top-alarms', { params: params });
  return data;
}

export async function fetchImpactServiceTopSites(params) {
  const { data } = await api.get('/impact-service/top-sites', { params: params });
  return data;
}

export async function fetchImpactServiceAlarms(params) {
  const { data } = await api.get('/impact-service/alarms', { params: params });
  return data;
}

export async function fetchImpactServiceAlarmDetail(alarmId, params) {
  const { data } = await api.get(`/impact-service/alarms/${alarmId}`, { params: params });
  return data;
}

// ===== Activity ENOM =====

export async function fetchActivityEnomFilters() {
  const { data } = await api.get('/activity-enom/filters', {
    params: { _: Date.now() },
    headers: { 'Cache-Control': 'no-cache' },
  });
  return data;
}

export async function fetchActivityEnomSummary(params) {
  const { data } = await api.get('/activity-enom/summary', { params: params });
  return data;
}

export async function fetchActivityEnomTrend(params) {
  const { data } = await api.get('/activity-enom/trend', { params: params });
  return data;
}

export async function fetchActivityEnomBreakdowns(params) {
  const { data } = await api.get('/activity-enom/breakdowns', { params: params });
  return data;
}

export async function fetchActivityEnomTopActivities(params) {
  const { data } = await api.get('/activity-enom/top-activities', { params: params });
  return data;
}

export async function fetchActivityEnomActivities(params) {
  const { data } = await api.get('/activity-enom/activities', { params: params });
  return data;
}

export async function fetchActivityEnomActivityDetail(activityId, params) {
  const { data } = await api.get(`/activity-enom/activities/${activityId}`, { params: params });
  return data;
}

// ===== Transport Quality =====

async function transportQualityGet(path, config = {}) {
  return withTransportRetry(async () => {
    const { data } = await api.get(path, config);
    return data;
  });
}

export async function fetchTransportQualityFilters(signal) {
  return transportQualityGet('/transport-quality/filters', {
    params: { _: Date.now() },
    headers: { 'Cache-Control': 'no-cache' },
    signal,
  });
}

export async function fetchTransportQualitySummary(params, signal) {
  return transportQualityGet('/transport-quality/summary', { params, signal });
}

export async function fetchTransportQualityTrend(params, signal) {
  return transportQualityGet('/transport-quality/trend', { params, signal });
}

export async function fetchTransportQualityDistributions(params, signal) {
  return transportQualityGet('/transport-quality/distributions', { params, signal });
}

export async function fetchTransportQualityBreakdowns(params, signal) {
  return transportQualityGet('/transport-quality/breakdowns', { params, signal });
}

export async function fetchTransportQualityPrioritySites(params, signal) {
  return transportQualityGet('/transport-quality/priority-sites', { params, signal });
}

// ===== Ticketing =====

export async function fetchTicketingFilters() {
  const { data } = await api.get('/ticketing/filters', {});
  return data;
}

export async function fetchTicketingDashboard(params) {
  const { data } = await api.get('/ticketing/dashboard', { params: params });
  return data;
}

export async function fetchTicketingTickets(params) {
  const { data } = await api.get('/ticketing/tickets', { params: params });
  return data;
}

export async function exportTicketingTickets(params) {
  return api.get('/ticketing/tickets/export', { params, responseType: 'blob' });
}

export async function fetchTicketingTicketDetail(ticketNumberSwfm) {
  const { data } = await api.get(`/ticketing/tickets/${encodeURIComponent(ticketNumberSwfm)}`);
  return data;
}

// ===== Ticket TOTI =====

export async function fetchTicketTotiFilters(signal) {
  const { data } = await api.get('/ticketing/toti/filters', { signal });
  return data;
}

export async function fetchTicketTotiDashboard(params, signal) {
  const { data } = await api.get('/ticketing/toti/dashboard', { params, signal });
  return data;
}

export async function fetchTicketTotiTickets(params, signal) {
  const { data } = await api.get('/ticketing/toti/tickets', { params, signal });
  return data;
}

// ===== Management Data =====

export async function fetchManagementTargets() {
  const { data } = await api.get('/management-data/targets');
  return data;
}

export async function validateManagementImport(target, files) {
  const body = new FormData();
  body.append('target', target);
  files.forEach((file) => body.append('files', file));
  const { data } = await api.post('/management-data/imports/validate', body);
  return data;
}

export async function commitManagementImport(jobId) {
  const { data } = await api.post(`/management-data/imports/${encodeURIComponent(jobId)}/commit`);
  return data;
}

export async function fetchManagementImports() {
  const { data } = await api.get('/management-data/imports');
  return data;
}

export async function fetchPicAliases() {
  const { data } = await api.get('/management-data/pic-aliases');
  return data;
}

export async function savePicAlias(payload) {
  const { data } = await api.post('/management-data/pic-aliases', payload);
  return data;
}

export async function deletePicAlias(aliasId) {
  await api.delete(`/management-data/pic-aliases/${encodeURIComponent(aliasId)}`);
}

export async function fetchDashboardUsers() {
  const { data } = await api.get('/management-data/users');
  return data;
}

export async function createDashboardUser(payload) {
  const { data } = await api.post('/management-data/users', payload);
  return data;
}

export async function updateDashboardUser(userId, payload) {
  const { data } = await api.patch(`/management-data/users/${encodeURIComponent(userId)}`, payload);
  return data;
}

// ===== Data Potensi =====

export async function fetchDataPotensiDashboard(params) {
  const { data } = await api.get('/data-potensi/dashboard', { params });
  return data;
}

export async function fetchDataPotensiSites(params) {
  const { data } = await api.get('/data-potensi/sites', { params });
  return data;
}

export async function fetchDataPotensiStatusOptions() {
  const { data } = await api.get('/data-potensi/status-options');
  return data;
}

export async function fetchDataPotensiFilterOptions(params) {
  const { data } = await api.get('/data-potensi/filter-options', { params });
  return data;
}

// ===== RF Tilt Analysis =====

export async function searchRfTiltSites(q) {
  const { data } = await api.get('/rf-tilt/sites', {
    params: { q: q || undefined },
  });
  return data;
}

export async function analyzeRfTilt(payload) {
  const { data } = await api.post('/rf-tilt/analysis', payload, {
    timeout: 60000,
  });
  return data;
}

export async function getAntennaSpec(antennaType) {
  const { data } = await api.get('/rf-tilt/antenna-spec', {
    params: { antenna_type: antennaType },
  });
  return data;
}

export async function searchAntennaModels(q) {
  const { data } = await api.get('/rf-tilt/antenna-models', {
    params: { q: q || undefined },
  });
  return data;
}

// ===== Tower Visualizer =====

export async function searchTowerPlanSites(q, signal) {
  const { data } = await api.get('/tower-plan/sites', {
    params: { q: q || undefined, limit: 20 },
    signal,
  });
  return data;
}

export async function fetchTowerPlanConfiguration(siteId, signal) {
  const { data } = await api.get(
    `/tower-plan/sites/${encodeURIComponent(siteId)}/configuration`,
    { signal },
  );
  return data;
}

export default api;
