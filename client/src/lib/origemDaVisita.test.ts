import { describe, it, expect } from "vitest";
import { origemDaVisita } from "./origemDaVisita";

const SITE = "jlb-analytics.onrender.com";

describe("origemDaVisita — de onde veio quem chegou", () => {
  it("sem referrer e sem UTM: direto", () => {
    expect(origemDaVisita("", "", SITE)).toEqual({ canal: "direto" });
  });

  it("busca do Google, com o host e nada além dele", () => {
    const o = origemDaVisita("https://www.google.com/search?q=meu+nome+e+cpf", "", SITE);
    expect(o).toEqual({ canal: "busca", ref: "www.google.com" });
    // A URL completa carregava a busca de quem clicou — não pode ser guardada.
    expect(JSON.stringify(o)).not.toMatch(/cpf|search\?/);
  });

  it("redes pelo host de saída que cada uma usa", () => {
    expect(origemDaVisita("https://l.instagram.com/", "", SITE)?.canal).toBe("instagram");
    expect(origemDaVisita("https://lm.facebook.com/l.php", "", SITE)?.canal).toBe("facebook");
    expect(origemDaVisita("https://t.co/abc", "", SITE)?.canal).toBe("x");
    expect(origemDaVisita("https://web.whatsapp.com/", "", SITE)?.canal).toBe("whatsapp");
    expect(origemDaVisita("https://www.reddit.com/r/x", "", SITE)?.canal).toBe("reddit");
  });

  it("site desconhecido vira 'outro site', guardando o host para descobrir qual", () => {
    expect(origemDaVisita("https://blog.qualquer.com.br/post", "", SITE))
      .toEqual({ canal: "outro site", ref: "blog.qualquer.com.br" });
  });

  it("UTM vence o referrer — é a declaração de quem montou o link", () => {
    // O caso do WhatsApp no celular: sem referrer, só a tag diz de onde veio.
    expect(origemDaVisita("", "?utm_source=whatsapp&utm_campaign=grupo-apostas", SITE))
      .toEqual({ canal: "whatsapp", utm_source: "whatsapp", utm_campaign: "grupo-apostas" });
  });

  it("UTM é texto livre: sai curto e limpo", () => {
    const o = origemDaVisita("", "?utm_source=" + encodeURIComponent("Insta Story <script>") + "x".repeat(80), SITE);
    expect(o?.utm_source).toMatch(/^[a-z0-9_.-]+$/);
    expect(o!.utm_source!.length).toBeLessThanOrEqual(40);
  });

  it("navegação interna não é chegada", () => {
    expect(origemDaVisita(`https://${SITE}/mercados`, "", SITE)).toBeNull();
  });

  it("referrer quebrado conta como direto, sem lançar erro", () => {
    expect(origemDaVisita("não é url", "", SITE)).toEqual({ canal: "direto" });
  });
});
