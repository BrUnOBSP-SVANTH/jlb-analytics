/**
 * Termos de Uso — JLB Analytics
 */
import PageHeader from "@/components/PageHeader";
import AnimatedSection from "@/components/AnimatedSection";
import { Link } from "wouter";
import { useSEO } from "@/hooks/useSEO";

const UPDATED = "9 de setembro de 2026";

/**
 * VERSÃO DO ACEITE. Sobe sempre que o texto muda de forma relevante.
 *
 * É o que dá sentido ao aceite: guardar "aceitou" sem guardar O QUE aceitou não
 * prova nada seis meses depois, quando os termos já mudaram duas vezes. A
 * gravação no cadastro registra esta string — ver lib/aceite.ts.
 */
export const VERSAO_TERMOS = "2026-09-09";

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-base font-display font-bold text-[var(--titulo)]">{n}. {title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

export default function Termos() {
  useSEO("Termos de Uso", "Termos de Uso da JLB Analytics — plataforma de educação quantitativa para mercados preditivos.");

  return (
    <div>
      <PageHeader title="Termos de Uso" subtitle="As regras para uso da plataforma JLB Analytics." badge="Legal" />
      <div className="container py-12 max-w-3xl mx-auto">
        <AnimatedSection>
          <p className="text-xs text-muted-foreground/60 mb-8">Última atualização: {UPDATED}</p>
          <div className="space-y-8">
            <Section n="1" title="Aceitação dos termos">
              <p>Ao acessar ou usar a JLB Analytics ("plataforma"), você concorda com estes Termos de Uso e com a nossa{" "}
                <Link href="/privacidade"><span className="text-gold hover:underline">Política de Privacidade</span></Link>.
                Se não concordar, não utilize a plataforma.</p>
            </Section>

            <Section n="2" title="Natureza do serviço">
              <p>A JLB Analytics é uma plataforma <strong className="text-foreground">exclusivamente educacional</strong> de análise quantitativa de mercados preditivos. <strong className="text-foreground">Não somos uma casa de apostas, corretora ou consultoria de investimentos</strong>, e não intermediamos transações financeiras ou apostas.</p>
              <p>Todo conteúdo — modelos, probabilidades, análises de IA, fair value e consenso — tem finalidade informativa e educacional. <strong className="text-foreground">Nada na plataforma constitui recomendação de investimento, aposta ou qualquer decisão financeira.</strong> Decisões são de responsabilidade exclusiva do usuário.</p>
            </Section>

            <Section n="3" title="O que a plataforma NÃO é, e o que ela NÃO promete">
              <p className="text-foreground/90">Esta seção existe para não deixar dúvida. Leia antes de criar conta.</p>

              <p><strong className="text-foreground">Nós erramos, e mostramos o quanto.</strong> Nossas análises são
                probabilísticas: quando dizemos 70%, a coisa não acontece em 3 de cada 10 vezes — e isso não é defeito,
                é o que "70%" significa. O histórico completo de acertos e erros da nossa IA fica publicado e auditável
                em <Link href="/track-record"><span className="text-gold hover:underline">Track Record</span></Link>,
                atualizado sozinho conforme os mercados resolvem, inclusive quando erramos.</p>

              <p><strong className="text-foreground">Análise não é garantia de ganho.</strong> Nenhum número, estimativa,
                fair value, sinal de vantagem ou texto gerado por IA nesta plataforma garante lucro, acerto ou
                resultado. Mesmo uma análise correta pode terminar em prejuízo — é assim que probabilidade funciona.
                Quem decide apostar ou investir assume o risco integralmente, e pode perder todo o valor aplicado.</p>

              <p><strong className="text-foreground">Não vendemos método de ganho, nem tecnologia para burlar sistema
                nenhum.</strong> Não oferecemos, e nunca vamos oferecer: esquema de ganho garantido, técnica para
                contornar regras, limites ou segurança de casas de apostas ou plataformas, promessa de retorno
                astronômico, "robô" que aposta por você, ou grupo de sinais pagos. Se você chegou procurando isso, esta
                plataforma não serve para você — e desconfie de quem oferecer.</p>

              <p><strong className="text-foreground">O que nós somos:</strong> uma plataforma dinâmica de EDUCAÇÃO e
                ANÁLISE quantitativa. Reunimos dados públicos de mercado, notícias e modelos estatísticos para ajudar
                você a pensar em probabilidades com método — e a medir a própria calibração ao longo do tempo. O produto
                é o raciocínio, não o palpite.</p>

              <p><strong className="text-foreground">Dinheiro fictício é fictício.</strong> A Banca Simulada usa valores
                imaginários em mercados reais, para fins de aprendizado. Nenhum centavo é movimentado, depositado ou
                sacado por nós, em nenhuma hipótese.</p>

              <p><strong className="text-foreground">Se apostar deixou de ser escolha, procure ajuda.</strong> Jogo pode
                causar dependência. No Brasil, os Jogadores Anônimos atendem em{" "}
                <a href="https://jogadoresanonimos.com.br" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">jogadoresanonimos.com.br</a>{" "}
                e o CVV, 24 horas, pelo telefone 188.</p>
            </Section>

            <Section n="4" title="Elegibilidade">
              <p>Você deve ter <strong className="text-foreground">18 anos ou mais</strong> e capacidade civil plena para usar a plataforma. Mercados preditivos e apostas podem ter restrições legais na sua jurisdição — é sua responsabilidade conhecê-las e respeitá-las.</p>
            </Section>

            <Section n="5" title="Conta de usuário">
              <p>Algumas funcionalidades exigem cadastro. Você é responsável por manter a confidencialidade das suas credenciais e por toda atividade na sua conta. Comunique-nos imediatamente qualquer uso não autorizado.</p>
            </Section>

            <Section n="6" title="Uso aceitável">
              <p>Você concorda em não: (a) usar a plataforma para fins ilícitos; (b) tentar burlar limites de uso, autenticação ou segurança; (c) raspar, copiar em massa ou revender o conteúdo; (d) sobrecarregar a infraestrutura com requisições automatizadas; (e) reverter, descompilar ou explorar vulnerabilidades.</p>
            </Section>

            <Section n="7" title="Propriedade intelectual">
              <p>A plataforma, a marca JLB Analytics, os modelos proprietários, a base de conhecimento Cerebro e o código são protegidos por direitos de propriedade intelectual. Dados de mercado são de seus respectivos provedores (Polymarket, Kalshi, BCB, entre outros).</p>
            </Section>

            <Section n="8" title="Dados de terceiros e disponibilidade">
              <p>Usamos APIs públicas (Polymarket, Kalshi, Banco Central do Brasil, Yahoo Finance, NewsAPI) e IA (Anthropic). Esses dados podem ter atraso, indisponibilidade ou imprecisão. Não garantimos disponibilidade ininterrupta nem exatidão de dados de terceiros.</p>
            </Section>

            <Section n="9" title="Isenção de responsabilidade">
              <p>A plataforma é fornecida "no estado em que se encontra". Na máxima extensão permitida em lei, a JLB Analytics não se responsabiliza por perdas financeiras, decisões de aposta/investimento, lucros cessantes ou danos decorrentes do uso das informações aqui apresentadas. Participação em mercados preditivos envolve risco de perda de capital.</p>
            </Section>

            <Section n="10" title="Alterações">
              <p>Podemos atualizar estes Termos a qualquer momento. Mudanças relevantes serão sinalizadas na plataforma. O uso continuado após alterações implica concordância.</p>
            </Section>

            <Section n="11" title="Contato">
              <p>Dúvidas sobre estes Termos: <a href="mailto:contato@jlbassetanalytics.com" className="text-gold hover:underline">contato@jlbassetanalytics.com</a>.</p>
            </Section>
          </div>
        </AnimatedSection>
      </div>
    </div>
  );
}
