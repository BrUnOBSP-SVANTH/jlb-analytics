# Roteiro dos vídeos de ajuda

> Gerado a partir de [scripts/cenasDoTutorial.ts](scripts/cenasDoTutorial.ts).
> **Não edite este arquivo à mão** — edite as cenas e rode `pnpm tutorial`, senão a
> fala e a filmagem divergem, que é o defeito que este formato existe para impedir.

6 vídeos. Os tempos abaixo são ESTIMADOS; os do player são medidos na gravação.
Toda cena com verificação é um teste: se o resultado esperado não aparece na tela, o vídeo
daquele filme não é produzido e o relatório diz qual passo falhou.

---

## Visão geral do JLB Analytics

`pnpm tutorial geral` · 7 cenas · ~02:56

> O percurso de quem chega agora: mercados, calculadoras, simulador e o nosso histórico.

### 1. O que é o JLB Analytics

**00:00 – 00:23** · rota `/` · cena `abertura` · 1 verificação

Este é o JLB Analytics. Ele faz três coisas: mostra ao vivo o que os maiores mercados de previsão do mundo estão dizendo, ensina você a calcular as chances por conta própria, e publica o histórico completo dos nossos acertos e dos nossos erros. Neste vídeo eu uso cada ferramenta de verdade, com números de verdade.

### 2. Mercados ao vivo

**00:23 – 00:48** · rota `/mercados` · cena `mercados` · 1 verificação

Aqui estão os mercados ao vivo do Polymarket, do Kalshi e do Manifold. O número grande é a probabilidade que o mercado dá para o evento acontecer — não é opinião nossa, é o preço que as pessoas estão pagando agora. E a busca entende português: eu escrevo eleição, e ela encontra os mercados de eleição, mesmo os que estão escritos em inglês.

### 3. Dentro de um mercado

**00:48 – 01:14** · rota `/mercados` · cena `mercado-detalhe` · 2 verificaçãoões

Abrindo um mercado, você vê o histórico do preço, o volume negociado e o prazo. O gráfico mostra como a opinião coletiva mudou com o tempo — uma virada brusca quase sempre tem uma notícia atrás. Mais abaixo está a regra de resolução, no texto original da plataforma: é ela que decide quem ganha, e por isso a gente não traduz.

### 4. Calculadora de valor esperado

**01:14 – 01:46** · rota `/calculadoras` · cena `valor-esperado` · 3 verificaçãoões

Agora as ferramentas, começando pela mais importante do site: o valor esperado. A pergunta é: se eu repetisse esta mesma posição muitas vezes, sairia no lucro ou no prejuízo? Vou testar. Cem reais, sessenta por cento de chance de dar certo e quarenta de dar errado, com odd dois — se acertar, recebo o dobro. A conta dá vinte reais positivos por posição. Repare que as duas chances somam cem: se não somarem, a calculadora avisa em vez de dar um número errado.

### 5. Kelly: quanto da banca arriscar

**01:46 – 02:10** · rota `/calculadoras` · cena `kelly` · 2 verificaçãoões

A aba do lado responde a pergunta seguinte: se vale a pena, quanto da banca eu coloco? Com cinquenta e cinco por cento de chance e odd dois, o critério de Kelly diz que o máximo matemático é dez por cento. E a própria tela recomenda usar só uma fração disso, porque a sua estimativa de chance também pode estar errada.

### 6. Simulador: o que a sorte faz com o método

**02:10 – 02:32** · rota `/simulador` · cena `simulador` · 1 verificação

O simulador mostra o que a conta sozinha não mostra: a variação. Mesmo com o valor esperado positivo, a curva passa por sequências ruins — e é nelas que as pessoas abandonam o método. Cada nova amostra é um caminho diferente para a mesma conta. Ver isso acontecer antes de viver isso é metade do aprendizado.

### 7. O histórico completo — inclusive os erros

**02:32 – 02:56** · rota `/track-record` · cena `fecho` · 1 verificação

E aqui o círculo fecha. Toda previsão da nossa IA é registrada antes de o mercado resolver, e medida pelo resultado oficial da plataforma — inclusive quando a gente erra, e a tela diz quanto. A análise por IA e a banca simulada ficam com uma conta grátis, e têm vídeos próprios. Para começar, o melhor caminho é a trilha de educação.

---

## A trilha de aprendizado

`pnpm tutorial trilha` · 4 cenas · ~01:15

> Os cinco níveis, com as calculadoras do Nível 1 e a checagem de cada nível.

### 1. A trilha: cinco níveis

**00:00 – 00:16** · rota `/educacao` · cena `educacao` · 1 verificação

A trilha tem cinco níveis, do valor esperado até a análise que junta tudo. Os dois primeiros são grátis. Cada nível tem calculadoras de verdade — não é texto para ler, é conta para fazer — e termina com uma checagem.

### 2. Nível 1: a margem da casa

**00:16 – 00:40** · rota `/nivel/1` · cena `nivel1-margem` · 1 verificação

No nível um, a primeira calculadora mostra o que quase ninguém vê: a margem da casa. Com odds de dois e dez, três e cinquenta e três e vinte, as chances embutidas somam mais de cem por cento. Os sete vírgula quarenta e quatro por cento que sobram são o que você paga só para participar — antes de qualquer resultado.

### 3. A checagem do nível

