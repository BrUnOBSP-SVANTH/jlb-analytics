/**
 * aceite — grava na conta que a pessoa aceitou os Termos, e qual versão.
 *
 * POR QUE ISTO NÃO ESTÁ SOLTO NO FORMULÁRIO. O aceite tem uma sutileza de
 * momento: no cadastro por e-mail, o Supabase cria a conta mas a SESSÃO só
 * existe depois da confirmação por e-mail. Gravar na hora do clique falharia em
 * silêncio (sem sessão, a RLS recusa a escrita e ninguém vê o erro) — e ficaria
 * um usuário sem aceite registrado, que é justamente o caso que o registro
 * existe para evitar.
 *
 * A saída é gravar quando a sessão APARECE: o formulário guarda a intenção, e o
 * AuthContext registra assim que o login se completa. Vale para os dois
 * caminhos, e-mail e Google.
 */
import { supabase } from "./supabase";
import { VERSAO_TERMOS } from "@/pages/Termos";

const CHAVE_PENDENTE = "jlb_aceite_pendente";

/**
 * Marca que esta pessoa aceitou os termos no formulário, mas a sessão ainda não
 * existe. Fica no navegador só até a sessão aparecer — é intenção em trânsito,
 * não dado de usuário.
 */
export function marcarAceitePendente(): void {
  try { localStorage.setItem(CHAVE_PENDENTE, VERSAO_TERMOS); } catch { /* sem storage: segue */ }
}

/** Grava o aceite na conta. Idempotente: regravar a mesma versão não faz mal. */
export async function registrarAceite(versao = VERSAO_TERMOS): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getUser();
    const id = data?.user?.id;
    if (!id) return false;
    const { error } = await supabase
      .from("profiles")
      .update({ termos_aceitos_em: new Date().toISOString(), termos_versao_aceita: versao })
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Chamado quando a sessão aparece. Se havia aceite pendente, grava e limpa.
 *
 * Falhar aqui não pode travar o login: a conta já existe e a pessoa já clicou.
 * A marca fica no navegador e a próxima entrada tenta de novo — melhor um aceite
 * gravado com atraso do que um usuário barrado por erro de rede.
 */
export async function resolverAceitePendente(): Promise<void> {
  let pendente: string | null = null;
  try { pendente = localStorage.getItem(CHAVE_PENDENTE); } catch { return; }
  if (!pendente) return;

  const ok = await registrarAceite(pendente);
  if (ok) {
    try { localStorage.removeItem(CHAVE_PENDENTE); } catch { /* ignora */ }
  }
}
