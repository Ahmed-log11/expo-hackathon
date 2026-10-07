# ml/ — wait-time prediction

Goal: predict each pavilion's wait for the next 30–60 minutes.

Plan:
1. Until a model exists, use the formula in engine/crowd_state.py.
2. Train on simulation logs from sim/ (features: crowd counts, entry rate,
   time of day, day of week, weather).
3. Start with scikit-learn or XGBoost. Save the model to ml/models/.
4. Loaded once by the backend; prediction is a plain function call.

Training is offline only. Live, the model only predicts.
