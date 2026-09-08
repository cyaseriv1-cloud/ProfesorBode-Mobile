# 📡 ProfesorBode Mobile (Android)

Herramienta móvil integral para el análisis y diseño de sistemas de control en el dominio de la frecuencia y del tiempo.

## 🚀 Módulos Incluidos
- **📈 Diagrama de Bode**: Asintótico y exacto con cálculo de Margen de Fase (MF) y Margen de Ganancia (MG).
- **🌀 Diagrama de Nyquist**: Con flechas de dirección en oro brillante y evaluación de estabilidad $Z = N + P$.
- **🎯 Lugar de las Raíces (Root Locus)**: Evolución de polos en función de la ganancia $K$.
- **⚙️ Diseño de Compensadores**: Adelanto (Lead), Retraso (Lag) y Adelanto-Retraso (Lead-Lag) con ajuste de $K_v$, MF y MG.
- **⏱️ Respuesta Temporal al Escalón**: Simulación numérica en lazo cerrado con $t_r, t_s, M_p, y_{ss}, e_{ss}$ comparando antes y después de compensar.

## 🛠️ Compilación del APK
Este repositorio cuenta con un flujo automatizado de **GitHub Actions** (`.github/workflows/build-apk.yml`) que compila el archivo APK para Android en cada commit.

Desarrollado con ❤️ por YCH.
