/**
 * A checagem que conclui um nível da trilha.
 *
 * O QUE ELA SUBSTITUI (Auditoria 21/09, APR-02). O nível era dado como
 * concluído quando qualquer calculadora dele devolvia resultado — apertar
 * "calcular" com os valores que já estavam no campo bastava. E "nível
 * concluído" é o que mede a trilha, vale 10 pontos e diz à pessoa onde ela
 * está. Medir clique e chamar de aprendizado é a versão educacional de inventar
 * número.
 *
 * As decisões de desenho, e o porquê de cada uma:
 *
 *  · a explicação aparece DEPOIS de responder, certo ou errado. O erro é o
 *    momento em que a pessoa está mais pronta para a correção — esconder a
 *    resposta certa desperdiça exatamente esse momento;
 *  · dá para refazer quantas vezes quiser. O objetivo é aprender, não filtrar,
 *    e um nível já concluído continua concluído;
 *  · a conclusão é registrada UMA vez (`concluirNivel` é idempotente), então
 *    refazer não vira fábrica de pontos;
 *  · nada aqui depende de login: a trilha é local-first, e quem tem conta leva
 *    o progresso para a nuvem pelo caminho de sempre.
 */
import { useState } from "react";
import { Check, X, RotateCcw, GraduationCap, Trophy } from "lucide-react";
import { checagemDoNivel, passouNaChecagem, ACERTOS_PARA_CONCLUIR } from "@/lib/checagemNiveis";
import { concluirNivel, niveisConcluidos } from "@/lib/userProgress";
import { track } from "@/lib/analytics";

export function ChecagemDeAprendizagem({ nivel, titulo }: { nivel: number; titulo: string }) {
  const perguntas = checagemDoNivel(nivel);
  const [passo, setPasso] = useState(0);
  const [escolha, setEscolha] = useState<number | null>(null);
  const [acertos, setAcertos] = useState(0);
  const [terminou, setTerminou] = useState(false);
  const [jaConcluido] = useState(() => niveisConcluidos().includes(nivel));

  if (perguntas.length === 0) return null;
  const atual = perguntas[passo];

  function responder(i: number) {
    if (escolha !== null) return;           // já respondeu esta
    setEscolha(i);
    if (i === atual.correta) setAcertos((a) => a + 1);
  }

  function avancar() {
    const certos = acertos;
    if (passo + 1 < perguntas.length) {
      setPasso(passo + 1);
      setEscolha(null);
      return;
    }
    setTerminou(true);
    track("checagem_nivel", { nivel, acertos: certos, total: perguntas.length });
    // Só conclui quem passou. `concluirNivel` já dá o ponto uma vez só.
    if (passouNaChecagem(certos)) concluirNivel(nivel, titulo);
  }

  function refazer() {
    setPasso(0); setEscolha(null); setAcertos(0); setTerminou(false);
  }

  // ── Resultado ──────────────────────────────────────────────────────────────
  if (terminou) {
    const passou = passouNaChecagem(acertos);
    return (
      <div className={`glass-card rounded-2xl p-6 border ${passou ? "border-positive/30" : "border-border/30"}`}>
        <div className="flex items-center gap-2 mb-3">
          {passou ? <Trophy className="w-5 h-5 text-positive" /> : <GraduationCap className="w-5 h-5 text-muted-foreground" />}
          <h2 className="font-semibold text-[var(--titulo)]">
            {passou ? `Nível ${nivel} concluído` : "Quase lá"}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          Você acertou <strong className="text-foreground">{acertos} de {perguntas.length}</strong>.{" "}
          {passou
            ? jaConcluido
              ? "Este nível já contava como concluído — refazer não tira nem soma."
              : "Ele passa a contar na sua trilha, e valeu 10 pontos."
            : `São ${ACERTOS_PARA_CONCLUIR} acertos para concluir. As explicações acima dizem por que cada resposta é o que é — vale reler e refazer.`}
        </p>
        <button
          onClick={refazer}
          className="alvo-toque inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border/50 text-foreground text-sm hover:bg-secondary/30 transition-colors"
        >
          <RotateCcw className="w-4 h-4" /> Refazer a checagem
        </button>
      </div>
    );
  }

  // ── Pergunta ───────────────────────────────────────────────────────────────
  const respondeu = escolha !== null;
  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-[var(--titulo)]">Checagem do nível</h2>
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {passo + 1} de {perguntas.length} · {ACERTOS_PARA_CONCLUIR} acertos concluem
        </span>
      </div>

      <p className="text-sm text-foreground leading-relaxed">{atual.pergunta}</p>

      <div className="space-y-2">
        {atual.alternativas.map((texto, i) => {
          const ehCerta = i === atual.correta;
          const foiEscolhida = escolha === i;
          // Depois de responder, a certa sempre aparece marcada — inclusive
          // quando a pessoa errou. É o que transforma o erro em aula.
          const cor = !respondeu
            ? "border-border/30 hover:border-primary/40 hover:bg-secondary/20"
            : ehCerta
              ? "border-positive/40 bg-positive/10"
              : foiEscolhida
                ? "border-negative/40 bg-negative/10"
                : "border-border/20 opacity-60";
          return (
            <button
              key={texto}
              onClick={() => responder(i)}
              disabled={respondeu}
              className={`alvo-toque w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${cor}`}
            >
              <span className="mt-0.5 shrink-0">
                {respondeu && ehCerta && <Check className="w-4 h-4 text-positive" />}
                {respondeu && foiEscolhida && !ehCerta && <X className="w-4 h-4 text-negative" />}
                {!respondeu && <span className="block w-4 h-4 rounded-full border border-border/50" />}
              </span>
              <span className="text-sm text-foreground leading-snug">{texto}</span>
            </button>
          );
        })}
      </div>

      {respondeu && (
        <div className="p-3 rounded-xl bg-secondary/20 border border-border/20">
          <p className="text-xs text-muted-foreground leading-relaxed">{atual.explicacao}</p>
        </div>
      )}

      {respondeu && (
        <button
          onClick={avancar}
          className="alvo-toque w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          {passo + 1 < perguntas.length ? "Próxima pergunta" : "Ver resultado"}
        </button>
      )}
    </div>
  );
}
