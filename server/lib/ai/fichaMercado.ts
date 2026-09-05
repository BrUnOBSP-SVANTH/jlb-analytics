/**
 * Ficha do mercado — o chão que NENHUMA análise pode deixar de ter.
 *
 * O QUE ISTO CONSERTA (05/09). Um mercado de CS2 abriu com a análise dizendo
 * "não temos notícias recentes ou dados proprietários sobre este confronto". Do
 * ponto de vista do leitor, é uma página em branco com um selo de IA. E era
 * evitável duas vezes: as notícias existiam no nosso banco (a busca é que não as
 * achava), e mesmo se não existissem, ainda tínhamos o que dizer.
 *
 * A regra que passa a valer: SEMPRE há o que dizer. Não porque inventamos, mas
 * porque três coisas existem para qualquer mercado, sem exceção:
 *
 *   1. O PREÇO, traduzido. "62%" não diz nada a quem chega; "quem aposta R$ 100
 *      recebe R$ 161 se acertar" diz.
 *   2. NOSSO HISTÓRICO da categoria. Não a base rate genérica que estava escrita
 *      à mão no código ("esportes: 50%, neutro"), mas o que MEDIMOS: em 220
 *      mercados de e-sports acompanhados até a liquidação oficial, o favorito
 *      venceu 84% das vezes. Isso é dado nosso, e é o tipo de coisa que o leitor
 *      não acha em outro lugar.
 *   3. O RELÓGIO. Quanto falta para fechar muda o que importa: em mercado que
 *      resolve amanhã, notícia de ontem é tudo; em um de 2028, é ruído.
 *
 * Nada aqui é estimativa nossa sobre o resultado — é descrição do que existe.
 * Por isso pode ir para a tela mesmo quando a IA não tem convicção nenhuma.
 */
import { SUPABASE_URL, SUPABASE_KEY } from "../supabaseRest.ts";
import { buscarTudo } from "../supaPaginado.ts";
import { getCache, setCache } from "../cache.ts";
import { log } from "../log.ts";

/** O que medimos numa categoria, olhando só o que já resolveu oficialmente. */
export interface HistoricoCategoria {
  categoria: string;
  resolvidos: number;
  /** % das vezes em que o lado favorito (preço > 50%) acabou vencendo. */
  favoritoVenceuPct: number;
  /** Preço médio que o favorito tinha. Comparar com o de cima é o insight. */
  precoMedioFavorito: number;
  /** % das vezes em que o SIM aconteceu — a taxa-base crua da categoria. */
  simAconteceuPct: number;
}

/**
 * Amostra mínima para publicar um número. Abaixo disto a porcentagem oscila
 * demais para significar algo: com 10 casos, um único resultado move 10 pontos.
 */
const MIN_AMOSTRA = 25;

const CACHE_KEY = "ficha:historico-categorias";
const CACHE_S = 6 * 60 * 60; // o histórico anda devagar; 6h basta e poupa a rota

/**
 * O histórico medido de cada categoria. Uma consulta só, cacheada — é chamada em
 * toda análise, e não pode custar uma ida ao banco por mercado aberto.
 */
export async function historicoPorCategoria(): Promise<Map<string, HistoricoCategoria>> {
  const cacheado = getCache<Array<HistoricoCategoria>>(CACHE_KEY);
  if (cacheado) return new Map(cacheado.map((h) => [h.categoria, h]));
  if (!SUPABASE_URL || !SUPABASE_KEY) return new Map();

  try {
    // buscarTudo, e não um `limit` grande: o PostgREST corta a resposta em 1.000
    // linhas SEM avisar, por mais que se peça mais. Já erramos assim uma vez, nas
    // estatísticas do track record — o número saía plausível e estava truncado.
    const linhas = await buscarTudo<{ category: string | null; market_prob: number; outcome: boolean }>(
      "ai_forecasts",
      "resolved=eq.true&outcome=not.is.null&select=category,market_prob,outcome&order=id.asc",
    );

    const acc = new Map<string, { n: number; favAcertou: number; somaPrecoFav: number; sim: number }>();
    for (const l of linhas) {
      const cat = (l.category ?? "other").toLowerCase();
      const preco = Number(l.market_prob);
      if (!Number.isFinite(preco)) continue;
      const a = acc.get(cat) ?? { n: 0, favAcertou: 0, somaPrecoFav: 0, sim: 0 };
      a.n += 1;
      // "Favorito" é o lado que o preço apontava. Empate exato em 50% não tem
      // favorito, então não conta para esta métrica — contaria como erro sempre.
      if (preco !== 50) {
        if ((preco > 50) === l.outcome) a.favAcertou += 1;
        a.somaPrecoFav += preco > 50 ? preco : 100 - preco;
      }
      if (l.outcome) a.sim += 1;
      acc.set(cat, a);
    }

    const saida: HistoricoCategoria[] = [];
    for (const [categoria, a] of Array.from(acc)) {
      if (a.n < MIN_AMOSTRA) continue;
      saida.push({
        categoria,
        resolvidos: a.n,
        favoritoVenceuPct: Math.round((a.favAcertou / a.n) * 1000) / 10,
        precoMedioFavorito: Math.round((a.somaPrecoFav / a.n) * 10) / 10,
        simAconteceuPct: Math.round((a.sim / a.n) * 1000) / 10,
      });
    }
    setCache(CACHE_KEY, saida, CACHE_S);
    return new Map(saida.map((h) => [h.categoria, h]));
  } catch {
    log.warn("[ficha] histórico por categoria indisponível — a ficha sai sem ele");
    return new Map();
  }
}

