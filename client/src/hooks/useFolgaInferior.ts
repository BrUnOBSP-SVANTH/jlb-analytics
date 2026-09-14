/**
 * useFolgaInferior — painel fixo no rodapé da tela avisa quanto espaço ocupa.
 *
 * O DEFEITO (14/09/2026). O aviso de cookies e o painel de comparação são
 * `fixed bottom-0 z-50`; o botão do chat é `fixed bottom-4 z-40`. Na primeira
 * visita o botão ficava INTEIRO embaixo do aviso — não dava para abrir o chat
 * sem antes decidir sobre cookies —, e com a comparação aberta, igual. O teste
 * e2e "chat: botão flutuante abre o painel" falhava por isso, e o CI ficava
 * vermelho a cada push.
 *
 * Subir o z-index do botão só trocaria o problema: ele passaria a tapar o botão
 * "Aceitar" do aviso. O certo é ele ficar ACIMA do painel, e isso exige saber a
 * altura do painel — que muda com a largura da tela (o aviso vira três linhas
 * no celular).
 *
 * O mecanismo: cada painel mede a própria altura com ResizeObserver e registra
 * aqui; a maior altura vira a variável CSS `--folga-inferior` no <html>. Quem
 * flutua lê a variável. Nenhum componente precisa conhecer o outro.
 */
import { useEffect, type RefObject } from "react";

const alturas = new Map<string, number>();

function publicar() {
  // A MAIOR, e não a soma: os painéis ficam todos em bottom-0, um sobre o outro.
  const maior = Array.from(alturas.values()).reduce((m, h) => Math.max(m, h), 0);
  document.documentElement.style.setProperty("--folga-inferior", `${Math.ceil(maior)}px`);
}

export function useFolgaInferior(id: string, ref: RefObject<HTMLElement | null>, ativo = true): void {
  useEffect(() => {
    const el = ref.current;
    if (!ativo || !el) return;
    const medir = () => { alturas.set(id, el.getBoundingClientRect().height); publicar(); };
    medir();
    // Sem ResizeObserver (navegador muito antigo), a medida do primeiro quadro
    // já tira o botão de baixo do painel; só não acompanha rotação de tela.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); alturas.delete(id); publicar(); };
  }, [id, ref, ativo]);
}
