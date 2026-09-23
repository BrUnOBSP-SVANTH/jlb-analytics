/**
 * O que um evento do Stripe quer dizer para o nosso banco — regra pura, testada.
 *
 * POR QUE SEPARADA (Auditoria 21/09, SEG-03). A leitura do evento estava
 * misturada com a chamada HTTP, e por isso dois defeitos passaram despercebidos:
 *
 *  1. o webhook procurava o usuário em `metadata.user_id`, mas esse metadata só
 *     existe na CHECKOUT SESSION. Nos eventos de assinatura
 *     (`customer.subscription.deleted`, `.paused`) ele vem vazio — ou seja,
 *     NINGUÉM voltava para o plano free ao cancelar. Quem cancelasse continuaria
 *     premium para sempre;
 *  2. `customer.subscription.updated` era ignorado, e é ele que avisa
 *     `past_due` e `unpaid` — assinatura que parou de ser paga seguia valendo.
 *
 * Agora o evento é traduzido aqui, e quem chama sabe por qual caminho achar o
 * usuário: pelo `user_id` do metadata (checkout) ou pelo `customer` do Stripe
 * (assinatura), que passamos a guardar no perfil.
 */

export type PlanoDoUsuario = "free" | "premium";

export interface EventoDoStripe {
  type: string;
  data: {
    object: {
      id?: string;
      metadata?: { user_id?: string };
      customer?: string;
      subscription?: string;
      status?: string;
      cancel_at_period_end?: boolean;
    };
  };
}

export interface LeituraDoEvento {
  /** Para qual plano a conta vai. `null` = o evento não muda plano. */
  plano: PlanoDoUsuario | null;
  /** Vem do metadata da Checkout Session; ausente nos eventos de assinatura. */
  userId?: string;
  /** O cliente no Stripe — a ponte para achar o usuário quando não há metadata. */
  customerId?: string;
  subscriptionId?: string;
  /** Para o log dizer a verdade sobre o que aconteceu. */
  motivo: string;
}

/**
 * Status de assinatura que NÃO sustentam o premium.
 *
 * `past_due` e `unpaid` são a cobrança falhando: o Stripe ainda tenta, mas quem
 * está com a fatura em aberto não pode continuar com o plano pago aberto por
 * tempo indeterminado. `canceled`, `incomplete_expired` e `paused` são o fim.
 */
const STATUS_SEM_PREMIUM = new Set(["past_due", "unpaid", "canceled", "incomplete_expired", "paused"]);

/** Status que sustentam o premium. `trialing` conta: é acesso concedido. */
const STATUS_COM_PREMIUM = new Set(["active", "trialing"]);

export function lerEventoDoStripe(evento: EventoDoStripe): LeituraDoEvento {
  const o = evento.data?.object ?? {};
  const base = {
    userId: o.metadata?.user_id,
    customerId: typeof o.customer === "string" ? o.customer : undefined,
  };

  switch (evento.type) {
    case "checkout.session.completed":
      // É o único evento que traz o nosso `user_id`, e é onde guardamos a ponte
      // (customer + subscription) para todos os eventos seguintes.
      return {
        ...base,
        subscriptionId: typeof o.subscription === "string" ? o.subscription : undefined,
        plano: "premium",
        motivo: "pagamento concluído",
      };

    case "customer.subscription.deleted":
    case "customer.subscription.paused":
      return { ...base, subscriptionId: o.id, plano: "free", motivo: `assinatura ${evento.type.split(".").pop()}` };

    case "customer.subscription.updated": {
      const status = String(o.status ?? "");
      if (STATUS_SEM_PREMIUM.has(status)) {
        return { ...base, subscriptionId: o.id, plano: "free", motivo: `assinatura em ${status}` };
      }
      if (STATUS_COM_PREMIUM.has(status)) {
        return { ...base, subscriptionId: o.id, plano: "premium", motivo: `assinatura ${status}` };
      }
      // ⚠️ `cancel_at_period_end` NÃO tira o premium: a pessoa pagou até o fim do
      // período e tem direito a usar até lá. Quem encerra é o `deleted`, depois.
      return { ...base, subscriptionId: o.id, plano: null, motivo: `status ${status || "desconhecido"} — nada a mudar` };
    }

    case "invoice.payment_failed":
      // Não muda o plano sozinho: o Stripe ainda vai tentar cobrar, e é o
      // `subscription.updated` (past_due) que decide. Serve para o log.
      return { ...base, plano: null, motivo: "cobrança falhou" };

    default:
      return { ...base, plano: null, motivo: "evento sem efeito no plano" };
  }
}
