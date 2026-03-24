import { describe, expect, test } from "vitest";

import {
  buildMercadoLivreSearchUrl,
  extractMercadoLivrePrimaryPrice,
  parseMercadoLivreListingCandidates,
  type MercadoLivreListingCandidate
} from "../dr-stone-scrapper/src/sources/mercadolivre/mercadolivre-parsing.js";

describe("mercado livre parsing", () => {
  test("builds the browser-backed search URL from the normalized slug", () => {
    expect(buildMercadoLivreSearchUrl("RX 9070 XT Sapphire")).toBe(
      "https://lista.mercadolivre.com.br/rx-9070-xt-sapphire"
    );
  });

  test("prefers the promotional price when the card contains multiple amounts", () => {
    expect(
      extractMercadoLivrePrimaryPrice("de R$ 6.899 por R$ 6.499 em 10x R$ 649,90 sem juros")
    ).toBe("6.499,00");
  });

  test("normalizes listing candidates into search result items", () => {
    const candidates: MercadoLivreListingCandidate[] = [
      {
        href: "https://www.mercadolivre.com.br/placa-de-video-gigabyte-rx-9070-xt-gaming-oc-radeon-16gb/p/MLB46991395#polycard_client=search-nordic",
        title: "Placa De Video Gigabyte Rx 9070 Xt Gaming Oc Radeon 16gb",
        titleAttr: null,
        ariaLabel: null,
        cardText:
          "Placa De Video Gigabyte Rx 9070 Xt Gaming Oc Radeon 16gb R$ 6.499 em 10x R$ 649,90 sem juros Frete gratis",
        priceText: "R$ 6.499",
        priceWhole: "6.499",
        priceCents: null,
        currencyText: "R$",
        sellerText: "Por PCL TECH DIGITAL",
        shippingText: "Frete gratis",
        installmentsText: "em 10x R$ 649,90 sem juros",
        stockText: "Disponivel",
        listingType: "Novo",
        dataId: "MLB46991395"
      }
    ];

    expect(parseMercadoLivreListingCandidates(candidates)).toEqual([
      {
        source: "mercadolivre",
        title: "Placa De Video Gigabyte Rx 9070 Xt Gaming Oc Radeon 16gb",
        canonicalUrl:
          "https://www.mercadolivre.com.br/placa-de-video-gigabyte-rx-9070-xt-gaming-oc-radeon-16gb/p/MLB46991395",
        price: "6499.00",
        currency: "BRL",
        availability: "in_stock",
        isAvailable: true,
        position: 1,
        metadata: {
          source_product_key: "MLB46991395",
          seller_name: "Mercado Livre",
          listing_type: "Novo",
          shipping_summary: "Frete gratis",
          installments_text: "em 10x R$ 649,90 sem juros",
          price_raw: "6.499,00"
        }
      }
    ]);
  });

  test("deduplicates repeated product URLs and ignores non-product search links", () => {
    const productCard: MercadoLivreListingCandidate = {
      href: "https://www.mercadolivre.com.br/placa-de-video-gigabyte-rx-9070-xt-gaming-oc-radeon-16gb/p/MLB46991395",
      title: "Placa De Video Gigabyte Rx 9070 Xt Gaming Oc Radeon 16gb",
      titleAttr: null,
      ariaLabel: null,
      cardText: "Placa De Video Gigabyte Rx 9070 Xt Gaming Oc Radeon 16gb R$ 6.499",
      priceText: "R$ 6.499",
      priceWhole: "6.499",
      priceCents: null,
      currencyText: "R$",
      sellerText: "Por PCL TECH DIGITAL",
      shippingText: null,
      installmentsText: null,
      stockText: "Disponivel",
      listingType: null,
      dataId: "MLB46991395"
    };

    expect(
      parseMercadoLivreListingCandidates([
        productCard,
        productCard,
        {
          href: "https://lista.mercadolivre.com.br/rx-9070-xt",
          title: "Resultados",
          titleAttr: null,
          ariaLabel: null,
          cardText: "Resultados para rx 9070 xt",
          priceText: null,
          priceWhole: null,
          priceCents: null,
          currencyText: null,
          sellerText: null,
          shippingText: null,
          installmentsText: null,
          stockText: null,
          listingType: null,
          dataId: null
        }
      ])
    ).toHaveLength(1);
  });
});
