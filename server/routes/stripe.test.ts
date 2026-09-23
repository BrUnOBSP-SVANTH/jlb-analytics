import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { assinaturaValida } from "./stripe.ts";

/**
 * A assinatura do webhook é a ÚNICA barreira entre um POST anônimo e a
 * concessão de um plano pago. Estes testes montam eventos assinados de verdade,
 * com o mesmo HMAC que o Stripe usa.
 */
const SEGREDO = "whsec_teste_jlb";
const AGORA = new Date("2026-09-22T12:00:00Z").getTime();

function assinar(corpo: string, segredo = SEGREDO, quando = AGORA): string {
  const t = Math.floor(quando / 1000);
  const v1 = crypto.createHmac("sha256", segredo).update(`${t}.${corpo}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

const CORPO = JSON.stringify({ type: "checkout.session.completed", data: { object: { metadata: { user_id: "u-1" } } } });

describe("assinaturaValida — o portão do webhook", () => {
  it("aceita um evento realmente assinado pelo Stripe", () => {
    expect(assinaturaValida(Buffer.from(CORPO), assinar(CORPO), SEGREDO, AGORA)).toBe(true);
  });

  it("recusa assinatura de outro segredo", () => {
    expect(assinaturaValida(Buffer.from(CORPO), assinar(CORPO, "whsec_de_outra_pessoa"), SEGREDO, AGORA)).toBe(false);
  });

  it("recusa corpo adulterado depois de assinado", () => {
    // O atacante pega um evento legítimo e troca o user_id pelo dele.
    const adulterado = CORPO.replace("u-1", "u-2");
    expect(assinaturaValida(Buffer.from(adulterado), assinar(CORPO), SEGREDO, AGORA)).toBe(false);
  });

  it("🔴 assinatura de TAMANHO diferente é recusada, não derruba a rota", () => {
    // `crypto.timingSafeEqual` LANÇA quando os buffers têm tamanhos diferentes.
    // Sem a conferência de tamanho, um `v1` curto virava exceção → HTTP 500 — e
    // 500 num webhook faz o Stripe REENVIAR o evento, sem parar.
    const t = Math.floor(AGORA / 1000);
    expect(() => assinaturaValida(Buffer.from(CORPO), `t=${t},v1=abcd`, SEGREDO, AGORA)).not.toThrow();
    expect(assinaturaValida(Buffer.from(CORPO), `t=${t},v1=abcd`, SEGREDO, AGORA)).toBe(false);
    expect(assinaturaValida(Buffer.from(CORPO), `t=${t},v1=`, SEGREDO, AGORA)).toBe(false);
    expect(assinaturaValida(Buffer.from(CORPO), `t=${t},v1=zzzz`, SEGREDO, AGORA)).toBe(false);
  });

  it("recusa evento velho (proteção contra reenvio)", () => {
    const seisMinutosAtras = AGORA - 6 * 60_000;
    expect(assinaturaValida(Buffer.from(CORPO), assinar(CORPO, SEGREDO, seisMinutosAtras), SEGREDO, AGORA)).toBe(false);
    // Dentro da janela de 5 minutos, vale.
    expect(assinaturaValida(Buffer.from(CORPO), assinar(CORPO, SEGREDO, AGORA - 4 * 60_000), SEGREDO, AGORA)).toBe(true);
  });

  it("recusa cabeçalho malformado e segredo vazio", () => {
    expect(assinaturaValida(Buffer.from(CORPO), "", SEGREDO, AGORA)).toBe(false);
    expect(assinaturaValida(Buffer.from(CORPO), "lixo", SEGREDO, AGORA)).toBe(false);
    expect(assinaturaValida(Buffer.from(CORPO), `t=abc,v1=${"0".repeat(64)}`, SEGREDO, AGORA)).toBe(false);
    // Sem segredo configurado ninguém entra — o webhook é fail-closed.
    expect(assinaturaValida(Buffer.from(CORPO), assinar(CORPO), "", AGORA)).toBe(false);
  });
});

describe("SEG-03 — o checkout não confia no que o navegador manda", () => {
  const fonte = () => import("node:fs").then((fs) =>
    fs.readFileSync(new URL("./stripe.ts", import.meta.url), "utf-8"));

  it("o preço sai do ambiente do SERVIDOR, nunca do corpo", async () => {
    const s = await fonte();
    expect(s).toContain("process.env.STRIPE_PREMIUM_PRICE_ID");
    // O corpo da requisição não decide mais nada sobre preço nem sobre quem é.
    expect(s).not.toMatch(/const \{ priceId, userId, userEmail \} = req\.body/);
  });

  it("quem é o usuário sai do JWT", async () => {
    const s = await fonte();
    expect(s).toMatch(/verifyUser\(String\(req\.headers\.authorization/);
    expect(s).toContain("login_necessario");
  });

  it("o metadata vai também na ASSINATURA, não só na sessão", async () => {
    // Sem esta linha o cancelamento chega sem saber de quem é.
    expect(await fonte()).toContain("subscription_data[metadata][user_id]");
  });
});
