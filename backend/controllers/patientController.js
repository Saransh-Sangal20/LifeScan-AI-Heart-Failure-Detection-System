const axios = require('axios');
const storage = require('../utils/storage');
const {
  deriveClinicalFactors,
  generateRecommendations,
  generateAISummary
} = require('../utils/clinicalLogic');

const FLASK_API_URL = process.env.FLASK_API_URL || 'http://127.0.0.1:5000';

/**
 * Generates a structured prediction identifier.
 */
function generatePredictionId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `LSAI-${timestamp}-${randomSuffix}`;
}

/**
 * Calculates Body Mass Index (BMI) if height (cm) & weight (kg) are given.
 */
function calculateBMI(heightCm, weightKg) {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
  const heightM = heightCm / 100;
  return Number((weightKg / (heightM * heightM)).toFixed(1));
}

/**
 * POST /api/predict or POST /api/patients
 * Submits patient features to Flask ML model, applies clinical rules, saves record, and returns full report.
 */
async function predictAndSave(req, res) {
  try {
    const data = req.body;

    if (!data || typeof data !== 'object') {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request payload. Request body must be a JSON object.'
      });
    }

    // Helper function for robust numeric parsing (handles strings, decimals, commas, spaces, NaN)
    const parseNum = (val, fallback, min, max) => {
      if (val === undefined || val === null || val === '') return fallback;
      let n = typeof val === 'number' ? val : Number(String(val).trim().replace(',', '.'));
      if (isNaN(n)) return fallback;
      if (min !== undefined && n < min) return min;
      if (max !== undefined && n > max) return max;
      return n;
    };

    // Helper functions for categorical normalization
    const parseChestPain = (val) => {
      const s = String(val || '').trim().toUpperCase();
      if (s.includes('ATA')) return 'ATA';
      if (s.includes('NAP')) return 'NAP';
      if (s.includes('TA') && !s.includes('ATA')) return 'TA';
      return 'ASY';
    };

    const parseECG = (val) => {
      const s = String(val || '').trim().toUpperCase();
      if (s.includes('LVH')) return 'LVH';
      if (s.includes('ST')) return 'ST';
      return 'Normal';
    };

    const parseSlope = (val) => {
      const s = String(val || '').trim().toUpperCase();
      if (s.includes('UP')) return 'Up';
      if (s.includes('DOWN')) return 'Down';
      return 'Flat';
    };

    // Required Demographics
    const name = data.name || data.patientName || 'Anonymous Patient';
    const age = Math.round(parseNum(data.Age !== undefined ? data.Age : data.age, 50, 1, 120));
    const gender = String(data.Sex || data.gender || 'M').trim().toUpperCase().startsWith('F') ? 'F' : 'M';
    const contact = data.contact || data.contactNumber || '';
    const height = data.height ? parseNum(data.height, null) : null;
    const weight = data.weight ? parseNum(data.weight, null) : null;
    const bmi = calculateBMI(height, weight);

    // Extract 11 ML features with robust canonical normalization
    const features = {
      Age: age,
      Sex: gender,
      ChestPainType: parseChestPain(data.ChestPainType),
      RestingBP: Math.round(parseNum(data.RestingBP, 120, 40, 300)),
      Cholesterol: Math.round(parseNum(data.Cholesterol, 200, 0, 700)),
      FastingBS: (data.FastingBS === 1 || data.FastingBS === '1' || data.FastingBS === true) ? 1 : 0,
      RestingECG: parseECG(data.RestingECG),
      MaxHR: Math.round(parseNum(data.MaxHR, 140, 40, 250)),
      ExerciseAngina: String(data.ExerciseAngina || 'N').trim().toUpperCase().startsWith('Y') ? 'Y' : 'N',
      Oldpeak: Number(parseNum(data.Oldpeak, 0.0, -5.0, 10.0).toFixed(1)),
      ST_Slope: parseSlope(data.ST_Slope)
    };

    // Forward feature vector to Flask ML API with retry (handles Render container spin-up)
    let mlResponse = null;
    const maxRetries = 2;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        mlResponse = await axios.post(`${FLASK_API_URL}/predict`, features, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000 // Allow up to 30s for cloud cold starts
        });
        if (mlResponse && mlResponse.data) break;
      } catch (err) {
        lastError = err;
        console.warn(`[LifeScan Backend] ML service attempt ${attempt} failed: ${err.message}`);

        // If it's a real 400 validation error from Python JSON, don't retry - it's intentional
        if (err.response && err.response.status === 400 && typeof err.response.data === 'object' && err.response.data.details) {
          break;
        }

        // If it's 502/503/timeout (Render container waking up), wait 2.5s and retry once
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2500));
        }
      }
    }

    if (!mlResponse || !mlResponse.data) {
      // 1. Check if it's a true 400 validation error from Python ML API
      if (lastError?.response?.status === 400 && typeof lastError.response.data === 'object') {
        const details = lastError.response.data.details;
        const errorMsg = Array.isArray(details)
          ? details.map(d => d.error || d.message).join(' ')
          : lastError.response.data.message || 'Validation error in clinical inputs.';
        return res.status(400).json({
          status: 'error',
          error: 'ML Input Validation Error',
          message: errorMsg,
          details
        });
      }

      // 2. Check if Render is waking up (502/503/504 or HTML gateway response)
      const isGatewayOrTimeout = lastError?.code === 'ECONNABORTED' ||
        lastError?.code === 'ETIMEDOUT' ||
        lastError?.response?.status === 502 ||
        lastError?.response?.status === 503 ||
        lastError?.response?.status === 504 ||
        typeof lastError?.response?.data === 'string';

      if (isGatewayOrTimeout) {
        return res.status(503).json({
          status: 'error',
          error: 'ML Service Starting Up',
          message: 'The AI prediction microservice is currently waking up from standby on the cloud. Please wait a few seconds and tap Predict Risk again.'
        });
      }

      return res.status(503).json({
        status: 'error',
        error: 'ML Service Unavailable',
        message: 'Could not connect to the Python ML Service (' + (lastError?.message || 'timeout') + ').'
      });
    }

    const { prediction, risk_category, risk_percentage } = mlResponse.data;

    // Apply Clinical Reasoning Engine
    const clinicalFactors = deriveClinicalFactors(features);
    const recommendations = generateRecommendations(features, risk_category);
    const aiSummary = generateAISummary({ name, ...features }, risk_percentage, risk_category, clinicalFactors);
    const predictionId = generatePredictionId();

    const patientRecord = {
      predictionId,
      name,
      age,
      gender,
      contact,
      height,
      weight,
      bmi,
      features,
      prediction,
      risk_percentage,
      risk_category,
      clinical_factors: clinicalFactors,
      recommendations,
      ai_summary: aiSummary,
      createdAt: new Date()
    };

    // Save to Database / Storage
    const savedRecord = await storage.savePatient(patientRecord);

    return res.status(201).json({
      status: 'success',
      message: 'Prediction evaluated and patient record saved successfully.',
      data: savedRecord
    });
  } catch (err) {
    console.error('Unexpected error in predictAndSave:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error processing patient prediction.',
      error: err.message
    });
  }
}

