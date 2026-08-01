/**
 * Validação de payload dos endpoints de IA (fail-fast, defensive programming).
 *
 * Antes: os handlers faziam `req.body as X` e confiavam no shape. Um body
 * malformado (posição sem título, número que veio como string) quebrava em
 * runtime (`.slice`/`.toFixed` de undefined) e virava um 500 genérico. Com zod,
 * a validação acontece na borda e devolve um 400 claro — sem crash.
 *
 * Os schemas espelham o shape ACEITO hoje (campos opcionais continuam opcionais)
 * para não rejeitar requisições que já funcionavam.
 */
import { z } from "zod";

/** Uma posição do portfólio simulado. `position` fica permissivo (string) — o
 *  handler só faz .toUpperCase(); o que importa é impedir undefined. */
export const portfolioBodySchema = z.object({
  positions: z.array(z.object({
    title: z.string().min(1),
    source: z.string().optional(),
    position: z.string(),
    entryProb: z.number(),
    currentProb: z.number().optional(),
    betSize: z.number(),
    pnl: z.number().nullish(),
  })).min(1, "envie ao menos 1 posição").max(200, "no máximo 200 posições"),
});

/** Valida o body contra um schema; devolve os dados tipados ou uma mensagem clara. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown):
  { ok: true; data: T } | { ok: false; message: string } {
  const r = schema.safeParse(body);
  if (r.success) return { ok: true, data: r.data };
  const first = r.error.issues[0];
  const path = first?.path.join(".") || "body";
  return { ok: false, message: `${path}: ${first?.message ?? "inválido"}` };
}
