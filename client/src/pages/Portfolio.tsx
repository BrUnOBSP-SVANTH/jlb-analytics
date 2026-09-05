/**
 * Banca Simulada — apostar dinheiro fictício em mercados REAIS e ver a conta fechar.
 *
 * O que esta tela era antes, e por que mudou. Ela guardava "posições" em
 * localStorage e marcava lucro pela variação do preço. Três problemas: a banca
 * sumia ao trocar de aparelho; o usuário escolhia à mão o preço de entrada
 * (comprava a 20% um mercado negociado a 80% — uma compra que não existe); e
 * nada NUNCA resolvia, então o resultado jamais chegava. Um simulador em que a
 * conta não fecha não ensina: é um caderno de anotações.
 *
 * Agora a aposta vive na conta do usuário, sai pelo preço real do mercado (o
 * mesmo da aba Mercados, atualizado no mesmo ritmo) e é liquidada pelo servidor
 * contra o resultado OFICIAL da plataforma. O que a pessoa aprende aqui é a
 * lição que o site inteiro defende: acertar muito não é o mesmo que lucrar —
 * o que decide é acertar onde o preço estava errado.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import MercadosTabs from "@/components/MercadosTabs";
import AnimatedSection from "@/components/AnimatedSection";
import { Termo } from "@/components/Termo";
import { Plus, RefreshCw, Info, Wallet, LogIn } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useAuth } from "@/contexts/AuthContext";
import {
  carregarApostas, registrarAposta, cancelarAposta, carregarMercados, marcarAMercado,
  type ApostaBanca, type MercadoBanca,
} from "@/lib/banca";
import { resumirBanca, reais, SALDO_INICIAL, type Lado } from "@shared/banca";
import { NovaApostaModal } from "@/components/portfolio/NovaApostaModal";
import { ApostaCard } from "@/components/portfolio/ApostaCard";
import { PortfolioAnalysisPanel } from "@/components/portfolio/PortfolioAnalysisPanel";
import { posicoesAntigas, descartarAntigas, baixarAntigasCSV, type PosicaoAntiga } from "@/components/portfolio/shared";

type Aba = "abertas" | "fechadas";

export default function Portfolio() {
  useSEO(
    "Banca Simulada",
    "Aposte dinheiro fictício em mercados reais do Polymarket e Kalshi e veja quanto ganharia ou perderia. Sem dinheiro real.",
  );
  const { user, loading: carregandoAuth } = useAuth();
  const [apostas, setApostas] = useState<ApostaBanca[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [aba, setAba] = useState<Aba>("abertas");
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [antigas, setAntigas] = useState<PosicaoAntiga[]>(posicoesAntigas);

  /** Busca as apostas na conta e marca as abertas ao preço de mercado de agora. */
  const sincronizar = useCallback(async (silencioso = false) => {
    if (!silencioso) setAtualizando(true);
    try {
      const [lista, mercados] = await Promise.all([carregarApostas(), carregarMercados()]);
      setApostas(marcarAMercado(lista, mercados));
      setAtualizadoEm(new Date());
    } catch {
      /* rede caiu: mantém o que já está na tela em vez de esvaziar a banca */
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    if (carregandoAuth) return;
    if (!user) { setCarregando(false); return; }
    void sincronizar(true);
  }, [user, carregandoAuth, sincronizar]);

  const resumo = useMemo(() => resumirBanca(apostas), [apostas]);
  const abertas = useMemo(() => apostas.filter((a) => !a.resolvido), [apostas]);
  const fechadas = useMemo(() => apostas.filter((a) => a.resolvido), [apostas]);

  async function apostar(mercado: MercadoBanca, lado: Lado, valor: number) {
    const r = await registrarAposta({ mercado, lado, valor });
    if (!r.ok) { toast.error(r.erro); return; }
    setModalAberto(false);
    toast.success(`Aposta de ${reais(valor)} registrada na sua banca`);
    void sincronizar(true);
  }

  async function cancelar(id: string) {
    const ok = await cancelarAposta(id);
    if (!ok) { toast.error("Não foi possível cancelar a aposta."); return; }
    toast("Aposta cancelada — o valor voltou para a banca");
    void sincronizar(true);
  }

  // ── Visitante: não dá para ter banca sem conta ──────────────────────────────
  if (!carregandoAuth && !user) {
    return (
      <div>
        <MercadosTabs />
        <PageHeader
          title="Banca Simulada"
          subtitle="Aposte dinheiro fictício em mercados reais e veja quanto ganharia — ou perderia."
          badge="Simulação"
        />
        <div className="container py-16">
          <div className="max-w-md mx-auto text-center glass-card rounded-2xl p-8">
            <Wallet className="w-12 h-12 mx-auto text-muted-foreground/20 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Sua banca fica na sua conta</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Entre para receber {reais(SALDO_INICIAL)} fictícios e acompanhar suas apostas até o
              resultado sair. Guardar na conta é o que permite abrir no celular e no computador
              sem perder nada — e é o que deixa o site liquidar suas apostas sozinho quando o
              mercado resolve.
            </p>
            <Link href="/login">
              <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer">
                <LogIn className="w-4 h-4" /> Entrar e começar a banca
              </span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <MercadosTabs />
      <PageHeader
        title="Banca Simulada"
        subtitle="Aposte dinheiro fictício em mercados reais do Polymarket e Kalshi. O resultado vem da liquidação oficial — não de chute nosso."
        badge="Simulação"
      />

      <div className="container py-10 space-y-8">
        {/* Como funciona — a explicação mora onde ela faz falta */}
        <AnimatedSection>
          <div className="flex items-start gap-3 p-4 rounded-xl border border-border/20 bg-secondary/5">
            <Info className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Nenhum centavo é real.</strong> Toda banca começa com{" "}
              {reais(SALDO_INICIAL)} fictícios. Você aposta pelo preço que o mercado está pagando de
              verdade agora — cada cota vale R$ 1 se você acertar e R$ 0 se errar. Quando o evento
              acontece, o site paga sua aposta pela{" "}
              <Termo nome="Resolução">liquidação oficial</Termo> da plataforma, a mesma que pagaria
              se o dinheiro fosse real.
            </p>
          </div>
        </AnimatedSection>

        {/* Resgate do portfólio antigo, se este navegador tiver algum */}
        {antigas.length > 0 && (
          <AnimatedSection>
            <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/25 bg-amber-500/5">
              <Info className="w-4 h-4 text-amber-500/70 shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground leading-relaxed space-y-2">
                <p>
                  <strong className="text-foreground">
                    Você tem {antigas.length} posição(ões) do portfólio antigo neste navegador.
                  </strong>{" "}
                  Elas ficavam salvas só aqui e usavam um preço de entrada escolhido à mão, em dólar.
                  Não dá para transformá-las em apostas da banca sem inventar o preço real daquele
                  momento — então preferimos te entregar os dados a fabricar um histórico.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => baixarAntigasCSV(antigas)}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium border border-border/40 text-foreground hover:border-border transition-colors">
                    Baixar em CSV
                  </button>
                  <button onClick={() => { descartarAntigas(); setAntigas([]); }}
                    className="px-3 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                    Descartar
                  </button>
                </div>
              </div>
            </div>
          </AnimatedSection>
        )}

        {/* A banca em números */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Numero
            rotulo="Disponível para apostar"
            valor={reais(resumo.disponivel)}
            nota={resumo.emJogo > 0 ? `${reais(resumo.emJogo)} em apostas abertas` : "banca livre"}
          />
          <Numero
            rotulo="Patrimônio"
            valor={reais(resumo.patrimonio)}
            nota={`começou em ${reais(resumo.saldoInicial)}`}
            cor={resumo.patrimonio > resumo.saldoInicial ? "text-positive" : resumo.patrimonio < resumo.saldoInicial ? "text-negative" : undefined}
          />
          <Numero
            rotulo="Lucro já fechado"
            valor={`${resumo.lucroRealizado >= 0 ? "+" : "−"}${reais(Math.abs(resumo.lucroRealizado))}`}
            nota={resumo.resolvidas > 0 ? `em ${resumo.resolvidas} aposta${resumo.resolvidas > 1 ? "s" : ""} resolvida${resumo.resolvidas > 1 ? "s" : ""}` : "nenhuma resolveu ainda"}
            cor={resumo.lucroRealizado > 0 ? "text-positive" : resumo.lucroRealizado < 0 ? "text-negative" : undefined}
          />
          <Numero
            rotulo="Taxa de acerto"
            valor={resumo.taxaAcerto !== null ? `${Math.round(resumo.taxaAcerto * 100)}%` : "—"}
            nota={resumo.taxaAcerto !== null ? `${resumo.acertos} de ${resumo.resolvidas}` : "aparece quando a 1ª resolver"}
          />
        </div>

        {/* A lição que os dois números juntos contam */}
        {resumo.resolvidas >= 3 && resumo.taxaAcerto !== null && (
          <AnimatedSection>
            <p className="text-xs text-muted-foreground leading-relaxed px-1">
              {resumo.taxaAcerto >= 0.5 && resumo.lucroRealizado < 0 ? (
                <>Repare: você acertou <strong className="text-foreground">{Math.round(resumo.taxaAcerto * 100)}%</strong> das
                apostas e mesmo assim está no prejuízo. É o efeito de apostar em favoritos — acerta
                muito, ganha pouco em cada acerto, e um erro apaga vários acertos.</>
              ) : resumo.taxaAcerto < 0.5 && resumo.lucroRealizado > 0 ? (
                <>Repare: você errou mais do que acertou e mesmo assim está no lucro. É o que acontece
                quando se aposta em pouco provável pelo preço certo — os poucos acertos pagam muito
                mais do que os erros custam.</>
              ) : (
                <>Taxa de acerto sozinha não diz se você está ganhando. O que decide é acertar onde o
                preço estava errado — apostar no favorito acerta muito e paga pouco.</>
              )}
            </p>
          </AnimatedSection>
        )}

        {/* Ações */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => setModalAberto(true)}
            disabled={resumo.disponivel < 1}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Plus className="w-4 h-4" /> Nova aposta
          </button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {atualizadoEm && (
              <span>Preços de {atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
            )}
            <button
              onClick={() => void sincronizar()}
              disabled={atualizando}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/30 hover:text-foreground hover:border-border/60 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${atualizando ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
        </div>

        {resumo.disponivel < 1 && abertas.length > 0 && (
          <p className="text-xs text-muted-foreground -mt-4">
            Sua banca está toda em jogo. O dinheiro volta quando alguma aposta resolver — ou se você
            cancelar uma delas.
          </p>
        )}

        {/* Banca vazia */}
        {!carregando && apostas.length === 0 && (
          <div className="text-center py-16 glass-card rounded-2xl">
            <Wallet className="w-12 h-12 mx-auto text-muted-foreground/20 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Você tem {reais(SALDO_INICIAL)} para apostar
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Escolha um mercado real, diga se acha que vai acontecer, e veja na hora quanto ganha se
              acertar e quanto perde se errar.
            </p>
            <button
              onClick={() => setModalAberto(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" /> Fazer a primeira aposta
            </button>
          </div>
        )}

        {/* Abas: em aberto × já resolvidas */}
        {apostas.length > 0 && (
          <>
            <div className="flex gap-2 border-b border-border/20">
              {([["abertas", `Em aberto (${abertas.length})`], ["fechadas", `Já resolvidas (${fechadas.length})`]] as const).map(([id, rotulo]) => (
                <button key={id} onClick={() => setAba(id)}
                  className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                    aba === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}>
                  {rotulo}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {(aba === "abertas" ? abertas : fechadas).map((a) => (
                <ApostaCard key={a.id} a={a} onCancelar={cancelar} />
              ))}
            </div>

            {aba === "fechadas" && fechadas.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">
                Nenhuma aposta resolveu ainda. Assim que o mercado for liquidado na plataforma, o
                resultado aparece aqui sozinho — você não precisa fazer nada.
              </p>
            )}
          </>
        )}

        {/* Análise da carteira pela IA */}
        <PortfolioAnalysisPanel apostas={abertas} />

        {apostas.length > 0 && (
          <div className="text-center pt-4 border-t border-border/20">
            <p className="text-xs text-muted-foreground mb-3">Para entender as contas por trás dos números:</p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link href="/calculadoras"><span className="text-xs text-primary hover:underline">Calculadoras de EV e Kelly</span></Link>
              <Link href="/previsao"><span className="text-xs text-primary hover:underline">Previsão guiada por IA</span></Link>
              <Link href="/apostas"><span className="text-xs text-primary hover:underline">Ver mercados ao vivo</span></Link>
            </div>
          </div>
        )}
      </div>

      {modalAberto && (
        <NovaApostaModal
          disponivel={resumo.disponivel}
          onApostar={apostar}
          onClose={() => setModalAberto(false)}
        />
      )}
    </div>
  );
}

function Numero({ rotulo, valor, nota, cor }: { rotulo: string; valor: string; nota: string; cor?: string }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{rotulo}</p>
      <p className={`text-xl font-mono font-bold tabular-nums ${cor ?? "text-foreground"}`}>{valor}</p>
      <p className="text-[10px] text-muted-foreground/70 mt-0.5">{nota}</p>
    </div>
  );
}