/**
 * GET /api/patients
 * Retrieves patient list with priority sorting (highest risk first), search, and risk filter.
 */
async function getAllPatients(req, res) {
  try {
    const { search, filter, sort } = req.query;
    const patients = await storage.findPatients({ search, filter, sort });
    return res.status(200).json({
      status: 'success',
      count: patients.length,
      data: patients
    });
  } catch (err) {
    console.error('Error fetching patients:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve patient history.',
      error: err.message
    });
  }
}

/**
 * GET /api/patients/:id
 * Retrieves a single patient report by MongoDB ID or PredictionID.
 */
async function getPatientById(req, res) {
  try {
    const { id } = req.params;
    const patient = await storage.findPatientById(id);
    if (!patient) {
      return res.status(404).json({
        status: 'error',
        message: `Patient with ID '${id}' not found.`
      });
    }
    return res.status(200).json({
      status: 'success',
      data: patient
    });
  } catch (err) {
    console.error('Error fetching patient details:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve patient record.',
      error: err.message
    });
  }
}

/**
 * DELETE /api/patients/:id
 * Removes a patient record.
 */
async function deletePatient(req, res) {
  try {
    const { id } = req.params;
    const success = await storage.deletePatient(id);
    if (!success) {
      return res.status(404).json({
        status: 'error',
        message: `Patient with ID '${id}' could not be found to delete.`
      });
    }
    return res.status(200).json({
      status: 'success',
      message: 'Patient record deleted successfully.'
    });
  } catch (err) {
    console.error('Error deleting patient:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to delete patient record.',
      error: err.message
    });
  }
}

/**
 * GET /api/analytics
 * Returns aggregated statistics, distributions, and timeline for charts.
 */
async function getAnalytics(req, res) {
  try {
    const analytics = await storage.getAnalytics();
    return res.status(200).json({
      status: 'success',
      data: analytics
    });
  } catch (err) {
    console.error('Error fetching analytics:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to generate analytics data.',
      error: err.message
    });
  }
}

/**
 * GET /api/health
 * Checks health of Express backend, MongoDB, and Flask ML API.
 */
async function checkHealth(req, res) {
  let flaskStatus = 'unreachable';
  let flaskDetails = null;

  try {
    const resp = await axios.get(`${FLASK_API_URL}/health`, { timeout: 3000 });
    flaskStatus = resp.data.status || 'healthy';
    flaskDetails = resp.data;
  } catch (err) {
    flaskStatus = 'offline';
  }

  return res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    backend: 'Express.js online',
    database: storage.isMongoConnected() ? 'MongoDB Connected' : 'Local Fallback Storage Active',
    ml_service: {
      url: FLASK_API_URL,
      status: flaskStatus,
      details: flaskDetails
    }
  });
}

module.exports = {
  predictAndSave,
  getAllPatients,
  getPatientById,
  deletePatient,
  getAnalytics,
  checkHealth
};
