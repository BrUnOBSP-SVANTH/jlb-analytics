/**
 * Política de Privacidade (LGPD) — JLB Analytics
 */
import PageHeader from "@/components/PageHeader";
import AnimatedSection from "@/components/AnimatedSection";
import { useSEO } from "@/hooks/useSEO";

const UPDATED = "24 de junho de 2026";

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-base font-display font-bold text-[var(--titulo)]">{n}. {title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

export default function Privacidade() {
  useSEO("Política de Privacidade", "Como a JLB Analytics coleta, usa e protege seus dados — em conformidade com a LGPD.");

  return (
    <div>
      <PageHeader title="Política de Privacidade" subtitle="Como tratamos seus dados — em conformidade com a LGPD (Lei 13.709/2018)." badge="Legal" />
      <div className="container py-12 max-w-3xl mx-auto">
        <AnimatedSection>
          <p className="text-xs text-muted-foreground/60 mb-8">Última atualização: {UPDATED}</p>
          <div className="space-y-8">
            <Section n="1" title="Quem somos (controlador)">
              <p>A JLB Analytics é a controladora dos dados pessoais tratados nesta plataforma. Contato do encarregado (DPO): <a href="mailto:contato.jlbanalytics@gmail.com" className="text-gold hover:underline">contato.jlbanalytics@gmail.com</a>.</p>
            </Section>

            <Section n="2" title="Dados que coletamos">
              <ul className="list-disc pl-5 space-y-1">
                <li><strong className="text-foreground">Cadastro:</strong> email e dados de autenticação (via Supabase).</li>
                <li><strong className="text-foreground">Uso da plataforma:</strong> previsões registradas, pontos, progresso e métricas de calibração — armazenados localmente (localStorage) e, se logado, sincronizados na sua conta.</li>
                <li><strong className="text-foreground">Uso de IA:</strong> registros de chamadas às análises (endpoint, modelo, latência) para controle de cota e melhoria do serviço.</li>
                <li><strong className="text-foreground">Técnicos:</strong> dados de navegação e métricas agregadas de uso (analytics).</li>
              </ul>
              <p>Não coletamos dados financeiros de apostas reais — a plataforma é educacional e o portfólio é simulado.</p>
            </Section>

            <Section n="3" title="Para que usamos (finalidade e base legal)">
              <p>Tratamos seus dados para: prestar o serviço (execução de contrato), personalizar a experiência e o nível de conteúdo, controlar cotas de IA, enviar comunicações que você optou por receber (consentimento), e cumprir obrigações legais. As bases legais seguem o art. 7º da LGPD.</p>
            </Section>

            <Section n="4" title="Comunicações por email">
              <p>Emails (resumo semanal, alertas) são <strong className="text-foreground">opt-in</strong> — só enviados se você ativar em Perfil → Notificações, e você pode desativar a qualquer momento. Base legal: consentimento.</p>
            </Section>

            <Section n="5" title="Compartilhamento com terceiros">
              <p>Compartilhamos o mínimo necessário com operadores que viabilizam o serviço:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong className="text-foreground">Supabase</strong> — autenticação e banco de dados.</li>
                <li><strong className="text-foreground">Anthropic (Claude)</strong> — processamento das análises de IA.</li>
                <li><strong className="text-foreground">Stripe</strong> — pagamentos do plano premium (quando aplicável).</li>
                <li><strong className="text-foreground">Provedor de email</strong> — envio dos comunicados opt-in.</li>
              </ul>
              <p>Não vendemos seus dados pessoais.</p>
            </Section>

            <Section n="6" title="Armazenamento e segurança">
              <p>Adotamos medidas técnicas e organizacionais (RLS no banco, controle de acesso por chave de serviço, rate limiting, criptografia em trânsito). Dados ficam retidos enquanto sua conta existir ou conforme exigências legais; previsões locais ficam no seu dispositivo até você limpá-las.</p>
            </Section>

            <Section n="7" title="Seus direitos (art. 18 da LGPD)">
              <p>Você pode solicitar: confirmação e acesso aos dados, correção, anonimização ou eliminação, portabilidade, informação sobre compartilhamento e revogação de consentimento. Exercite-os por <a href="mailto:contato.jlbanalytics@gmail.com" className="text-gold hover:underline">contato.jlbanalytics@gmail.com</a>.</p>
            </Section>

            <Section n="8" title="Cookies e armazenamento no seu aparelho">
              <p><strong className="text-foreground">Começando pelo que NÃO fazemos:</strong> não usamos cookie de
                publicidade, rastreador de terceiro, pixel de rede social nem qualquer ferramenta que siga você para
                fora deste site. Não vendemos, alugamos nem compartilhamos seus dados com anunciantes.</p>

              <p>O que guardamos fica no <strong className="text-foreground">armazenamento local do seu navegador</strong>,
                e em dois grupos:</p>

              <p className="text-foreground/90 font-medium pt-1">1. Essencial — sem isso o site não funciona</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong className="text-foreground/80">Sua sessão de login.</strong> Guardada pelo Supabase, é o que
                  mantém você conectado entre uma página e outra. Sem ela, seria preciso entrar a cada clique.</li>
                <li><strong className="text-foreground/80">Tema claro ou escuro</strong> (<code className="text-[11px]">jlb-theme</code>).</li>
                <li><strong className="text-foreground/80">O aceite dos Termos</strong> (<code className="text-[11px]">jlb_aceite_pendente</code>),
                  só até ele ser gravado na sua conta.</li>
                <li><strong className="text-foreground/80">O que você criou:</strong> previsões registradas, alertas de
                  mercado, filtros e modo de visualização, e se o tour de boas-vindas já foi visto. É seu dado,
                  guardado no seu aparelho.</li>
              </ul>

              <p className="text-foreground/90 font-medium pt-1">2. Medição de uso — opcional, e você escolhe</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong className="text-foreground/80">Um identificador aleatório</strong> (<code className="text-[11px]">jlb_anon_id</code>):
                  um número sorteado, sem nome, e-mail, IP ou qualquer coisa que aponte para você. Serve para contarmos
                  quantas <em>pessoas distintas</em> usaram cada tela, em vez de quantos cliques houve. Vai para o
                  nosso próprio servidor, e para mais ninguém.</li>
              </ul>

              <p className="pt-1"><strong className="text-foreground">A escolha é real e reversível.</strong> Ao entrar
                pela primeira vez, um aviso pergunta se você aceita a medição. Se recusar, nada é enviado e o
                identificador é <strong className="text-foreground/80">apagado</strong> — não é só deixar de coletar
                daqui em diante. Para mudar de ideia depois, basta limpar os dados deste site no seu navegador: o aviso
                aparece de novo.</p>

              <p><strong className="text-foreground">Enquanto você não responde, não medimos.</strong> O padrão de quem
                ainda não escolheu é o essencial.</p>
            </Section>

            <Section n="9" title="Alterações">
              <p>Esta política pode ser atualizada. Mudanças relevantes serão comunicadas na plataforma.</p>
            </Section>
          </div>
        </AnimatedSection>
      </div>
    </div>
  );
}
