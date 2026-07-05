/**
 * Termos de Uso — JLB Analytics
 */
import PageHeader from "@/components/PageHeader";
import AnimatedSection from "@/components/AnimatedSection";
import { Link } from "wouter";
import { useSEO } from "@/hooks/useSEO";

const UPDATED = "24 de junho de 2026";

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-base font-display font-bold text-foreground">{n}. {title}</h2>
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

            <Section n="3" title="Elegibilidade">
              <p>Você deve ter <strong className="text-foreground">18 anos ou mais</strong> e capacidade civil plena para usar a plataforma. Mercados preditivos e apostas podem ter restrições legais na sua jurisdição — é sua responsabilidade conhecê-las e respeitá-las.</p>
            </Section>

            <Section n="4" title="Conta de usuário">
              <p>Algumas funcionalidades exigem cadastro. Você é responsável por manter a confidencialidade das suas credenciais e por toda atividade na sua conta. Comunique-nos imediatamente qualquer uso não autorizado.</p>
            </Section>

            <Section n="5" title="Uso aceitável">
              <p>Você concorda em não: (a) usar a plataforma para fins ilícitos; (b) tentar burlar limites de uso, autenticação ou segurança; (c) raspar, copiar em massa ou revender o conteúdo; (d) sobrecarregar a infraestrutura com requisições automatizadas; (e) reverter, descompilar ou explorar vulnerabilidades.</p>
            </Section>

            <Section n="6" title="Propriedade intelectual">
              <p>A plataforma, a marca JLB Analytics, os modelos proprietários, a base de conhecimento Cerebro e o código são protegidos por direitos de propriedade intelectual. Dados de mercado são de seus respectivos provedores (Polymarket, Kalshi, BCB, entre outros).</p>
            </Section>

            <Section n="7" title="Dados de terceiros e disponibilidade">
              <p>Usamos APIs públicas (Polymarket, Kalshi, Banco Central do Brasil, Yahoo Finance, NewsAPI) e IA (Anthropic). Esses dados podem ter atraso, indisponibilidade ou imprecisão. Não garantimos disponibilidade ininterrupta nem exatidão de dados de terceiros.</p>
            </Section>

            <Section n="8" title="Isenção de responsabilidade">
              <p>A plataforma é fornecida "no estado em que se encontra". Na máxima extensão permitida em lei, a JLB Analytics não se responsabiliza por perdas financeiras, decisões de aposta/investimento, lucros cessantes ou danos decorrentes do uso das informações aqui apresentadas. Participação em mercados preditivos envolve risco de perda de capital.</p>
            </Section>

            <Section n="9" title="Alterações">
              <p>Podemos atualizar estes Termos a qualquer momento. Mudanças relevantes serão sinalizadas na plataforma. O uso continuado após alterações implica concordância.</p>
            </Section>

            <Section n="10" title="Contato">
              <p>Dúvidas sobre estes Termos: <a href="mailto:contato@jlbassetanalytics.com" className="text-gold hover:underline">contato@jlbassetanalytics.com</a>.</p>
            </Section>
          </div>
        </AnimatedSection>
      </div>
    </div>
  );
}