**00:40 – 01:00** · rota `/nivel/1` · cena `nivel1-checagem` · 1 verificação

E cada nível termina com uma checagem. O SIM custa quarenta centavos e você acha que a chance real é cinquenta por cento: quanto vale cada real apostado? Vinte e cinco centavos — e o erro comum é responder dez, subtraindo as porcentagens. A explicação aparece na hora, com a conta escrita.

### 4. Nível 5: a análise integrada

**01:00 – 01:15** · rota `/nivel/5` · cena `nivel5` · 1 verificação

No último nível tudo se junta: modelos, mercado e notícia na mesma leitura. O sistema nunca diz o que fazer — mostra onde os modelos divergem do mercado e por quê, e deixa a decisão com você.

---

## Previsão guiada por IA

`pnpm tutorial previsao` · 2 cenas · ~00:41 · ⚠️ **precisa de conta** (`TUTORIAL_EMAIL` e `TUTORIAL_SENHA` no `.env`)

> Você escreve o que quer prever; a IA escolhe o modelo e mostra a conta por trás.

### 1. Previsão guiada por IA

**00:00 – 00:21** · rota `/previsao` · cena `previsao-pedido` · 1 verificação

Com uma conta grátis, a previsão guiada por IA fica liberada. Você escolhe a área, escreve o que quer prever e o horizonte. Vou pedir a inflação nos próximos três meses.

### 2. O modelo e a conta por trás

**00:21 – 00:41** · rota `/previsao` · cena `previsao-resultado` · 1 verificação

A IA não chuta um número: ela escolhe o modelo econométrico que serve para a pergunta e mostra a fórmula e o artigo de onde ele vem. Dá para conferir cada passo — e é esse o ponto. Uma estimativa que você não consegue conferir é só uma opinião com casas decimais.

---

## Análise de mercados

`pnpm tutorial analise` · 3 cenas · ~00:54 · ⚠️ **precisa de conta** (`TUTORIAL_EMAIL` e `TUTORIAL_SENHA` no `.env`)

> Notícias cruzadas com os mercados, o briefing do dia e a análise por IA de um mercado.

### 1. O contexto por trás do preço

**00:00 – 00:12** · rota `/noticias` · cena `noticias` · 1 verificação

Na análise de mercados, os mesmos mercados aparecem cruzados com notícias, discussões e os artigos do nosso Cérebro — o contexto que explica por que o preço está onde está.

### 2. O briefing do dia

**00:12 – 00:25** · rota `/briefing` · cena `briefing` · 1 verificação

Todo dia a IA escreve um briefing com o que mudou nos mercados e na economia brasileira. A régua no topo mostra onde está a mediana dos mercados mais movimentados do dia.

### 3. A análise por IA — e o limite dela

**00:25 – 00:54** · rota `/mercados` · cena `analise-ia` · 1 verificação

E dentro de qualquer mercado, a análise por IA lê notícias reais, compara com casos parecidos do passado e estima um valor justo. Preciso ser honesto sobre o limite, porque ele está escrito na tela: a IA parte do preço do mercado e não se afasta mais de quinze pontos dele. É uma trava contra excesso de confiança. Trate a análise como uma segunda opinião com as fontes à mostra — nunca como recomendação.

---

## Sua conta: banca simulada e calibração

`pnpm tutorial conta` · 2 cenas · ~00:48 · ⚠️ **precisa de conta** (`TUTORIAL_EMAIL` e `TUTORIAL_SENHA` no `.env`)

> Mil reais fictícios em mercados reais, e o painel que mede se você está acertando.

### 1. Banca simulada — dinheiro fictício, mercado real

**00:00 – 00:28** · rota `/portfolio` · cena `banca` · 2 verificaçãoões

Com a conta, você ganha uma banca de mil reais fictícios para testar suas estimativas. Vou abrir uma nova aposta, buscar por presidente e escolher um mercado. O preço da cota é o preço real de agora. Digo que não vai acontecer, escolho apostar cem reais, e vejo na hora quanto ganho. Quando o mercado resolve, o site liquida a posição pelo resultado oficial da plataforma, não por um chute nosso.

### 2. A sua calibração

**00:28 – 00:48** · rota `/dashboard` · cena `dashboard` · 1 verificação

No painel você acompanha a sua calibração. O Brier Score mede o quanto as suas probabilidades batem com o que aconteceu: zero é perfeito, e responder cinquenta por cento em tudo dá zero vírgula vinte e cinco. É o número que diz se você está melhorando — ou só tendo sorte.

---

## Duelos de previsão

`pnpm tutorial duelos` · 1 cena · ~00:22 · ⚠️ **precisa de conta** (`TUTORIAL_EMAIL` e `TUTORIAL_SENHA` no `.env`)

> Previsões seladas sobre os mesmos mercados — vence o menor Brier. Por pontos, sem dinheiro.

### 1. Duelos de previsão

**00:00 – 00:22** · rota `/duelos` · cena `duelos` · 2 verificaçãoões

Nos duelos, você pode desafiar a comunidade ou a nossa própria IA sobre os mesmos mercados, e ninguém vê a do outro antes do fim. Vou criar um duelo contra a IA: escolho dois mercados e selo as minhas previsões. Quando tudo resolve, vence quem teve o menor Brier. É um beta valendo pontos, sem dinheiro.
