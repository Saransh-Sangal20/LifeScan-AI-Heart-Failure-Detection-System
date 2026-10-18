import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 60000
});

/**
 * Submit patient data for ML evaluation & clinical reasoning.
 */
export async function submitPrediction(patientData) {
  try {
    const response = await apiClient.post('/predict', patientData);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw error.response.data;
    }
    throw { message: error.message || 'Failed to connect to the prediction backend service.' };
  }
}

/**
 * Fetch all patient history records with optional search, filter, and sort.
 */
export async function getPatients(params = {}) {
  try {
    const response = await apiClient.get('/patients', { params });
    return response.data;
  } catch (error) {
    console.error('API Error in getPatients:', error);
    if (error.response && error.response.data) {
      throw error.response.data;
    }
    throw { message: 'Failed to retrieve patient records.' };
  }
}

/**
 * Fetch a single patient report by MongoDB ID or PredictionID.
 */
export async function getPatientById(id) {
  try {
    const response = await apiClient.get(`/patients/${id}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw error.response.data;
    }
    throw { message: `Failed to retrieve patient record for ID ${id}.` };
  }
}

/**
 * Delete a patient record.
 */
export async function deletePatient(id) {
  try {
    const response = await apiClient.delete(`/patients/${id}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw error.response.data;
    }
    throw { message: 'Failed to delete patient record.' };
  }
}

/**
 * Fetch aggregated metrics & chart data for the Analytics page.
 */
export async function getAnalytics() {
  try {
    const response = await apiClient.get('/analytics');
    return response.data;
  } catch (error) {
    console.error('API Error in getAnalytics:', error);
    if (error.response && error.response.data) {
      throw error.response.data;
    }
    throw { message: 'Failed to fetch analytics metrics.' };
  }
}

/**
 * Fetch microservice health status.
 */
export async function getSystemHealth() {
  try {
    const response = await apiClient.get('/health');
    return response.data;
  } catch (error) {
    return {
      status: 'offline',
      backend: 'Unreachable',
      ml_service: { status: 'offline' }
    };
  }
}

export default {
  submitPrediction,
  getPatients,
  getPatientById,
  deletePatient,
  getAnalytics,
  getSystemHealth
};
