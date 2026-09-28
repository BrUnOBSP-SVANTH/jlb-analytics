# Roteiro do vídeo de ajuda

> Gerado por `pnpm tutorial` a partir de [scripts/cenasDoTutorial.ts](scripts/cenasDoTutorial.ts).
> **Não edite este arquivo à mão** — edite as cenas e rode de novo, senão a fala
> e a filmagem divergem, que é o defeito que este formato existe para impedir.

Duração estimada da narração: **03:35** em 8 cenas.
O vídeo sai **sem áudio**: a locução é gravada por cima, seguindo os tempos abaixo.

---

## 1. O que é o JLB Analytics

**00:00 – 00:22** · rota `/` · cena `abertura`

Este é o JLB Analytics. Ele faz três coisas: mostra ao vivo o que os maiores mercados de previsão do mundo estão prevendo, ensina você a calcular as chances por conta própria, e publica o histórico completo dos nossos acertos e dos nossos erros. Vou te mostrar o caminho inteiro em menos de quatro minutos.

## 2. Mercados ao vivo — Polymarket e Kalshi

**00:22 – 00:49** · rota `/mercados` · cena `mercados`

Aqui estão os mercados ao vivo. Cada card é um evento do mundo real, e o número grande é a probabilidade que o mercado está dando para ele acontecer. Isso não é opinião nossa: é o preço que milhares de pessoas estão pagando agora, e ele muda sozinho ao longo do dia. A busca no topo filtra por assunto — e o atalho dela é a tecla barra.

## 3. Dentro de um mercado

**00:49 – 01:09** · rota `/mercados` · cena `mercado-detalhe`

Clicando num mercado você vê o histórico do preço, o volume negociado e o prazo. Repare no gráfico: o que ele mostra é como a opinião coletiva mudou ao longo do tempo. Uma virada brusca quase sempre tem uma notícia atrás — e é exatamente isso que a próxima ferramenta vai investigar.

## 4. A análise por IA — e o limite dela

**01:09 – 01:47** · rota `/mercados` · cena `analise-ia`

> ⚠️ **Precisa de conta.** Sem `TUTORIAL_EMAIL`/`TUTORIAL_SENHA` o gravador filma a tela
> do visitante (o convite para entrar), não a tela de dentro.

Esta é a análise por IA. Ela lê notícias reais e compara o evento com casos parecidos do passado para estimar um valor justo. E aqui eu preciso ser honesto sobre uma limitação, porque ela está escrita na própria tela: a IA parte do preço do mercado e não se afasta mais de quinze pontos percentuais dele. É uma trava deliberada contra excesso de confiança. O preço dessa trava é que o Edge que você vê aqui tem teto. Trate isso como uma segunda opinião fundamentada, com as fontes à mostra — nunca como recomendação de compra.

## 5. Calculadoras: Valor Esperado e Kelly

**01:47 – 02:24** · rota `/calculadoras` · cena `calculadoras`

Agora as ferramentas. A primeira é o Valor Esperado, e ela é a mais importante do site inteiro. A pergunta que ela responde é: se eu repetisse esta mesma decisão mil vezes, eu sairia no lucro ou no prejuízo? Você põe a sua estimativa de chance de um lado, a odd oferecida do outro, e ela te diz. A maioria das pessoas perde dinheiro aqui não por falta de intuição, mas por nunca ter feito essa conta. A aba do lado, Kelly, responde a pergunta seguinte: dado que vale a pena, quanto da banca eu arrisco.

## 6. Simulador: o que a sorte faz com o método

**02:24 – 02:48** · rota `/simulador` · cena `simulador`

O simulador mostra uma coisa que a conta sozinha não mostra: a variação. Arraste a sua chance real de ganhar e veja a curva se mexer. Mesmo com o Valor Esperado positivo, você vai passar por sequências ruins — e é justamente nelas que as pessoas abandonam o método. Ver isso acontecer antes de viver isso é metade do aprendizado.

## 7. Banca Simulada — dinheiro fictício, mercado real

**02:48 – 03:12** · rota `/portfolio` · cena `banca`

> ⚠️ **Precisa de conta.** Sem `TUTORIAL_EMAIL`/`TUTORIAL_SENHA` o gravador filma a tela
> do visitante (o convite para entrar), não a tela de dentro.

Por último, a banca simulada. Você recebe um saldo fictício e registra posições em mercados de verdade, pelo preço de verdade — você não escolhe o preço. Quando o mercado resolve, o site liquida a sua posição pelo resultado oficial da plataforma, não por um chute nosso. É onde você descobre, sem arriscar nada, se o seu método está funcionando.

## 8. O histórico completo — inclusive os erros

**03:12 – 03:35** · rota `/track-record` · cena `fecho`

E é aqui que o círculo fecha. Todo acerto e todo erro das nossas previsões ficam nesta página, medidos pelo resultado oficial de quem liquidou o mercado. Quando a gente erra, está aqui. Comece pelo Nível 1 na trilha de educação — é grátis, e é de onde tudo o que eu te mostrei passa a fazer sentido.
