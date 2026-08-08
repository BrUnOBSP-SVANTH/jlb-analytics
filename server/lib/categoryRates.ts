// Base rates históricas por categoria — âncora do protocolo Superforecaster.
// Usado pela análise de mercado, model-predict e seed de previsões.
export const CATEGORY_BASE_RATES: Record<string, { baseRate: number; volatility: string; note: string }> = {
  politics:   { baseRate: 50,  volatility: "alta",   note: "Eventos políticos têm alta incerteza — base rate neutro 50%" },
  sports:     { baseRate: 50,  volatility: "média",  note: "Resultados esportivos são próximos de 50% sem info adicional" },
  crypto:     { baseRate: 50,  volatility: "muito alta", note: "Cripto tem alta volatilidade — base rate neutro" },
  economics:  { baseRate: 60,  volatility: "média",  note: "Indicadores macro tendem a continuar a tendência vigente" },
  science:    { baseRate: 65,  volatility: "baixa",  note: "Eventos científicos geralmente confirmam tendências" },
  climate:    { baseRate: 70,  volatility: "baixa",  note: "Previsões climáticas têm alta acurácia em curto prazo" },
  business:   { baseRate: 55,  volatility: "média",  note: "M&A e resultados corporativos tendem levemente positivos" },
  other:      { baseRate: 50,  volatility: "alta",   note: "Categoria desconhecida — base rate neutro" },
};
