/**
 * API service — Axios instance + all API call functions.
 * Communicates with FastAPI backend.
 */
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Add auth token if exists
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nod_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ===== Auth =====

export async function authLogin(username, password) {
  const { data } = await api.post('/auth/login', { username, password });
  if (data.token) {
    localStorage.setItem('nod_auth_token', data.token);
  }
  return data;
}

export function authLogout() {
  localStorage.removeItem('nod_auth_token');
}


// ===== Map =====

export async function fetchMapSites(bulan, tahun, nop) {
  const { data } = await api.get('/map/sites', {
    params: { bulan, tahun, nop: nop || undefined },
    timeout: 60000,
  });
  return data;
}

export async function fetchMapSectors({ nop, siteId } = {}) {
  const { data } = await api.get('/map/sectors', {
    params: {
      nop: nop || undefined,
      site_id: siteId || undefined,
    },
    timeout: 60000,
  });
  return data;
}

export async function fetchSitePopup(siteId, bulan, tahun) {
  const { data } = await api.get(`/map/sites/${siteId}/popup`, { params: { bulan, tahun } });
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

export async function fetchSiteAvailability(siteId, bulan, tahun) {
  const { data } = await api.get(`/availability/site/${siteId}`, { params: { bulan, tahun } });
  return data;
}

export async function fetchTrend(siteId, tahun, bulan) {
  const { data } = await api.get(`/availability/trend/${siteId}`, { params: { tahun, bulan } });
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

export async function fetchSiteDetail(siteId, bulan, tahun) {
  const { data } = await api.get(`/sites/${siteId}/detail`, { params: { bulan, tahun } });
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

// ===== Reporting =====

export async function fetchReportingAvailableMonths() {
  const { data } = await api.get('/reporting/available-months');
  return data;
}

export async function fetchReportingScorecards(trxMonth, nop) {
  const { data } = await api.get('/reporting/scorecards', {
    params: { trx_month: trxMonth, nop: nop || undefined },
  });
  return data;
}

export async function fetchRevenueByKabupaten(trxMonth, nop) {
  const { data } = await api.get('/reporting/revenue-by-kabupaten', {
    params: { trx_month: trxMonth, nop: nop || undefined },
  });
  return data;
}

export async function fetchSiteClassByKabupaten(trxMonth, nop) {
  const { data } = await api.get('/reporting/site-class-by-kabupaten', {
    params: { trx_month: trxMonth, nop: nop || undefined },
  });
  return data;
}

export async function fetchBatteryByKabupaten(nop) {
  const { data } = await api.get('/reporting/battery-by-kabupaten', {
    params: { nop: nop || undefined },
  });
  return data;
}

export async function fetchRevenueTrend(nop) {
  const { data } = await api.get('/reporting/trend', {
    params: { nop: nop || undefined },
  });
  return data;
}

// ===== Impact Service =====

export async function fetchImpactServiceFilters() {
  const { data } = await api.get('/impact-service/filters', {
    params: { _: Date.now() },
    headers: { 'Cache-Control': 'no-cache' },
  });
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

// ===== Transport Quality =====

export async function fetchTransportQualityFilters() {
  const { data } = await api.get('/transport-quality/filters', {
    params: { _: Date.now() },
    headers: { 'Cache-Control': 'no-cache' },
  });
  return data;
}

export async function fetchTransportQualitySummary(params) {
  const { data } = await api.get('/transport-quality/summary', { params: params });
  return data;
}

export async function fetchTransportQualityTrend(params) {
  const { data } = await api.get('/transport-quality/trend', { params: params });
  return data;
}

export async function fetchTransportQualityDistributions(params) {
  const { data } = await api.get('/transport-quality/distributions', { params: params });
  return data;
}

export async function fetchTransportQualityBreakdowns(params) {
  const { data } = await api.get('/transport-quality/breakdowns', { params: params });
  return data;
}

export async function fetchTransportQualityPrioritySites(params) {
  const { data } = await api.get('/transport-quality/priority-sites', { params: params });
  return data;
}

// ===== Ticketing =====

export async function fetchTicketingFilters() {
  const { data } = await api.get('/ticketing/filters', {
    params: { _: Date.now() },
    headers: { 'Cache-Control': 'no-cache' },
  });
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

export async function fetchTicketingTicketDetail(ticketNumberSwfm) {
  const { data } = await api.get(`/ticketing/tickets/${encodeURIComponent(ticketNumberSwfm)}`);
  return data;
}

export default api;
