/**
 * VereditoTrackRecord — o placar que a página inteira existe para mostrar.
 *
 * O PROBLEMA. `/track-record` tinha doze blocos empilhados, todos com o mesmo
 * tratamento: mesma borda, mesmo raio, ícone pequeno, título pequeno, tabela.
 * Seis mil e quatrocentos pixels de altura sem nenhuma hierarquia — o placar
 * pesava o mesmo que a seção "como medimos". Quem abria a página não tinha como
 * saber o que ela estava tentando dizer.
 *
 * E os dados dizem algo específico e forte. Medido em 11/09/2026, sobre 1.022
 * previsões resolvidas:
 *
 *     nós acertamos a direção em 80%   ·   o mercado também, em 80%
 *     nosso Brier 0,142                ·   o dele 0,142
 *     quando discordamos do preço (397 vezes), acertamos 32%
 *
 * Empatamos com o mercado na parte fácil e PERDEMOS na difícil. Essa é a
 * história, e é exatamente o tipo de coisa que ninguém publica sobre si mesmo.
 * É o fosso competitivo desta plataforma — e estava soterrado.
 *
 * A DECISÃO DE DESENHO: dois números grandes, lado a lado, com o sinal de
 * igualdade entre eles. Não é ornamento — é a leitura. Quando os dois números
 * são o mesmo, o empate vira uma imagem antes de virar uma frase; e quando
 * deixarem de ser, o desenho conta isso sozinho, sem ninguém reescrever o texto.
 *
 * O erro vem ANTES do acerto, de propósito. Numa página que se vende por
 * honestidade, começar pela parte boa é começar pelo que qualquer concorrente
 * também faria.
 */
import { useEffect, useState } from "react";
import { buscarJson } from "@/lib/api";
import { pct, num, plural } from "@shared/formato";

interface Resumo {
  available: boolean;
  resolvedCount: number;
  settledCount: number;
  hitRate: number | null;
  marketHitRate: number | null;
  edgeRate: number | null;
  edgeCount: number;
  aiBrier: number | null;
  marketBrier: number | null;
  minAmostra: number;
}

/** Diferença de acerto abaixo da qual chamar de "vantagem" seria ler ruído. */
const EMPATE_PP = 2;

export function VereditoTrackRecord() {
  const [d, setD] = useState<Resumo | null>(null);

  useEffect(() => {
    let vivo = true;
    void buscarJson<Resumo>("/api/ai/track-record")
      .then((r) => { if (vivo) setD(r); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  if (!d?.available || d.hitRate === null || d.resolvedCount < d.minAmostra) return null;

  const nos = d.hitRate;
  const mercado = d.marketHitRate;
  const diferenca = mercado !== null ? nos - mercado : null;
  const empatou = diferenca !== null && Math.abs(diferenca) <= EMPATE_PP;
  const naFrente = diferenca !== null && diferenca > EMPATE_PP;

  const sinal = empatou ? "=" : naFrente ? ">" : "<";

  return (
    <section className="border-b border-border/40 pb-10 mb-10">
      <div className="max-w-3xl">
        {/* O PLACAR. Os dois números têm o mesmo tamanho porque medem a mesma
            coisa no mesmo conjunto — dar destaque ao nosso seria a mão no peso. */}
        <div className="flex items-end gap-5 sm:gap-8 flex-wrap">
          <div>
            <p className="font-mono font-semibold tabular-nums leading-[0.85] text-foreground text-[3.5rem] sm:text-[5rem]">
              {nos}<span className="text-2xl align-top text-muted-foreground">%</span>
            </p>
            <p className="text-sm text-muted-foreground mt-2">acertamos a direção</p>
          </div>

          <p
            className="font-mono text-muted-foreground text-[2.5rem] sm:text-[3.5rem] leading-[1.2] pb-6"
            aria-label={empatou ? "igual a" : naFrente ? "maior que" : "menor que"}
          >
            {sinal}
          </p>

          <div>
            {/* Construído igual ao nosso, e não com `pct()`: os dois números
                medem a mesma coisa e precisam ser tipograficamente idênticos —
                qualquer diferença de tratamento já é um dedo na balança. */}
            <p className="font-mono font-semibold tabular-nums leading-[0.85] text-foreground text-[3.5rem] sm:text-[5rem]">
              {mercado}<span className="text-2xl align-top text-muted-foreground">%</span>
            </p>
            <p className="text-sm text-muted-foreground mt-2">o mercado, nas mesmas perguntas</p>
          </div>
        </div>

        <p className="text-base sm:text-lg text-foreground/90 leading-relaxed mt-7 max-w-2xl">
          {empatou ? (
            <>
              Em {plural(d.resolvedCount, "previsão resolvida", "previsões resolvidas")}, a nossa IA
              acerta o lado tão bem quanto o mercado — e nada além disso.{" "}
              <strong className="text-foreground">Empate</strong>, escrito com todas as letras.
            </>
          ) : naFrente ? (
            <>
              Em {plural(d.resolvedCount, "previsão resolvida", "previsões resolvidas")}, a nossa IA
              acertou o lado mais vezes que o mercado — {pct(Math.abs(diferenca!))} acima.
            </>
          ) : (
            <>
              Em {plural(d.resolvedCount, "previsão resolvida", "previsões resolvidas")}, a nossa IA
              acertou o lado menos vezes que o mercado — {pct(Math.abs(diferenca!))} abaixo. Está
              publicado aqui porque é o que aconteceu.
            </>
          )}
        </p>

        {/* O ERRO ANTES DO ACERTO. Esta é a parte que ninguém publica sobre si
            mesmo, e por isso ela vem primeiro. */}
        {d.edgeRate !== null && d.edgeCount > 0 && (
          <div className="mt-7 border-l-2 border-negative/50 pl-5">
            <p className="text-base text-foreground/90 leading-relaxed max-w-2xl">
              E quando a IA <strong className="text-foreground">discorda do preço</strong> — o teste
              que separa análise de acompanhamento — ela acerta{" "}
              <span className="font-mono font-semibold text-negative">{pct(d.edgeRate)}</span> das{" "}
              {plural(d.edgeCount, "vez", "vezes")}.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2 max-w-2xl">
              Menos da metade. Divergir do consenso é a coisa mais difícil que existe em mercado
              preditivo, e hoje nós não conseguimos fazer isso melhor que a multidão. Você está lendo
              isto na nossa própria página porque esconder seria o oposto do que vendemos.
            </p>
          </div>
        )}

        {/* A procedência, em uma linha. Não é um card. */}
        <p className="text-sm text-muted-foreground mt-7">
          {d.settledCount > 0 && (
            <>
              <span className="font-mono tabular-nums text-foreground/80">{num(d.settledCount)}</span>
              {" "}dessas resoluções vieram do resultado oficial da plataforma
              {d.aiBrier !== null && d.marketBrier !== null && <> · </>}
            </>
          )}
          {d.aiBrier !== null && d.marketBrier !== null && (
            <>
              Brier {num(d.aiBrier, 3)} contra {num(d.marketBrier, 3)} do mercado
            </>
          )}
        </p>
      </div>
    </section>
  );
}
