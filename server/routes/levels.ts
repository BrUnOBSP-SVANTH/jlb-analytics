/**
 * levels.ts — as rotas das calculadoras dos Níveis 1 a 5.
 *
 * 🔴 A CONTA NÃO MORA MAIS AQUI (Auditoria 21/09, DES-03). Eram 650 linhas de
 * matemática pura atrás de dezoito rotas HTTP — nenhuma tocando rede, banco ou
 * IA. Cada clique numa calculadora custava uma ida e volta ao servidor: ~300ms
 * na produção, e mais de dez segundos quando o plano grátis do Render tinha
 * deixado o serviço dormir. Esperar dez segundos por uma multiplicação faz a
 * pessoa concluir que o site está quebrado.
 *
 * A matemática foi para `shared/modelosEducacionais.ts` e o navegador calcula na
 * hora, inclusive sem internet. Estas rotas continuam existindo sobre AS MESMAS
 * funções — uma implementação só, que é o que garante que a tela e a API nunca
 * divirjam. Elas ficam porque são superfície pública (e o motor B2B pode querer
 * usá-las), não porque a tela precisa delas.
 *
 * A transcrição foi mecânica e verificada por comparação: as 26 provas de
 * integração deste diretório e a captura de referência das 23 respostas
 * continuaram idênticas, byte a byte.
 */

import { Router } from "express";
import type { Response } from "express";
import {
  ev1, houseEdge1, bayes1, zscore2, confidenceInterval2, correlation2, taylorRule3, poisson3, elo3, garch3, enso3, polling3, prospect4, brier4, gambler4, maturity4, divergence5, ensemble5,
  type Resultado,
} from "../../shared/modelosEducacionais.ts";

const router = Router();

/** `ok` vira 200, o resto vira 422 — com o MESMO corpo que a rota já devolvia. */
function responder(res: Response, r: Resultado) {
  return r.ok ? res.json(r.payload) : res.status(422).json(r.payload);
}

router.post("/level1/ev", (req, res) => responder(res, ev1(req.body)));
router.post("/level1/house-edge", (req, res) => responder(res, houseEdge1(req.body)));
router.post("/level1/bayes", (req, res) => responder(res, bayes1(req.body)));
router.post("/level2/zscore", (req, res) => responder(res, zscore2(req.body)));
router.post("/level2/confidence-interval", (req, res) => responder(res, confidenceInterval2(req.body)));
router.post("/level2/correlation", (req, res) => responder(res, correlation2(req.body)));
router.post("/level3/taylor-rule", (req, res) => responder(res, taylorRule3(req.body)));
router.post("/level3/poisson", (req, res) => responder(res, poisson3(req.body)));
router.post("/level3/elo", (req, res) => responder(res, elo3(req.body)));
router.post("/level3/garch", (req, res) => responder(res, garch3(req.body)));
router.post("/level3/enso", (req, res) => responder(res, enso3(req.body)));
router.post("/level3/polling", (req, res) => responder(res, polling3(req.body)));
router.post("/level4/prospect", (req, res) => responder(res, prospect4(req.body)));
router.post("/level4/brier", (req, res) => responder(res, brier4(req.body)));
router.post("/level4/gambler", (req, res) => responder(res, gambler4(req.body)));
router.post("/level4/maturity", (req, res) => responder(res, maturity4(req.body)));
router.post("/level5/divergence", (req, res) => responder(res, divergence5(req.body)));
router.post("/level5/ensemble", (req, res) => responder(res, ensemble5(req.body)));

export default router;
