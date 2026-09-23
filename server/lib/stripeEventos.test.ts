import { describe, it, expect } from "vitest";
import { lerEventoDoStripe, type EventoDoStripe } from "./stripeEventos.ts";

const evento = (type: string, object: Record<string, unknown>): EventoDoStripe =>
  ({ type, data: { object } });

describe("checkout concluído — o único evento que sabe quem é o usuário", () => {
  it("guarda o vínculo com o Stripe e libera o premium", () => {
    const r = lerEventoDoStripe(evento("checkout.session.completed", {
      metadata: { user_id: "u-123" }, customer: "cus_ABC", subscription: "sub_XYZ",
    }));
    expect(r).toMatchObject({ plano: "premium", userId: "u-123", customerId: "cus_ABC", subscriptionId: "sub_XYZ" });
  });
});

describe("🔴 cancelar a assinatura precisa voltar a conta para free", () => {
  it("o evento de cancelamento NÃO traz o nosso user_id — e era esse o defeito", () => {
    // O webhook procurava `metadata.user_id`, que só existe na Checkout Session.
    // Nos eventos de assinatura ele vem vazio: ninguém voltava para o free ao
    // cancelar, e quem cancelasse seguiria premium para sempre. A ponte agora é
    // o `customer`, que guardamos no perfil quando o pagamento entrou.
    const r = lerEventoDoStripe(evento("customer.subscription.deleted", {
      id: "sub_XYZ", customer: "cus_ABC", status: "canceled",
    }));
    expect(r.userId).toBeUndefined();
    expect(r.customerId).toBe("cus_ABC");
    expect(r.plano).toBe("free");
  });

  it("assinatura pausada também volta para free", () => {
    expect(lerEventoDoStripe(evento("customer.subscription.paused", { id: "sub_1", customer: "cus_1" })).plano).toBe("free");
  });
});

describe("🔴 assinatura que parou de ser paga não segue premium", () => {
  // `customer.subscription.updated` era simplesmente ignorado.
  it("past_due e unpaid tiram o premium", () => {
    for (const status of ["past_due", "unpaid"]) {
      const r = lerEventoDoStripe(evento("customer.subscription.updated", { id: "sub_1", customer: "cus_1", status }));
      expect(r.plano, `status ${status}`).toBe("free");
      expect(r.motivo).toContain(status);
    }
  });

  it("active e trialing sustentam o premium", () => {
    for (const status of ["active", "trialing"]) {
      expect(lerEventoDoStripe(evento("customer.subscription.updated", { id: "s", customer: "c", status })).plano,
        `status ${status}`).toBe("premium");
    }
  });

  it("⚠️ quem cancelou mas pagou até o fim do mês CONTINUA premium até lá", () => {
    // `cancel_at_period_end` é um aviso, não o fim. Tirar o acesso aqui seria
    // cobrar por um período e não entregar. Quem encerra é o `deleted`.
    const r = lerEventoDoStripe(evento("customer.subscription.updated", {
      id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: true,
    }));
    expect(r.plano).toBe("premium");
  });

  it("status desconhecido não muda nada — na dúvida, não mexe no plano de quem pagou", () => {
    const r = lerEventoDoStripe(evento("customer.subscription.updated", { id: "s", customer: "c", status: "incomplete" }));
    expect(r.plano).toBeNull();
  });
});

describe("eventos que não mudam plano", () => {
  it("cobrança falhada apenas registra — quem decide é o status da assinatura", () => {
    // O Stripe ainda vai tentar cobrar de novo; derrubar o plano na primeira
    // falha tiraria o acesso de quem só teve um cartão recusado por um dia.
    const r = lerEventoDoStripe(evento("invoice.payment_failed", { customer: "cus_1" }));
    expect(r.plano).toBeNull();
    expect(r.motivo).toContain("cobrança falhou");
  });

  it("evento desconhecido não derruba nem promove ninguém", () => {
    expect(lerEventoDoStripe(evento("customer.created", { customer: "c" })).plano).toBeNull();
    expect(lerEventoDoStripe({ type: "x" } as EventoDoStripe).plano).toBeNull();
  });
});
