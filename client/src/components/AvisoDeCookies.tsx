/**
 * AvisoDeCookies — a escolha sobre medição, com as duas saídas no mesmo peso.
 *
 * DECISÕES QUE DEFINEM SE ISTO PRESTA OU NÃO:
 *
 * · AS DUAS OPÇÕES APARECEM JUNTAS, e "Só o essencial" não é um link escondido
 *   nem um cinza apagado ao lado de um botão colorido. O padrão da internet é
 *   esconder a recusa atrás de dois cliques; aqui recusar custa o mesmo que
 *   aceitar. Se a recusa é mais difícil que o aceite, não é escolha.
 *
 * · NÃO BLOQUEIA A TELA. É uma faixa no rodapé, não um muro sobre o conteúdo. O
 *   site funciona inteiro sem responder — e até responder, NÃO medimos (ver
 *   lib/cookies.ts: o padrão de quem não escolheu é "essencial").
 *
 * · DIZ O QUE ESTÁ EM JOGO em uma frase, com o link para a lista completa. "Este
 *   site usa cookies" não informa nada; "um identificador aleatório para contar
 *   quantas pessoas usaram cada tela" informa.
 *
 * · NÃO TEM X DE FECHAR. Fechar sem escolher deixaria a pessoa achando que
 *   decidiu quando não decidiu. As duas saídas são decisões.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { jaEscolheu, definirConsentimento } from "@/lib/cookies";
import MarcaProbabilidade from "@/components/MarcaProbabilidade";

export default function AvisoDeCookies() {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    // Só depois de montar: no primeiro quadro o localStorage ainda não foi lido
    // e o aviso piscaria para quem já escolheu.
    if (!jaEscolheu()) setAberto(true);
  }, []);

  if (!aberto) return null;

  function escolher(opcao: "completo" | "essencial") {
    definirConsentimento(opcao);
    setAberto(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Escolha sobre medição de uso"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-background/95 backdrop-blur-xl"
    >
      <div className="container py-4 flex flex-col lg:flex-row lg:items-center gap-4">
        <MarcaProbabilidade className="text-primary shrink-0 hidden lg:block" size={26} />

        <p className="text-xs text-muted-foreground leading-relaxed flex-1">
          <strong className="text-foreground">Guardamos algumas coisas no seu aparelho.</strong>{" "}
          O essencial — sua sessão, o tema e as previsões que você registrou — não tem como ser
          desligado, senão o site não funciona. Além disso, gostaríamos de guardar um{" "}
          <strong className="text-foreground/80">identificador aleatório</strong> (sem nome, e-mail
          ou IP) só para contar quantas pessoas usaram cada tela. Ele vai para o nosso servidor, e
          para mais ninguém — não há publicidade, rastreador de terceiro nem venda de dado aqui.{" "}
          <Link href="/privacidade">
            <span className="text-gold hover:underline">Ver a lista completa do que guardamos</span>
          </Link>.
        </p>

        {/* Os dois botões com o MESMO peso visual: a recusa não pode custar mais
            que o aceite, senão vira escolha só no nome. */}
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => escolher("essencial")}
            className="flex-1 lg:flex-none px-4 py-2.5 rounded-lg text-xs font-semibold border border-border/60 text-foreground hover:bg-secondary/40 transition-colors"
          >
            Só o essencial
          </button>
          <button
            onClick={() => escolher("completo")}
            className="flex-1 lg:flex-none px-4 py-2.5 rounded-lg text-xs font-semibold border border-border/60 text-foreground hover:bg-secondary/40 transition-colors"
          >
            Aceitar a medição
          </button>
        </div>
      </div>
    </div>
  );
}