export interface DadosFicha {
  titulo: string;
  precoPct: number;
  categoria: string;
  plataforma: string;
  fechaEm?: string | null;
  volume?: number;
  /** Texto de trajetória já pronto (vem de fetchMarketMomentum), se houver. */
  trajetoria?: string;
}

/** Quanto volta ao apostar R$ 100 num lado, ao preço atual. */
function retornoDe100(precoPct: number): number {
  const p = precoPct / 100;
  return p > 0 ? Math.round((100 / p) * 100) / 100 : 0;
}

function diasAte(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const d = (t - Date.now()) / 86_400_000;
  return d > 0 ? d : null;
}

/**
 * Monta a ficha. NUNCA devolve vazio: o preço sempre existe, e do preço já saem
 * duas frases verdadeiras. É esse piso que impede a análise de sair em branco.
 */
export async function montarFicha(d: DadosFicha): Promise<string> {
  const linhas: string[] = [];
  const simPct = Math.round(d.precoPct);
  const naoPct = 100 - simPct;

  linhas.push(
    `PREÇO E O QUE ELE PAGA: o mercado dá ${simPct}% de chance ao SIM. `
    + `Quem apostar R$ 100 no SIM recebe R$ ${retornoDe100(simPct).toFixed(2)} se acertar; `
    + `no NÃO (cotado a ${naoPct}%), recebe R$ ${retornoDe100(naoPct).toFixed(2)}.`,
  );

  const dias = diasAte(d.fechaEm);
  if (dias !== null) {
    linhas.push(
      dias < 2
        ? `RELÓGIO: fecha em menos de 2 dias — o preço já absorveu quase tudo que era público; só notícia de última hora ainda move.`
        : dias < 15
          ? `RELÓGIO: fecha em ${Math.round(dias)} dias — janela em que notícia recente ainda muda o preço.`
          : `RELÓGIO: fecha em ${Math.round(dias)} dias — prazo longo, o preço tende a andar devagar e em semanas, não em horas.`,
    );
  }

  if (typeof d.volume === "number" && d.volume > 0) {
    linhas.push(
      `LIQUIDEZ: US$ ${Math.round(d.volume).toLocaleString("pt-BR")} negociados. `
      + (d.volume >= 100_000
        ? `Volume alto — muita gente apostando, então o preço carrega mais informação.`
        : `Volume baixo — poucos participantes, então o preço é menos confiável como consenso.`),
    );
  }

  if (d.trajetoria) linhas.push(d.trajetoria);

  const hist = (await historicoPorCategoria()).get((d.categoria ?? "").toLowerCase());
  if (hist) {
    // O par (venceu %, preço médio) é o que ensina: se o favorito ganha MAIS do
    // que o preço dizia, a categoria vinha subestimando o favorito na amostra.
    const diferenca = hist.favoritoVenceuPct - hist.precoMedioFavorito;
    const leitura = Math.abs(diferenca) < 4
      ? `o preço acertou de perto — o mercado desta categoria vem bem calibrado na nossa amostra`
      : diferenca > 0
        ? `o favorito venceu MAIS do que o preço dizia (${diferenca.toFixed(0)}pp acima), ou seja, nesta amostra a categoria vinha subestimando o favorito`
        : `o favorito venceu MENOS do que o preço dizia (${Math.abs(diferenca).toFixed(0)}pp abaixo), ou seja, nesta amostra pagava-se caro pelo favorito`;
    linhas.push(
      `NOSSO HISTÓRICO EM ${hist.categoria.toUpperCase()}: acompanhamos ${hist.resolvidos} mercados desta categoria até a liquidação oficial. `
      + `O favorito venceu ${hist.favoritoVenceuPct}% das vezes, com preço médio de ${hist.precoMedioFavorito}% — ${leitura}. `
      + `O SIM aconteceu em ${hist.simAconteceuPct}% deles. `
      + `(Amostra nossa, não projeção: descreve o passado desta categoria, não este mercado.)`,
    );
  }

  return linhas.join("\n");
}
