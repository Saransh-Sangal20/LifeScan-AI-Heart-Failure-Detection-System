import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import LoadingPulse from '../components/LoadingPulse';
import Toast from '../components/Toast';
import { submitPrediction } from '../services/api';

export default function AddPatientPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const initialForm = {
    name: '',
    age: '',
    gender: '',
    contact: '',
    height: '',
    weight: '',
    ChestPainType: '',
    RestingBP: '',
    Cholesterol: '',
    FastingBS: '',
    RestingECG: '',
    MaxHR: '',
    ExerciseAngina: '',
    Oldpeak: '',
    ST_Slope: ''
  };

  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});

  const presets = {
    highRisk: {
      name: 'Saransh Sangal',
      age: 65,
      gender: 'M',
      contact: '9811234567',
      height: 175,
      weight: 82,
      ChestPainType: 'ASY',
      RestingBP: 150,
      Cholesterol: 285,
      FastingBS: 1,
      RestingECG: 'LVH',
      MaxHR: 108,
      ExerciseAngina: 'Y',
      Oldpeak: 2.8,
      ST_Slope: 'Flat'
    },
    moderateRisk: {
      name: 'Amit Patel',
      age: 48,
      gender: 'M',
      contact: '9734567890',
      height: 172,
      weight: 74,
      ChestPainType: 'NAP',
      RestingBP: 128,
      Cholesterol: 235,
      FastingBS: 0,
      RestingECG: 'Normal',
      MaxHR: 140,
      ExerciseAngina: 'N',
      Oldpeak: 0.9,
      ST_Slope: 'Flat'
    },
    lowRisk: {
      name: 'Rahul Sharma',
      age: 38,
      gender: 'M',
      contact: '9123456789',
      height: 174,
      weight: 70,
      ChestPainType: 'ATA',
      RestingBP: 118,
      Cholesterol: 190,
      FastingBS: 0,
      RestingECG: 'Normal',
      MaxHR: 160,
      ExerciseAngina: 'N',
      Oldpeak: 0.0,
      ST_Slope: 'Up'
    }
  };

  const loadPreset = (key) => {
    if (presets[key]) {
      setForm(presets[key]);
      setErrors({});
      setToast({
        type: 'info',
        message: `Loaded sample record for ${presets[key].name}.`
      });
    }
  };

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? '' : Number(value)) : value
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const validate = () => {
    const errs = {};
    if (!form.name || !form.name.trim()) errs.name = 'Patient name is required.';
    if (!form.age || form.age < 1 || form.age > 120) errs.age = 'Enter a valid age (1-120).';
    if (!form.gender) errs.gender = 'Please select a gender.';
    if (!form.RestingBP || form.RestingBP < 40 || form.RestingBP > 300) errs.RestingBP = 'Enter resting BP (40-300 mm Hg).';
    if (form.Cholesterol === '' || form.Cholesterol < 0 || form.Cholesterol > 700) errs.Cholesterol = 'Enter cholesterol (0-700 mg/dl).';
    if (form.FastingBS === '') errs.FastingBS = 'Please select fasting blood sugar.';
    if (!form.RestingECG) errs.RestingECG = 'Please select resting ECG.';
    if (!form.MaxHR || form.MaxHR < 40 || form.MaxHR > 250) errs.MaxHR = 'Enter max HR (40-250 bpm).';
    if (!form.ChestPainType) errs.ChestPainType = 'Please select chest pain type.';
    if (!form.ExerciseAngina) errs.ExerciseAngina = 'Please select exercise angina status.';
    if (form.Oldpeak === '' || form.Oldpeak < -5 || form.Oldpeak > 10) errs.Oldpeak = 'Enter ST depression (-5.0 to 10.0).';
    if (!form.ST_Slope) errs.ST_Slope = 'Please select peak ST slope.';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      setToast({ type: 'error', message: 'Please complete the required medical parameters.' });
      return;
    }

    try {
      setLoading(true);
      const payload = {
        name: form.name.trim(),
        age: Number(form.age),
        gender: form.gender,
        contact: form.contact ? form.contact.trim() : '',
        height: form.height ? Number(form.height) : null,
        weight: form.weight ? Number(form.weight) : null,
        // 11 ML features
        Age: Number(form.age),
        Sex: form.gender,
        ChestPainType: form.ChestPainType,
        RestingBP: Number(form.RestingBP),
        Cholesterol: Number(form.Cholesterol),
        FastingBS: Number(form.FastingBS),
        RestingECG: form.RestingECG,
        MaxHR: Number(form.MaxHR),
        ExerciseAngina: form.ExerciseAngina,
        Oldpeak: Number(form.Oldpeak),
        ST_Slope: form.ST_Slope
      };

      const result = await submitPrediction(payload);
      const savedPatient = result?.data;
      const targetId = savedPatient?.predictionId || savedPatient?._id;

      navigate(`/report/${targetId}`);
    } catch (err) {
      console.error('Prediction failed:', err);
      setToast({
        type: 'error',
        message: err.message || err.error || 'Failed to generate prediction. Check backend connection.'
      });
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* ── Page Header ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Add Patient
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Enter patient details and medical parameters to calculate heart failure risk
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setForm(initialForm); setErrors({}); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-medium transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear Form</span>
          </button>
        </div>
      </div>

      {/* ── Sample Fill Buttons (For Quick Demonstration) ──── */}
      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-slate-600 font-medium">Quick Demo Profiles:</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadPreset('highRisk')}
            className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-red-700 rounded text-xs font-medium"
          >
            Sample High Risk (Saransh)
          </button>
          <button
            type="button"
            onClick={() => loadPreset('moderateRisk')}
            className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-amber-700 rounded text-xs font-medium"
          >
            Sample Moderate Risk (Amit)
          </button>
          <button
            type="button"
            onClick={() => loadPreset('lowRisk')}
            className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-emerald-700 rounded text-xs font-medium"
          >
            Sample Low Risk (Rahul)
          </button>
        </div>
      </div>

      {/* ── Form Container ─────────────────────────────────── */}
      {loading ? (
        <div className="app-card p-10">
          <LoadingPulse message="Processing clinical parameters and calculating prediction..." />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* GROUP 1: Patient Information */}
          <div className="app-card p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-800 border-b border-slate-200 pb-2">
              Patient Information
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              {/* Patient Name */}
              <div className="sm:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700 block">
                  Patient Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Enter Patient Name"
                  className={`w-full px-3 py-2 bg-white border ${
                    errors.name ? 'border-red-500' : 'border-slate-300'
                  } rounded-md text-slate-800 text-sm focus:outline-none focus:border-blue-600`}
                />
                {errors.name && <p className="text-red-600 text-xs mt-0.5">{errors.name}</p>}
              </div>

              {/* Age */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">
                  Age <span className="text-red-600">*</span>
                </label>
                <input
                  type="number"
                  name="age"
                  value={form.age}
                  onChange={handleChange}
                  placeholder="e.g. 50"
                  min="1"
                  max="120"
                  className={`w-full px-3 py-2 bg-white border ${
                    errors.age ? 'border-red-500' : 'border-slate-300'
                  } rounded-md text-slate-800 text-sm focus:outline-none focus:border-blue-600`}
                />
                {errors.age && <p className="text-red-600 text-xs mt-0.5">{errors.age}</p>}
              </div>

              {/* Gender */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">
                  Gender <span className="text-red-600">*</span>
                </label>
                <select
                  name="gender"
                  value={form.gender}
                  onChange={handleChange}
                  className={`w-full px-3 py-2 bg-white border ${
                    errors.gender ? 'border-red-500' : 'border-slate-300'
                  } rounded-md text-slate-800 text-sm focus:outline-none focus:border-blue-600`}
                >
                  <option value="">Select Gender</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
                {errors.gender && <p className="text-red-600 text-xs mt-0.5">{errors.gender}</p>}
              </div>

              {/* Phone */}
              <div className="sm:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700 block">
                  Phone (Optional)
                </label>
                <input
                  type="text"
                  name="contact"
                  value={form.contact}
                  onChange={handleChange}
                  placeholder="9876543210"
                  maxLength="10"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-800 text-sm focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* Height */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">
                  Height in cm (Optional)
                </label>
                <input
                  type="number"
                  name="height"
                  value={form.height}
                  onChange={handleChange}
                  placeholder="e.g. 175"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-800 text-sm focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* Weight */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">
                  Weight in kg (Optional)
                </label>
                <input
                  type="number"
                  name="weight"
                  value={form.weight}
                  onChange={handleChange}
                  placeholder="e.g. 70"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-800 text-sm focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
          </div>

          {/* GROUP 2: Medical Parameters */}
          <div className="app-card p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-800 border-b border-slate-200 pb-2">
              Medical Parameters
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              
              {/* Resting BP */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">
                  Resting Blood Pressure (mm Hg) <span className="text-red-600">*</span>
                </label>
                <input
                  type="number"
                  name="RestingBP"
                  value={form.RestingBP}
                  onChange={handleChange}
                  placeholder="e.g. 130"
                  min="40"
                  max="300"
                  className={`w-full px-3 py-2 bg-white border ${
                    errors.RestingBP ? 'border-red-500' : 'border-slate-300'
                  } rounded-md text-slate-800 text-sm focus:outline-none focus:border-blue-600`}
                />
                {errors.RestingBP && <p className="text-red-600 text-xs mt-0.5">{errors.RestingBP}</p>}
              </div>

              {/* Cholesterol */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">
                  Serum Cholesterol (mg/dl) <span className="text-red-600">*</span>
                </label>
                <input
                  type="number"
                  name="Cholesterol"
                  value={form.Cholesterol}
                  onChange={handleChange}
                  placeholder="e.g. 220"
                  min="0"
                  max="700"
                  className={`w-full px-3 py-2 bg-white border ${
                    errors.Cholesterol ? 'border-red-500' : 'border-slate-300'
                  } rounded-md text-slate-800 text-sm focus:outline-none focus:border-blue-600`}
                />
                {errors.Cholesterol && <p className="text-red-600 text-xs mt-0.5">{errors.Cholesterol}</p>}
              </div>

              {/* Fasting BS */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">
                  Fasting Blood Sugar <span className="text-red-600">*</span>
                </label>
                <select
                  name="FastingBS"
                  value={form.FastingBS}
                  onChange={handleChange}
                  className={`w-full px-3 py-2 bg-white border ${
                    errors.FastingBS ? 'border-red-500' : 'border-slate-300'
                  } rounded-md text-slate-800 text-sm focus:outline-none focus:border-blue-600`}
                >
                  <option value="">Select Fasting Blood Sugar</option>
                  <option value={0}>≤ 120 mg/dl (Normal)</option>
                  <option value={1}>&gt; 120 mg/dl (Elevated / Diabetic)</option>
                </select>
                {errors.FastingBS && <p className="text-red-600 text-xs mt-0.5">{errors.FastingBS}</p>}
              </div>

              {/* Resting ECG */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">
                  Resting ECG <span className="text-red-600">*</span>
                </label>
                <select
                  name="RestingECG"
                  value={form.RestingECG}
                  onChange={handleChange}
                  className={`w-full px-3 py-2 bg-white border ${
                    errors.RestingECG ? 'border-red-500' : 'border-slate-300'
                  } rounded-md text-slate-800 text-sm focus:outline-none focus:border-blue-600`}
                >
                  <option value="">Select Resting ECG</option>
                  <option value="Normal">Normal</option>
                  <option value="LVH">Left Ventricular Hypertrophy (LVH)</option>
                  <option value="ST">ST-T Wave Abnormality (ST)</option>
                </select>
                {errors.RestingECG && <p className="text-red-600 text-xs mt-0.5">{errors.RestingECG}</p>}
              </div>

              {/* MaxHR */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">
                  Max Heart Rate (bpm) <span className="text-red-600">*</span>
                </label>
                <input
                  type="number"
                  name="MaxHR"
                  value={form.MaxHR}
                  onChange={handleChange}
                  placeholder="e.g. 145"
                  min="40"
                  max="250"
                  className={`w-full px-3 py-2 bg-white border ${
                    errors.MaxHR ? 'border-red-500' : 'border-slate-300'
                  } rounded-md text-slate-800 text-sm focus:outline-none focus:border-blue-600`}
                />
                {errors.MaxHR && <p className="text-red-600 text-xs mt-0.5">{errors.MaxHR}</p>}
              </div>

              {/* Chest Pain Type */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">
                  Chest Pain Type <span className="text-red-600">*</span>
                </label>
                <select
                  name="ChestPainType"
                  value={form.ChestPainType}
                  onChange={handleChange}
                  className={`w-full px-3 py-2 bg-white border ${
                    errors.ChestPainType ? 'border-red-500' : 'border-slate-300'
                  } rounded-md text-slate-800 text-sm focus:outline-none focus:border-blue-600`}
                >
                  <option value="">Select Chest Pain Type</option>
                  <option value="ASY">ASY - Asymptomatic</option>
                  <option value="ATA">ATA - Atypical Angina</option>
                  <option value="NAP">NAP - Non-Anginal Pain</option>
                  <option value="TA">TA - Typical Angina</option>
                </select>
                {errors.ChestPainType && <p className="text-red-600 text-xs mt-0.5">{errors.ChestPainType}</p>}
              </div>

              {/* Exercise Angina */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">
                  Exercise Induced Angina <span className="text-red-600">*</span>
                </label>
                <select
                  name="ExerciseAngina"
                  value={form.ExerciseAngina}
                  onChange={handleChange}
                  className={`w-full px-3 py-2 bg-white border ${
                    errors.ExerciseAngina ? 'border-red-500' : 'border-slate-300'
                  } rounded-md text-slate-800 text-sm focus:outline-none focus:border-blue-600`}
                >
                  <option value="">Select Angina Status</option>
                  <option value="N">No (Absent)</option>
                  <option value="Y">Yes (Present)</option>
                </select>
                {errors.ExerciseAngina && <p className="text-red-600 text-xs mt-0.5">{errors.ExerciseAngina}</p>}
              </div>

              {/* Oldpeak */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">
                  ST Depression (Oldpeak) (mm) <span className="text-red-600">*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  name="Oldpeak"
                  value={form.Oldpeak}
                  onChange={handleChange}
                  placeholder="e.g. 1.0"
                  min="-5"
                  max="10"
                  className={`w-full px-3 py-2 bg-white border ${
                    errors.Oldpeak ? 'border-red-500' : 'border-slate-300'
                  } rounded-md text-slate-800 text-sm focus:outline-none focus:border-blue-600`}
                />
                {errors.Oldpeak && <p className="text-red-600 text-xs mt-0.5">{errors.Oldpeak}</p>}
              </div>

              {/* ST Slope */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">
                  ST Slope <span className="text-red-600">*</span>
                </label>
                <select
                  name="ST_Slope"
                  value={form.ST_Slope}
                  onChange={handleChange}
                  className={`w-full px-3 py-2 bg-white border ${
                    errors.ST_Slope ? 'border-red-500' : 'border-slate-300'
                  } rounded-md text-slate-800 text-sm focus:outline-none focus:border-blue-600`}
                >
                  <option value="">Select ST Slope</option>
                  <option value="Up">Upsloping (Up)</option>
                  <option value="Flat">Flat</option>
                  <option value="Down">Downsloping (Down)</option>
                </select>
                {errors.ST_Slope && <p className="text-red-600 text-xs mt-0.5">{errors.ST_Slope}</p>}
              </div>

            </div>
          </div>

          {/* ── Predict Risk Button ────────────────────────────── */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="w-full sm:w-auto px-6 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white font-medium text-sm rounded-md shadow-sm transition-colors"
            >
              Predict Risk
            </button>
          </div>

        </form>
      )}

      {/* Toast Notification */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

    </div>
  );
}
