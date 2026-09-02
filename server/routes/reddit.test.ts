import { describe, it, expect } from "vitest";
import { parseRedditRSS } from "./reddit.ts";

// Recorte real do feed https://www.reddit.com/r/sportsbook/.rss (02/09/2026).
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <author><name>/u/Sportsbook_Mod</name></author>
    <content type="html">&lt;div&gt;texto do post&lt;/div&gt;</content>
    <id>t3_abc123</id>
    <link href="https://www.reddit.com/r/sportsbook/comments/abc123/teasers/" />
    <updated>2026-09-02T11:30:00+00:00</updated>
    <published>2026-09-02T11:00:00+00:00</published>
    <title>Let&amp;#39;s Talk About Teasers - 2026 Season</title>
  </entry>
  <entry>
    <author><name>/u/outro</name></author>
    <id>t3_def456</id>
    <link href="https://www.reddit.com/r/sportsbook/comments/def456/props/" />
    <published>2026-09-02T09:00:00+00:00</published>
    <title>MLB Props and Home Run Picks</title>
  </entry>
</feed>`;

describe("parseRedditRSS — o feed que substituiu a API bloqueada", () => {
  const posts = parseRedditRSS(FEED, "sportsbook");

  it("extrai as entradas com título, link e data", () => {
    expect(posts).toHaveLength(2);
    expect(posts[0].title).toContain("Teasers");
    expect(posts[0].url).toContain("/comments/abc123/");
    expect(posts[0].permalink).toBe("/r/sportsbook/comments/abc123/teasers/");
    expect(posts[0].subreddit).toBe("sportsbook");
    expect(posts[0].author).toBe("Sportsbook_Mod");
  });

  it("usa `published` como data do post (não `updated`)", () => {
    // 11:00 é a publicação; 11:30 é uma edição posterior. A idade do post é
    // calculada com a primeira — senão um post velho editado hoje pareceria novo.
    expect(new Date(posts[0].created_utc * 1000).toISOString()).toBe("2026-09-02T11:00:00.000Z");
  });

  it("decodifica entidades HTML do título", () => {
    expect(posts[0].title).not.toContain("&amp;");
    expect(posts[0].title).toMatch(/Let.s Talk/);
  });

  // A regra de fidelidade desta troca: o RSS não publica votos nem comentários.
  // Zerar seria afirmar que o post não tem engajamento; chutar seria pior.
  it("NÃO inventa votos nem comentários — os campos ficam ausentes", () => {
    expect(posts[0].score).toBeUndefined();
    expect(posts[0].num_comments).toBeUndefined();
  });

  it("ignora entrada sem título ou sem link em vez de emitir lixo", () => {
    expect(parseRedditRSS("<feed><entry><id>x</id></entry></feed>", "x")).toHaveLength(0);
    expect(parseRedditRSS("", "x")).toHaveLength(0);
  });
});
