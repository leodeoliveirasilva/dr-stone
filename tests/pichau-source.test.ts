import { describe, expect, test } from "vitest";

import {
  buildPichauSearchUrls,
  extractPichauPrimaryPrice,
  parsePichauListingCandidates,
  type PichauListingCandidate
} from "../dr-stone-scrapper/src/sources/pichau/pichau-parsing.js";

describe("pichau parsing", () => {
  test("builds candidate search URLs for the browser-backed search flow", () => {
    expect(buildPichauSearchUrls("RX 9070 XT Sapphire")).toEqual([
      "https://www.pichau.com.br/search?q=RX%209070%20XT%20Sapphire",
      "https://www.pichau.com.br/busca?q=RX%209070%20XT%20Sapphire",
      "https://www.pichau.com.br/catalogsearch/result/?q=RX%209070%20XT%20Sapphire"
    ]);
  });

  test("extracts the promotional listing price before installment values", () => {
    expect(
      extractPichauPrimaryPrice(
        "de R$ 3,294.11 por R$ 2,199.99 À vista 15% de desconto no PIX R$ 2,588.22 Em até 12 x de R$ 215.69 Sem juros no cartão"
      )
    ).toBe("2,199.99");
  });

  test("normalizes product-card candidates into search result items", () => {
    const candidates: PichauListingCandidate[] = [
      {
        href: "https://www.pichau.com.br/placa-de-video-asus-geforce-rtx-5060-prime-oc-edition-8gb-gddr7-128-bit-prime-rtx5060-o8g?foo=bar",
        text: "21 % OFF 9 UNID Frete Grátis: Sul e Sudeste Placa de Video Asus GeForce RTX 5060 Prime OC Edition, 8GB, GDDR7, 128-bit, PRIME-RTX5060-O8G de R$ 3,294.11 por R$ 2,199.99 À vista 15% de desconto no PIX R$ 2,588.22 Em até 12 x de R$ 215.69 Sem juros no cartão",
        ariaLabel: null,
        titleAttr: null,
        imgAlt: "Placa de Video Asus GeForce RTX 5060 Prime OC Edition, 8GB, GDDR7, 128-bit, PRIME-RTX5060-O8G",
        headings: [],
        dataSku: "PRIME-RTX5060-O8G"
      }
    ];

    expect(parsePichauListingCandidates(candidates)).toEqual([
      {
        source: "pichau",
        title: "Placa de Video Asus GeForce RTX 5060 Prime OC Edition, 8GB, GDDR7, 128-bit, PRIME-RTX5060-O8G",
        canonicalUrl:
          "https://www.pichau.com.br/placa-de-video-asus-geforce-rtx-5060-prime-oc-edition-8gb-gddr7-128-bit-prime-rtx5060-o8g",
        price: "2199.99",
        currency: "BRL",
        availability: "in_stock",
        isAvailable: true,
        position: 1,
        metadata: {
          source_product_key: "PRIME-RTX5060-O8G",
          seller_name: "Pichau",
          price_raw: "2,199.99"
        }
      }
    ]);
  });

  test("deduplicates repeated product links and ignores non-product paths", () => {
    const repeatedCard: PichauListingCandidate = {
      href: "https://www.pichau.com.br/placa-de-video-sapphire-radeon-rx-9070-xt-pulse-16gb-gddr6-256-bit-11348-03-20g",
      text: "Frete Grátis: Sul e Sudeste Placa de Video Sapphire Radeon RX 9070 XT Pulse, 16GB, GDDR6, 256-bit, 11348-03-20G de R$ 7,058.81 por R$ 5,599.99 À vista 15% de desconto no PIX R$ 6,588.22 Em até 12 x de R$ 549.02 Sem juros no cartão",
      ariaLabel: null,
      titleAttr: null,
      imgAlt: null,
      headings: [
        "Placa de Video Sapphire Radeon RX 9070 XT Pulse, 16GB, GDDR6, 256-bit, 11348-03-20G"
      ],
      dataSku: "11348-03-20G"
    };

    expect(
      parsePichauListingCandidates([
        repeatedCard,
        repeatedCard,
        {
          href: "https://www.pichau.com.br/eletronicos",
          text: "Eletrônicos",
          ariaLabel: null,
          titleAttr: null,
          imgAlt: null,
          headings: [],
          dataSku: null
        }
      ])
    ).toHaveLength(1);
  });
});
