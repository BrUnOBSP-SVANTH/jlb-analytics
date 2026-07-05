import { describe, it, expect } from "vitest";
import { extractJson } from "./extractJson.ts";

describe("extractJson — caminho feliz (idêntico a JSON.parse)", () => {
  it("parseia objeto simples", () => {
    expect(extractJson('{"a":1,"b":"x"}')).toEqual({ a: 1, b: "x" });
  });

  it("remove cercas markdown ```json", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("ignora preâmbulo antes do JSON", () => {
    expect(extractJson("Aqui está a análise:\n{\"a\":1}")).toEqual({ a: 1 });
  });

  it("lida com arrays aninhados de objetos", () => {
    expect(extractJson('{"d":[{"q":"x"},{"q":"y"}],"z":2}')).toEqual({ d: [{ q: "x" }, { q: "y" }], z: 2 });
  });

  it("não se confunde com } ou ] dentro de strings", () => {
    expect(extractJson('{"a":"tem } e ] dentro","b":3}')).toEqual({ a: "tem } e ] dentro", b: 3 });
  });

  it("respeita aspas escapadas", () => {
    expect(extractJson('{"a":"diz \\"oi\\"","b":1}')).toEqual({ a: 'diz "oi"', b: 1 });
  });
});

describe("extractJson — salvamento de JSON truncado (max_tokens)", () => {
  it("recupera string cortada no meio", () => {
    expect(extractJson('{"a":1,"b":"texto cortado no me')).toEqual({ a: 1, b: "texto cortado no me" });
  });

  it("recupera após vírgula pendente", () => {
    expect(extractJson('{"a":1,"b":2,')).toEqual({ a: 1, b: 2 });
  });

  it("recupera dentro de array truncado", () => {
    expect(extractJson('{"a":1,"d":[{"q":"x"},{"q":"y')).toEqual({ a: 1, d: [{ q: "x" }, { q: "y" }] });
  });

  it("completa chave sem valor com null", () => {
    expect(extractJson('{"a":1,"b":')).toEqual({ a: 1, b: null });
  });

  it("descarta campo parcial irreparável mas salva os completos", () => {
    const r = extractJson('{"a":1,"b":2,"c":{"x":');
    expect(r.a).toBe(1);
    expect(r.b).toBe(2);
  });

  it("salva campos completos de um schema grande truncado (caso model-predict)", () => {
    const r = extractJson('{"modelChosen":"Poisson","modelFamily":"contagem","formula":"λ^k e^-λ / k!","whyThisModel":"porque os gols seguem');
    expect(r.modelChosen).toBe("Poisson");
    expect(r.modelFamily).toBe("contagem");
  });
});

describe("extractJson — sem JSON", () => {
  it("lança erro quando não há objeto algum", () => {
    expect(() => extractJson("Desculpe, não posso responder.")).toThrow(/No JSON found/);
  });
});
