import axios from 'axios'

// Base URL is environment-driven, exactly as before.
export const API_URL = import.meta.env.VITE_API_URL

// Backend may return a bare array or a DRF paginated object; handle both.
export function getRecordsPayload(data) {
  return Array.isArray(data) ? data : data.results || []
}

// --- API calls (endpoints and shapes are unchanged) ---

export async function fetchNormalizedRecords() {
  const response = await axios.get(`${API_URL}/api/normalized-records/`)
  return getRecordsPayload(response.data)
}

export async function approveRecord(recordId) {
  const response = await axios.patch(`${API_URL}/api/normalized-records/${recordId}/approve/`)
  return response.data
}

// No custom X-Tenant-ID header: a custom request header makes this a non-simple
// cross-origin request, triggering a CORS preflight the backend's default
// allowed-headers list rejects -> the browser surfaces "Network Error" even though
// the endpoint returns 200. The records list omits the header for the same reason;
// the backend resolves the default tenant when none is sent.
export async function fetchRawPayload(rawPayloadId) {
  const response = await axios.get(`${API_URL}/api/raw-payloads/${rawPayloadId}/`)
  return response.data
}

export function describeError(err, fallback) {
  return err?.response?.data?.detail || err?.message || fallback
}
